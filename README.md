# Deck Game Tune

**Apply community-proven Steam Deck game settings in one tap.**

A [Decky Loader](https://decky.xyz/) plugin that reads [Deck Verified](https://deckverified.games/)
community reports for the game you just launched and writes them straight into Steam's own
per-game profile — TDP, frame cap, Proton version, launch options, resolution, scaling.

> **Status: pre-alpha.** Nothing is built yet. Feasibility is verified (see
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)); one hardware spike stands between this and a
> working prototype (see [docs/SPIKE.md](docs/SPIKE.md)).

## The problem

You install a game on your Deck. It runs badly — 25fps, or it stutters, or the battery is gone in
90 minutes.

Someone already solved this. They found the exact settings for that exact game on that exact
device and wrote them down. Thousands of these reports exist. Here is a real one:

```
FINAL FANTASY VII REMAKE — Steam Deck LCD
  Proton .......... GE-proton10-30
  Launch options .. WINEDLLOVERRIDES="dsound=n,b" %command%
  TDP limit ....... 14W
  Frame limit ..... 40 fps
  Resolution ...... 1024x640
```

To use that knowledge today, you do this **by hand**:

1. Install GE Proton (a separate tool, in Desktop Mode), then Properties → Compatibility → pick it
2. Properties → General → type `WINEDLLOVERRIDES="dsound=n,b" %command%` into a text box
   **on a touchscreen keyboard**
3. Hold QAM → Performance → enable per-game profile → Advanced View → drag TDP to 14
4. Same menu → Framerate Limit → 40
5. Properties → resolution → 1024x640

Four menus and a typed string, for **one game**. Then you do it again for the next game.

## What Deck Game Tune does

Shows you those settings when you launch the game, and a button that applies them.

Every PC game has an "auto-detect optimal settings" button in its graphics menu. On the Deck the
settings that matter most — TDP, frame cap, Proton version, launch options — live *outside* the
game, so no game can set them for you. Nobody built that button.

[`Deck Settings`](https://github.com/DeckSettings/decky-game-settings) (125k installs) shows you
the answer and stops there. Deck Game Tune presses it.

## How it works

```
game launches (RegisterForAppLifetimeNotifications)
  → GET deckverified.games/deck-verified/api/v1/game_details?appid=…
  → keep reports matching YOUR device (OLED and LCD differ), rank by rating
  → read current settings (Perf.RegisterForStateChanges) and show a diff
  → [Apply]   SteamClient.Apps.*  +  SteamClient.System.Perf.UpdateSettings
  → [Revert]  restore the snapshot taken before applying
```

Recommendations are clamped to what your device actually supports (`SystemPerfLimits` gives
`tdp_limit_min/max` and `fps_limit_options`), so a Legion Go report's 30W suggestion won't be
pushed onto a Deck verbatim.

## Design rules

These are load-bearing, not preferences:

- **Never auto-apply.** Show the diff; the user presses the button. Silently changing someone's
  machine from crowd data is how you earn angry issues.
- **Always revertible.** Snapshot before every apply, one-tap undo.
- **Be honest about the half we can't do.** In-game graphics settings (42% of reports carry them)
  can't be applied — every game has its own config format. Those are shown as a checklist, never
  pretended away.
- **Say how much we actually know.** One report from a different device is not the same as six
  from yours, and the UI should not make them look alike.

## What can actually be applied

Measured across all 371 Steam Deck reports, counting only values that would genuinely *change*
the machine (no-op defaults excluded):

| Setting | Share of reports | Mechanism |
|---|---|---|
| Frame limit | 54% | `Perf.UpdateSettings` → `fps_limit` |
| TDP limit | 36% | `Perf.UpdateSettings` → `tdp_limit` |
| Proton override | 28% | `SteamClient.Apps.SpecifyCompatTool` |
| Resolution | 27% | `SteamClient.Apps.SetAppResolutionOverride` |
| Launch options | 13% | `SteamClient.Apps.SetAppLaunchOptions` |
| Manual GPU clock | 12% | `Perf.UpdateSettings` → `gpu_performance_manual_mhz` |
| Scaling filter | 11% | `Perf.UpdateSettings` → `split_scaling_filter` |

**316 of 371 Deck reports (85%) carry at least one actionable setting, across 224 distinct games,
averaging 2.2 settings each.** Full methodology in [docs/RESEARCH.md](docs/RESEARCH.md).

## Credits

Settings data comes from the [Deck Verified](https://deckverified.games/) project and its
community contributors — [`DeckSettings/game-reports-steamos`](https://github.com/DeckSettings/game-reports-steamos)
(GPL-3.0). Deck Game Tune reads their public API; it does not vendor their data. If you find Deck Game Tune
useful, go submit a report.

## Licence

[MIT](LICENSE)
