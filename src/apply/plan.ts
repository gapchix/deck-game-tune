/**
 * Turning one community report into a diff we can show and then apply.
 *
 * Pure module. No network, no SteamClient, no React — everything it needs is
 * passed in, so the whole of it is testable off-device. This is deliberate:
 * it is the only place where a wrong decision silently changes someone's
 * machine, so it is the part that gets tested hardest.
 *
 * Three rules it exists to enforce:
 *
 *  1. Never propose a value the hardware can't take. Reports come from Legion
 *     Go and ROG Ally too, and a 30W suggestion must not reach a Deck.
 *  2. Never propose a change that changes nothing.
 *  3. Never claim we can apply something we can't — an uninstalled Proton
 *     build, or in-game graphics settings.
 */

import type { Report, ReportData } from '../api/deckVerified';
import type { Device } from '../data/device';
import { coerceNumber, coerceString, deviceTierFor, type DeviceTier } from '../data/reports';

/** Which mechanism writes this change. See docs/ARCHITECTURE.md. */
export type Mechanism =
  | 'SetAppLaunchOptions'
  | 'SpecifyCompatTool'
  | 'SetAppResolutionOverride'
  | 'Perf.UpdateSettings';

/** Tier A works today; tier C is gated on the protobuf spike (docs/SPIKE.md). */
export type Tier = 'A' | 'C';

export type ChangeKey =
  | 'launchOptions'
  | 'protonTool'
  | 'resolution'
  | 'tdpLimit'
  | 'frameLimit'
  | 'gpuClock'
  | 'scalingFilter';

export interface Clamp {
  requested: number;
  applied: number;
  reason: string;
}

export interface Change {
  key: ChangeKey;
  label: string;
  /** Current value in display form, or null when unset. */
  from: string | null;
  /** Value we would write, in display form. */
  to: string;
  tier: Tier;
  mechanism: Mechanism;
  /** The typed value the executor writes. */
  value: string | number;
  /** Present when the report's number was out of range for this hardware. */
  clamped?: Clamp;
  /** Present when we understand the change but cannot perform it. */
  blocked?: string;
}

/** ESplitScalingFilter, mirrored from the @decky/ui type definitions. */
export const SCALING_FILTER = {
  Invalid: 0,
  Linear: 1,
  Nearest: 2,
  FSR: 3,
  NIS: 4,
} as const;

export interface CurrentSettings {
  launchOptions: string | null;
  /** Steam's internal tool name, e.g. "GE-Proton10-30". Null means stock Proton. */
  compatTool: string | null;
  resolution: string | null;
  tdpLimit: number | null;
  isTdpLimitEnabled: boolean;
  frameLimit: number | null;
  isFrameLimitEnabled: boolean;
  gpuClock: number | null;
  scalingFilter: number | null;
}

/** The subset of SystemPerfLimits we act on. Nulls mean "unknown, don't clamp". */
export interface DeviceLimits {
  tdpMin: number | null;
  tdpMax: number | null;
  fpsOptions: number[] | null;
  gpuMinMhz: number | null;
  gpuMaxMhz: number | null;
}

/** One entry from SteamClient.Apps.GetAvailableCompatTools. */
export interface CompatTool {
  strToolName: string;
  strDisplayName?: string;
}

export interface PlanInput {
  appId: number;
  report: Report;
  device: Device;
  current: CurrentSettings;
  limits: DeviceLimits;
  availableCompatTools: CompatTool[];
}

export interface ApplyPlan {
  appId: number;
  device: Device;
  tier: DeviceTier;
  changes: Change[];
  /** Report content we can show but never apply. */
  inGame: { display: string | null; graphics: string | null };
  /** Things the user should read before pressing the button. */
  warnings: string[];
}

function clampNumber(
  requested: number,
  min: number | null,
  max: number | null,
  unit: string,
): { value: number; clamp?: Clamp } {
  if (min !== null && requested < min) {
    return {
      value: min,
      clamp: { requested, applied: min, reason: `below this device's minimum of ${min}${unit}` },
    };
  }
  if (max !== null && requested > max) {
    return {
      value: max,
      clamp: { requested, applied: max, reason: `above this device's maximum of ${max}${unit}` },
    };
  }
  return { value: requested };
}

/** Snap a frame cap to the nearest value Steam actually offers on this device. */
function snapToOption(requested: number, options: number[] | null): { value: number; clamp?: Clamp } {
  if (!options || options.length === 0) return { value: requested };
  if (options.includes(requested)) return { value: requested };

  const nearest = options.reduce((best, o) =>
    Math.abs(o - requested) < Math.abs(best - requested) ? o : best,
  );
  return {
    value: nearest,
    clamp: {
      requested,
      applied: nearest,
      reason: `this device only offers ${options.join(', ')} fps`,
    },
  };
}

/**
 * Find the installed compatibility tool matching what the report used.
 *
 * We can only select a Proton build the user already has — `SpecifyCompatTool`
 * takes an internal tool name, not a wish. Returns null when it isn't
 * installed, which becomes a blocked change rather than a silent skip.
 */
export function matchCompatTool(
  data: ReportData,
  available: CompatTool[],
): { tool: CompatTool | null; wanted: string | null } {
  const toolName = coerceString(data.steam_play_compatibility_tool_used);
  const version = coerceString(data.compatibility_tool_version);

  const isStock = toolName === null || /^steam proton$/i.test(toolName);
  const versionIsDefault = version === null || /^default$/i.test(version);

  // Stock Proton at its default version is what Steam already does.
  if (isStock && versionIsDefault) return { tool: null, wanted: null };

  const wanted = version && !versionIsDefault ? version : toolName;
  if (!wanted) return { tool: null, wanted: null };

  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
  const target = norm(wanted);

  const hit =
    available.find((t) => norm(t.strToolName) === target) ??
    available.find((t) => t.strDisplayName && norm(t.strDisplayName) === target) ??
    available.find((t) => norm(t.strToolName).includes(target)) ??
    available.find((t) => t.strDisplayName && norm(t.strDisplayName).includes(target));

  return { tool: hit ?? null, wanted };
}

function parseScalingFilter(raw: string | null): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  // Linear is the default — proposing it is a no-op, and 99% of reports carry it.
  if (s === 'linear' || s === 'auto') return null;
  if (s === 'nearest') return SCALING_FILTER.Nearest;
  if (s === 'fsr') return SCALING_FILTER.FSR;
  if (s === 'nis') return SCALING_FILTER.NIS;
  return null;
}

const FILTER_NAMES: Record<number, string> = {
  [SCALING_FILTER.Linear]: 'Linear',
  [SCALING_FILTER.Nearest]: 'Nearest',
  [SCALING_FILTER.FSR]: 'FSR',
  [SCALING_FILTER.NIS]: 'NIS',
};

export function buildPlan(input: PlanInput): ApplyPlan {
  const { appId, report, device, current, limits, availableCompatTools } = input;
  const data = report.data;
  const tier = deviceTierFor(device, data);
  const changes: Change[] = [];
  const warnings: string[] = [];

  if (tier === 'other') {
    warnings.push(
      `This report is from ${coerceString(data.device) ?? 'a different handheld'}, not a Steam Deck. ` +
        `Its numbers are clamped to what your device supports, but they were tuned for other hardware.`,
    );
  } else if (tier === 'sibling') {
    warnings.push(
      `This report is from the other Steam Deck model. The two differ in efficiency, so expect ` +
        `different battery life than the reporter saw.`,
    );
  }

  // ---- Tier A: direct SteamClient.Apps calls -----------------------------

  const launch = coerceString(data.custom_launch_options);
  if (launch && launch.toLowerCase() !== '%command%' && launch !== current.launchOptions) {
    changes.push({
      key: 'launchOptions',
      label: 'Launch options',
      from: current.launchOptions,
      to: launch,
      tier: 'A',
      mechanism: 'SetAppLaunchOptions',
      value: launch,
    });
  }

  const { tool, wanted } = matchCompatTool(data, availableCompatTools);
  if (wanted) {
    if (!tool) {
      changes.push({
        key: 'protonTool',
        label: 'Proton version',
        from: current.compatTool,
        to: wanted,
        tier: 'A',
        mechanism: 'SpecifyCompatTool',
        value: wanted,
        blocked: `${wanted} isn't installed. Install it (ProtonUp-Qt or the Wine Cellar plugin) and try again.`,
      });
    } else if (tool.strToolName !== current.compatTool) {
      changes.push({
        key: 'protonTool',
        label: 'Proton version',
        from: current.compatTool,
        to: tool.strDisplayName ?? tool.strToolName,
        tier: 'A',
        mechanism: 'SpecifyCompatTool',
        value: tool.strToolName,
      });
    }
  }

  const resolution = coerceString(data.game_resolution);
  if (resolution && !/^default$/i.test(resolution) && resolution !== current.resolution) {
    changes.push({
      key: 'resolution',
      label: 'Resolution',
      from: current.resolution,
      to: resolution,
      tier: 'A',
      mechanism: 'SetAppResolutionOverride',
      value: resolution,
    });
  }

  // ---- Tier C: one Perf.UpdateSettings message ---------------------------

  const tdp = coerceNumber(data.tdp_limit);
  if (tdp !== null) {
    const { value, clamp } = clampNumber(tdp, limits.tdpMin, limits.tdpMax, 'W');
    // An unset limit is not the same as a limit that happens to equal ours.
    const already = current.isTdpLimitEnabled && current.tdpLimit === value;
    if (!already) {
      changes.push({
        key: 'tdpLimit',
        label: 'TDP limit',
        from: current.isTdpLimitEnabled && current.tdpLimit !== null ? `${current.tdpLimit}W` : null,
        to: `${value}W`,
        tier: 'C',
        mechanism: 'Perf.UpdateSettings',
        value,
        ...(clamp ? { clamped: clamp } : {}),
      });
    }
  }

  const fps = coerceNumber(data.frame_limit);
  const frameLimitDisabled = /^on$/i.test(coerceString(data.disable_frame_limit) ?? '');
  if (fps !== null && !frameLimitDisabled) {
    const { value, clamp } = snapToOption(fps, limits.fpsOptions);
    const already = current.isFrameLimitEnabled && current.frameLimit === value;
    if (!already) {
      changes.push({
        key: 'frameLimit',
        label: 'Frame limit',
        from:
          current.isFrameLimitEnabled && current.frameLimit !== null
            ? `${current.frameLimit} fps`
            : null,
        to: `${value} fps`,
        tier: 'C',
        mechanism: 'Perf.UpdateSettings',
        value,
        ...(clamp ? { clamped: clamp } : {}),
      });
    }
  }

  const gpu = coerceNumber(data.manual_gpu_clock);
  if (gpu !== null) {
    const { value, clamp } = clampNumber(gpu, limits.gpuMinMhz, limits.gpuMaxMhz, 'MHz');
    if (current.gpuClock !== value) {
      changes.push({
        key: 'gpuClock',
        label: 'GPU clock',
        from: current.gpuClock !== null ? `${current.gpuClock} MHz` : null,
        to: `${value} MHz`,
        tier: 'C',
        mechanism: 'Perf.UpdateSettings',
        value,
        ...(clamp ? { clamped: clamp } : {}),
      });
    }
  }

  const filter = parseScalingFilter(coerceString(data.scaling_filter));
  if (filter !== null && filter !== current.scalingFilter) {
    changes.push({
      key: 'scalingFilter',
      label: 'Scaling filter',
      from: current.scalingFilter !== null ? (FILTER_NAMES[current.scalingFilter] ?? null) : null,
      to: FILTER_NAMES[filter],
      tier: 'C',
      mechanism: 'Perf.UpdateSettings',
      value: filter,
    });
  }

  return {
    appId,
    device,
    tier,
    changes,
    inGame: {
      display: coerceString(data.game_display_settings),
      graphics: coerceString(data.game_graphics_settings),
    },
    warnings,
  };
}

/** Changes we can actually perform right now. */
export function applicableChanges(plan: ApplyPlan, tierCAvailable: boolean): Change[] {
  return plan.changes.filter((c) => !c.blocked && (c.tier === 'A' || tierCAvailable));
}

export function isEmpty(plan: ApplyPlan, tierCAvailable: boolean): boolean {
  return applicableChanges(plan, tierCAvailable).length === 0;
}
