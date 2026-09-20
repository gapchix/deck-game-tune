# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Pre-alpha. Nothing released yet.

### Added

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
