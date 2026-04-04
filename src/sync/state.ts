import fs from 'fs';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

export interface SyncState {
  lastSyncAt: string | null;       // ISO timestamp
  lastSyncedDate: string | null;   // YYYY-MM-DD — last sold date we processed
  syncedExternalIds: string[];     // all externalIds we've successfully synced
}

const DEFAULT_STATE: SyncState = {
  lastSyncAt: null,
  lastSyncedDate: null,
  syncedExternalIds: [],
};

export function loadSyncState(): SyncState {
  if (!fs.existsSync(config.paths.syncState)) {
    return { ...DEFAULT_STATE };
  }
  try {
    const raw = fs.readFileSync(config.paths.syncState, 'utf-8');
    return { ...DEFAULT_STATE, ...JSON.parse(raw) } as SyncState;
  } catch (err) {
    logger.warn(`Could not read sync state, starting fresh: ${err}`);
    return { ...DEFAULT_STATE };
  }
}

export function saveSyncState(state: SyncState): void {
  fs.mkdirSync(config.paths.data, { recursive: true });
  fs.writeFileSync(config.paths.syncState, JSON.stringify(state, null, 2), 'utf-8');
  logger.debug(`Sync state saved to ${config.paths.syncState}`);
}

export function markSynced(state: SyncState, externalIds: string[], lastDate: string): SyncState {
  const idSet = new Set(state.syncedExternalIds);
  for (const id of externalIds) idSet.add(id);
  return {
    lastSyncAt: new Date().toISOString(),
    lastSyncedDate: lastDate > (state.lastSyncedDate ?? '') ? lastDate : state.lastSyncedDate,
    syncedExternalIds: Array.from(idSet),
  };
}
