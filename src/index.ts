import { Command } from 'commander';
import { SyncEngine } from './sync/engine';
import { exportFromRicochet } from './ricochet/export';
import { parsePayoutCsv, findLatestPayoutCsv } from './transform/parser';
import { groupByDate } from './transform/grouper';
import { dailyTotalsToWaveEntries } from './transform/mapper';
import { loadSyncState } from './sync/state';
import { logger } from './utils/logger';
import { config } from './utils/config';

const program = new Command();

program
  .name('tadpole-sync')
  .description('Tadpole Crossing: sync Ricochet Consignment → Wave Accounting')
  .version('0.1.0');

// ── export ────────────────────────────────────────────────────────────────────
program
  .command('export')
  .description('Export payout history (and inventory) from Ricochet to data/exports/')
  .action(async () => {
    try {
      logger.info('Starting Ricochet export...');
      const result = await exportFromRicochet();
      console.log('\nExport complete:');
      console.log(`  Payout history: ${result.payoutHistoryPath}`);
      if (result.inventoryPath) {
        console.log(`  Inventory:      ${result.inventoryPath}`);
      }
      console.log(`  Exported at:    ${result.exportedAt}`);
    } catch (err) {
      logger.error(`Export failed: ${err}`);
      process.exit(1);
    }
  });

// ── transform ─────────────────────────────────────────────────────────────────
program
  .command('transform')
  .description('Parse the latest Ricochet CSV and preview what would be entered into Wave')
  .option('--csv <path>', 'Path to specific payout CSV (default: latest in data/exports/)')
  .option('--start <date>', 'Start date YYYY-MM-DD', config.sync.startDate)
  .option('--end <date>', 'End date YYYY-MM-DD', new Date().toISOString().split('T')[0])
  .action(async (opts) => {
    const csvPath = opts.csv ?? findLatestPayoutCsv(config.paths.exports);
    if (!csvPath) {
      console.error('No CSV found. Run `npm run export` first.');
      process.exit(1);
    }

    const records = parsePayoutCsv(csvPath);
    const dailyTotals = groupByDate(records);

    console.log(`\nParsed ${records.length} records from: ${csvPath}`);
    console.log(`Grouped into ${dailyTotals.length} days\n`);
    console.log('Date'.padEnd(12), 'Items'.padEnd(8), 'Gross Sales'.padEnd(14), 'Consigner (90%)'.padEnd(18), 'Store (10%)'.padEnd(14), 'Discounts');
    console.log('-'.repeat(80));

    let totalGross = 0, totalConsigner = 0, totalStore = 0;

    for (const day of dailyTotals) {
      totalGross += day.grossSales;
      totalConsigner += day.consignerPayouts;
      totalStore += day.storeCommission;

      console.log(
        day.date.padEnd(12),
        String(day.recordCount).padEnd(8),
        `$${day.grossSales.toFixed(2)}`.padEnd(14),
        `$${day.consignerPayouts.toFixed(2)}`.padEnd(18),
        `$${day.storeCommission.toFixed(2)}`.padEnd(14),
        day.totalDiscounts > 0 ? `-$${day.totalDiscounts.toFixed(2)}` : '',
      );
    }

    console.log('-'.repeat(80));
    console.log(
      'TOTAL'.padEnd(12),
      ''.padEnd(8),
      `$${totalGross.toFixed(2)}`.padEnd(14),
      `$${totalConsigner.toFixed(2)}`.padEnd(18),
      `$${totalStore.toFixed(2)}`,
    );

    console.log('\nWave entries that would be created:');
    for (const day of dailyTotals) {
      const set = dailyTotalsToWaveEntries(day);
      console.log(`  [INCOME]  ${set.income.date}  ${set.income.description.padEnd(55)} $${set.income.amount.toFixed(2)}`);
      console.log(`  [EXPENSE] ${set.expense.date}  ${set.expense.description.padEnd(55)} $${set.expense.amount.toFixed(2)}`);
    }
  });

// ── sync ──────────────────────────────────────────────────────────────────────
program
  .command('sync')
  .description('Full sync: export from Ricochet and enter into Wave')
  .option('--dry-run', 'Show what would be entered without actually doing it')
  .option('--skip-export', 'Skip Ricochet export, use existing CSV in data/exports/')
  .option('--csv <path>', 'Use a specific CSV file instead of exporting')
  .option('--start <date>', 'Start date YYYY-MM-DD', config.sync.startDate)
  .option('--end <date>', 'End date YYYY-MM-DD', new Date().toISOString().split('T')[0])
  .action(async (opts) => {
    const engine = new SyncEngine();
    try {
      const result = await engine.sync({
        dryRun: opts.dryRun ?? false,
        skipExport: opts.skipExport ?? false,
        csvPath: opts.csv,
        startDate: opts.start,
        endDate: opts.end,
      });

      console.log('\nSync result:');
      console.log(`  Mode:         ${result.dryRun ? 'DRY RUN' : 'LIVE'}`);
      console.log(`  Exported:     ${result.exported}`);
      console.log(`  Records:      ${result.recordsParsed}`);
      console.log(`  Days:         ${result.daysProcessed}`);
      console.log(`  Created:      ${result.entriesCreated}`);
      console.log(`  Skipped:      ${result.entriesSkipped}`);
      console.log(`  Errors:       ${result.errors.length}`);

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        for (const e of result.errors) console.log(`  • ${e}`);
        process.exit(1);
      }
    } catch (err) {
      logger.error(`Sync failed: ${err}`);
      process.exit(1);
    }
  });

// ── status ────────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show last sync date, pending transactions')
  .action(() => {
    const state = loadSyncState();
    const csvPath = findLatestPayoutCsv(config.paths.exports);

    console.log('\nTadpole Crossing Sync Status');
    console.log('─'.repeat(40));
    console.log(`Last sync:       ${state.lastSyncAt ?? 'never'}`);
    console.log(`Last date synced: ${state.lastSyncedDate ?? 'none'}`);
    console.log(`IDs tracked:     ${state.syncedExternalIds.length}`);
    console.log(`Latest CSV:      ${csvPath ?? 'none — run export first'}`);

    if (csvPath) {
      try {
        const records = parsePayoutCsv(csvPath);
        const pending = records.filter(r => {
          const d = r.soldDate || r.paidDate;
          return !state.lastSyncedDate || d > state.lastSyncedDate;
        });
        console.log(`Pending records: ${pending.length} since ${state.lastSyncedDate ?? 'beginning'}`);
      } catch {
        // CSV read failure is non-fatal for status
      }
    }
  });

program.parseAsync(process.argv).catch(err => {
  logger.error(err);
  process.exit(1);
});
