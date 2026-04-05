import fs from 'fs';
import path from 'path';
import type { WaveEntry } from './types';
import { config } from '../utils/config';

/**
 * Generates a Wave-importable CSV from a flat list of WaveEntry objects.
 *
 * Wave's CSV importer accepts a simple format:
 *   Transaction Date, Description, Amount
 * where positive = income/deposit, negative = expense/withdrawal.
 *
 * Returns the path to the written file.
 */
export function writeWaveCsv(entries: WaveEntry[]): string {
  const rows: string[] = [
    '"Transaction Date","Description","Amount","Account","Note"',
  ];

  for (const entry of entries) {
    const amount =
      entry.type === 'income'
        ? entry.amount.toFixed(2)
        : (-entry.amount).toFixed(2);

    rows.push(
      [
        `"${entry.date}"`,
        `"${entry.description.replace(/"/g, '""')}"`,
        `"${amount}"`,
        `"${entry.accountName.replace(/"/g, '""')}"`,
        `"${entry.categoryName.replace(/"/g, '""')}"`,
      ].join(','),
    );
  }

  const filename = `wave-import-${new Date().toISOString().split('T')[0]}.csv`;
  const filepath = path.join(config.paths.exports, filename);
  fs.writeFileSync(filepath, rows.join('\n'), 'utf8');
  return filepath;
}
