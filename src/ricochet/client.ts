import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import type { RicochetSale, RicochetConsignerPayout, RicochetInventoryItem, RicochetDateRange } from './types';

export class RicochetClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async connect(): Promise<void> {
    logger.info('Launching browser for Ricochet...');
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
    await this.login();
  }

  async disconnect(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  private async login(): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');
    logger.info('Logging into Ricochet...');
    await this.page.goto(config.ricochet.url);
    // TODO: implement login flow once Ricochet URL/UI is known
    await this.page.fill('[name="username"]', config.ricochet.username);
    await this.page.fill('[name="password"]', config.ricochet.password);
    await this.page.click('[type="submit"]');
    await this.page.waitForNavigation();
    logger.info('Logged into Ricochet');
  }

  async getSales(_range: RicochetDateRange): Promise<RicochetSale[]> {
    // TODO: implement — navigate to sales report, apply date filter, extract data
    logger.warn('RicochetClient.getSales not yet implemented');
    return [];
  }

  async getConsignerPayouts(_range: RicochetDateRange): Promise<RicochetConsignerPayout[]> {
    // TODO: implement
    logger.warn('RicochetClient.getConsignerPayouts not yet implemented');
    return [];
  }

  async getInventory(): Promise<RicochetInventoryItem[]> {
    // TODO: implement
    logger.warn('RicochetClient.getInventory not yet implemented');
    return [];
  }
}
