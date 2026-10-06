import { describe, expect, it } from 'vitest';
import { assessResource } from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/architecture-review';

describe('browser architecture configuration review', () => {
  const row = {
    name: 'synthetic-worker',
    region: 'test',
    cores: '8',
    needed: '2',
    intensity: '0.45',
    autoscale: 'false',
  };
  it('flags the three supported configuration issues', () => {
    const result = assessResource(row);
    expect(result).toHaveLength(3);
    expect(result.join(' ')).toContain('Review autoscaling');
    expect(result.join(' ')).toContain('Review sizing');
    expect(result.join(' ')).toContain('Review region choice');
  });
  it('does not replace unknown measurements with zero or claim a pass', () => {
    expect(
      assessResource({ ...row, cores: '', needed: '', intensity: '', autoscale: 'unknown' }),
    ).toEqual([expect.stringContaining('Evidence incomplete')]);
  });
  it('rejects invalid numbers', () => {
    for (const cores of ['NaN', 'Infinity', '-1'])
      expect(() => assessResource({ ...row, cores })).toThrow();
  });
  it('does not call a no-finding result a comprehensive assessment', () => {
    expect(
      assessResource({ ...row, cores: '2', intensity: '0.1', autoscale: 'true' })[0],
    ).toContain('not a comprehensive');
  });
});
