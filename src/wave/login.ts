import type { Page } from 'playwright';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { screenshot } from '../utils/screenshots';

const BUSINESS_TRANSACTIONS_URL =
  `${config.wave.url}/${config.wave.businessId}/accounting/transactions`;

export async function loginToWave(page: Page): Promise<void> {
  logger.info(`Navigating to Wave transactions URL: ${BUSINESS_TRANSACTIONS_URL}`);

  // Navigate to the business URL directly — Wave will redirect to login if not authed
  await page.goto(BUSINESS_TRANSACTIONS_URL, { waitUntil: 'domcontentloaded' });

  // Wait up to 10s to see what page we land on
  const onLoginPage = await page
    .waitForSelector('input[type="email"], input[name="email"]', { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  if (!onLoginPage) {
    logger.info('Wave: already authenticated, skipping login');
    await screenshot(page, 'wave-already-authed');
    return;
  }

  await screenshot(page, 'wave-login-page');
  logger.info('Wave: login form detected, filling credentials...');

  // Fill email
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
  await emailInput.fill(config.wave.email);

  // Some Wave login pages show both fields at once; others show password only after "Next"
  const passwordVisible = await page
    .locator('input[type="password"]')
    .isVisible()
    .catch(() => false);

  if (!passwordVisible) {
    logger.info('Wave: two-step login — clicking Next after email');
    const nextBtn = page
      .getByRole('button', { name: /next|continue/i })
      .or(page.locator('button[type="submit"]'))
      .first();
    await nextBtn.click();
    await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
  }

  await page.locator('input[type="password"]').first().fill(config.wave.password);
  await screenshot(page, 'wave-login-filled');

  // Submit — Wave uses a submit button (may say "Log in", "Sign in", or just be type=submit)
  const submitBtn = page
    .getByRole('button', { name: /log in|sign in/i })
    .or(page.locator('button[type="submit"]'))
    .first();
  await submitBtn.click();

  // Wait for navigation away from the login page (up to 30s for SSO / 2FA flows)
  await page
    .waitForURL(
      url => !url.href.includes('/login') && !url.href.includes('/signin'),
      { timeout: 30_000 },
    )
    .catch(async () => {
      // If URL didn't change, grab a screenshot and throw
      await screenshot(page, 'wave-login-failed');
      const current = page.url();
      throw new Error(`Wave login failed — still at: ${current}`);
    });

  await screenshot(page, 'wave-after-login');
  logger.info('Wave: logged in successfully');
}

/** Navigate to the correct business's transactions page after login */
export async function navigateToTransactions(page: Page): Promise<void> {
  const current = page.url();
  if (current.includes(config.wave.businessId) && current.includes('/transactions')) {
    logger.info('Wave: already on transactions page');
    return;
  }

  logger.info('Wave: navigating to Accounting → Transactions...');
  await page.goto(BUSINESS_TRANSACTIONS_URL, { waitUntil: 'domcontentloaded' });

  // Wait for the transactions page to render (React SPA — wait for a known element)
  await page
    .waitForSelector('h1, [data-testid="transactions-page"], button:has-text("Add transaction"), button:has-text("More")', {
      timeout: 15_000,
    })
    .catch(() => { /* page may render differently — proceed */ });

  await screenshot(page, 'wave-transactions-page');
  logger.info('Wave: on transactions page');
}
