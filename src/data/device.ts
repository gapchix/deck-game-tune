/**
 * Which handheld is this, and which community reports apply to it.
 *
 * Two problems this module exists to solve:
 *
 *  1. Steam Deck LCD and OLED differ enough in APU efficiency and battery
 *     capacity that their reports must not be pooled.
 *  2. The community report corpus labels the same device several ways —
 *     "Valve Steam Deck OLED" (200 reports) and "Steam Deck OLED" (60) are
 *     one device. Matching on the raw string silently loses three quarters
 *     of the data.
 */

export type DeckModel = 'lcd' | 'oled' | 'unknown';

export interface DeviceDmi {
  vendor: string;
  product: string;
}

export interface Device {
  model: DeckModel;
  /** Human label for the UI, e.g. "Steam Deck OLED". */
  label: string;
  /** True when this is Valve hardware we have a confident model for. */
  isSteamDeck: boolean;
}

/** DMI product codenames for Valve hardware. */
const DMI_CODENAMES: Record<string, DeckModel> = {
  jupiter: 'lcd',
  galileo: 'oled',
};

const MODEL_LABELS: Record<DeckModel, string> = {
  lcd: 'Steam Deck LCD',
  oled: 'Steam Deck OLED',
  unknown: 'Unknown device',
};

export function identifyDevice(dmi: DeviceDmi): Device {
  const model = DMI_CODENAMES[dmi.product.trim().toLowerCase()] ?? 'unknown';
  return {
    model,
    label: MODEL_LABELS[model],
    isSteamDeck: model !== 'unknown',
  };
}

/**
 * Normalise a report's free-text `device` field to a model.
 *
 * Returns `unknown` for other handhelds (Legion Go, ROG Ally, …) — those
 * reports are not discarded outright, but they are ranked below same-device
 * ones and their numbers must be clamped before use.
 */
export function normaliseReportDevice(raw: string | null | undefined): DeckModel {
  if (!raw) return 'unknown';
  const s = raw.toLowerCase();

  if (!s.includes('steam deck')) return 'unknown';
  if (s.includes('oled')) return 'oled';
  // Everything else Valve-branded is an LCD variant: the corpus carries
  // "Steam Deck LCD (256GB/512GB)", "Valve Steam Deck LCD (64GB)", and
  // bare "Steam Deck".
  return 'lcd';
}

/** True when a report was written on the same model the user is holding. */
export function isSameModel(device: Device, reportDevice: string | null | undefined): boolean {
  return device.model !== 'unknown' && normaliseReportDevice(reportDevice) === device.model;
}
