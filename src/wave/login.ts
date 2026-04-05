import type { Page } from 'playwright';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { screenshot } from '../utils/screenshots';

export const BUSINESS_TRANSACTIONS_URL =
  `${config.wave.url}/${config.wave.businessId}/transactions`;

// Selector for the Wave login email input
const EMAIL_SELECTOR = 'input[type="email"], input[name="email"]';

export async function loginToWave(page: Page): Promise<void> {
  logger.info(`Navigating to Wave transactions URL: ${BUSINESS_TRANSACTIONS_URL}`);

  // Wave uses client-side routing — navigating to /transactions renders the login form
  // at that URL without a redirect. We detect auth state by whether the email input appears.
  await page.goto(BUSINESS_TRANSACTIONS_URL, { waitUntil: 'domcontentloaded' });

  // Wait up to 15s for React to hydrate and decide whether to render login or transactions
  const onLoginPage = await page
    .waitForSelector(EMAIL_SELECTOR, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!onLoginPage) {
    logger.info('Wave: already authenticated — transactions page rendered without login form');
    await screenshot(page, 'wave-already-authed');
    return;
  }

  await screenshot(page, 'wave-login-page');
  logger.info('Wave: login form detected, filling credentials...');

  // Fill email
  const emailInput = page.locator(EMAIL_SELECTOR).first();
  await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
  await emailInput.fill(config.wave.email);

  // Wave shows both email + password together when accessed via a protected URL.
  // If password field isn't visible yet, click "Next" (two-step flow).
  const passwordVisible = await page.locator('input[type="password"]').isVisible().catch(() => false);
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

  // Submit (button may read "Sign in", "Log in", or be type=submit)
  const submitBtn = page
    .getByRole('button', { name: /log in|sign in/i })
    .or(page.locator('button[type="submit"]'))
    .first();
  await submitBtn.click();

  // Wave may or may not change the URL after login (client-side auth vs. server redirect).
  // Wait for whichever comes first: login form disappears, OR URL changes.
  logger.info('Wave: waiting for login to complete...');
  await Promise.race([
    // Most reliable: the email input leaves the DOM
    page.waitForSelector(EMAIL_SELECTOR, { state: 'hidden', timeout: 40_000 }),
    // Fallback: URL changes away from /login or /signin (server-side redirect)
    page.waitForURL(
      url => !url.href.includes('/login') && !url.href.includes('/signin'),
      { timeout: 40_000 },
    ),
  ]).catch(async () => {
    await screenshot(page, 'wave-login-failed');
    throw new Error(`Wave login failed — still at: ${page.url()}`);
  });

  // Give React a moment to render the authenticated transactions view
  await page.waitForTimeout(1_500);

  await screenshot(page, 'wave-after-login');
  logger.info(`Wave: logged in successfully — at ${page.url()}`);
}

/** Navigate to the transactions page (skip if already there) */
export async function navigateToTransactions(page: Page): Promise<void> {
  const current = page.url();
  const isOnTransactions = current.includes(config.wave.businessId)
    && current.endsWith('/transactions');

  if (isOnTransactions) {
    logger.info('Wave: already on transactions page');
    // Still wait for React to fully render the authenticated view
    await page.waitForSelector('button', { timeout: 10_000 }).catch(() => {});
    return;
  }

  logger.info('Wave: navigating to Transactions page...');
  await page.goto(BUSINESS_TRANSACTIONS_URL, { waitUntil: 'domcontentloaded' });

  // Wait for any button to appear (confirms React has rendered)
  await page.waitForSelector('button', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_000);

  await screenshot(page, 'wave-transactions-page');
  logger.info('Wave: on transactions page');
}
