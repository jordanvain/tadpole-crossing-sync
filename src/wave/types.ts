export interface WaveTransaction {
  id?: string;
  businessId: string;
  externalId: string;    // used for deduplication
  date: string;          // ISO date string
  description: string;
  anchor: WaveTransactionAnchor;
  lineItems: WaveLineItem[];
}

export interface WaveTransactionAnchor {
  accountId: string;
  amount: number;
  direction: 'DEPOSIT' | 'WITHDRAWAL';
}

export interface WaveLineItem {
  accountId: string;
  amount: number;
  description: string;
  taxId?: string;
}

export interface WaveAccount {
  id: string;
  name: string;
  type: string;
  subtype: string;
  normalBalanceType: 'DEBIT' | 'CREDIT';
}

export interface WaveCustomer {
  id: string;
  name: string;
  email?: string;
}

export interface WaveCreateTransactionResult {
  transaction: WaveTransaction;
  didCreate: boolean;
}
