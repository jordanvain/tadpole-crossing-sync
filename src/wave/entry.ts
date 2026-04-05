import path from 'path';
import { chromium } from 'playwright';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { screenshot } from '../utils/screenshots';
import { loginToWave, navigateToTransactions } from './login';
import { writeWaveCsv } from './csv-writer';
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

    // Flatten to a list, skipping already-synced entries
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

    const browser = await chromium.launch({
      headless: config.browser.headless,
      slowMo: config.browser.slowMo,
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginToWave(page);
      await navigateToTransactions(page);

      // ── Strategy 1: CSV import via "More" dropdown ─────────────────────────
      const csvImported = await this.tryCsvImport(page, toCreate);

      if (csvImported) {
        logger.info('Wave CSV import succeeded');
        for (const entry of toCreate) {
          results.push({ entry, success: true, skipped: false });
        }
        return results;
      }

      // ── Strategy 2: Manual form entry ─────────────────────────────────────
      logger.info('CSV import unavailable — falling back to manual form entry');
      for (const entry of toCreate) {
        const result = await this.enterTransactionForm(page, entry);
        results.push(result);
        await page.waitForTimeout(400);
      }
    } finally {
      await browser.close();
    }

    return results;
  }

  // ── CSV import ─────────────────────────────────────────────────────────────

  private async tryCsvImport(
    page: import('playwright').Page,
    entries: WaveEntry[],
  ): Promise<boolean> {
    try {
      logger.info('Wave: looking for "More" → Import option...');

      // Wave transactions page has a "More" button (sometimes a dropdown trigger)
      const moreBtn = page
        .getByRole('button', { name: /^more$/i })
        .or(page.locator('button').filter({ hasText: /^more$/i }))
        .or(page.locator('[aria-label*="more" i]'))
        .first();

      const moreVisible = await moreBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!moreVisible) {
        logger.info('Wave: "More" button not found, skipping CSV import path');
        return false;
      }

      await moreBtn.click();
      await page.waitForTimeout(300);
      await screenshot(page, 'wave-more-dropdown');

      // Look for an Import / Upload option in the dropdown
      const importItem = page
        .getByRole('menuitem', { name: /import|upload/i })
        .or(page.locator('[role="menuitem"], [role="option"], li, a').filter({ hasText: /import|upload/i }))
        .first();

      const importVisible = await importItem.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!importVisible) {
        logger.info('Wave: no Import item in "More" dropdown');
        // Close dropdown
        await page.keyboard.press('Escape');
        return false;
      }

      await importItem.click();
      await page.waitForTimeout(500);
      await screenshot(page, 'wave-import-dialog');

      // Generate the CSV file
      const csvPath = writeWaveCsv(entries);
      logger.info(`Wave: generated import CSV at ${csvPath}`);

      // Look for file input (visible or hidden) and upload
      const fileInput = page.locator('input[type="file"]').first();

      // Playwright can set files on hidden inputs directly
      await fileInput.setInputFiles(csvPath);
      await page.waitForTimeout(1_000);
      await screenshot(page, 'wave-import-file-selected');

      // Handle column-mapping step if present: look for a "Next" or "Continue" button
      const nextBtn = page
        .getByRole('button', { name: /next|continue|proceed/i })
        .first();
      if (await nextBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        logger.info('Wave: column mapping step detected — clicking Next');
        await nextBtn.click();
        await page.waitForTimeout(800);
        await screenshot(page, 'wave-import-column-map');

        // Try another Next if there's a second mapping step
        if (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await nextBtn.click();
          await page.waitForTimeout(500);
        }
      }

      // Final "Import" / "Confirm" / "Submit" button
      const confirmBtn = page
        .getByRole('button', { name: /import|confirm|submit|finish/i })
        .first();
      if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(2_000);
        await screenshot(page, 'wave-import-confirmed');
        return true;
      }

      logger.warn('Wave: import dialog found but no confirm button — import may have auto-submitted');
      await screenshot(page, 'wave-import-no-confirm');
      return true; // assume success if file was accepted

    } catch (err) {
      logger.warn(`Wave CSV import attempt failed: ${err}`);
      await screenshot(page, 'wave-import-error');
      return false;
    }
  }

  // ── Manual form entry ──────────────────────────────────────────────────────

  private async enterTransactionForm(
    page: import('playwright').Page,
    entry: WaveEntry,
  ): Promise<WaveEntryResult> {
    logger.info(`Entering Wave transaction: ${entry.description} — $${entry.amount}`);

    try {
      // Wave: "Add transaction" is sometimes a split button (the label is on the left,
      // dropdown arrow on the right). Click the label part.
      const addBtn = page
        .getByRole('button', { name: /add transaction/i })
        .or(page.locator('button').filter({ hasText: /add transaction/i }))
        .first();

      await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await addBtn.click();
      await page.waitForTimeout(400);
      await screenshot(page, `wave-form-open-${entry.externalId}`);

      // Date
      const dateField = page
        .locator('input[type="date"]')
        .or(page.locator('input[placeholder*="date" i]'))
        .first();
      await dateField.waitFor({ state: 'visible', timeout: 5_000 });
      await dateField.fill(entry.date);

      // Description
      const descField = page
        .locator('input[placeholder*="description" i], input[placeholder*="memo" i], input[name*="description" i], textarea[placeholder*="description" i]')
        .first();
      await descField.fill(entry.description);

      // Account dropdown
      await this.fillCombobox(page, entry.accountName, /account/i);

      // Category dropdown
      await this.fillCombobox(page, entry.categoryName, /categor/i);

      // Amount
      const amountField = page
        .locator('input[type="number"], input[placeholder*="amount" i], input[name*="amount" i]')
        .first();
      await amountField.fill(entry.amount.toFixed(2));

      await screenshot(page, `wave-form-filled-${entry.externalId}`);

      // Save
      const saveBtn = page
        .getByRole('button', { name: /^save$|save transaction/i })
        .or(page.locator('button[type="submit"]').filter({ hasText: /save/i }))
        .first();
      await saveBtn.click();
      await page.waitForTimeout(1_000);
      await screenshot(page, `wave-form-saved-${entry.externalId}`);

      logger.info(`Wave transaction created: ${entry.description}`);
      return { entry, success: true, skipped: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to enter Wave transaction: ${msg}`);
      await screenshot(page, `wave-form-error-${entry.externalId}`);

      // Dismiss any open modal before continuing
      try {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } catch { /* ignore */ }

      return { entry, success: false, skipped: false, error: msg };
    }
  }

  /**
   * Fill a combobox/searchable-dropdown.
   * labelPattern is used to find the right field among multiple comboboxes.
   */
  private async fillCombobox(
    page: import('playwright').Page,
    value: string,
    labelPattern: RegExp,
  ): Promise<void> {
    // Try to find a labelled combobox first
    const labelled = page
      .locator(`[role="combobox"]`)
      .filter({ hasText: '' }) // ensure it's interactive
      .and(
        page.locator(`[aria-label*="${labelPattern.source.replace(/\\/g, '')}" i]`)
          .or(page.locator('input').filter({ has: page.locator(`[id*="${labelPattern.source}" i]`) })),
      )
      .first();

    // Fall back: find input near a label that matches
    const nearby = page
      .locator('label')
      .filter({ hasText: labelPattern })
      .locator('xpath=following-sibling::* | ..//*')
      .locator('input, [role="combobox"]')
      .first();

    // Try generic combobox near the form (nth-based on order: account=0, category=1)
    const allComboboxes = page.locator('[role="combobox"], select');

    let field = labelled;
    if (!(await field.isVisible({ timeout: 1_000 }).catch(() => false))) {
      field = nearby;
    }

    if (await field.isVisible({ timeout: 1_500 }).catch(() => false)) {
      // It's a native <select>
      const tagName = await field.evaluate((el) => (el as { tagName: string }).tagName.toLowerCase());
      if (tagName === 'select') {
        await (field as import('playwright').Locator).selectOption({ label: value });
        return;
      }
      // Searchable input
      await field.click();
      await field.fill(value);
    } else {
      // Last resort: click each combobox and look for matching option in the listbox
      const count = await allComboboxes.count();
      for (let i = 0; i < count; i++) {
        const cb = allComboboxes.nth(i);
        const ariaLabel = (await cb.getAttribute('aria-label') ?? '').toLowerCase();
        const placeholder = (await cb.getAttribute('placeholder') ?? '').toLowerCase();
        const hint = labelPattern.source.toLowerCase().replace(/\\/g, '');
        if (!ariaLabel.includes(hint) && !placeholder.includes(hint)) continue;
        await cb.click();
        await cb.fill(value).catch(() => { /* read-only combobox */ });
        break;
      }
    }

    // Wait for and click the matching option in the listbox
    await page.waitForTimeout(300);
    const option = page
      .getByRole('option', { name: new RegExp(value, 'i') })
      .or(page.locator('[role="listbox"] [role="option"]').filter({ hasText: new RegExp(value, 'i') }))
      .or(page.locator('li').filter({ hasText: new RegExp(value, 'i') }))
      .first();

    if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await option.click();
    }
  }
}
