import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GreenOpsMeasure } from '@greenops/measure';
import { SustainabilityLedger } from '../src/ledger.js';
import { SelfAccountant } from '../src/self-accountant.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function ledgerPath() {
  const root = mkdtempSync(join(tmpdir(), 'greenops-ledger-usage-test-'));
  roots.push(root);
  return join(root, 'ledger.json');
}
const params = {
  runId: 'test-run',
  startedAt: '2026-01-01T00:00:00Z',
  bugsDetected: 1,
  bugsImproved: 0,
  savings: { energyKwh: 0, carbonKgCo2e: 0 },
};

describe('nullable accounting ledger compatibility', () => {
  it('persists explicit unknown footprint and net impact', () => {
    const path = ledgerPath();
    const meter = new SelfAccountant(new GreenOpsMeasure());
    meter.recordLlm('investigate', 15);
    meter.recordLlm('investigate', null);
    new SustainabilityLedger(path).recordOutcome({ ...params, selfCost: meter.summary() });
    const outcome = new SustainabilityLedger(path).allOutcomes()[0]!;
    expect(outcome.selfCost).toMatchObject({
      tokens: null,
      knownTokens: 15,
      usageComplete: false,
      llmCalls: 2,
      unknownLlmCalls: 1,
      energyKwh: null,
      carbonKgCo2e: null,
    });
    expect(outcome.net).toEqual({ energyKwh: null, carbonKgCo2e: null, netPositive: null });
  });

  it('writes complete zero-call metadata for offline work', () => {
    const meter = new SelfAccountant(new GreenOpsMeasure());
    const outcome = new SustainabilityLedger(ledgerPath()).recordOutcome({
      ...params,
      selfCost: meter.summary(),
    });
    expect(outcome.selfCost).toMatchObject({
      tokens: 0,
      knownTokens: 0,
      usageComplete: true,
      llmCalls: 0,
      unknownLlmCalls: 0,
      energyKwh: 0,
      carbonKgCo2e: 0,
    });
    expect(outcome.net).toEqual({ energyKwh: 0, carbonKgCo2e: 0, netPositive: false });
  });

  it('reads and preserves numeric historical outcomes without inventing coverage metadata', () => {
    const path = ledgerPath();
    const historic = {
      ...params,
      finishedAt: params.startedAt,
      selfCost: { tokens: 32, toolCalls: 2, retries: 0, energyKwh: 0.1, carbonKgCo2e: 0.04 },
      net: { energyKwh: -0.1, carbonKgCo2e: -0.04, netPositive: false },
    };
    writeFileSync(path, JSON.stringify({ version: 1, entries: [], outcomes: [historic] }));
    const ledger = new SustainabilityLedger(path);
    expect(ledger.allOutcomes()[0]).toEqual(historic);
    ledger.recordOutcome({
      ...params,
      runId: 'new-run',
      selfCost: new SelfAccountant(new GreenOpsMeasure()).summary(),
    });
    expect(new SustainabilityLedger(path).allOutcomes()[0]).toEqual(historic);
  });
});

describe('crash-safe persistence', () => {
  const entry = {
    runId: 'r',
    bugId: 'b',
    stage: 'detect' as const,
    summary: 's',
    data: {},
  };

  it('replaces the ledger without leaving temp files and keeps valid JSON after each append', () => {
    const path = ledgerPath();
    const ledger = new SustainabilityLedger(path);
    for (let i = 0; i < 25; i++) {
      ledger.append({ ...entry, bugId: `b${i}` });
      const onDisk = JSON.parse(readFileSync(path, 'utf8'));
      expect(onDisk.entries).toHaveLength(i + 1);
    }
    expect(readdirSync(dirname(path))).toEqual(['ledger.json']);
    expect(new SustainabilityLedger(path).allEntries().map((e) => e.seq)).toEqual(
      Array.from({ length: 25 }, (_, i) => i),
    );
  });

  it('leaves the previous ledger intact and removes the temp file when the replace fails', () => {
    const path = ledgerPath();
    const ledger = new SustainabilityLedger(path);
    ledger.append(entry);
    const before = readFileSync(path, 'utf8');
    // Replacing a directory with a file fails on every platform.
    rmSync(path);
    mkdirSync(path);
    expect(() => ledger.append(entry)).toThrow();
    expect(readdirSync(dirname(path))).toEqual(['ledger.json']);
    rmSync(path, { recursive: true });
    writeFileSync(path, before);
    expect(new SustainabilityLedger(path).allEntries()).toHaveLength(1);
  });
});
