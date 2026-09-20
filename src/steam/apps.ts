/**
 * Thin wrappers over `SteamClient.Apps`.
 *
 * Everything here touches the live Steam UI and therefore can only be tested
 * on a Deck. Keep it thin on purpose: no decisions live here, so the logic
 * that *can* be tested stays in `src/apply/plan.ts` and `src/data/`.
 *
 * Verified against decky-frontend-lib `src/globals/steam-client/App.ts`.
 */

import type { CompatTool } from '../apply/plan';

interface Unregisterable {
  unregister: () => void;
}

/** The fields of AppDetails we actually read. */
interface AppDetailsSubset {
  strLaunchOptions?: string;
  strCompatToolName?: string;
  strCompatToolDisplayName?: string;
}

declare const SteamClient: {
  Apps: {
    RegisterForAppDetails: (
      appId: number,
      cb: (details: AppDetailsSubset) => void,
    ) => Unregisterable;
    GetResolutionOverrideForApp: (appId: number) => Promise<string>;
    GetAvailableCompatTools: (appId: number) => Promise<CompatTool[]>;
    SetAppLaunchOptions: (appId: number, launchOptions: string) => void;
    SpecifyCompatTool: (appId: number, strToolName: string) => void;
    SetAppResolutionOverride: (appId: number, resolution: string) => void;
  };
};

const DETAILS_TIMEOUT_MS = 5000;

/**
 * One-shot read of an app's details.
 *
 * `RegisterForAppDetails` is a subscription, not a getter, so we take the
 * first value and unregister. The timeout matters: a registration that never
 * fires would otherwise hang the panel forever with no explanation.
 */
export function readAppDetails(appId: number): Promise<AppDetailsSubset | null> {
  return new Promise((resolve) => {
    let settled = false;
    let registration: Unregisterable | null = null;

    const finish = (value: AppDetailsSubset | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        registration?.unregister();
      } catch {
        /* the UI may already have torn it down */
      }
      resolve(value);
    };

    const timer = setTimeout(() => {
      console.warn(`[deck-game-tune] app details timed out for ${appId}`);
      finish(null);
    }, DETAILS_TIMEOUT_MS);

    try {
      registration = SteamClient.Apps.RegisterForAppDetails(appId, (details) => finish(details));
    } catch (err) {
      console.error('[deck-game-tune] RegisterForAppDetails threw', err);
      finish(null);
    }
  });
}

export async function getResolutionOverride(appId: number): Promise<string | null> {
  try {
    const value = await SteamClient.Apps.GetResolutionOverrideForApp(appId);
    const s = (value ?? '').trim();
    return s === '' ? null : s;
  } catch (err) {
    console.error('[deck-game-tune] GetResolutionOverrideForApp failed', err);
    return null;
  }
}

export async function getAvailableCompatTools(appId: number): Promise<CompatTool[]> {
  try {
    const tools = await SteamClient.Apps.GetAvailableCompatTools(appId);
    return Array.isArray(tools) ? tools : [];
  } catch (err) {
    console.error('[deck-game-tune] GetAvailableCompatTools failed', err);
    return [];
  }
}

/** The write side, matching the `SteamWriter` contract in `apply/execute.ts`. */
export const steamWriter = {
  setLaunchOptions(appId: number, value: string): void {
    SteamClient.Apps.SetAppLaunchOptions(appId, value);
  },
  specifyCompatTool(appId: number, toolName: string): void {
    SteamClient.Apps.SpecifyCompatTool(appId, toolName);
  },
  setResolutionOverride(appId: number, resolution: string): void {
    SteamClient.Apps.SetAppResolutionOverride(appId, resolution);
  },
};
