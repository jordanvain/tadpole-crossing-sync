import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { screenshot } from '../utils/screenshots';
import { loginToWave, navigateToTransactions, BUSINESS_TRANSACTIONS_URL } from './login';
import { writeWaveCsv } from './csv-writer';
import type { WaveEntry, WaveEntryResult, WaveEntrySet } from './types';

// Persist Wave session to avoid repeated logins (which trigger Wave's device-verification)
const SESSION_DIR = path.join(config.paths.data, 'wave-session');

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

    // Flatten, skipping already-synced
    const toCreate: WaveEntry[] = [];
    for (const set of entrySets) {
      for (const entry of [set.income, set.expense]) {
        if (alreadySynced.has(entry.externalId)) {
          logger.info(`Skipping already-synced entry: ${entry.externalId}`);
          results.push({ entry, success: true, skipped: true });
        } else {
          toCreate.push(entry);
        }
      }
    }

    if (toCreate.length === 0 || dryRun) {
      for (const entry of toCreate) {
        logger.info(`[DRY RUN] Would create ${entry.type}: ${entry.description} — $${entry.amount}`);
        results.push({ entry, success: true, skipped: false });
      }
      return results;
    }

    // Use a persistent context so Wave session cookies survive between runs.
    // This avoids the /auth/verify device-verification flow that Wave triggers
    // when it detects repeated logins from a new browser fingerprint.
    fs.mkdirSync(SESSION_DIR, { recursive: true });

    const context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: config.browser.headless,
      slowMo: config.browser.slowMo,
    });
    const page = await context.newPage();

    try {
      await loginToWave(page);

      // Detect Wave's device-verification interstitial (/auth/verify)
      if (page.url().includes('/auth/verify')) {
        logger.warn(
          'Wave is asking for device verification — check Sharon@tadpolecrossinggifts.com email ' +
          'and click the verification link, then re-run the sync.',
        );
        await screenshot(page, 'wave-auth-verify-blocked');
        throw new Error(
          'Wave device verification required. Open the verification email, click the link, ' +
          'then run the sync again (the saved session will skip login next time).',
        );
      }

      await navigateToTransactions(page);

      // ── Strategy 1: CSV import via "More" → "Upload transactions" ────────────
      const csvImported = await this.tryCsvImport(page, toCreate);
      if (csvImported) {
        logger.info('Wave CSV import succeeded');
        for (const entry of toCreate) results.push({ entry, success: true, skipped: false });
        return results;
      }

      // ── Strategy 2: Manual form entry ─────────────────────────────────────────
      logger.info('CSV import unavailable — using manual form entry');
      for (const entry of toCreate) {
        const result = await this.enterTransactionForm(page, entry);
        results.push(result);
        await page.waitForTimeout(400);
      }
    } finally {
      await context.close();
    }

    return results;
  }

  // ── CSV import ──────────────────────────────────────────────────────────────

  private async tryCsvImport(
    page: import('playwright').Page,
    entries: WaveEntry[],
  ): Promise<boolean> {
    try {
      logger.info('Wave: looking for "More" → "Upload transactions"...');

      // "More" is a plain button (confirmed via probe)
      const moreBtn = page.locator('button').filter({ hasText: /^More$/ }).first();
      if (!(await moreBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
        logger.info('Wave: "More" button not visible, skipping CSV import');
        return false;
      }

      await moreBtn.click();
      await page.waitForTimeout(400);
      await screenshot(page, 'wave-more-dropdown');

      // "Upload transactions" is the free-tier import option
      const uploadItem = page
        .locator('[role="menuitem"], [role="option"], li, a, button')
        .filter({ hasText: /upload transactions/i })
        .first();

      if (!(await uploadItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
        logger.info('Wave: "Upload transactions" not in More menu');
        await page.keyboard.press('Escape');
        return false;
      }

      await uploadItem.click();
      await page.waitForTimeout(800);
      await screenshot(page, 'wave-upload-dialog');

      // Generate the CSV
      const csvPath = writeWaveCsv(entries);
      logger.info(`Wave: generated import CSV at ${csvPath}`);

      // Upload the file (Playwright can set files on hidden inputs too)
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(csvPath);
      await page.waitForTimeout(1_200);
      await screenshot(page, 'wave-upload-file-selected');

      // Wave import wizard: click Next / Continue if a column-mapping step appears
      for (let step = 0; step < 3; step++) {
        const nextBtn = page
          .getByRole('button', { name: /next|continue|proceed/i })
          .first();
        if (!(await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false))) break;
        await nextBtn.click();
        await page.waitForTimeout(800);
        await screenshot(page, `wave-upload-step-${step + 1}`);
      }

      // Final confirm / import button
      const confirmBtn = page
        .getByRole('button', { name: /^import$|^confirm$|^finish$|^submit$/i })
        .first();
      if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(2_000);
        await screenshot(page, 'wave-upload-confirmed');
        return true;
      }

      logger.warn('Wave: CSV upload accepted but no final confirm button — assuming auto-submit');
      await screenshot(page, 'wave-upload-no-confirm');
      return true;
    } catch (err) {
      logger.warn(`Wave CSV import attempt failed: ${err}`);
      await screenshot(page, 'wave-upload-error').catch(() => {});
      return false;
    }
  }

  // ── Manual form entry ───────────────────────────────────────────────────────

  private async enterTransactionForm(
    page: import('playwright').Page,
    entry: WaveEntry,
  ): Promise<WaveEntryResult> {
    logger.info(`Entering Wave transaction: ${entry.description} — $${entry.amount}`);

    try {
      // "Add transaction" opens a dropdown with Add deposit / Add withdrawal / etc.
      const addBtn = page.locator('button').filter({ hasText: /add transaction/i }).first();
      await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await addBtn.click();
      await page.waitForTimeout(500);

      // Pick the right sub-option
      const subOptionText = entry.type === 'income' ? /add deposit/i : /add withdrawal/i;
      const subOption = page
        .getByRole('menuitem', { name: subOptionText })
        .or(page.locator('[role="option"], li, a, button').filter({ hasText: subOptionText }))
        .first();
      await subOption.waitFor({ state: 'visible', timeout: 5_000 });
      await subOption.click();
      await page.waitForTimeout(700);
      await screenshot(page, `wave-form-open-${entry.externalId}`);

      // All form fields are inside [role="dialog"]
      const dialog = page.locator('[role="dialog"]').first();
      await dialog.waitFor({ state: 'visible', timeout: 8_000 });

      // Date (placeholder="yyyy-mm-dd" scoped to dialog, avoids filter date fields on the page)
      const dateField = dialog.locator('input[placeholder="yyyy-mm-dd"]').first();
      await dateField.waitFor({ state: 'visible', timeout: 5_000 });
      await dateField.fill(entry.date);

      // Description
      const descField = dialog.locator('input[placeholder*="Description" i]').first();
      await descField.fill(entry.description);

      // Amount (aria-label="amount" is specific to the form field)
      const amountField = dialog.locator('input[aria-label="amount"]').first();
      await amountField.fill(entry.amount.toFixed(2));

      // Account dropdown (best-effort — don't fail if not found)
      await this.trySetDropdown(page, dialog, entry.accountName, /account|cash on hand/i);

      // Category dropdown (best-effort)
      await this.trySetDropdown(page, dialog, entry.categoryName, /categor|uncategorized/i);

      await screenshot(page, `wave-form-filled-${entry.externalId}`);

      // Save
      const saveBtn = dialog.getByRole('button', { name: /^save$/i }).first();
      await saveBtn.click();
      await page.waitForTimeout(1_200);
      await screenshot(page, `wave-form-saved-${entry.externalId}`);

      logger.info(`Wave transaction saved: ${entry.description}`);
      return { entry, success: true, skipped: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to enter Wave transaction: ${msg}`);
      await screenshot(page, `wave-form-error-${entry.externalId}`).catch(() => {});

      // Dismiss open modal
      try {
        const cancelBtn = page.locator('[role="dialog"] button').filter({ hasText: /cancel/i }).first();
        if (await cancelBtn.isVisible({ timeout: 800 }).catch(() => false)) {
          await cancelBtn.click();
        } else {
          await page.keyboard.press('Escape');
        }
        await page.waitForTimeout(300);
      } catch { /* ignore */ }

      return { entry, success: false, skipped: false, error: msg };
    }
  }

  /**
   * Try to set a Wave custom dropdown (Account or Category) in the form dialog.
   * These are React components — not native selects. Best-effort: log on failure.
   */
  private async trySetDropdown(
    page: import('playwright').Page,
    dialog: import('playwright').Locator,
    targetValue: string,
    triggerPattern: RegExp,
  ): Promise<void> {
    try {
      // Find a button in the dialog whose text matches the current dropdown label
      const trigger = dialog
        .locator('button, [role="combobox"], [role="button"]')
        .filter({ hasText: triggerPattern })
        .first();

      if (!(await trigger.isVisible({ timeout: 1_500 }).catch(() => false))) return;

      await trigger.click();
      await page.waitForTimeout(400);

      // Look for the target value in the dropdown list
      const option = page
        .getByRole('option', { name: new RegExp(targetValue, 'i') })
        .or(page.locator('[role="listbox"] [role="option"], li, button').filter({
          hasText: new RegExp(targetValue, 'i'),
        }))
        .first();

      if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(300);
      } else {
        logger.debug(`Wave: dropdown option "${targetValue}" not found — using default`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
    } catch {
      // Non-fatal: leave default value
      logger.debug(`Wave: could not set dropdown to "${targetValue}" — skipping`);
    }
  }
}
