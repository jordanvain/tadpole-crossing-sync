import type { DailyTotals } from '../ricochet/types';
import type { WaveEntrySet } from '../wave/types';

/**
 * Map a DailyTotals row into the two Wave transactions we need to create:
 *   1. INCOME  — gross sales total  → Sales Income account
 *   2. EXPENSE — consigner payout   → Cost of Goods / Consigner Payouts account
 */
export function dailyTotalsToWaveEntries(day: DailyTotals): WaveEntrySet {
  const id = `ricochet-${day.date}`;
  return {
    externalId: id,
    date: day.date,
    income: {
      externalId: `${id}-income`,
      date: day.date,
      description: `Consignment sales — ${day.date} (${day.recordCount} items)`,
      amount: day.grossSales,
      type: 'income',
      accountName: 'Sales',
      categoryName: 'Sales',
    },
    expense: {
      externalId: `${id}-expense`,
      date: day.date,
      description: `Consigner payout — ${day.date} (${day.recordCount} items, 90%)`,
      amount: day.consignerPayouts,
      type: 'expense',
      accountName: 'Checking',
      categoryName: 'Cost of Goods Sold',
    },
  };
}

export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}
