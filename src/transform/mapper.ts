import { config } from '../utils/config';
import type { RicochetSale, RicochetConsignerPayout } from '../ricochet/types';
import type { WaveTransaction } from '../wave/types';

// TODO: populate these account IDs from Wave once accounts are set up
const WAVE_ACCOUNTS = {
  checking: '',          // primary checking account
  salesIncome: '',       // sales/revenue account
  commissionIncome: '',  // store commission/fee income
  salesTaxPayable: '',   // sales tax liability
  consignerExpense: '',  // consigner payout expense account
};

export function saleToWaveTransaction(sale: RicochetSale): WaveTransaction {
  const storeIncome = sale.items.reduce((sum, item) => sum + item.storeFee, 0);

  return {
    businessId: config.wave.businessId,
    externalId: `ricochet-sale-${sale.transactionNumber}`,
    date: sale.date,
    description: `Ricochet sale #${sale.transactionNumber}`,
    anchor: {
      accountId: WAVE_ACCOUNTS.checking,
      amount: sale.total,
      direction: 'DEPOSIT',
    },
    lineItems: [
      {
        accountId: WAVE_ACCOUNTS.salesIncome,
        amount: sale.subtotal - storeIncome,
        description: 'Consigner sales (pass-through)',
      },
      {
        accountId: WAVE_ACCOUNTS.commissionIncome,
        amount: storeIncome,
        description: 'Store commission/fees',
      },
      ...(sale.taxAmount > 0 ? [{
        accountId: WAVE_ACCOUNTS.salesTaxPayable,
        amount: sale.taxAmount,
        description: 'Sales tax collected',
      }] : []),
    ],
  };
}

export function payoutToWaveTransaction(payout: RicochetConsignerPayout): WaveTransaction {
  return {
    businessId: config.wave.businessId,
    externalId: `ricochet-payout-${payout.id}`,
    date: payout.date,
    description: `Consigner payout — ${payout.consignerName}`,
    anchor: {
      accountId: WAVE_ACCOUNTS.checking,
      amount: payout.amount,
      direction: 'WITHDRAWAL',
    },
    lineItems: [
      {
        accountId: WAVE_ACCOUNTS.consignerExpense,
        amount: payout.amount,
        description: `Payout to ${payout.consignerName}`,
      },
    ],
  };
}

export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}
