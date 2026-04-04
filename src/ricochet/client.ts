// Ricochet data is accessed via CSV export — see src/ricochet/export.ts
// This file re-exports types and the export function for convenience.
export { exportFromRicochet } from './export';
export type { ExportResult } from './export';
export type {
  RicochetPayoutRow,
  RicochetPayoutRecord,
  DailyTotals,
  RicochetDateRange,
} from './types';
