# Contributing

Thanks for helping. The most valuable contributions here are **device reports** — Deck Game Tune can only
apply what the community has written down, so if a game you play isn't covered, the highest-impact
thing you can do is [submit a report to Deck Verified](https://deckverified.games/) rather than
open a PR here.

The second most valuable thing is telling us when an applied setting made things *worse*, with
your device and the game. That's the data we can't get any other way.

## Development setup

Requirements: Node.js ≥ 16.14 and **pnpm 9** (not npm — the plugin-store CI is version-sensitive).

```bash
npm i -g pnpm@9
pnpm install
pnpm run build      # emits dist/index.js
```

## Testing on a Deck

Most of this plugin talks to `SteamClient`, which only exists inside Steam's UI. That means:

- **Anything touching `SteamClient` needs a real Steam Deck.** Type-checking is not evidence that
  a call works.
- `src/apply/plan.ts` is deliberately pure — `(report, currentState, limits) => ApplyPlan` — so
  device filtering, clamping and no-op elimination can be tested off-device. Put logic there where
  you can.

To deploy a build to your Deck, enable Developer mode in Decky, set a password in Desktop Mode,
and copy the built plugin to `~/homebrew/plugins/`.

## Before you open a PR

- Check any new `SteamClient` call against the current
  [`decky-frontend-lib`](https://github.com/SteamDeckHomebrew/decky-frontend-lib) type definitions
  under `src/globals/steam-client/`. These are undocumented internal APIs and Valve changes them.
- Don't add a code path that changes a user's machine without showing them a diff first, and don't
  add one that can't be reverted. Those two rules are the whole trust model — see
  [CLAUDE.md](CLAUDE.md).
- If you discover something about the Steam APIs the hard way, write it into
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), including what *didn't* work. Nobody should have
  to rediscover it.

## Credit where it's due

Settings data comes from [Deck Verified](https://deckverified.games/) and its contributors
([`DeckSettings/game-reports-steamos`](https://github.com/DeckSettings/game-reports-steamos),
GPL-3.0). We read their public API and do not vendor their data. Please keep it that way, cache
politely, and never poll.
