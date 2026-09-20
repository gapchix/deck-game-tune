import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { GameDetails, Report, ReportData } from '../src/api/deckVerified';
import type { Device } from '../src/data/device';
import {
  bestTierGroup,
  coerceNumber,
  coerceString,
  countActionable,
  deviceTierFor,
  hasInGameSettings,
  hasMeaningfulSpread,
  parseRating,
  rankReports,
  toIntentOptions,
} from '../src/data/reports';

function fixture(name: string): GameDetails {
  const url = new URL(`../fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as GameDetails;
}

const OLED: Device = { model: 'oled', label: 'Steam Deck OLED', isSteamDeck: true };
const LCD: Device = { model: 'lcd', label: 'Steam Deck LCD', isSteamDeck: true };

function report(data: Partial<ReportData>, extra: Partial<Report> = {}): Report {
  return { id: 1, number: 1, data: data as ReportData, ...extra };
}

describe('coercion', () => {
  it('treats the corpus placeholders as absent', () => {
    for (const v of ['Unknown', '_No response_', 'N/A', 'null', 'None', '', '  ']) {
      expect(coerceString(v)).toBeNull();
    }
    expect(coerceNumber('Unknown')).toBeNull();
  });

  it('accepts numbers arriving as either strings or numbers', () => {
    expect(coerceNumber('12')).toBe(12);
    expect(coerceNumber(12)).toBe(12);
    expect(coerceNumber(null)).toBeNull();
  });
});

describe('parseRating', () => {
  it('reads the (n/5) suffix', () => {
    expect(parseRating('★★★★★ (5/5)')).toBe(5);
    expect(parseRating('★★★★☆ (4/5)')).toBe(4);
  });

  it('falls back to counting stars', () => {
    expect(parseRating('★★★')).toBe(3);
  });

  it('returns null when the reporter left it blank', () => {
    expect(parseRating('-')).toBe(null);
    expect(parseRating(null)).toBeNull();
    expect(parseRating('Unknown')).toBeNull();
  });
});

describe('countActionable', () => {
  it('ignores the defaults that the template forces reporters to fill in', () => {
    // Required fields at their default values mean "no change" — counting them
    // would make almost every report look actionable when it is not.
    expect(
      countActionable({
        steam_play_compatibility_tool_used: 'Steam Proton',
        compatibility_tool_version: 'default',
        scaling_filter: 'Linear',
        game_resolution: 'Default',
        custom_launch_options: '%command%',
      } as ReportData),
    ).toBe(0);
  });

  it('counts a pinned Proton build even under the stock tool name', () => {
    expect(
      countActionable({
        steam_play_compatibility_tool_used: 'Steam Proton',
        compatibility_tool_version: 'Proton 7.0.6',
      } as ReportData),
    ).toBe(1);
  });

  it('excludes the noise fields', () => {
    // Half-rate shading appears in 2% of reports and VRR in 1%; both are cut.
    expect(
      countActionable({ half_rate_shading: 'On', enable_vrr: 'On' } as ReportData),
    ).toBe(0);
  });

  it('counts a real report', () => {
    expect(
      countActionable({
        tdp_limit: '14',
        frame_limit: '40',
        steam_play_compatibility_tool_used: 'Glorious Eggroll Proton (GE)',
        compatibility_tool_version: 'GE-proton10-30',
        custom_launch_options: 'WINEDLLOVERRIDES="dsound=n,b" %command%',
        game_resolution: '1024x640',
      } as ReportData),
    ).toBe(5);
  });
});

describe('deviceTierFor', () => {
  it('matches across the duplicate OLED labels', () => {
    expect(deviceTierFor(OLED, { device: 'Valve Steam Deck OLED' } as ReportData)).toBe('exact');
    expect(deviceTierFor(OLED, { device: 'Steam Deck OLED' } as ReportData)).toBe('exact');
  });

  it('treats the other Deck revision as a sibling, not a match', () => {
    expect(deviceTierFor(OLED, { device: 'Steam Deck LCD (64GB)' } as ReportData)).toBe('sibling');
  });

  it('treats other handhelds as other', () => {
    expect(deviceTierFor(OLED, { device: 'Lenovo Legion Go S' } as ReportData)).toBe('other');
  });
});

describe('rankReports', () => {
  it('drops reports with nothing we could apply', () => {
    const ranked = rankReports(
      [
        report({ device: 'Steam Deck OLED', scaling_filter: 'Linear' }),
        report({ device: 'Steam Deck OLED', tdp_limit: '10' }),
      ],
      OLED,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0].actionable).toBe(1);
  });

  it('puts the closest hardware first even when a worse-matching report is rated higher', () => {
    const ranked = rankReports(
      [
        report({ device: 'Lenovo Legion Go', tdp_limit: '30', performance_rating: '★★★★★ (5/5)' }),
        report({ device: 'Steam Deck OLED', tdp_limit: '10', performance_rating: '★★★☆☆ (3/5)' }),
      ],
      OLED,
    );
    expect(ranked[0].tier).toBe('exact');
    expect(ranked[1].tier).toBe('other');
  });

  it('sorts unrated reports below rated ones', () => {
    const ranked = rankReports(
      [
        report({ device: 'Steam Deck OLED', tdp_limit: '10', performance_rating: '-' }),
        report({ device: 'Steam Deck OLED', tdp_limit: '12', performance_rating: '★★★★☆ (4/5)' }),
      ],
      OLED,
    );
    expect(ranked[0].rating).toBe(4);
    expect(ranked[1].rating).toBeNull();
  });
});

describe('real fixture: Hollow Knight: Silksong', () => {
  const game = fixture('hollow-knight-silksong');

  it('matches both reports despite the inconsistent device labels', () => {
    // The corpus writes the same device as "Valve Steam Deck OLED" and
    // "Steam Deck OLED". Matching raw strings would find one of the two.
    const ranked = rankReports(game.reports, OLED);
    expect(ranked).toHaveLength(2);
    expect(ranked.every((r) => r.tier === 'exact')).toBe(true);
  });

  it('treats the same reports as siblings on an LCD', () => {
    const ranked = rankReports(game.reports, LCD);
    expect(ranked.every((r) => r.tier === 'sibling')).toBe(true);
  });

  it('is one of the minority of games with a real choice to offer', () => {
    // 8W/90fps vs 7W/60fps — a 30fps spread, so the picker is warranted here.
    const group = bestTierGroup(rankReports(game.reports, OLED));
    expect(hasMeaningfulSpread(group)).toBe(true);

    const options = toIntentOptions(group);
    expect(options.map((o) => o.intent)).toEqual(['battery', 'performance']);
    expect(coerceNumber(options[0].ranked.report.data.frame_limit)).toBe(60);
    expect(coerceNumber(options[1].ranked.report.data.frame_limit)).toBe(90);
  });
});

describe('real fixture: Cyberpunk 2077', () => {
  const game = fixture('cyberpunk-2077');

  it('degrades to sibling reports when the game has none for your model', () => {
    // Six reports, zero OLED: three Steam Deck LCD and three Legion Go.
    // Returning nothing here would be wrong; so would silently pretending
    // a Legion Go report is a Deck one.
    const ranked = rankReports(game.reports, OLED);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].tier).toBe('sibling');
    expect(ranked.some((r) => r.tier === 'exact')).toBe(false);
  });

  it('offers only the closest tier as alternatives', () => {
    const group = bestTierGroup(rankReports(game.reports, OLED));
    expect(group.every((r) => r.tier === 'sibling')).toBe(true);
  });

  it('finds exact matches for an LCD', () => {
    const ranked = rankReports(game.reports, LCD);
    expect(ranked[0].tier).toBe('exact');
  });
});

describe('hasInGameSettings', () => {
  it('flags the 42% of reports carrying settings no plugin can apply', () => {
    expect(hasInGameSettings({ game_graphics_settings: '#### QUICK PRESET' } as ReportData)).toBe(
      true,
    );
    expect(hasInGameSettings({} as ReportData)).toBe(false);
  });
});
