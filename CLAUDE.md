# Deck Game Tune — working notes

A Decky Loader plugin that applies community-proven Steam Deck game settings in one tap.

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before touching anything.** It records which
`SteamClient` APIs were verified and where. [`docs/RESEARCH.md`](docs/RESEARCH.md) explains why
this idea and not a different one — don't re-derive that; it cost a full session.

## Status

Pre-alpha. M1 (toolchain, running-app trigger, device identity) and M2 (API client, report
ranking) have landed. **Next: M3** — the pure `ApplyPlan` builder.

[`docs/SPIKE.md`](docs/SPIKE.md) gates only `Perf.UpdateSettings` — frame limit, TDP, GPU clock
and scaling filter. Don't build on that call until it's answered on hardware. Everything else,
including the whole Tier A apply path (Proton, launch options, resolution), is unaffected and
should proceed.

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

Everything under `src/data/` and `src/apply/plan.ts` is pure — no network, no `SteamClient` — and
that is where the real logic lives: device normalisation, report ranking, clamping, no-op
elimination. Test it off-device with Vitest against the real API captures in `fixtures/`, and
push logic down into these modules rather than into components so it stays testable.

Everything else needs hardware. `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build` should
all pass before a commit.

Two corpus facts worth not rediscovering, both encoded in tests:

- The same device is labelled several ways (`Valve Steam Deck OLED` 200 reports vs
  `Steam Deck OLED` 60). Matching raw strings loses most of the data.
- A game can have several reports and none from your model — Cyberpunk 2077 has six, zero OLED.
  Matching must degrade through tiers, and a report from other hardware must never be presented
  as if it were a match.
