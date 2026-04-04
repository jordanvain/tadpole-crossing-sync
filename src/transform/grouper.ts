import type { RicochetPayoutRecord, DailyTotals } from '../ricochet/types';

/** Group payout records by sold date and sum totals for the day */
export function groupByDate(records: RicochetPayoutRecord[]): DailyTotals[] {
  const byDate = new Map<string, RicochetPayoutRecord[]>();

  for (const record of records) {
    const date = record.soldDate || record.paidDate;
    if (!date) continue;
    const existing = byDate.get(date) ?? [];
    existing.push(record);
    byDate.set(date, existing);
  }

  const totals: DailyTotals[] = [];

  for (const [date, dayRecords] of byDate.entries()) {
    let grossSales = 0;
    let consignerPayouts = 0;
    let storeCommission = 0;
    let totalDiscounts = 0;

    for (const r of dayRecords) {
      grossSales += r.grossSalePrice;
      consignerPayouts += r.consignerAmount;
      storeCommission += r.storeCommission;
      totalDiscounts += Math.abs(r.discounts);
    }

    totals.push({
      date,
      recordCount: dayRecords.length,
      grossSales: round(grossSales),
      consignerPayouts: round(consignerPayouts),
      storeCommission: round(storeCommission),
      totalDiscounts: round(totalDiscounts),
    });
  }

  // Sort ascending by date
  totals.sort((a, b) => a.date.localeCompare(b.date));
  return totals;
}

/** Filter records that fall within a date range (inclusive, using soldDate) */
export function filterByDateRange(
  records: RicochetPayoutRecord[],
  startDate: string,
  endDate: string,
): RicochetPayoutRecord[] {
  return records.filter(r => {
    const d = r.soldDate || r.paidDate;
    return d >= startDate && d <= endDate;
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
