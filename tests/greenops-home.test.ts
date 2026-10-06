import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import Home from '../apps/CodeVitals-MCP/website/src/app/page';
import { metadata } from '../apps/CodeVitals-MCP/website/src/app/layout';

vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/link', () => ({
  default: ({ children, ...props }: { children: unknown; href: string }) =>
    createElement('a', props, children),
}));
const websiteRequire = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = websiteRequire('react');
const { renderToStaticMarkup } = websiteRequire('react-dom/server');
const css = (file: string) =>
  readFileSync(resolve(__dirname, '../apps/CodeVitals-MCP/website/src/app', file), 'utf8');

describe('GreenOps project alignment', () => {
  it('offers recorded and sample entry points without inventing operational results', () => {
    const html = renderToStaticMarkup(createElement(Home));
    expect(html).toContain('GreenOps');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/dashboard?data=sample"');
    expect(html).toContain('Plans do not deploy changes');
    expect(html).not.toContain('/Users/');
    expect(html).not.toContain('MCP v1.0');
    expect(html).not.toContain('9 dimensions');
  });
  it('shows all specialist workspaces and links the available workflow destinations', () => {
    const html = renderToStaticMarkup(createElement(Home));
    for (const agent of [
      'Carbon efficiency',
      'Digital waste',
      'AI efficiency',
      'Architecture',
      'Disaster recovery',
      'Collaboration',
      'Pipeline efficiency',
    ])
      expect(html).toContain(agent);
    expect(html).toContain('href="/dashboard?tab=carbon"');
    expect(html).toContain('href="/dashboard?tab=approval"');
    expect(html).toContain('href="/dashboard?tab=waste&amp;sandbox=1"');
    expect(html).toContain('href="/dashboard/ai-efficiency-demo"');
    expect(html).toContain('href="/dashboard/measurement"');
    expect(html).toContain('Repository analysis, built into GreenOps');
    expect(html).not.toContain('CodeVitals');
    expect(metadata.title).toContain('GreenOps');
  });
  it('uses bounded view motion with reduced-motion and print overrides', () => {
    const shell = css('dashboard/control-plane/control-plane.module.css');
    expect(shell).toContain('--cp-motion-enter: 320ms');
    expect(shell).toContain('@keyframes viewEnter');
    expect(shell).toContain('@media (prefers-reduced-motion: reduce)');
    expect(shell).toContain('animation: none !important');
    expect(shell).toContain('scroll-behavior: auto !important');
    expect(shell).toContain('.textButton[data-loading=');
    for (const path of ['notifications.module.css', 'audit-pages.module.css']) {
      expect(css(`dashboard/control-plane/${path}`)).toContain(
        '@media (prefers-reduced-motion: reduce)',
      );
    }
  });
});
