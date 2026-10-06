import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FindingDetail } from '../apps/CodeVitals-MCP/website/src/app/dashboard/dashboard-components.js';
import type { Finding } from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-dashboard.js';
import type {
  LedgerEntry,
  LedgerStage,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/ledger-data.js';

// These checks concern semantic content and disclosure state, not SVG/CSS output.
// Mock the website-local icon package to avoid transforming its entire icon set.
vi.mock('../apps/CodeVitals-MCP/website/node_modules/lucide-react', () => ({
  AlertTriangle: () => null,
  BadgeCheck: () => null,
  BookOpen: () => null,
  ChevronDown: () => null,
  ChevronLeft: () => null,
  ChevronRight: () => null,
  ClipboardCheck: () => null,
  History: () => null,
  Info: () => null,
  ShieldCheck: () => null,
}));
vi.mock('../apps/CodeVitals-MCP/website/src/app/dashboard/dashboard.module.css', () => ({
  default: {},
}));

// The website is independently installed; resolve its existing React instance
// instead of introducing a second runtime or browser-test dependency at the root.
const websiteRequire = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = websiteRequire('react');
const { renderToStaticMarkup } = websiteRequire('react-dom/server');

const entry = (stage: LedgerStage, data: Record<string, unknown>): LedgerEntry => ({
  stage,
  data,
  seq: 1,
  runId: 'run-review-test',
  bugId: 'finding-review-test',
  timestamp: '2026-10-03T08:00:00.000Z',
  summary: 'INTERNAL_SUMMARY_CANARY',
});

const finding = (entries: LedgerEntry[], extra: Partial<Finding> = {}): Finding => ({
  bugId: 'finding-review-test',
  agentId: 'ai-efficiency',
  agentName: 'AI Efficiency Agent',
  category: 'oversized-token-request',
  severity: 'medium',
  title: 'Review the output limit',
  state: 'withheld',
  impactEnergyKwh: 0,
  impactCarbonKg: 0,
  confidence: 'unknown',
  effort: 'small',
  recommendationId: 'right-size-max-tokens',
  recommendationTitle: 'Right-size the output limit',
  recommendation: 'Test an output limit against real completion lengths.',
  expectedReductionFactor: 0,
  reversible: false,
  entries,
  ...extra,
});

const render = (value: Finding): string =>
  renderToStaticMarkup(createElement(FindingDetail, { finding: value }));

describe('Auditable finding review rendering', () => {
  it('renders audit timestamps with an explicit locale and UTC time zone', () => {
    const html = render(finding([entry('detect', {})]));
    expect(html).toContain('dateTime="2026-10-03T08:00:00.000Z"');
    expect(html).toContain('3 Oct 2026, 08:00:00');
    expect(html).toContain('UTC');
  });

  it('renders selected evidence without exposing raw internal records or reasoning', () => {
    const html = render(
      finding([
        entry('detect', {
          location: {
            filePath: 'C:\\private-folder\\trace.json',
            startLine: 2,
            symbol: 'demo-service',
          },
          evidence: {
            maxTokens: 2000,
            completionTokens: 15,
            prompt: 'PRIVATE_PROMPT_CANARY',
            apiKey: 'PRIVATE_KEY_CANARY',
          },
          codeSnippet: 'RAW_SOURCE_CANARY',
        }),
        entry('investigate', { rootCause: 'INTERNAL_REASONING_CANARY', error: 'RAW_ERROR_CANARY' }),
        entry('compare', {
          reasoning: 'COMPARISON_TRACE_CANARY',
          suggestedCode: 'RAW_PROPOSAL_CANARY',
        }),
      ]),
    );
    expect(html).toContain('Evidence');
    expect(html).toContain('trace.json');
    expect(html).toContain('demo-service');
    expect(html).toContain('Configured output limit');
    for (const canary of [
      'PRIVATE_PROMPT_CANARY',
      'PRIVATE_KEY_CANARY',
      'RAW_SOURCE_CANARY',
      'INTERNAL_REASONING_CANARY',
      'RAW_ERROR_CANARY',
      'COMPARISON_TRACE_CANARY',
      'RAW_PROPOSAL_CANARY',
      'INTERNAL_SUMMARY_CANARY',
      'private-folder',
    ]) {
      expect(html).not.toContain(canary);
    }
    expect(html).not.toContain('Structured ledger data');
    expect(html).not.toContain('Structured finding evidence');
  });

  it('distinguishes automatic policy permission from human approval and successful application', () => {
    const html = render(
      finding([
        entry('approve', { approved: true, approver: 'policy-approver' }),
        entry('improve', { applied: false, note: 'RAW_FAILURE_CANARY' }),
      ]),
    );
    expect(html).toContain('Automatic policy: allowed the change');
    expect(html).toContain('not a human approval');
    expect(html).toContain('Change not applied');
    expect(html).toContain('No verification result recorded');
    expect(html).not.toContain('RAW_FAILURE_CANARY');
    expect(html).toContain('id="human-decision"');
    expect(html).toContain('id="verified-result"');
  });

  it('does not infer a human decision from an arbitrary approver name', () => {
    const html = render(
      finding([entry('approve', { approved: true, approver: 'unit-test-person' })]),
    );
    expect(html).toContain('Unattributed decision: allowed the change');
    expect(html).toContain('does not establish whether a person or automation');
    expect(html).not.toContain('Human approved');
  });

  it('describes sandbox application and re-detection without claiming power-metered savings', () => {
    const html = render(
      finding(
        [
          entry('improve', { applied: true, mode: 'sandbox' }),
          entry('verify', {
            confirmed: true,
            measurementBasis: 'observed-redetection+estimated-conversion',
          }),
        ],
        { state: 'verified' },
      ),
    );
    expect(html).toContain('Applied in a sandbox');
    expect(html).toContain('not the original workload');
    expect(html).toContain('Verification passed');
    expect(html).toContain('Energy and carbon remain model-based estimates');
  });

  it('labels projections as unvalidated and does not invent missing measurements', () => {
    const html = render(finding([]));
    expect(html).toContain('Projected impact · unvalidated estimate');
    expect(html).toContain('not achieved savings');
    expect(html).toContain('Not recorded');
    expect(html).not.toContain('0 Wh');
    expect(html).not.toContain('0 kg CO₂e');
  });

  it('renders only recorded alternatives and sanitizes public alternative text', () => {
    const html = render(
      finding([
        entry('compare', {
          recommended: 'right-size-max-tokens',
          strategies: [
            {
              id: 'right-size-max-tokens',
              title: 'Chosen strategy',
              description: 'Chosen description',
            },
            {
              id: 'alternative',
              title: 'Measure before changing',
              description: 'Inspect api_key=unit-test-canary https://private.example/?token=canary',
              effort: 'small',
            },
          ],
        }),
      ]),
    );
    expect(html).toContain('Measure before changing');
    expect(html).not.toContain('unit-test-canary');
    expect(html).not.toContain('private.example');
    expect(render(finding([]))).toContain('No alternative options were recorded');
  });

  it('provides an accessible manual-steps control without a fake approval or apply action', () => {
    const html = render(finding([]));
    expect(html).toContain('View manual steps');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls=');
    expect(html).toContain('Automatic changes are not connected to this dashboard');
    expect(html).toContain('How to verify the result');
    expect(html).not.toContain('Approve improvement');
    expect(html).not.toContain('Apply automatically');
  });
});
