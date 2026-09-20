/**
 * Snapshot persistence, backed by `main.py`.
 *
 * Revert points must survive a Steam UI restart, so they go to disk rather
 * than into browser storage. `main.py` writes them atomically under
 * DECKY_PLUGIN_SETTINGS_DIR.
 */

import { callable } from '@decky/api';

import type { Snapshot, SnapshotStore } from './execute';

const saveSnapshot = callable<[app_id: number, snapshot: Snapshot], boolean>('save_snapshot');
const getSnapshot = callable<[app_id: number], Snapshot | null>('get_snapshot');
const deleteSnapshot = callable<[app_id: number], boolean>('delete_snapshot');
const listSnapshotAppIds = callable<[], number[]>('list_snapshot_app_ids');

export const pythonSnapshotStore: SnapshotStore = {
  async save(appId, snapshot) {
    try {
      return await saveSnapshot(appId, snapshot);
    } catch (err) {
      console.error('[deck-game-tune] save_snapshot failed', err);
      return false;
    }
  },

  async get(appId) {
    try {
      const value = await getSnapshot(appId);
      return value ?? null;
    } catch (err) {
      console.error('[deck-game-tune] get_snapshot failed', err);
      return null;
    }
  },

  async remove(appId) {
    try {
      return await deleteSnapshot(appId);
    } catch (err) {
      console.error('[deck-game-tune] delete_snapshot failed', err);
      return false;
    }
  },
};

/** Which apps currently have a revert point, for a "tuned games" list later. */
export async function tunedAppIds(): Promise<number[]> {
  try {
    return (await listSnapshotAppIds()) ?? [];
  } catch (err) {
    console.error('[deck-game-tune] list_snapshot_app_ids failed', err);
    return [];
  }
}
