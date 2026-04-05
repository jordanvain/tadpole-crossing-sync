import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { screenshot } from '../utils/screenshots';

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
    // Navigate directly to the dashboard — Ricochet retains session cookies in the system browser profile,
    // so we may already be authenticated. If not, the login page will appear and we fall back to logging in.
    logger.info('Navigating to Ricochet dashboard...');
    await page.goto(`${config.ricochet.url}/dashboard`, { waitUntil: 'networkidle' });
    await screenshot(page, 'ricochet-dashboard');

    // If redirected to login, perform login first
    if (page.url().includes('/login') || page.url().includes('/signin')) {
      logger.info('Session expired — logging in...');
      const { loginToRicochet } = await import('./login');
      await loginToRicochet(page);
    } else {
      logger.info('Already authenticated — proceeding to export');
    }

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

  // Click the "Payout History" tab
  const payoutHistoryTab = page.getByRole('tab', { name: /payout history/i })
    .or(page.getByRole('link', { name: /payout history/i }))
    .or(page.locator('a, button, [role="tab"]').filter({ hasText: /payout history/i }));

  await payoutHistoryTab.first().click();
  await page.waitForLoadState('networkidle');

  // Wait for the loading overlay (span.loading) to disappear — it intercepts pointer events
  logger.info('Waiting for loading overlay to clear...');
  await page.waitForSelector('span.loading', { state: 'hidden', timeout: 60000 });

  await screenshot(page, 'ricochet-payout-history');

  logger.info('Waiting for export button...');
  const exportBtn = page
    .getByRole('button', { name: /export/i })
    .or(page.locator('a, button').filter({ hasText: /export/i }));

  await exportBtn.first().waitFor({ state: 'visible', timeout: 15000 });

  // Wait for download — handles both same-page downloads and popup-based downloads.
  // Promise.race is NOT used here because the page-level listener rejects when the page closes
  // (e.g. if Export opens a new tab), which would kill the race before the popup delivers.
  const context = page.context();
  const download = await new Promise<import('playwright').Download>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Export download timeout after 60s')), 60000);

    const done = (dl: import('playwright').Download) => {
      clearTimeout(timeout);
      resolve(dl);
    };

    // Case 1: download fires on the current page (direct navigation)
    page.once('download', done);

    // Case 2: Export opens a new tab/popup that delivers the download
    context.once('page', (popup) => {
      popup.once('download', done);
    });

    // Click the export button after listeners are set.
    // Use { timeout: 0 } so the click itself doesn't time out waiting for navigation —
    // our outer timeout handles the deadline.
    exportBtn.first().click({ timeout: 0 }).catch(reject);
  });

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

  // Wait for loading overlay to clear
  await page.waitForSelector('span.loading', { state: 'hidden', timeout: 60000 });

  await screenshot(page, 'ricochet-inventory');

  const exportBtn = page
    .getByRole('button', { name: /export/i })
    .or(page.locator('a, button').filter({ hasText: /export/i }));

  await exportBtn.first().waitFor({ state: 'visible', timeout: 15000 });

  const context = page.context();
  const download = await new Promise<import('playwright').Download>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Inventory export download timeout after 60s')), 60000);
    const done = (dl: import('playwright').Download) => { clearTimeout(timeout); resolve(dl); };
    page.once('download', done);
    context.once('page', (popup) => { popup.once('download', done); });
    exportBtn.first().click({ timeout: 0 }).catch(reject);
  });

  const filename = `inventory_${timestamp}.csv`;
  const filePath = path.join(config.paths.exports, filename);
  await download.saveAs(filePath);

  logger.info(`Inventory exported to: ${filePath}`);
  return filePath;
}
