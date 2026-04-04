import path from 'path';
import fs from 'fs';
import type { Page } from 'playwright';
import { logger } from './logger';
import { config } from './config';

const screenshotDir = path.join(config.paths.logs, 'screenshots');

fs.mkdirSync(screenshotDir, { recursive: true });

export async function screenshot(page: Page, label: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}-${label}.png`;
  const filepath = path.join(screenshotDir, filename);
  try {
    await page.screenshot({ path: filepath, fullPage: false });
    logger.debug(`Screenshot saved: ${filename}`);
  } catch (err) {
    logger.warn(`Failed to take screenshot "${label}": ${err}`);
  }
}
