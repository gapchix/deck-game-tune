/**
 * One place for the switches that the spike's outcome flips.
 */

/**
 * Whether `SteamClient.System.Perf.UpdateSettings` can be driven yet.
 *
 * False until the protobuf serialization question in docs/SPIKE.md is
 * answered on hardware. While it is false the plugin still works — it applies
 * Proton version, launch options and resolution — but TDP, frame limit, GPU
 * clock and scaling filter are shown as "not yet supported" rather than
 * silently dropped, so the UI never implies it did something it didn't.
 */
export const TIER_C_AVAILABLE = false;

export const DECK_VERIFIED_URL = 'https://deckverified.games';
