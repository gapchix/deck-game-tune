# On-device verification checklist

Everything in `src/data/` and `src/apply/plan.ts` is covered by `pnpm test`. The list below is
what tests **cannot** answer, because it depends on how Steam actually behaves. Work through it
on a real Deck before trusting the apply path.

## Deploying a build

```bash
pnpm install && pnpm build
# copy dist/index.js, plugin.json, package.json, main.py and LICENSE to:
#   ~/homebrew/plugins/deck-game-tune/
# then restart Decky, or reboot
```

## Unverified assumptions

These are marked in the source where they occur. Each one is a guess that looks right:

| Assumption | Where | Why it matters |
|---|---|---|
| Passing `''` to `SetAppLaunchOptions` clears launch options | `apply/execute.ts` `revert` | Revert leaves stale options behind if wrong |
| Passing `''` to `SpecifyCompatTool` resets to Steam's default | `apply/execute.ts` `revert` | **Highest risk.** Could leave the game on a Proton build the user didn't pick |
| Passing `''` to `SetAppResolutionOverride` clears the override | `apply/execute.ts` `revert` | Game could stay at the report's resolution |
| `RegisterForAppDetails` fires promptly for an installed app | `steam/apps.ts` | A 5s timeout guards it, but a slow path means an empty diff |
| `strCompatToolName` is the same string `SpecifyCompatTool` expects | `steam/apps.ts`, `apply/plan.ts` | A mismatch means we always think the tool differs and propose a redundant change |

## The run-through

1. **Device identity** — open the panel with no game running. It should name your exact model
   (Steam Deck OLED / LCD), not "Unknown device".
2. **No reports** — launch a game with no Deck Verified coverage. It should say so plainly, and
   must distinguish that from the service being unreachable (try with Wi-Fi off).
3. **Diff correctness** — launch a covered game. Every "from" value must match what Steam's own
   UI shows. This is the check that catches a wrong read.
4. **Apply** — press it, then verify each value in Steam's own menus:
   - Properties → General → Launch Options
   - Properties → Compatibility → the selected Proton build
   - the game's resolution override
5. **Persistence** — quit the game and relaunch it. The settings must still be there. If they
   aren't, we're writing somewhere transient.
6. **Revert** — press Undo, then check every setting is back to its pre-apply value, including
   ones that were *unset* before. Confirm the plugin didn't touch a setting it never changed.
7. **Blocked Proton** — find a report wanting a GE build you don't have. It must say so and
   refuse to apply *anything*, rather than applying the rest silently.
8. **Snapshot durability** — apply, then restart the Steam UI (or reboot). The Undo button must
   still be there, because the snapshot lives on disk rather than in the UI's memory.

## Known gaps at this stage

- Tier C (TDP, frame limit, GPU clock, scaling filter) is behind `TIER_C_AVAILABLE` in
  `src/config.ts` and shows as "not supported yet". See [SPIKE.md](SPIKE.md).
- Because the device's real `SystemPerfLimits` are only readable through that same API, **no
  clamping happens live yet**. It is implemented and tested, but wired to nulls. When the spike
  lands, feed real limits in — otherwise a Legion Go report's 30W would reach a Deck unchallenged.
