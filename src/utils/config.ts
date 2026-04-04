import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const config = {
  ricochet: {
    url: process.env.RICOCHET_URL ?? 'https://bellemercantile.ricoconsign.com',
    username: required('RICOCHET_USERNAME'),
    password: required('RICOCHET_PASSWORD'),
  },
  wave: {
    url: process.env.WAVE_URL ?? 'https://next.waveapps.com',
    email: required('WAVE_EMAIL'),
    password: required('WAVE_PASSWORD'),
    businessId: process.env.WAVE_BUSINESS_ID ?? 'ec882151-0f97-413c-8f0b-5c031d36229d',
  },
  browser: {
    headless: process.env.HEADLESS === 'true',
    slowMo: parseInt(process.env.SLOW_MO ?? '100', 10),
  },
  sync: {
    startDate: process.env.SYNC_START_DATE ?? '2026-01-01',
    mode: (process.env.SYNC_MODE ?? 'full') as 'full' | 'export-only' | 'dry-run',
  },
  paths: {
    data: path.resolve(process.cwd(), 'data'),
    exports: path.resolve(process.cwd(), 'data', 'exports'),
    logs: path.resolve(process.cwd(), 'data', 'logs'),
    syncState: path.resolve(process.cwd(), 'data', 'sync-state.json'),
  },
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
