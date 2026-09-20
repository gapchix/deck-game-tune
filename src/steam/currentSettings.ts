/**
 * Reading what the machine is set to right now.
 *
 * This is the "from" side of every diff row and the content of every revert
 * snapshot, so a wrong read here shows the user a false diff. When a value
 * cannot be read we return null (meaning "unset") rather than guessing.
 *
 * The tier C fields are null until the protobuf spike lands (docs/SPIKE.md);
 * they come from Perf.RegisterForStateChanges, not from SteamClient.Apps.
 */

import type { CurrentSettings } from '../apply/plan';
import { getResolutionOverride, readAppDetails } from './apps';

export async function readCurrentSettings(appId: number): Promise<CurrentSettings> {
  const [details, resolution] = await Promise.all([
    readAppDetails(appId),
    getResolutionOverride(appId),
  ]);

  const launchOptions = (details?.strLaunchOptions ?? '').trim();
  const compatTool = (details?.strCompatToolName ?? '').trim();

  return {
    launchOptions: launchOptions === '' ? null : launchOptions,
    compatTool: compatTool === '' ? null : compatTool,
    resolution,

    // Tier C — not readable until the spike lands.
    tdpLimit: null,
    isTdpLimitEnabled: false,
    frameLimit: null,
    isFrameLimitEnabled: false,
    gpuClock: null,
    scalingFilter: null,
  };
}
