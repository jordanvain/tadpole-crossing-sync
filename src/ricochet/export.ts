import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { screenshot } from '../utils/screenshots';
import { loginToRicochet } from './login';

export interface ExportResult {
  payoutHistoryPath: string;
  inventoryPath: string | null;
  exportedAt: string;
}

export async function exportFromRicochet(): Promise<ExportResult> {
  fs.mkdirSync(config.paths.exports, { recursive: true });

  const browser = await chromium.launch({
    headless: config.browser.headless,
    slowMo: config.browser.slowMo,
  });

  const context = await browser.newContext({
    acceptDownloads: true,
  });
  const page = await context.newPage();

  try {
    await loginToRicochet(page);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);

    // Export Payout History
    const payoutHistoryPath = await exportPayoutHistory(page, timestamp);

    // Export Inventory (best-effort)
    let inventoryPath: string | null = null;
    try {
      inventoryPath = await exportInventory(page, timestamp);
    } catch (err) {
      logger.warn(`Inventory export skipped: ${err}`);
    }

    return {
      payoutHistoryPath,
      inventoryPath,
      exportedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}

async function exportPayoutHistory(page: import('playwright').Page, timestamp: string): Promise<string> {
  logger.info('Navigating to Payout History...');

  // Click the "Payout History" tab — try common tab/link patterns
  const payoutHistoryTab = page.getByRole('tab', { name: /payout history/i })
    .or(page.getByRole('link', { name: /payout history/i }))
    .or(page.locator('a, button, [role="tab"]').filter({ hasText: /payout history/i }));

  await payoutHistoryTab.first().click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'ricochet-payout-history');

  logger.info('Waiting for export button...');
  const exportBtn = page
    .getByRole('button', { name: /export/i })
    .or(page.locator('a, button').filter({ hasText: /export/i }));

  // Start waiting for download before clicking
  const downloadPromise = page.waitForEvent('download');
  await exportBtn.first().click();
  const download = await downloadPromise;

  const filename = `payout-history_${timestamp}.csv`;
  const filePath = path.join(config.paths.exports, filename);
  await download.saveAs(filePath);

  logger.info(`Payout history exported to: ${filePath}`);
  await screenshot(page, 'ricochet-payout-exported');
  return filePath;
}

async function exportInventory(page: import('playwright').Page, timestamp: string): Promise<string> {
  logger.info('Navigating to Inventory...');

  const inventoryTab = page.getByRole('tab', { name: /inventory/i })
    .or(page.getByRole('link', { name: /inventory/i }))
    .or(page.locator('a, button, [role="tab"]').filter({ hasText: /^inventory$/i }));

  await inventoryTab.first().click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'ricochet-inventory');

  const exportBtn = page
    .getByRole('button', { name: /export/i })
    .or(page.locator('a, button').filter({ hasText: /export/i }));

  const downloadPromise = page.waitForEvent('download');
  await exportBtn.first().click();
  const download = await downloadPromise;

  const filename = `inventory_${timestamp}.csv`;
  const filePath = path.join(config.paths.exports, filename);
  await download.saveAs(filePath);

  logger.info(`Inventory exported to: ${filePath}`);
  return filePath;
}
