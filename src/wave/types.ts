/** A single transaction to be entered into Wave via browser automation */
export interface WaveEntry {
  externalId: string;   // used for deduplication tracking
  date: string;         // YYYY-MM-DD
  description: string;
  amount: number;
  type: 'income' | 'expense';
  accountName: string;  // Which account (e.g. "Checking", "Sales")
  categoryName: string; // Category / contra account
}

/** A paired income + expense entry for one day of consignment activity */
export interface WaveEntrySet {
  externalId: string;
  date: string;
  income: WaveEntry;
  expense: WaveEntry;
}

/** Result from attempting to enter a transaction into Wave */
export interface WaveEntryResult {
  entry: WaveEntry;
  success: boolean;
  skipped: boolean;
  error?: string;
}
