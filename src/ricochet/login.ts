import type { Page } from 'playwright';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { screenshot } from '../utils/screenshots';

export async function loginToRicochet(page: Page): Promise<void> {
  logger.info('Navigating to Ricochet login...');
  await page.goto(config.ricochet.url, { waitUntil: 'networkidle' });
  await screenshot(page, 'ricochet-login-page');

  // Fill username — Ricochet uses a standard login form
  await page.fill('input[name="username"], input[name="email"], input[type="email"]', config.ricochet.username);
  await page.fill('input[name="password"], input[type="password"]', config.ricochet.password);
  await screenshot(page, 'ricochet-login-filled');

  await page.click('button[type="submit"], input[type="submit"]');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'ricochet-after-login');

  // Verify we're logged in by checking for a dashboard element
  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('signin')) {
    throw new Error(`Ricochet login may have failed — still at: ${currentUrl}`);
  }

  logger.info('Logged into Ricochet successfully');
}
