import dotenv from 'dotenv';

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const config = {
  ricochet: {
    url: required('RICOCHET_URL'),
    username: required('RICOCHET_USERNAME'),
    password: required('RICOCHET_PASSWORD'),
  },
  wave: {
    apiUrl: process.env.WAVE_API_URL ?? 'https://gql.waveapps.com/graphql/public',
    apiToken: required('WAVE_API_TOKEN'),
    businessId: required('WAVE_BUSINESS_ID'),
  },
  sync: {
    intervalHours: parseInt(process.env.SYNC_INTERVAL_HOURS ?? '24', 10),
    startDate: process.env.SYNC_START_DATE ?? '2026-01-01',
  },
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
