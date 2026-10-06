import type { LedgerEntry, LedgerStage } from './ledger-data';

export const STAGES: LedgerStage[] = [
  'detect',
  'investigate',
  'compare',
  'simulate',
  'approve',
  'improve',
  'verify',
];
export const STAGE_HELP: Record<LedgerStage, string> = {
  detect: 'A potential source of technology waste was identified.',
  investigate: 'Evidence was analyzed to determine the root cause.',
  compare: 'Possible remediations were evaluated.',
  simulate: 'Expected savings were estimated before making a change.',
  approve: 'A policy or human decided whether the change could proceed.',
  improve: 'The approved remediation was applied or attempted.',
  verify:
    'A follow-up check recorded whether the change worked. Energy conversions remain estimates.',
};
export const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const text = (value: unknown, fallback = '—') =>
  typeof value === 'string' && value.length > 0 ? value : fallback;
export function entryFor(entries: LedgerEntry[], stage: LedgerStage) {
  return entries.findLast((entry) => entry.stage === stage);
}
export function formatMeasuredEnergy(kwh: number | null | undefined, signed = false): string {
  if (typeof kwh !== 'number' || !Number.isFinite(kwh)) return 'Not recorded';
  if (kwh === 0) return '0 Wh';
  const sign = kwh < 0 ? '−' : signed ? '+' : '';
  const wh = Math.abs(kwh * 1000);
  if (wh < 0.001) return `${sign}<0.001 Wh`;
  const value = wh < 1000 ? wh : Math.abs(kwh);
  return `${sign}${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${wh < 1000 ? 'Wh' : 'kWh'}`;
}
export function formatCarbon(kg: number | null | undefined): string {
  if (typeof kg !== 'number' || !Number.isFinite(kg)) return 'Not recorded';
  if (kg === 0) return '0 kg CO₂e';
  const grams = Math.abs(kg * 1000);
  if (grams < 0.001) return `${kg < 0 ? '−' : ''}<0.001 g CO₂e`;
  return Math.abs(kg) < 1
    ? `${(kg * 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} g CO₂e`
    : `${kg.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg CO₂e`;
}
