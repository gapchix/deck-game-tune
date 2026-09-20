/**
 * Applying a plan, and undoing it.
 *
 * The writer and the snapshot store are injected, so the ordering and safety
 * rules here are tested without a Deck. The rule that matters most:
 *
 *   **Nothing is written until the snapshot is safely stored.**
 *
 * An apply we cannot undo is worse than an apply that didn't happen, so a
 * failed snapshot save aborts the whole operation.
 */

import type { Change, ChangeKey, CurrentSettings } from './plan';

export interface SteamWriter {
  setLaunchOptions(appId: number, value: string): void | Promise<void>;
  specifyCompatTool(appId: number, toolName: string): void | Promise<void>;
  setResolutionOverride(appId: number, resolution: string): void | Promise<void>;
}

/** Pre-apply state for one app. Persisted by `main.py`. */
export interface Snapshot {
  appId: number;
  takenAt: number;
  launchOptions: string | null;
  compatTool: string | null;
  resolution: string | null;
  /**
   * The keys this apply set out to change. Reverting only these leaves
   * anything the user changed by hand alone.
   */
  intendedKeys: ChangeKey[];
}

export interface SnapshotStore {
  save(appId: number, snapshot: Snapshot): Promise<boolean>;
  get(appId: number): Promise<Snapshot | null>;
  remove(appId: number): Promise<boolean>;
}

export interface ExecuteResult {
  ok: boolean;
  applied: Change[];
  /** The change that stopped us, if any. Earlier changes stay applied. */
  failure: { change: Change; error: string } | null;
  /** Set when we refused to start. */
  abortedReason: string | null;
}

const TIER_A_MECHANISMS = new Set([
  'SetAppLaunchOptions',
  'SpecifyCompatTool',
  'SetAppResolutionOverride',
]);

export function buildSnapshot(
  appId: number,
  current: CurrentSettings,
  changes: Change[],
  now = Date.now(),
): Snapshot {
  return {
    appId,
    takenAt: now,
    launchOptions: current.launchOptions,
    compatTool: current.compatTool,
    resolution: current.resolution,
    intendedKeys: changes.map((c) => c.key),
  };
}

async function writeChange(appId: number, change: Change, writer: SteamWriter): Promise<void> {
  switch (change.mechanism) {
    case 'SetAppLaunchOptions':
      await writer.setLaunchOptions(appId, String(change.value));
      return;
    case 'SpecifyCompatTool':
      await writer.specifyCompatTool(appId, String(change.value));
      return;
    case 'SetAppResolutionOverride':
      await writer.setResolutionOverride(appId, String(change.value));
      return;
    default:
      // Tier C goes through Perf.UpdateSettings and is not wired yet
      // (docs/SPIKE.md). Refusing loudly beats pretending it worked.
      throw new Error(`${change.mechanism} is not supported yet`);
  }
}

/**
 * Apply `changes` to `appId`, snapshotting first.
 *
 * Stops at the first failure rather than pressing on: a half-applied profile
 * is confusing, and the snapshot still lets the user put everything back.
 */
export async function executeChanges(
  appId: number,
  changes: Change[],
  current: CurrentSettings,
  writer: SteamWriter,
  store: SnapshotStore,
): Promise<ExecuteResult> {
  const blocked = changes.find((c) => c.blocked);
  if (blocked) {
    return {
      ok: false,
      applied: [],
      failure: null,
      abortedReason: `${blocked.label} cannot be applied: ${blocked.blocked}`,
    };
  }

  const unsupported = changes.find((c) => !TIER_A_MECHANISMS.has(c.mechanism));
  if (unsupported) {
    return {
      ok: false,
      applied: [],
      failure: null,
      abortedReason: `${unsupported.label} needs a mechanism that isn't wired up yet`,
    };
  }

  if (changes.length === 0) {
    return { ok: true, applied: [], failure: null, abortedReason: null };
  }

  const snapshot = buildSnapshot(appId, current, changes);
  const saved = await store.save(appId, snapshot).catch(() => false);
  if (!saved) {
    // Refuse rather than apply something we could not undo.
    return {
      ok: false,
      applied: [],
      failure: null,
      abortedReason: 'Could not save a revert point, so nothing was changed.',
    };
  }

  const applied: Change[] = [];
  for (const change of changes) {
    try {
      await writeChange(appId, change, writer);
      applied.push(change);
    } catch (err) {
      return {
        ok: false,
        applied,
        failure: { change, error: err instanceof Error ? err.message : String(err) },
        abortedReason: null,
      };
    }
  }

  return { ok: true, applied, failure: null, abortedReason: null };
}

/**
 * Put everything back the way it was.
 *
 * Only the keys the apply intended to touch are restored, so a setting the
 * user changed by hand afterwards survives.
 *
 * UNVERIFIED: that passing an empty string resets each setting to Steam's
 * default. It is how other plugins drive these calls, but it has not been
 * confirmed on hardware — check it before trusting revert on a real machine,
 * particularly for SpecifyCompatTool.
 */
export async function revert(
  snapshot: Snapshot,
  writer: SteamWriter,
  store: SnapshotStore,
): Promise<ExecuteResult> {
  const keys = new Set(snapshot.intendedKeys);
  const applied: Change[] = [];

  const steps: Array<{ key: ChangeKey; run: () => void | Promise<void>; label: string }> = [
    {
      key: 'launchOptions',
      label: 'Launch options',
      run: () => writer.setLaunchOptions(snapshot.appId, snapshot.launchOptions ?? ''),
    },
    {
      key: 'protonTool',
      label: 'Proton version',
      run: () => writer.specifyCompatTool(snapshot.appId, snapshot.compatTool ?? ''),
    },
    {
      key: 'resolution',
      label: 'Resolution',
      run: () => writer.setResolutionOverride(snapshot.appId, snapshot.resolution ?? ''),
    },
  ];

  for (const step of steps) {
    if (!keys.has(step.key)) continue;
    try {
      await step.run();
      applied.push({ key: step.key, label: step.label } as Change);
    } catch (err) {
      return {
        ok: false,
        applied,
        failure: {
          change: { key: step.key, label: step.label } as Change,
          error: err instanceof Error ? err.message : String(err),
        },
        abortedReason: null,
      };
    }
  }

  // Only drop the revert point once everything is back.
  await store.remove(snapshot.appId).catch(() => false);
  return { ok: true, applied, failure: null, abortedReason: null };
}
