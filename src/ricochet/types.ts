/** Raw row from Ricochet Payout History CSV export */
export interface RicochetPayoutRow {
  item: string;
  saleNumber: string;
  agreedPrice: number;
  costSplitPct: number;   // e.g. 90 = 90%
  agedPrice: number;
  discounts: number;
  paidDate: string;       // YYYY-MM-DD
  soldDate: string;       // YYYY-MM-DD
  amount: number;         // amount paid to consigner
}

/** A single payout history record after parsing */
export interface RicochetPayoutRecord {
  item: string;
  saleNumber: string;
  agreedPrice: number;
  splitPct: number;
  agedPrice: number;
  discounts: number;
  paidDate: string;
  soldDate: string;
  consignerAmount: number;
  // Derived
  grossSalePrice: number; // agreedPrice after discounts
  storeCommission: number; // grossSalePrice - consignerAmount
}

/** Daily totals aggregated from payout records */
export interface DailyTotals {
  date: string;           // YYYY-MM-DD (using soldDate)
  recordCount: number;
  grossSales: number;     // sum of agreedPrice (after discounts)
  consignerPayouts: number; // sum of consigner amounts (90%)
  storeCommission: number;  // sum of store share (10%)
  totalDiscounts: number;
}

export interface RicochetDateRange {
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
}
