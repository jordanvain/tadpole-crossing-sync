import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { logger } from '../utils/logger';
import type { RicochetPayoutRow, RicochetPayoutRecord } from '../ricochet/types';

/**
 * Ricochet Payout History CSV columns:
 * Item | Sale # | Agreed price | Cost/Split % | Aged Price | Discounts | Paid date | Sold date | Amount
 */
function parseAmount(raw: string): number {
  if (!raw || raw.trim() === '' || raw.trim() === '-') return 0;
  // Strip currency symbols, commas, parentheses (negatives)
  const cleaned = raw.replace(/[$,()%\s]/g, '');
  const negative = raw.includes('(') || raw.startsWith('-');
  const value = parseFloat(cleaned) || 0;
  return negative ? -value : value;
}

function parseDate(raw: string): string {
  if (!raw || raw.trim() === '') return '';
  const trimmed = raw.trim();
  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Slash-separated: MM/DD/YYYY or MM/DD/YY
  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    const [m, d, y] = slashParts;
    return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Dash-separated: MM-DD-YYYY (Ricochet actual format)
  const dashParts = trimmed.split('-');
  if (dashParts.length === 3 && dashParts[2].length === 4) {
    const [m, d, y] = dashParts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return trimmed;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function parsePayoutCsv(filePath: string): RicochetPayoutRecord[] {
  logger.info(`Parsing payout CSV: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf-8');

  const rawRows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  if (rawRows.length === 0) {
    logger.warn('CSV file is empty or has no data rows');
    return [];
  }

  // Normalize headers to handle minor formatting differences
  const headerMap = buildHeaderMap(rawRows[0]);
  logger.debug('CSV header map:', headerMap);

  const records: RicochetPayoutRecord[] = [];

  for (const raw of rawRows) {
    const row = mapRow(raw, headerMap);

    const agreedPrice = parseAmount(row.agreedPrice ?? '');
    const discounts = parseAmount(row.discounts ?? '');
    const consignerAmount = parseAmount(row.amount ?? '');
    const splitPct = parseAmount(row.costSplitPct ?? '');

    const grossSalePrice = agreedPrice - Math.abs(discounts);
    const storeCommission = grossSalePrice - consignerAmount;

    records.push({
      item: row.item ?? '',
      saleNumber: row.saleNumber ?? '',
      agreedPrice,
      splitPct,
      agedPrice: parseAmount(row.agedPrice ?? ''),
      discounts,
      paidDate: parseDate(row.paidDate ?? ''),
      soldDate: parseDate(row.soldDate ?? ''),
      consignerAmount,
      grossSalePrice,
      storeCommission,
    });
  }

  logger.info(`Parsed ${records.length} payout records`);
  return records;
}

/** Find the most recent payout CSV in the exports directory */
export function findLatestPayoutCsv(exportsDir: string): string | null {
  if (!fs.existsSync(exportsDir)) return null;

  const files = fs.readdirSync(exportsDir)
    .filter(f => f.startsWith('payout-history') && f.endsWith('.csv'))
    .sort()
    .reverse();

  return files.length > 0 ? require('path').join(exportsDir, files[0]) : null;
}

// --- header normalization helpers ---

type RowAlias = {
  item: string;
  saleNumber: string;
  agreedPrice: string;
  costSplitPct: string;
  agedPrice: string;
  discounts: string;
  paidDate: string;
  soldDate: string;
  amount: string;
};

const COLUMN_ALIASES: Record<keyof RowAlias, string[]> = {
  item: ['item', 'itemname', 'description', 'itemdescription'],
  saleNumber: ['sale', 'saleno', 'salenumber', 'sale#', 'transactionno', 'transactionnumber'],
  agreedPrice: ['agreedprice', 'agreed', 'listprice', 'price'],
  costSplitPct: ['costsplit', 'costsplit%', 'split', 'splitpct', 'split%', 'costsplitpct'],
  agedPrice: ['agedprice', 'aged'],
  discounts: ['discounts', 'discount'],
  paidDate: ['paiddate', 'paid', 'paidOn', 'paydate'],
  soldDate: ['solddate', 'sold', 'saledate', 'soldOn'],
  amount: ['amount', 'payout', 'payoutamount', 'consigneramount', 'net'],
};

function buildHeaderMap(sampleRow: Record<string, string>): Record<string, keyof RowAlias> {
  const map: Record<string, keyof RowAlias> = {};
  for (const rawHeader of Object.keys(sampleRow)) {
    const normalized = normalizeHeader(rawHeader);
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof RowAlias, string[]][]) {
      if (aliases.includes(normalized)) {
        map[rawHeader] = field;
        break;
      }
    }
  }
  return map;
}

function mapRow(raw: Record<string, string>, headerMap: Record<string, keyof RowAlias>): Partial<Record<keyof RowAlias, string>> {
  const out: Partial<Record<keyof RowAlias, string>> = {};
  for (const [rawHeader, field] of Object.entries(headerMap)) {
    out[field] = raw[rawHeader] ?? '';
  }
  return out;
}
