import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withCarbonReceipt } from '../apps/cli/src/carbon-receipt-store.js';

const dirs: string[] = [];
const file = () => {
  const dir = mkdtempSync(join(tmpdir(), 'greenops-carbon-receipt-'));
  dirs.push(dir);
  return join(dir, 'receipt.json');
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
describe('receipt reservation before cluster writes', () => {
  it('refuses existing output without running dispatch or changing existing content', async () => {
    const path = file();
    writeFileSync(path, 'existing receipt');
    const dispatch = vi.fn();
    await expect(withCarbonReceipt(path, { planId: 'test' }, dispatch)).rejects.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
    expect(readFileSync(path, 'utf8')).toBe('existing receipt');
  });
  it('persists an inspectable pending record before operation and retains it on failure', async () => {
    const path = file();
    await expect(
      withCarbonReceipt(path, { planId: 'test', jobName: 'target' }, async () => {
        expect(JSON.parse(readFileSync(path, 'utf8')).state).toBe('dispatch-not-confirmed');
        throw new Error('API failure');
      }),
    ).rejects.toThrow('API failure');
    expect(JSON.parse(readFileSync(path, 'utf8')).jobName).toBe('target');
  });
  it('keeps confirmed receipt when a later observation or ledger operation fails', async () => {
    const path = file();
    const receipt = { planId: 'test', jobUid: 'created-job' };
    await expect(
      withCarbonReceipt(path, { planId: 'test' }, async (persist) => {
        persist(receipt);
        throw new Error('status unavailable');
      }),
    ).rejects.toThrow('status unavailable');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(receipt);
  });
});
