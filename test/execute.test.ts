import { describe, expect, it, vi } from 'vitest';

import type { Change, CurrentSettings } from '../src/apply/plan';
import {
  buildSnapshot,
  executeChanges,
  revert,
  type Snapshot,
  type SnapshotStore,
  type SteamWriter,
} from '../src/apply/execute';

const CURRENT: CurrentSettings = {
  launchOptions: 'OLD_OPTS %command%',
  compatTool: 'proton_experimental',
  resolution: '1280x800',
  tdpLimit: null,
  isTdpLimitEnabled: false,
  frameLimit: null,
  isFrameLimitEnabled: false,
  gpuClock: null,
  scalingFilter: null,
};

function change(over: Partial<Change>): Change {
  return {
    key: 'launchOptions',
    label: 'Launch options',
    from: null,
    to: 'x',
    tier: 'A',
    mechanism: 'SetAppLaunchOptions',
    value: 'x',
    ...over,
  } as Change;
}

const LAUNCH = change({ key: 'launchOptions', mechanism: 'SetAppLaunchOptions', value: 'NEW %command%' });
const PROTON = change({
  key: 'protonTool',
  label: 'Proton version',
  mechanism: 'SpecifyCompatTool',
  value: 'GE-Proton10-30',
});
const RES = change({
  key: 'resolution',
  label: 'Resolution',
  mechanism: 'SetAppResolutionOverride',
  value: '1024x640',
});

function fakeWriter(overrides: Partial<SteamWriter> = {}) {
  return {
    setLaunchOptions: vi.fn(),
    specifyCompatTool: vi.fn(),
    setResolutionOverride: vi.fn(),
    ...overrides,
  } satisfies SteamWriter & Record<string, unknown>;
}

function fakeStore(saveResult = true) {
  const saved: Snapshot[] = [];
  const store: SnapshotStore = {
    save: vi.fn(async (_appId: number, snapshot: Snapshot) => {
      if (saveResult) saved.push(snapshot);
      return saveResult;
    }),
    get: vi.fn(async () => saved[saved.length - 1] ?? null),
    remove: vi.fn(async () => true),
  };
  return { store, saved };
}

describe('buildSnapshot', () => {
  it('captures the pre-apply state and what we intend to touch', () => {
    const snap = buildSnapshot(42, CURRENT, [LAUNCH, RES], 1000);
    expect(snap).toEqual({
      appId: 42,
      takenAt: 1000,
      launchOptions: 'OLD_OPTS %command%',
      compatTool: 'proton_experimental',
      resolution: '1280x800',
      intendedKeys: ['launchOptions', 'resolution'],
    });
  });
});

describe('executeChanges', () => {
  it('saves the revert point before writing anything', async () => {
    const order: string[] = [];
    const store: SnapshotStore = {
      save: vi.fn(async () => {
        order.push('save');
        return true;
      }),
      get: vi.fn(async () => null),
      remove: vi.fn(async () => true),
    };
    const writer = fakeWriter({
      setLaunchOptions: vi.fn(() => {
        order.push('write');
      }),
    });

    await executeChanges(1, [LAUNCH], CURRENT, writer, store);
    expect(order).toEqual(['save', 'write']);
  });

  it('refuses to apply anything when the revert point cannot be saved', async () => {
    // An apply we cannot undo is worse than one that never happened.
    const { store } = fakeStore(false);
    const writer = fakeWriter();

    const result = await executeChanges(1, [LAUNCH, RES], CURRENT, writer, store);

    expect(result.ok).toBe(false);
    expect(result.abortedReason).toContain('revert point');
    expect(writer.setLaunchOptions).not.toHaveBeenCalled();
    expect(writer.setResolutionOverride).not.toHaveBeenCalled();
  });

  it('applies every change and reports them', async () => {
    const { store } = fakeStore();
    const writer = fakeWriter();

    const result = await executeChanges(7, [LAUNCH, PROTON, RES], CURRENT, writer, store);

    expect(result.ok).toBe(true);
    expect(result.applied).toHaveLength(3);
    expect(writer.setLaunchOptions).toHaveBeenCalledWith(7, 'NEW %command%');
    expect(writer.specifyCompatTool).toHaveBeenCalledWith(7, 'GE-Proton10-30');
    expect(writer.setResolutionOverride).toHaveBeenCalledWith(7, '1024x640');
  });

  it('stops at the first failure and reports what did apply', async () => {
    const { store } = fakeStore();
    const writer = fakeWriter({
      specifyCompatTool: vi.fn(() => {
        throw new Error('tool vanished');
      }),
    });

    const result = await executeChanges(1, [LAUNCH, PROTON, RES], CURRENT, writer, store);

    expect(result.ok).toBe(false);
    expect(result.applied.map((c) => c.key)).toEqual(['launchOptions']);
    expect(result.failure?.error).toBe('tool vanished');
    // The change after the failure must not have been attempted.
    expect(writer.setResolutionOverride).not.toHaveBeenCalled();
  });

  it('refuses a blocked change rather than half-applying the rest', async () => {
    const { store } = fakeStore();
    const writer = fakeWriter();
    const blocked = change({ ...PROTON, blocked: "GE-Proton10-30 isn't installed." });

    const result = await executeChanges(1, [LAUNCH, blocked], CURRENT, writer, store);

    expect(result.ok).toBe(false);
    expect(result.abortedReason).toContain("isn't installed");
    expect(writer.setLaunchOptions).not.toHaveBeenCalled();
  });

  it('refuses tier C changes until the spike lands', async () => {
    const { store } = fakeStore();
    const writer = fakeWriter();
    const tierC = change({
      key: 'tdpLimit',
      label: 'TDP limit',
      tier: 'C',
      mechanism: 'Perf.UpdateSettings',
      value: 12,
    });

    const result = await executeChanges(1, [tierC], CURRENT, writer, store);

    expect(result.ok).toBe(false);
    expect(result.abortedReason).toContain("isn't wired up yet");
  });

  it('does nothing, successfully, for an empty plan', async () => {
    const { store } = fakeStore();
    const writer = fakeWriter();

    const result = await executeChanges(1, [], CURRENT, writer, store);

    expect(result.ok).toBe(true);
    expect(store.save).not.toHaveBeenCalled();
  });
});

describe('revert', () => {
  const snapshot: Snapshot = {
    appId: 9,
    takenAt: 0,
    launchOptions: 'OLD %command%',
    compatTool: 'proton_experimental',
    resolution: '1280x800',
    intendedKeys: ['launchOptions', 'resolution'],
  };

  it('restores only the settings the apply touched', async () => {
    // The Proton version was never changed, so reverting must not touch it —
    // the user may have switched it themselves since.
    const { store } = fakeStore();
    const writer = fakeWriter();

    const result = await revert(snapshot, writer, store);

    expect(result.ok).toBe(true);
    expect(writer.setLaunchOptions).toHaveBeenCalledWith(9, 'OLD %command%');
    expect(writer.setResolutionOverride).toHaveBeenCalledWith(9, '1280x800');
    expect(writer.specifyCompatTool).not.toHaveBeenCalled();
  });

  it('clears a setting that had no value before', async () => {
    const { store } = fakeStore();
    const writer = fakeWriter();

    await revert({ ...snapshot, launchOptions: null, intendedKeys: ['launchOptions'] }, writer, store);

    expect(writer.setLaunchOptions).toHaveBeenCalledWith(9, '');
  });

  it('drops the revert point once everything is back', async () => {
    const { store } = fakeStore();
    await revert(snapshot, fakeWriter(), store);
    expect(store.remove).toHaveBeenCalledWith(9);
  });

  it('keeps the revert point when restoring fails', async () => {
    // Losing it here would strand the user half-reverted with no way back.
    const { store } = fakeStore();
    const writer = fakeWriter({
      setResolutionOverride: vi.fn(() => {
        throw new Error('nope');
      }),
    });

    const result = await revert(snapshot, writer, store);

    expect(result.ok).toBe(false);
    expect(store.remove).not.toHaveBeenCalled();
  });
});
