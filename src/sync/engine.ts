import { exportFromRicochet } from '../ricochet/export';
import { parsePayoutCsv, findLatestPayoutCsv } from '../transform/parser';
import { groupByDate, filterByDateRange } from '../transform/grouper';
import { dailyTotalsToWaveEntries } from '../transform/mapper';
import { WaveEntryClient } from '../wave/entry';
import { loadSyncState, saveSyncState, markSynced } from './state';
import { filterUnsynced, buildSyncedSet } from './dedup';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import type { WaveEntrySet } from '../wave/types';

export interface SyncResult {
  exported: boolean;
  recordsParsed: number;
  daysProcessed: number;
  entriesCreated: number;
  entriesSkipped: number;
  errors: string[];
  dryRun: boolean;
}

export interface SyncOptions {
  startDate?: string;
  endDate?: string;
  dryRun?: boolean;
  skipExport?: boolean;   // use existing CSV in data/exports/
  csvPath?: string;       // explicit CSV path to use
}

export class SyncEngine {
  async sync(opts: SyncOptions = {}): Promise<SyncResult> {
    const result: SyncResult = {
      exported: false,
      recordsParsed: 0,
      daysProcessed: 0,
      entriesCreated: 0,
      entriesSkipped: 0,
      errors: [],
      dryRun: opts.dryRun ?? false,
    };

    const startDate = opts.startDate ?? config.sync.startDate;
    const endDate = opts.endDate ?? new Date().toISOString().split('T')[0];
    const dryRun = opts.dryRun ?? false;

    logger.info(`Sync starting — range: ${startDate} → ${endDate}, dryRun: ${dryRun}`);

    // 1. Export from Ricochet (unless skipped)
    let csvPath = opts.csvPath ?? null;
    if (!opts.skipExport && !csvPath) {
      try {
        logger.info('Exporting from Ricochet...');
        const exportResult = await exportFromRicochet();
        csvPath = exportResult.payoutHistoryPath;
        result.exported = true;
        logger.info(`Export complete: ${csvPath}`);
      } catch (err) {
        const msg = `Ricochet export failed: ${err}`;
        logger.error(msg);
        result.errors.push(msg);

        // Fall back to most recent existing CSV
        const fallback = findLatestPayoutCsv(config.paths.exports);
        if (fallback) {
          logger.warn(`Falling back to existing CSV: ${fallback}`);
          csvPath = fallback;
        } else {
          logger.error('No existing CSV to fall back to — aborting');
          return result;
        }
      }
    } else if (!csvPath) {
      csvPath = findLatestPayoutCsv(config.paths.exports);
      if (!csvPath) {
        const msg = 'No CSV found in data/exports/ — run `npm run export` first';
        logger.error(msg);
        result.errors.push(msg);
        return result;
      }
      logger.info(`Using existing CSV: ${csvPath}`);
    }

    // 2. Parse CSV
    const allRecords = parsePayoutCsv(csvPath);
    result.recordsParsed = allRecords.length;

    // 3. Filter by date range
    const inRange = filterByDateRange(allRecords, startDate, endDate);
    logger.info(`${inRange.length} records in date range ${startDate} → ${endDate}`);

    // 4. Group by date → daily totals
    const dailyTotals = groupByDate(inRange);
    result.daysProcessed = dailyTotals.length;

    // 5. Map to Wave entry sets
    const entrySets: WaveEntrySet[] = dailyTotals.map(dailyTotalsToWaveEntries);

    // 6. Dedup against sync state
    const state = loadSyncState();
    const newSets = filterUnsynced(entrySets, state);
    const skippedCount = entrySets.length - newSets.length;
    result.entriesSkipped = skippedCount * 2; // income + expense per set

    logger.info(`${newSets.length} new day-sets to enter (${skippedCount} already synced)`);

    if (config.sync.mode === 'export-only') {
      logger.info('SYNC_MODE=export-only — skipping Wave entry');
      return result;
    }

    // 7. Enter into Wave
    if (newSets.length > 0) {
      const waveClient = new WaveEntryClient();
      const syncedSet = buildSyncedSet(state);
      const entryResults = await waveClient.enterEntrySets(newSets, syncedSet, dryRun);

      const successfulIds: string[] = [];
      let lastDate = '';

      for (const r of entryResults) {
        if (r.skipped) {
          result.entriesSkipped++;
        } else if (r.success) {
          result.entriesCreated++;
          successfulIds.push(r.entry.externalId);
          if (r.entry.date > lastDate) lastDate = r.entry.date;
        } else {
          result.errors.push(`${r.entry.externalId}: ${r.error}`);
        }
      }

      // 8. Persist sync state (skip in dry run)
      if (!dryRun && successfulIds.length > 0) {
        const newState = markSynced(state, successfulIds, lastDate);
        saveSyncState(newState);
        logger.info(`Sync state updated — last synced date: ${newState.lastSyncedDate}`);
      }
    }

    logger.info(
      `Sync complete — records: ${result.recordsParsed}, days: ${result.daysProcessed}, ` +
      `created: ${result.entriesCreated}, skipped: ${result.entriesSkipped}, errors: ${result.errors.length}`,
    );

    return result;
  }
}
