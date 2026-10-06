import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  'apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/control-plane.module.css',
  'utf8',
);
const light = css.slice(0, css.indexOf('}'));
const color = (name: string, palette = light) => {
  const value = palette.match(new RegExp(`--cp-${name}: (#[a-f0-9]+);`))?.[1];
  if (!value) throw new Error(`Missing palette token: ${name}`);
  return value.length === 4 ? '#' + [...value.slice(1)].map((c) => c + c).join('') : value;
};
const luminance = (hex: string) =>
  hex
    .slice(1)
    .match(/../g)!
    .map((part) => {
      const n = parseInt(part, 16) / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a: string, b: string) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe('sage and lime dashboard palette', () => {
  it('uses the reference-inspired default palette', () => {
    expect(color('bg')).toBe('#f6f7f1');
    expect(color('action')).toBe('#add653');
    expect(color('text')).toBe('#0b291b');
    expect(color('progress-bg')).toBe('#dce4cb');
  });
  it.each(['text', 'muted', 'accent', 'green', 'blue', 'purple'])(
    'keeps %s readable on white and sage',
    (token) => {
      expect(contrast(color(token), color('surface'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color(token), color('progress-bg'))).toBeGreaterThanOrEqual(4.5);
    },
  );
  it('uses dark text on lime actions, not low-contrast white text', () => {
    expect(contrast(color('action-ink'), color('action'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color('progress-ink'), color('progress-bg'))).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps chart strokes visible against white', () => {
    expect(contrast(color('chart-primary'), color('surface'))).toBeGreaterThanOrEqual(3);
  });
});

describe('charcoal and olive dashboard palette', () => {
  const olive = css.match(/\.root\[data-theme='olive'\] \{([^}]+)\}/)![1];
  const token = (name: string) => color(name, olive);
  it('keeps a dark sidebar and white panels as a separate theme', () => {
    expect(token('sidebar-bg')).toBe('#242424');
    expect(token('surface')).toBe('#ffffff');
    expect(token('action')).toBe('#294e42');
  });
  it.each(['text', 'muted', 'accent', 'green', 'blue', 'purple'])(
    'keeps %s readable on white panels',
    (name) => expect(contrast(token(name), token('surface'))).toBeGreaterThanOrEqual(4.5),
  );
  it('keeps sidebar labels and focus accents readable on charcoal', () => {
    for (const name of ['sidebar-ink', 'sidebar-accent']) {
      expect(contrast(token(name), token('sidebar-bg'))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('keeps white labels readable on actions and both gradient stops', () => {
    expect(contrast(token('action-ink'), token('action'))).toBeGreaterThanOrEqual(4.5);
    for (const stop of ['#294e42', '#647449']) {
      expect(contrast(token('progress-ink'), stop)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it.each(['chart-primary', 'chart-secondary', 'chart-tertiary'])(
    'keeps %s distinguishable from the white canvas',
    (name) => expect(contrast(token(name), token('surface'))).toBeGreaterThanOrEqual(3),
  );
});
