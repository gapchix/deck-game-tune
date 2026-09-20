# Architecture

> Everything in the "Verified" sections below was read out of the `@decky/ui` type definitions
> ([`SteamDeckHomebrew/decky-frontend-lib`](https://github.com/SteamDeckHomebrew/decky-frontend-lib),
> `main` branch) or observed from the live Deck Verified API on 2026-09-20. Line numbers refer to
> that repo at that time and will drift.

## Data source — verified

Base URL: `https://deckverified.games/deck-verified/api/v1`

| Endpoint | Returns |
|---|---|
| `GET /game_details?appid={id}&include_external=true` | full report set for an app |
| `GET /game_details?name={name}&include_external=false` | same, by name |
| `GET /search_games?term={t}&include_external=true` | `{ gameName, appId }[]` |
| `GET /issue_labels` | labels; devices are the `DEVICE:`-prefixed ones |
| `GET /report_form` | the report form schema |

Responses are **already-parsed JSON**, not raw issue markdown. A `game_details` response looks like:

```
{ reports[], external_reviews[], gameName, appId, projectNumber, metadata, reports_summary }
```

and each `reports[i].data` carries the fields we care about:

```
game_name, app_id, launcher, device, os_version,
target_framerate, average_battery_power_draw, calculated_battery_life_minutes,
steam_play_compatibility_tool_used, compatibility_tool_version,
custom_launch_options, game_resolution, frame_limit, disable_frame_limit,
enable_vrr, allow_tearing, half_rate_shading, tdp_limit, manual_gpu_clock,
scaling_mode, scaling_filter,
game_display_settings, game_graphics_settings,     ← markdown, display-only
additional_notes, performance_rating
```

`@decky/api` exports `fetchNoCors`, which is how a plugin reaches this from the Steam UI context.
**No backend of our own is required.**

Two things about these values that will bite if assumed:

- **Numeric fields arrive as numbers here, but as strings in the underlying report form.** The
  same `tdp_limit` is `8` from the API and `"8"` in the GitHub issue body. `coerceNumber` in
  `src/data/reports.ts` takes either; don't compare raw.
- **"Filled in" is not "actionable."** The report template marks several fields required, so
  `steam_play_compatibility_tool_used` is populated in 100% of reports and `scaling_filter` in
  99% — almost always at their defaults ("Steam Proton"/"default", "Linear"), which mean *no
  change*. Any fill-rate measured without excluding those is wrong.

## Applying settings — verified

### Direct `SteamClient.Apps` calls

| Call | Source | Use |
|---|---|---|
| `SetAppLaunchOptions(appId, launchOptions)` | `App.ts:541` | launch options |
| `SpecifyCompatTool(appId, strToolName)` | `App.ts:694` | Proton version |
| `SetAppResolutionOverride(appId, resolution)` | `App.ts:548` | resolution |
| `GetResolutionOverrideForApp(appId)` | `App.ts:236` | read current, for the diff |
| `GetAvailableCompatTools(appId)` | `App.ts:115` | is the recommended Proton even installed? |

### `SteamClient.System.Perf.UpdateSettings(base64)`

Takes a base64-serialized `CMsgSystemPerfUpdateSettings`. The per-app message covers everything
else we need:

```ts
SystemPerfSettingsPerApp {
  tdp_limit, is_tdp_limit_enabled
  fps_limit, is_fps_limit_enabled
  gpu_performance_manual_mhz, gpu_performance_level   // EGPUPerformanceLevel
  split_scaling_filter                                 // ESplitScalingFilter: Linear|Nearest|FSR|NIS
  split_scaling_scaler                                 // ESplitScalingScaler: Auto|Integer|Fit|Fill|Stretch
  is_game_perf_profile_enabled                         // the "use per-game profile" toggle
  display_refresh_manual_hz, display_external_refresh_manual_hz
  fps_limit_external, is_vrr_enabled, is_tearing_enabled
  cpu_governor, cpu_governor_manual_mhz, fsr_sharpness, nis_sharpness
  is_low_latency_mode_enabled, is_variable_resolution_enabled
  is_dynamic_refresh_rate_enabled, use_dynamic_refresh_rate_in_steam
  force_composite, is_composite_debug_enabled
}
```

**Why this matters:** writing TDP this way writes *Steam's own per-game profile*. Steam owns the
value, it persists, and it renders correctly in the QAM. The alternative — sysfs writes with a
background enforcement loop, as PowerTools / SimpleDeckyTDP / docky do — fights Steam's UI. We
should not need sysfs at all.

### Reading current state and limits

- `Perf.RegisterForStateChanges(cb)` → `CMsgSystemPerfState` with `current_game_id`,
  `active_profile_game_id`, `settings()` and `limits()`. This is both the **diff source** and the
  **revert snapshot**.
- `SystemPerfLimits` → `tdp_limit_min/max`, `fps_limit_options`, `fps_limit_options_external`,
  `gpu_performance_manual_min/max_mhz`, `display_refresh_manual_hz_min/max`,
  `is_vrr_supported`, `is_tearing_supported`, `split_scaling_filters_available`,
  `split_scaling_scalers_available`.

  **Always clamp recommendations to these.** Reports come from Legion Go and ROG Ally too.

### Trigger

`SteamClient.GameSessions.RegisterForAppLifetimeNotifications(cb)` → fires on game launch/exit.

## The one unsolved problem

`UpdateSettings` wants a serialized protobuf and `decky-frontend-lib` ships **no** protobuf helper
(checked: nothing matching `proto|pb|serial|msg` under `src/`).

Planned approach: use the library's webpack utilities — `findModuleExport` / `findModuleByExport`
/ `findModule` from `src/webpack.ts` — to borrow Valve's own `CMsgSystemPerfUpdateSettings` class
out of the Steam UI bundle rather than hand-rolling a `.proto`. This is a standard Decky technique
and the tooling is exported for it, but **it is unproven until run on hardware.** See
[SPIKE.md](SPIKE.md).

Fallback if that fails: hand-write the `.proto` for that one message and serialize with
`protobufjs`. Heavier, and the field numbers would have to be reverse-engineered.

## Proposed layout

```
src/
  index.tsx              plugin entry, QAM panel registration
  api/deckVerified.ts    the five endpoints above, typed + cached
  api/steam.ts           thin wrappers over SteamClient.Apps
  perf/message.ts        CMsgSystemPerfUpdateSettings build + serialize  ← the spike
  perf/state.ts          read current per-app settings, clamp to limits
  apply/plan.ts          report → ApplyPlan (a diff), pure + unit-testable
  apply/execute.ts       run an ApplyPlan, snapshot first
  ui/                    panel, diff rows, revert
main.py                  backend — settings persistence, snapshots
plugin.json              Decky manifest
```

`apply/plan.ts` should be pure: `(report, currentState, limits) => ApplyPlan`. That is where the
clamping, device filtering and no-op elimination live, and it is the part worth testing hardest.

## Standing risks

1. **Undocumented internal APIs.** Valve can change `SteamClient` in any SteamOS update. True of
   every Decky plugin; worth stating once.
2. **The incumbent could add Apply.** `Deck Settings` has the API, the brand and 125k users. Speed
   and doing the one thing better are the only mitigations.
3. **Catalogue size.** 224 Deck games have something to apply. Hit rate depends on library
   overlap; it skews popular, which helps.
