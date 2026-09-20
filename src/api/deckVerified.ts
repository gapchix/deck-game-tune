/**
 * Client for the Deck Verified API.
 *
 * https://deckverified.games/deck-verified/api/v1
 *
 * This is a free, volunteer-run service and the source of everything this
 * plugin knows. Be a good citizen: one request per app, cached, never polled.
 * The data belongs to the people who wrote the reports — we read it, we do
 * not vendor it, and the UI credits them.
 */

import { fetchNoCors } from '@decky/api';

export const API_BASE = 'https://deckverified.games/deck-verified/api/v1';

/** Raw report fields, exactly as the API returns them. Values are strings or null. */
export interface ReportData {
  game_name?: string | null;
  app_id?: string | number | null;
  launcher?: string | null;
  device?: string | null;
  os_version?: string | null;

  target_framerate?: string | null;
  average_battery_power_draw?: string | number | null;
  calculated_battery_life_minutes?: number | null;

  steam_play_compatibility_tool_used?: string | null;
  compatibility_tool_version?: string | null;
  custom_launch_options?: string | null;

  game_resolution?: string | null;
  frame_limit?: string | number | null;
  disable_frame_limit?: string | null;
  enable_vrr?: string | null;
  allow_tearing?: string | null;
  half_rate_shading?: string | null;
  tdp_limit?: string | number | null;
  manual_gpu_clock?: string | number | null;
  scaling_mode?: string | null;
  scaling_filter?: string | null;

  /** Markdown. Cannot be applied — every game has its own config format. */
  game_display_settings?: string | null;
  /** Markdown. Cannot be applied. */
  game_graphics_settings?: string | null;

  additional_notes?: string | null;
  /** e.g. "★★★★★ (5/5)" */
  performance_rating?: string | null;
}

export interface Report {
  id: number;
  number: number;
  title?: string;
  html_url?: string;
  data: ReportData;
  reactions?: {
    reactions_thumbs_up?: number;
    reactions_thumbs_down?: number;
  };
  comments?: number;
  labels?: Array<{ name?: string } | string>;
  user?: { login?: string; avatar_url?: string };
  created_at?: string;
  updated_at?: string;
}

export interface GameDetails {
  gameName: string;
  appId: number;
  reports: Report[];
  /** Prose summary across all reports. Useful context, not a source of settings. */
  reports_summary?: string;
  metadata?: Record<string, unknown>;
}

export interface GameSearchResult {
  gameName: string;
  appId: number;
}

/** Cache entries live this long. Reports change on the order of weeks. */
const CACHE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  at: number;
  value: GameDetails | null;
}

const cache = new Map<number, CacheEntry>();

/** Exposed for tests and for a manual refresh button. */
export function clearCache(): void {
  cache.clear();
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetchNoCors(url, { method: 'GET' });
  if (!res.ok) {
    console.error(`[deck-game-tune] ${res.status} ${res.statusText} for ${url}`);
    return null;
  }
  return (await res.json()) as T;
}

/**
 * Reports for one Steam app. Returns null when the service is unreachable,
 * and a GameDetails with an empty `reports` array when the game is simply
 * not covered — the caller must tell those two apart in the UI.
 */
export async function fetchReportsForApp(appId: number): Promise<GameDetails | null> {
  const hit = cache.get(appId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  try {
    const value = await getJson<GameDetails>(
      `${API_BASE}/game_details?appid=${encodeURIComponent(String(appId))}&include_external=false`,
    );
    cache.set(appId, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.error('[deck-game-tune] fetchReportsForApp failed', err);
    return null;
  }
}

/** Name search, for games whose app id has no reports (or non-Steam titles later). */
export async function searchGames(term: string): Promise<GameSearchResult[]> {
  if (term.trim().length < 3) return [];
  try {
    const results = await getJson<GameSearchResult[]>(
      `${API_BASE}/search_games?term=${encodeURIComponent(term)}&include_external=false`,
    );
    return Array.isArray(results) ? results : [];
  } catch (err) {
    console.error('[deck-game-tune] searchGames failed', err);
    return [];
  }
}
