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

  const submitBtn = page.locator('button[type="submit"], input[type="submit"]')
    .or(page.getByRole('button', { name: /login|sign in|log in/i }));

  // Wait for URL to change away from login page (real navigation), with fallback to Enter key
  await Promise.all([
    page.waitForURL(url => !url.toString().includes('/login') && !url.toString().includes('/signin'), { timeout: 30000 }).catch(() => null),
    submitBtn.first().click(),
  ]);

  // If still on login page, try pressing Enter in the password field
  if (page.url().includes('login') || page.url().includes('signin')) {
    await page.locator('input[type="password"]').press('Enter');
    await page.waitForURL(url => !url.toString().includes('/login') && !url.toString().includes('/signin'), { timeout: 30000 });
  }

  await page.waitForLoadState('networkidle');
  await screenshot(page, 'ricochet-after-login');

  // Verify we're logged in
  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('signin')) {
    throw new Error(`Ricochet login may have failed — still at: ${currentUrl}`);
  }

  logger.info('Logged into Ricochet successfully');
}
