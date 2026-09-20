/**
 * Turning a pile of community reports into "the one to show you".
 *
 * Pure module — no network, no SteamClient. Everything here is unit-tested
 * against real API responses in `fixtures/`.
 *
 * Two facts from the corpus drive the design:
 *
 *  - 81% of Deck games have exactly one report, so the common case is "show
 *    the single one you have", not "let the user choose".
 *  - A game can have six reports and none from your model (Cyberpunk 2077 has
 *    three Steam Deck LCD and three Legion Go, zero OLED), so matching must
 *    degrade through tiers rather than return nothing.
 */

import type { Report, ReportData } from '../api/deckVerified';
import { normaliseReportDevice, type Device } from './device';

/** How well a report's hardware matches the user's. */
export type DeviceTier = 'exact' | 'sibling' | 'other';

export interface RankedReport {
  report: Report;
  tier: DeviceTier;
  /** 1-5, or null when the reporter left it blank. */
  rating: number | null;
  /** How many settings we could actually apply from this report. */
  actionable: number;
  updatedAt: number;
}

const NON_VALUES = new Set(['', 'unknown', '_no response_', 'n/a', 'null', 'none']);

/** Normalise an API value to a trimmed string, or null when it carries no information. */
export function coerceString(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return NON_VALUES.has(s.toLowerCase()) ? null : s;
}

export function coerceNumber(value: string | number | null | undefined): number | null {
  const s = coerceString(value);
  if (s === null) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** "★★★★☆ (4/5)" -> 4. Returns null when absent or unparseable. */
export function parseRating(raw: string | null | undefined): number | null {
  const s = coerceString(raw ?? null);
  if (s === null) return null;
  const m = /(\d+)\s*\/\s*5/.exec(s);
  if (m) {
    const n = Number.parseInt(m[1], 10);
    return n >= 1 && n <= 5 ? n : null;
  }
  // Fall back to counting filled stars, in case the "(n/5)" suffix is dropped.
  const stars = (s.match(/★/g) ?? []).length;
  return stars >= 1 && stars <= 5 ? stars : null;
}

export function deviceTierFor(device: Device, data: ReportData): DeviceTier {
  const reported = normaliseReportDevice(data.device);
  if (reported === 'unknown') return 'other';
  if (device.model !== 'unknown' && reported === device.model) return 'exact';
  // A Deck report from the other panel revision: same family, close enough to
  // be useful, different enough to be worth saying out loud.
  return 'sibling';
}

/**
 * How many settings in this report we could actually write.
 *
 * Counts only values that would *change* something. The report template marks
 * several fields required, so "filled in" is not the same as "actionable":
 * "Steam Proton / default" and "Scaling Filter: Linear" are the defaults and
 * mean no change. Half-rate shading (2% of reports) and VRR (1%) are noise
 * and are excluded entirely.
 */
export function countActionable(data: ReportData): number {
  let n = 0;

  if (coerceNumber(data.tdp_limit) !== null) n++;
  if (coerceNumber(data.frame_limit) !== null) n++;
  if (coerceNumber(data.manual_gpu_clock) !== null) n++;

  const launch = coerceString(data.custom_launch_options);
  if (launch && launch.toLowerCase() !== '%command%') n++;

  const tool = coerceString(data.steam_play_compatibility_tool_used);
  const version = coerceString(data.compatibility_tool_version);
  const customTool = tool !== null && !/^steam proton$/i.test(tool);
  const pinnedVersion = version !== null && !/^default$/i.test(version);
  if (customTool || pinnedVersion) n++;

  const resolution = coerceString(data.game_resolution);
  if (resolution && !/^default$/i.test(resolution)) n++;

  const filter = coerceString(data.scaling_filter);
  if (filter && !/^(linear|auto)$/i.test(filter)) n++;

  return n;
}

/** True when a report carries in-game settings we can show but never apply. */
export function hasInGameSettings(data: ReportData): boolean {
  return (
    coerceString(data.game_graphics_settings) !== null ||
    coerceString(data.game_display_settings) !== null
  );
}

const TIER_ORDER: Record<DeviceTier, number> = { exact: 0, sibling: 1, other: 2 };

/**
 * Rank reports for this device, dropping any with nothing to apply.
 *
 * Order: closest hardware first, then the community's own rating, then how
 * much it can actually do for us, then recency. Reactions are deliberately
 * not used — they are almost always zero across the corpus.
 */
export function rankReports(reports: Report[], device: Device): RankedReport[] {
  return reports
    .filter((r) => r && r.data)
    .map((report) => ({
      report,
      tier: deviceTierFor(device, report.data),
      rating: parseRating(report.data.performance_rating),
      actionable: countActionable(report.data),
      updatedAt: Date.parse(report.updated_at ?? report.created_at ?? '') || 0,
    }))
    .filter((r) => r.actionable > 0)
    .sort(
      (a, b) =>
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
        (b.rating ?? -1) - (a.rating ?? -1) ||
        b.actionable - a.actionable ||
        b.updatedAt - a.updatedAt,
    );
}

/** The reports worth offering as alternatives: the best tier that has any. */
export function bestTierGroup(ranked: RankedReport[]): RankedReport[] {
  if (ranked.length === 0) return [];
  const tier = ranked[0].tier;
  return ranked.filter((r) => r.tier === tier);
}

/**
 * Whether two or more reports differ enough to be worth offering as a choice.
 *
 * Measured across the corpus, only 7.8% of Deck games clear this bar — which
 * is exactly why the UI shows a single recommendation by default and only
 * reveals a picker when there is a real decision to make.
 */
export function hasMeaningfulSpread(group: RankedReport[]): boolean {
  if (group.length < 2) return false;

  const tdps = group.map((r) => coerceNumber(r.report.data.tdp_limit)).filter((v): v is number => v !== null);
  const fpss = group.map((r) => coerceNumber(r.report.data.frame_limit)).filter((v): v is number => v !== null);

  const spread = (xs: number[]) => (xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0);

  return spread(tdps) >= 4 || spread(fpss) >= 10;
}

export type Intent = 'battery' | 'balanced' | 'performance';

export interface IntentOption {
  intent: Intent;
  ranked: RankedReport;
}

/**
 * Label a group of differing reports by what they trade off.
 *
 * Labels are assigned *relative to each other*, not against absolute
 * thresholds — 30fps at 8W is "performance" for a heavy game and "battery"
 * for a light one, and inventing fixed cutoffs would misdescribe both.
 */
export function toIntentOptions(group: RankedReport[]): IntentOption[] {
  if (!hasMeaningfulSpread(group)) return [];

  const score = (r: RankedReport) => {
    const fps = coerceNumber(r.report.data.frame_limit);
    const tdp = coerceNumber(r.report.data.tdp_limit);
    // Frame target dominates; power breaks ties.
    return (fps ?? 0) * 10 + (tdp ?? 0);
  };

  const sorted = [...group].sort((a, b) => score(a) - score(b));

  if (sorted.length === 2) {
    return [
      { intent: 'battery', ranked: sorted[0] },
      { intent: 'performance', ranked: sorted[1] },
    ];
  }

  const out: IntentOption[] = [{ intent: 'battery', ranked: sorted[0] }];
  for (let i = 1; i < sorted.length - 1; i++) out.push({ intent: 'balanced', ranked: sorted[i] });
  out.push({ intent: 'performance', ranked: sorted[sorted.length - 1] });
  return out;
}
