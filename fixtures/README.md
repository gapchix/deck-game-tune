# Test fixtures

Real, unmodified responses from the [Deck Verified](https://deckverified.games/) API, captured
2026-09-20 and used only to unit-test the pure logic in `src/data/`. The plugin itself fetches
live from the API at runtime — it does not ship or vendor this data.

The report content belongs to the Deck Verified community contributors and is published under
GPL-3.0 as part of
[`DeckSettings/game-reports-steamos`](https://github.com/DeckSettings/game-reports-steamos).
This project's own code is MIT; these two files are third-party content included for testing,
under their original licence.

| File | Why it's here |
|---|---|
| `hollow-knight-silksong.json` | Both reports are OLED but labelled differently (`Valve Steam Deck OLED` vs `Steam Deck OLED`) — the device-normalisation case. They also disagree meaningfully (8W/90fps vs 7W/60fps), which exercises the intent picker. |
| `cyberpunk-2077.json` | Six reports and **none** from an OLED — three Steam Deck LCD, three Legion Go. Exercises tier fallback, and the rule that a report from different hardware must never be presented as a match. |

To refresh:

```bash
curl -s "https://deckverified.games/deck-verified/api/v1/game_details?appid=1030300&include_external=false" \
  -o fixtures/hollow-knight-silksong.json
```

Expect the tests to need updating if you do — they assert against the specific reports that
existed on the capture date.
