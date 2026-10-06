import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import DemoClient, {
  DemoRunSummary,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo-client.js';
import type {
  DemoResponse,
  DemoRun,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo-types.js';

vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: unknown }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('../apps/CodeVitals-MCP/website/node_modules/lucide-react', () => ({
  Activity: () => null,
  ArrowRight: () => null,
  BarChart3: () => null,
  Beaker: () => null,
  BrainCircuit: () => null,
  Check: () => null,
  CheckCircle2: () => null,
  ChevronRight: () => null,
  ClipboardList: () => null,
  Download: () => null,
  LayoutDashboard: () => null,
  Leaf: () => null,
  ListFilter: () => null,
  LoaderCircle: () => null,
  RefreshCw: () => null,
  RotateCcw: () => null,
  ShieldCheck: () => null,
  XCircle: () => null,
}));
vi.mock(
  '../apps/CodeVitals-MCP/website/src/app/dashboard/ai-efficiency-demo/demo.module.css',
  () => ({ default: {} }),
);

const websiteRequire = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = websiteRequire('react');
const { renderToStaticMarkup } = websiteRequire('react-dom/server');
const config: DemoResponse['config'] = {
  geminiAvailable: false,
  model: null,
  liveRequestLimit: 13,
};
const makeRun = (): DemoRun => ({
  schemaVersion: 1,
  id: 'demo-test',
  version: 2,
  mode: 'fixture',
  model: 'fixture-v1',
  status: 'awaiting-approval',
  createdAt: '2026-10-04T01:00:00Z',
  updatedAt: '2026-10-04T01:00:00Z',
  datasetHash: 'dataset-digest',
  activity: [],
  baseline: {
    requests: 8,
    modelCalls: 8,
    cacheHits: 0,
    tokens: 340,
    missingUsage: 0,
    durationMs: 1,
    qualityPassed: true,
    results: [{ id: 'delivery-1', answer: '3 days', correct: true, cached: false, tokens: 40 }],
  },
  recommendation: {
    strategy: 'exact-match-cache',
    title: 'Cache identical eligible requests',
    explanation: 'The same eligible requests repeat.',
    source: 'fixture-rule',
    model: 'fixture-v1',
    tokens: 0,
    risk: 'Do not cache personal responses.',
    confidence: 'High for this synthetic workload.',
    digest: 'recommendation-digest',
  },
});
const render = (run: DemoRun | null = null) =>
  renderToStaticMarkup(createElement(DemoClient, { initialResponse: { run, config } }));

describe('AI efficiency demo user-facing safeguards', () => {
  it('embeds the isolated workflow without duplicating the shared dashboard navigation or main landmark', () => {
    const html = renderToStaticMarkup(
      createElement(DemoClient, { initialResponse: { run: makeRun(), config }, embedded: true }),
    );
    expect(html).toContain('data-embedded="true"');
    expect(html).toContain('aria-label="AI efficiency verification demo"');
    expect(html).toContain('Turn repeated AI calls into a verified improvement');
    expect(html).toContain('Refresh status');
    expect(html).toContain('Download evidence');
    expect(html).not.toContain('aria-label="Workspace navigation"');
    expect(html).not.toContain('<main');
  });

  it('keeps every workspace destination available with the isolated demo selected', () => {
    const html = render(makeRun());
    const sidebar =
      html.match(/<header[^>]*aria-label="Workspace navigation"[^>]*>[\s\S]*?<\/header>/)?.[0] ??
      '';
    const navigation = sidebar.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(navigation.match(/<a\b/g)).toHaveLength(7);
    for (const route of [
      '/dashboard',
      '/dashboard/agents',
      '/dashboard/findings',
      '/dashboard/approvals',
      '/dashboard/trace',
      '/dashboard/ai-efficiency-demo',
      '/dashboard/reports',
    ]) {
      expect(navigation).toContain(`href="${route}"`);
    }
    expect(navigation).toContain('Approval inbox');
    expect(navigation).toContain('Impact reports');
    const currentLink = navigation.match(/<a\b[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/)?.[0];
    expect(currentLink).toContain('href="/dashboard/ai-efficiency-demo"');
    expect(navigation.match(/aria-current="page"/g)).toHaveLength(1);
    expect(sidebar).not.toContain('?run=');
    expect(sidebar).toContain('Control Plane');
    expect(sidebar).toContain('Refresh status');
  });

  it('shows missing SCI evidence rather than a carbon score from fixture tokens', () => {
    const html = render(makeRun());
    expect(html).toContain('Carbon intensity: more evidence needed');
    expect(html).toContain('href="/dashboard/measurement"');
    expect(html).toContain('Request reduction is not yet a carbon saving');
  });
  it('defaults to an explicitly offline synthetic demo without starting a run', () => {
    const html = render();
    expect(html).toContain('Synthetic workload');
    expect(html).toContain('Fixture replay');
    expect(html).toContain('No LLM calls or API spend');
    expect(html).toContain('Run baseline and find waste');
    expect(html).toMatch(
      /disabled=""[^>]*type="radio"[^>]*value="gemini"|type="radio"[^>]*disabled=""[^>]*value="gemini"/,
    );
    expect(html).not.toContain('Verified request reduction');
  });

  it('surfaces a successful restore response that reports an operation still in progress', () => {
    const html = renderToStaticMarkup(
      createElement(DemoClient, {
        initialResponse: {
          run: makeRun(),
          config,
          error: 'A demo operation is still processing.',
        },
      }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('A demo operation is still processing.');
    expect(html).toContain('Refresh status to retrieve the latest recorded stage.');
    expect(html).not.toContain('We could not complete that action.');
  });

  it('requires an explicit reviewer and acknowledgment before approval or rejection', () => {
    const html = render(makeRun());
    expect(html).toContain('Reviewer name');
    expect(html).toContain('self-declared demo identity');
    expect(html).toContain('I have reviewed the evidence');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Approve sandbox change<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Reject change<\/button>/);
    expect(html).not.toContain('Apply to sandbox');
  });

  it('distinguishes a failed first baseline attempt from a completed workload', () => {
    const run = makeRun();
    run.mode = 'gemini';
    run.status = 'failed';
    run.recommendation = undefined;
    run.baseline = {
      ...run.baseline!,
      modelCalls: 1,
      results: [],
      qualityPassed: false,
      tokens: null,
    };
    const html = render(run);
    expect(html).toContain('8 planned synthetic requests');
    expect(html).toContain('0 of 8 responses completed');
    expect(html).toContain('1 Gemini calls attempted');
    expect(html).toContain('A complete, passing baseline is required before review');
    expect(html).toContain('No completed baseline responses were recorded.');
    expect(html).not.toContain('Next step');
    expect(html).not.toContain('<small>Recorded</small>');
    expect(html).not.toContain('Awaiting review');
    expect(html).not.toContain('Synthetic requests sent to Gemini');
  });

  it('makes application a separate action after approval', () => {
    const run = makeRun();
    run.status = 'approved';
    run.decision = {
      approved: true,
      actor: 'Demo reviewer',
      note: 'Test isolation',
      at: run.createdAt,
      recommendationDigest: 'recommendation-digest',
      identity: 'self-declared-demo',
    };
    const html = render(run);
    expect(html).toContain('Apply to sandbox');
    expect(html).toContain('Approved by Demo reviewer');
    expect(html).not.toContain('Replay and verify');
  });

  it('shows the fallback source without claiming model-generated advice', () => {
    const run = makeRun();
    run.mode = 'gemini';
    run.model = 'test-model';
    run.recommendation!.source = 'fallback';
    run.recommendation!.fallbackReason = 'Provider timeout';
    const html = render(run);
    expect(html).toContain('Rule fallback');
    expect(html).toContain('The model did not supply this recommendation.');
    expect(html).toContain('Provider timeout');
  });

  it('shows replay and rollback only once the sandbox change has been applied', () => {
    const run = makeRun();
    run.status = 'applied';
    run.application = {
      at: run.createdAt,
      beforeHash: 'before',
      afterHash: 'after',
      cacheEnabled: true,
      scope: 'Demo only',
    };
    const html = render(run);
    expect(html).toContain('Replay and verify');
    expect(html).toContain('Roll back sandbox change');
    expect(html).toContain('Not verified yet');
    expect(html).not.toContain('This workload passed verification.');
  });

  it('reports token and estimated energy increases honestly even if request checks pass', () => {
    const run = makeRun();
    run.mode = 'gemini';
    run.status = 'verified';
    run.verification = {
      at: run.updatedAt,
      passed: true,
      after: { ...run.baseline!, modelCalls: 4, cacheHits: 4, tokens: 380 },
      requestsSaved: 4,
      tokensSaved: -40,
      outputsEquivalent: true,
      checks: [{ label: 'Request reduction', passed: true }],
      estimatedEnergyWh: -0.0001,
      estimatedCarbonGrams: -0.00004,
      assumptions: ['Provider model estimate, not measured power.'],
    };
    const html = renderToStaticMarkup(createElement(DemoRunSummary, { run }));
    expect(html).toContain('40 more reported tokens');
    expect(html).toContain('Wh increase');
    expect(html).toContain('g CO₂e increase');
    expect(html).toContain('not metered electricity or net system savings');
  });

  it('does not present a failed verification as a successful improvement', () => {
    const run = makeRun();
    run.status = 'verification-failed';
    run.verification = {
      at: run.updatedAt,
      passed: false,
      after: { ...run.baseline!, qualityPassed: false },
      requestsSaved: 0,
      tokensSaved: 0,
      outputsEquivalent: false,
      checks: [{ label: 'Equivalent outputs', passed: false }],
      estimatedEnergyWh: null,
      estimatedCarbonGrams: null,
      assumptions: [],
    };
    const html = render(run);
    expect(html).toContain('Do not treat this result as a verified improvement.');
    expect(html).toContain('Equivalent outputs: failed');
    expect(html).not.toContain('This workload passed verification.');
  });

  it('keeps exported evidence and the technical trace secondary to the next action', () => {
    const html = render(makeRun());
    expect(html).toContain('Download evidence');
    expect(html).toContain('Evidence identifiers');
    expect(html).toContain('Request-by-request output evidence');
    expect(html).toContain('does not modify the fleet ledger');
    expect(html).toContain('attempted workload calls across baseline and replay');
    expect(html).not.toContain('completed workload calls across baseline and replay');
  });
});
