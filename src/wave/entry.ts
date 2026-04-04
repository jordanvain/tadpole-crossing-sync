import { chromium } from 'playwright';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { screenshot } from '../utils/screenshots';
import { loginToWave, selectBusiness } from './login';
import type { WaveEntry, WaveEntryResult, WaveEntrySet } from './types';

export class WaveEntryClient {
  async enterEntrySets(
    entrySets: WaveEntrySet[],
    alreadySynced: Set<string>,
    dryRun: boolean,
  ): Promise<WaveEntryResult[]> {
    const results: WaveEntryResult[] = [];

    if (entrySets.length === 0) {
      logger.info('No Wave entries to create');
      return results;
    }

    const browser = await chromium.launch({
      headless: config.browser.headless,
      slowMo: config.browser.slowMo,
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginToWave(page);
      await selectBusiness(page);
      await this.navigateToTransactions(page);

      for (const set of entrySets) {
        for (const entry of [set.income, set.expense]) {
          if (alreadySynced.has(entry.externalId)) {
            logger.info(`Skipping already-synced entry: ${entry.externalId}`);
            results.push({ entry, success: true, skipped: true });
            continue;
          }

          if (dryRun) {
            logger.info(`[DRY RUN] Would create ${entry.type} entry: ${entry.description} — $${entry.amount}`);
            results.push({ entry, success: true, skipped: false });
            continue;
          }

          const result = await this.enterTransaction(page, entry);
          results.push(result);

          // Brief pause between entries to avoid being flagged
          await page.waitForTimeout(500);
        }
      }
    } finally {
      await browser.close();
    }

    return results;
  }

  private async navigateToTransactions(page: import('playwright').Page): Promise<void> {
    logger.info('Navigating to Wave Accounting → Transactions...');

    // Navigate directly to transactions page
    const businessId = config.wave.businessId;
    await page.goto(
      `${config.wave.url}/${businessId}/accounting/transactions`,
      { waitUntil: 'networkidle' },
    );
    await screenshot(page, 'wave-transactions-page');
  }

  private async enterTransaction(
    page: import('playwright').Page,
    entry: WaveEntry,
  ): Promise<WaveEntryResult> {
    logger.info(`Entering Wave transaction: ${entry.description} — $${entry.amount}`);

    try {
      // Click "Add transaction" button
      const addBtn = page
        .getByRole('button', { name: /add transaction/i })
        .or(page.locator('button').filter({ hasText: /add transaction/i }));

      await addBtn.first().click();
      await page.waitForTimeout(300);
      await screenshot(page, `wave-add-txn-${entry.externalId}`);

      // Fill date field
      const dateField = page.locator('input[type="date"], input[placeholder*="date" i]').first();
      await dateField.fill(entry.date);

      // Fill description
      const descField = page
        .locator('input[placeholder*="description" i], input[placeholder*="memo" i], input[name*="description" i]')
        .first();
      await descField.fill(entry.description);

      // Select income vs expense type
      if (entry.type === 'income') {
        const incomeOpt = page
          .getByRole('option', { name: /income/i })
          .or(page.locator('label, button, [role="option"]').filter({ hasText: /^income$/i }));
        if (await incomeOpt.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await incomeOpt.first().click();
        }
      } else {
        const expenseOpt = page
          .getByRole('option', { name: /expense/i })
          .or(page.locator('label, button, [role="option"]').filter({ hasText: /^expense$/i }));
        if (await expenseOpt.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await expenseOpt.first().click();
        }
      }

      // Select account
      await this.selectDropdownOption(page, entry.accountName, 'account');

      // Select category
      await this.selectDropdownOption(page, entry.categoryName, 'category');

      // Fill amount
      const amountField = page
        .locator('input[type="number"], input[placeholder*="amount" i], input[name*="amount" i]')
        .first();
      await amountField.fill(String(entry.amount));

      await screenshot(page, `wave-txn-filled-${entry.externalId}`);

      // Save the transaction
      const saveBtn = page
        .getByRole('button', { name: /save/i })
        .or(page.locator('button').filter({ hasText: /^save$/i }));
      await saveBtn.first().click();
      await page.waitForLoadState('networkidle');
      await screenshot(page, `wave-txn-saved-${entry.externalId}`);

      logger.info(`Wave transaction created: ${entry.description}`);
      return { entry, success: true, skipped: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to enter Wave transaction: ${msg}`);
      await screenshot(page, `wave-txn-error-${entry.externalId}`);

      // Try to dismiss any open modal before retrying next entry
      try {
        const cancelBtn = page
          .getByRole('button', { name: /cancel/i })
          .or(page.locator('button').filter({ hasText: /cancel/i }));
        if (await cancelBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
          await cancelBtn.first().click();
        }
      } catch { /* ignore */ }

      return { entry, success: false, skipped: false, error: msg };
    }
  }

  private async selectDropdownOption(
    page: import('playwright').Page,
    value: string,
    labelHint: string,
  ): Promise<void> {
    // Try native select first
    const select = page
      .locator(`select[name*="${labelHint}" i], select[id*="${labelHint}" i]`)
      .first();
    if (await select.isVisible({ timeout: 1000 }).catch(() => false)) {
      await select.selectOption({ label: value });
      return;
    }

    // Try combobox / searchable dropdown
    const combobox = page
      .locator(`[role="combobox"][aria-label*="${labelHint}" i], input[placeholder*="${labelHint}" i]`)
      .first();
    if (await combobox.isVisible({ timeout: 1000 }).catch(() => false)) {
      await combobox.click();
      await combobox.fill(value);
      await page.waitForTimeout(300);
      const option = page
        .getByRole('option', { name: new RegExp(value, 'i') })
        .or(page.locator('[role="listbox"] [role="option"]').filter({ hasText: new RegExp(value, 'i') }));
      await option.first().click();
    }
  }
}
