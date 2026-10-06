import { describe, expect, it } from 'vitest';
import {
  asRecord,
  entryFor,
  formatCarbon,
  formatMeasuredEnergy,
  text,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/dashboard-format.js';
import type {
  LedgerEntry,
  LedgerStage,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data.js';

describe('Dashboard energy formatting', () => {
  it('keeps missing energy and carbon unknown instead of displaying zero', () => {
    expect(formatMeasuredEnergy(null)).toBe('Not recorded');
    expect(formatMeasuredEnergy(undefined)).toBe('Not recorded');
    expect(formatCarbon(null)).toBe('Not recorded');
    expect(formatCarbon(undefined)).toBe('Not recorded');
  });
  it('shows zero in readable units without a misleading positive sign', () => {
    expect(formatMeasuredEnergy(0)).toBe('0 Wh');
    expect(formatMeasuredEnergy(0, true)).toBe('0 Wh');
    expect(formatMeasuredEnergy(-0, true)).toBe('0 Wh');
  });

  it('preserves small values in Wh rather than rounding to almost-zero kWh', () => {
    expect(formatMeasuredEnergy(0.0012)).toBe(`${(1.2).toLocaleString()} Wh`);
    expect(formatMeasuredEnergy(0.0012)).not.toContain('kWh');
  });

  it('preserves the direction of signed and negative results', () => {
    expect(formatMeasuredEnergy(0.002, true)).toBe('+2 Wh');
    expect(formatMeasuredEnergy(-0.002)).toBe('−2 Wh');
    expect(formatMeasuredEnergy(-0.002, true)).toBe('−2 Wh');
    expect(formatMeasuredEnergy(-2)).toBe('−2 kWh');
  });

  it('uses a less-than label below one thousandth of a Wh', () => {
    expect(formatMeasuredEnergy(0.0000005)).toBe('<0.001 Wh');
    expect(formatMeasuredEnergy(0.0000005, true)).toBe('+<0.001 Wh');
    expect(formatMeasuredEnergy(-0.0000005, true)).toBe('−<0.001 Wh');
    expect(formatMeasuredEnergy(0.000001)).toBe(`${(0.001).toLocaleString()} Wh`);
  });

  it('switches to kWh at one thousand Wh', () => {
    expect(formatMeasuredEnergy(0.999)).toBe('999 Wh');
    expect(formatMeasuredEnergy(1)).toBe('1 kWh');
    expect(formatMeasuredEnergy(1, true)).toBe('+1 kWh');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'does not render an invalid energy measurement: %s',
    (value) => expect(formatMeasuredEnergy(value)).toBe('Not recorded'),
  );
});

describe('Dashboard carbon formatting', () => {
  it('shows zero without implying a reduction', () => {
    expect(formatCarbon(0)).toBe('0 kg CO₂e');
    expect(formatCarbon(-0)).toBe('0 kg CO₂e');
  });

  it('uses grams below one kilogram and kilograms at the boundary', () => {
    expect(formatCarbon(0.001)).toBe('1 g CO₂e');
    expect(formatCarbon(0.999)).toBe('999 g CO₂e');
    expect(formatCarbon(1)).toBe('1 kg CO₂e');
  });

  it('labels tiny nonzero quantities without rounding them to zero', () => {
    expect(formatCarbon(0.0000005)).toBe('<0.001 g CO₂e');
    expect(formatCarbon(-0.0000005)).toBe('−<0.001 g CO₂e');
    expect(formatCarbon(0.000001)).toBe(`${(0.001).toLocaleString()} g CO₂e`);
  });

  it('retains negative carbon quantities in both units', () => {
    expect(formatCarbon(-0.001)).toBe(`${(-1).toLocaleString()} g CO₂e`);
    expect(formatCarbon(-1)).toBe(`${(-1).toLocaleString()} kg CO₂e`);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'does not render an invalid carbon measurement: %s',
    (value) => expect(formatCarbon(value)).toBe('Not recorded'),
  );
});

describe('Dashboard ledger presentation helpers', () => {
  const entry = (stage: LedgerStage, seq: number): LedgerEntry => ({
    seq,
    runId: 'run-test',
    bugId: 'bug-test',
    stage,
    timestamp: `2026-10-03T08:00:0${seq}.000Z`,
    summary: `${stage} ${seq}`,
    data: {},
  });

  it('selects the last recorded entry for a stage without mutating the journey', () => {
    const first = entry('investigate', 1);
    const latest = entry('investigate', 3);
    const entries = [first, entry('compare', 2), latest, entry('simulate', 4)];
    const snapshot = [...entries];
    expect(entryFor(entries, 'investigate')).toBe(latest);
    expect(entryFor(entries, 'compare')).toBe(entries[1]);
    expect(entries).toEqual(snapshot);
  });

  it('leaves missing stages unknown', () => {
    expect(entryFor([], 'verify')).toBeUndefined();
    expect(entryFor([entry('detect', 1)], 'verify')).toBeUndefined();
  });

  it('preserves a valid record by identity', () => {
    const record = { provider: 'offline', tokens: 0 };
    expect(asRecord(record)).toBe(record);
  });

  it.each([null, undefined, [], ['value'], 'value', 0, false])(
    'uses an empty record for non-record data: %s',
    (value) => expect(asRecord(value)).toEqual({}),
  );

  it('renders nonempty strings and explicit fallback text without coercing data', () => {
    expect(text('Evidence recorded')).toBe('Evidence recorded');
    expect(text('')).toBe('—');
    expect(text(undefined, 'Not recorded')).toBe('Not recorded');
    expect(text(0)).toBe('—');
    expect(text(null)).toBe('—');
    expect(text({ toString: () => 'untrusted value' })).toBe('—');
  });
});
