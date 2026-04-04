import type { WaveEntrySet } from '../wave/types';
import type { SyncState } from './state';

/** Filter out entry sets where both income AND expense are already synced */
export function filterUnsynced(sets: WaveEntrySet[], state: SyncState): WaveEntrySet[] {
  const synced = new Set(state.syncedExternalIds);
  return sets.filter(set => {
    const incomesynced = synced.has(set.income.externalId);
    const expenseSynced = synced.has(set.expense.externalId);
    return !incomesynced || !expenseSynced;
  });
}

/** Build a Set of already-synced external IDs for quick lookup */
export function buildSyncedSet(state: SyncState): Set<string> {
  return new Set(state.syncedExternalIds);
}
