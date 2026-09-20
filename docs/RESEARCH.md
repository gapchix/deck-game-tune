# Research log

All figures dated **2026-09-20**. Sources: the Decky plugin store API
(`https://plugins.deckbrew.xyz/plugins`), the GitHub API, and all 498 issues in
[`DeckSettings/game-reports-steamos`](https://github.com/DeckSettings/game-reports-steamos).

## Why this idea and not another

Six ideas were screened against **both** the Decky store catalogue (110 plugins) **and** GitHub.
Checking only the store is not sufficient — several capable plugins are distributed by release zip
and never listed.

| Idea | Verdict | Why |
|---|---|---|
| Storage janitor | **Killed** | `Storage Cleaner` v1.4.0, `Games Prefix Manager`, `MicroSDeck` |
| "What should I play" | **Killed** | `SuggestMe` v1.5.3 is exactly it; plus `Deck Progress Tracker`, `HLTB for Deck`, `TabMaster` |
| Dock-aware profiles | **Killed** | [`datbird/docky`](https://github.com/datbird/docky) — triggers, modes, fan curves, TDP profiles, in-Game-Mode editor. v1.4.11, actively pushed. **Not in the store**, which is how the first pass missed it |
| Achievement "what next" | **Killed** | six plugins, two active (`cheevodeck`, `achievement-companion`, `Decky-Achievement`, `SDAchievement`, …) |
| Battery prediction ("Range") | **Open** | see below — real gap, but a wide prior |
| **Apply community settings** | **Open — chosen** | see below |
| Deck config backup/migration | Open | zero search hits, but a once-a-year tool; weak pull |
| Co-op matchmaker | Open | only `FriendsBar` (0 stars) nearby; Steam friend-privacy defaults are a real risk |

### The chosen lane

`Deck Settings` (`DeckSettings/decky-game-settings`) has **125,831 downloads**. Its own feature
list is *"fetches and displays"*. Verified by reading its source: the frontend is views + fetch +
GitHub report submission; `main.py` does image upload, a DMI vendor read and a mounts read.
**Zero writes** — no sysfs, no `SpecifyCompatTool`, no launch options.

It even ships an `onGameStartWithReports` notification — it taps you on the shoulder when it has
settings for your game, then makes you apply them by hand.

Only competitor for the apply step: `jacobdonahoe/decky-game-optimizer` — **one commit, "Initial
release", 2026-03-10, never touched since, 0 stars.** An abandoned stub, not an incumbent.

Demand for this data is therefore *measured*, not inferred — the hardest thing to validate is
already done by someone else's install count.

## What the data supports

498 reports parsed, of which **371 are Steam Deck**.

### Actionable settings (Steam Deck only, n=371)

"Actionable" excludes no-op defaults. The template marks several fields required, so a naive
fill-rate shows a misleading 100% for `Steam Play Compatibility Tool Used` ("Steam Proton" +
"default" = no change) and `Scaling Filter` ("Linear" = the default).

| Setting | Count | Share |
|---|---:|---:|
| Frame limit (a number) | 202 | 54% |
| TDP limit (a number) | 133 | 36% |
| Proton override (non-default tool or pinned version) | 105 | 28% |
| Resolution override (non-Default) | 102 | 27% |
| Launch options (beyond bare `%command%`) | 50 | 13% |
| Manual GPU clock | 45 | 12% |
| Scaling filter (non-Linear) | 42 | 11% |
| Half-rate shading ON | 6 | 2% |
| VRR ON | 3 | 1% |

- **316 / 371 (85%)** have at least one actionable setting
- **224 distinct Deck games** have something to apply
- **2.2** actionable settings per such report on average — a small bundle, not one toggle, which
  is exactly what makes doing it by hand annoying
- Only **83 reports (22%) / 61 games** carry *both* a TDP limit and a frame limit

Half-rate shading and VRR are noise; cut them from v1.

### Device labels are dirty

`Valve Steam Deck OLED` (200) and `Steam Deck OLED` (60) are the same device under two labels;
same for the LCD variants. Normalisation is required before filtering, and OLED/LCD must be kept
separate — different APU process and battery capacity.

## The "Range" idea, and why it was parked

Battery prediction survived the same screen — the category is stale (`Battery Tracker` is v0.2.0
from March 2024, still tagged `template`; `PowerTools` is manual knobs; `AutoSuspend` only
suspends) and GitHub turned up nothing doing prediction.

The problem is the data. `average_battery_power_draw` is reported at 1-watt granularity (good),
71.5% fill rate (good), 245 distinct games (usable) — but wattage is **a property of the
reporter's settings, not of the game**:

```
Hollow Knight     4 reports:  17W, 10W, 5W, 10W          ← 3.4x spread on a 2D indie
Hogwarts Legacy   7 reports:  15, 10, 10, 10, 29, 29, 29 ← bimodal
Cyberpunk 2077    5 reports:  34, 36, 30, 22, 21
```

A pooled average for Hollow Knight (10.5W) spans "8 hours" to "2.4 hours". Useless as a point
estimate. It works only as a *range conditioned on settings*, collapsing toward a point as the
user's own measured sessions accumulate.

Also note the API already returns `calculated_battery_life_minutes` per report — part of that
value proposition exists upstream.

Parked, not dead: it composes naturally on top of Deck Game Tune later — apply the settings, then report
what they actually cost you, and feed the measurement back.

## Toolchain notes

- Node ≥ 16.14, pnpm 9 (`npm i -g pnpm@9` — CI on plugin submission is version-sensitive)
- Distribution package: `dist/index.js`, `package.json`, `plugin.json`, `LICENSE`, `main.py`
- Custom backends compile from `backend/src` to `backend/out`
- Store submission is a PR to the plugin database against a **public** repo — private is not an
  option if we want to be listed
