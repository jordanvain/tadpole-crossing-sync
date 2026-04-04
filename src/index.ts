import cron from 'node-cron';
import { SyncEngine } from './sync/engine';
import { logger } from './utils/logger';
import { config } from './utils/config';

const engine = new SyncEngine();

async function runSync(): Promise<void> {
  try {
    const result = await engine.sync();
    if (result.errors.length > 0) {
      logger.warn(`Sync completed with ${result.errors.length} errors`);
      process.exitCode = 1;
    }
  } catch (err) {
    logger.error('Sync failed', err);
    process.exitCode = 1;
  }
}

const isWatch = process.argv.includes('--watch');

if (isWatch) {
  const intervalHours = config.sync.intervalHours;
  const cronExpression = `0 */${intervalHours} * * *`;
  logger.info(`Running in watch mode — schedule: every ${intervalHours}h (${cronExpression})`);

  // Run immediately on start, then on schedule
  runSync();
  cron.schedule(cronExpression, () => {
    logger.info('Scheduled sync starting...');
    runSync();
  });
} else {
  runSync();
}
