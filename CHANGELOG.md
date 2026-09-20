# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Pre-alpha. Nothing released yet.

### Added

- Tier A apply and revert. `src/apply/execute.ts` writes launch options, Proton version and
  resolution, always saving a revert point first — if that save fails, nothing is applied.
  `src/steam/apps.ts` wraps the SteamClient calls, `main.py` persists snapshots atomically.
- `src/ui/` — the Quick Access panel: the diff, clamp and blocked explanations, an Apply button,
  and Undo. The intent picker appears only when the reports for that game actually disagree,
  which measurement says is 7.8% of them.
- `docs/VERIFY.md` — the on-device checklist, including the assumptions that tests cannot cover.
- `src/apply/plan.ts` — the pure diff builder: `(report, current, limits) => ApplyPlan`. Clamps
  every number to what the hardware accepts, snaps frame caps to the options Steam actually
  offers, drops changes that would change nothing, blocks (rather than skips) a Proton build that
  is not installed, and carries in-game graphics settings through as read-only notes.
- `src/api/deckVerified.ts` — typed, cached client for the Deck Verified API. One request per
  app, 30-minute TTL, never polled.
- `src/data/reports.ts` — ranks reports for the user's hardware through device tiers
  (exact model / other Deck revision / different handheld), drops reports with nothing
  applicable, and decides when two reports differ enough to be worth offering as a choice.
- Real API responses in `fixtures/` covering device-label normalisation and the
  no-report-for-your-model fallback.
- Plugin toolchain: pnpm 9, `@decky/ui`, `@decky/api`, rollup via `@decky/rollup`, plus Vitest,
  ESLint and Prettier.
- `src/steam/session.ts` — tracks the running game via `RegisterForAppLifetimeNotifications`.
  Non-Steam shortcuts report app id 0 and are treated as "nothing we can help with" rather than
  guessed at.
- `src/data/device.ts` — identifies the handheld from DMI (`Jupiter` = LCD, `Galileo` = OLED) and
  normalises the community corpus' inconsistent device labels.
- `main.py` — DMI read and atomic snapshot persistence under `DECKY_PLUGIN_SETTINGS_DIR`.
- Repository scaffold, licence and contribution guide.
- `docs/ARCHITECTURE.md` — verified `SteamClient` API surface for applying settings, the Deck
  Verified API shape, and the proposed module layout.
- `docs/RESEARCH.md` — competitive screen across the Decky store and GitHub, and the measured
  fill rates that justify the feature set.
- `docs/SPIKE.md` — the one open feasibility question (`CMsgSystemPerfUpdateSettings`
  serialization) and how to answer it.
