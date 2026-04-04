# Data Mapping: Ricochet → Wave

This document describes how data from Ricochet Consignment maps to Wave Accounting.

## Sales Transactions

| Ricochet Field | Wave Field | Notes |
|---|---|---|
| `transactionNumber` | `externalId` (prefix: `ricochet-sale-`) | Used for deduplication |
| `date` | `date` | ISO date string |
| `total` | anchor `amount` | Full deposit to checking |
| `paymentMethod` | — | Not yet mapped |
| `taxAmount` | Sales Tax Payable line item | Liability account |
| `items[].storeFee` | Commission Income line item | Store revenue |
| `items[].consignerPayout` | pass-through (offset) | Not income to store |

### Wave Accounts Used (Sales)
- **Anchor:** Checking account (DEPOSIT)
- **Line item 1:** Sales Income — consigner pass-through portion
- **Line item 2:** Commission Income — store fee/markup
- **Line item 3:** Sales Tax Payable — tax collected (liability)

---

## Consigner Payouts

| Ricochet Field | Wave Field | Notes |
|---|---|---|
| `id` | `externalId` (prefix: `ricochet-payout-`) | Used for deduplication |
| `date` | `date` | ISO date string |
| `amount` | anchor `amount` | Full withdrawal from checking |
| `consignerName` | `description` | Included in transaction description |
| `checkNumber` | — | Not yet mapped |

### Wave Accounts Used (Payouts)
- **Anchor:** Checking account (WITHDRAWAL)
- **Line item:** Consigner Expense account

---

## Wave Account IDs to Configure

Before running, populate `WAVE_ACCOUNTS` in `src/transform/mapper.ts`:

| Constant | Account Type | Notes |
|---|---|---|
| `checking` | Asset / Checking | Primary bank account |
| `salesIncome` | Income / Sales | Consigner pass-through sales |
| `commissionIncome` | Income | Store commission/fees |
| `salesTaxPayable` | Liability | Collected sales tax |
| `consignerExpense` | Expense | Consigner payouts |

Account IDs can be retrieved from Wave via the `getAccounts()` API call.

---

## Deduplication Strategy

Every transaction written to Wave is tagged with an `externalId` derived from the Ricochet record ID (e.g., `ricochet-sale-12345`). Before creating a transaction, the sync engine checks if that `externalId` already exists in Wave. If it does, the record is skipped.

This means syncs are safe to re-run — they will not create duplicate entries.

---

## Open Questions

- [ ] Does Ricochet export sales tax per-item or per-transaction?
- [ ] How does Ricochet handle refunds/returns? Do they appear as negative sales?
- [ ] What is the correct Wave account structure for a consignment shop?
- [ ] Should consigner payouts be tracked as expenses or as liability payments?
