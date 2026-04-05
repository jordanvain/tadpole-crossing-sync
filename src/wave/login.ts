import type { Page } from 'playwright';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { screenshot } from '../utils/screenshots';

export async function loginToWave(page: Page): Promise<void> {
  logger.info('Navigating to Wave...');

  // Navigate to the business dashboard directly — Wave will redirect to /login and set a
  // return URL so that after auth it redirects back to the intended page (not 404).
  const targetUrl = `${config.wave.url}/${config.wave.businessId}/accounting/transactions`;
  await page.goto(targetUrl, { waitUntil: 'load' });
  await screenshot(page, 'wave-initial-page');

  // If we're already logged in (session cookie still valid), skip login
  if (!page.url().includes('/login') && !page.url().includes('/signin')) {
    logger.info('Already authenticated with Wave');
    return;
  }

  logger.info('Wave redirected to login — entering credentials...');
  await screenshot(page, 'wave-login-page');

  // When Wave redirects from a protected page, it renders both email and password fields.
  // Wait for the email input, fill both fields, then click "Sign in".
  await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 30000 });
  await page.fill('input[name="email"], input[type="email"]', config.wave.email);
  await page.fill('input[name="password"], input[type="password"]', config.wave.password);
  await screenshot(page, 'wave-login-filled');

  // Click "Sign in" button
  const submitBtn = page.locator('button[type="submit"]')
    .or(page.getByRole('button', { name: /sign in/i }));
  await submitBtn.first().click();

  // Wait for navigation away from /login — Wave will redirect back to the target page
  await page.waitForURL(
    url => !url.toString().includes('/login') && !url.toString().includes('/signin'),
    { timeout: 90000 },
  );

  await page.waitForLoadState('load');
  await screenshot(page, 'wave-after-login');

  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
    throw new Error(`Wave login may have failed — still at: ${currentUrl}`);
  }

  logger.info(`Logged into Wave successfully — at: ${currentUrl}`);
}

/** Navigate to the correct business if Wave shows a business selector */
export async function selectBusiness(page: Page): Promise<void> {
  const url = page.url();
  // If already in the business dashboard, skip
  if (url.includes(config.wave.businessId)) return;

  // Look for business selector / switcher
  try {
    const businessLink = page.locator(`a[href*="${config.wave.businessId}"]`).first();
    if (await businessLink.isVisible({ timeout: 3000 })) {
      await businessLink.click();
      await page.waitForLoadState('load');
      logger.info('Navigated to Tadpole Crossing business');
      await screenshot(page, 'wave-business-selected');
    }
  } catch {
    // Already on correct business or no selector shown
  }
}
