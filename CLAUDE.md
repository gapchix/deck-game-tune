# Deck Game Tune — working notes

A Decky Loader plugin that applies community-proven Steam Deck game settings in one tap.

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before touching anything.** It records which
`SteamClient` APIs were verified and where. [`docs/RESEARCH.md`](docs/RESEARCH.md) explains why
this idea and not a different one — don't re-derive that; it cost a full session.

## Status

Pre-alpha. No code yet. [`docs/SPIKE.md`](docs/SPIKE.md) is the gate: until the protobuf question
is answered on real hardware, don't build product code on top of `Perf.UpdateSettings`.

## Hard constraints

- **pnpm 9, Node ≥ 16.14.** Not npm. The plugin-store CI is version-sensitive.
- **`SteamClient` is undocumented internal API.** Every call must be checked against the current
  [`decky-frontend-lib`](https://github.com/SteamDeckHomebrew/decky-frontend-lib) type definitions
  under `src/globals/steam-client/`, not against memory or a blog post. Valve changes these.
- **Anything touching `SteamClient` can only be tested on a real Deck.** Don't claim a call works
  because it type-checks.
- **Prefer Steam's own APIs over sysfs.** `Perf.UpdateSettings` writes Steam's per-game profile, so
  Steam owns the value and it persists. sysfs writes require an enforcement loop and fight the QAM.
  If you find yourself reaching for `/sys/class/hwmon`, stop and re-read ARCHITECTURE.md.

## Design rules (load-bearing, not preferences)

- **Never auto-apply.** Show a diff, let the user press the button.
- **Always revertible.** Snapshot before every apply.
- **Never pretend to apply what we can't.** In-game graphics settings are display-only.
- **Show confidence honestly.** One report from another device ≠ six from this one.

## Be a good API citizen

Deck Verified's API is free, public and run by volunteers. Cache aggressively, request per-app
(not bulk), and never poll. Their data is GPL-3.0 and belongs to their contributors — read it via
the API, don't vendor it, and credit them in the UI.

## Testing

`src/apply/plan.ts` is pure — `(report, currentState, limits) => ApplyPlan` — and is where device
filtering, clamping and no-op elimination live. That's the part that can and should be unit-tested
off-device. Everything else needs hardware.
