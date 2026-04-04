import { RicochetClient } from '../ricochet/client';
import { WaveClient } from '../wave/client';
import { saleToWaveTransaction, payoutToWaveTransaction } from '../transform/mapper';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

export interface SyncResult {
  salesSynced: number;
  payoutsSynced: number;
  skipped: number;
  errors: string[];
}

export class SyncEngine {
  private ricochet = new RicochetClient();
  private wave = new WaveClient();

  async sync(startDate?: string, endDate?: string): Promise<SyncResult> {
    const result: SyncResult = { salesSynced: 0, payoutsSynced: 0, skipped: 0, errors: [] };

    const range = {
      startDate: startDate ?? config.sync.startDate,
      endDate: endDate ?? new Date().toISOString().split('T')[0],
    };

    logger.info(`Starting sync for range ${range.startDate} → ${range.endDate}`);

    try {
      await this.ricochet.connect();

      // Sync sales
      const sales = await this.ricochet.getSales(range);
      logger.info(`Found ${sales.length} sales to sync`);

      for (const sale of sales) {
        try {
          const transaction = saleToWaveTransaction(sale);
          const exists = await this.wave.transactionExists(transaction.externalId);

          if (exists) {
            result.skipped++;
            continue;
          }

          await this.wave.createTransaction(transaction);
          result.salesSynced++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`Failed to sync sale ${sale.transactionNumber}: ${msg}`);
          result.errors.push(`sale:${sale.transactionNumber}: ${msg}`);
        }
      }

      // Sync consigner payouts
      const payouts = await this.ricochet.getConsignerPayouts(range);
      logger.info(`Found ${payouts.length} payouts to sync`);

      for (const payout of payouts) {
        try {
          const transaction = payoutToWaveTransaction(payout);
          const exists = await this.wave.transactionExists(transaction.externalId);

          if (exists) {
            result.skipped++;
            continue;
          }

          await this.wave.createTransaction(transaction);
          result.payoutsSynced++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`Failed to sync payout ${payout.id}: ${msg}`);
          result.errors.push(`payout:${payout.id}: ${msg}`);
        }
      }
    } finally {
      await this.ricochet.disconnect();
    }

    logger.info(`Sync complete — sales: ${result.salesSynced}, payouts: ${result.payoutsSynced}, skipped: ${result.skipped}, errors: ${result.errors.length}`);
    return result;
  }
}
