import type { Page } from 'playwright';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { screenshot } from '../utils/screenshots';

export async function loginToWave(page: Page): Promise<void> {
  logger.info('Navigating to Wave login...');
  await page.goto(`${config.wave.url}/login`, { waitUntil: 'networkidle' });
  await screenshot(page, 'wave-login-page');

  await page.fill('input[name="email"], input[type="email"]', config.wave.email);
  await page.fill('input[name="password"], input[type="password"]', config.wave.password);
  await screenshot(page, 'wave-login-filled');

  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'wave-after-login');

  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
    throw new Error(`Wave login may have failed — still at: ${currentUrl}`);
  }

  logger.info('Logged into Wave successfully');
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
      await page.waitForLoadState('networkidle');
      logger.info('Navigated to Tadpole Crossing business');
      await screenshot(page, 'wave-business-selected');
    }
  } catch {
    // Already on correct business or no selector shown
  }
}
