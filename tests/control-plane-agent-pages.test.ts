import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentPages,
  filterWorkspaceRows,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/agent-pages';
import type {
  AgentKey,
  AgentWorkspace,
  ControlPlaneData,
  Opportunity,
} from '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/types';

vi.mock(
  '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/agent-pages.module.css',
  () => ({ default: {} }),
);
vi.mock(
  '../apps/CodeVitals-MCP/website/src/app/dashboard/control-plane/control-plane.module.css',
  () => ({ default: {} }),
);
vi.mock('../apps/CodeVitals-MCP/website/node_modules/next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: unknown }) =>
    createElement('a', { href, ...props }, children),
}));

const websiteRequire = createRequire(
  resolve(__dirname, '../apps/CodeVitals-MCP/website/package.json'),
);
const { createElement } = websiteRequire('react');
const { renderToStaticMarkup } = websiteRequire('react-dom/server');

const names: Record<AgentKey, string> = {
  ai: 'AI Efficiency Agent',
  waste: 'Digital Waste Agent',
  carbon: 'Carbon Efficiency Agent',
  arch: 'Architecture Agent',
  dr: 'Disaster Recovery Agent',
  collab: 'Collaboration Agent',
  pipeline: 'Pipeline Efficiency Agent',
};

function workspace(key: AgentKey): AgentWorkspace {
  return {
    key,
    name: names[key],
    description: `Test ${key} workspace`,
    savingsMonthly: null,
    runCostMonthly: null,
    roiPercent: null,
    metrics: [{ label: 'Recorded opportunity', value: '12', hint: 'From supplied evidence' }],
    inventoryTitle: `${key} resource inventory`,
    columns: ['Region', 'Evidence'],
    rows: [
      {
        id: 'resource-1',
        name: `${key} example resource`,
        cells: ['Example North', 'Measured baseline'],
        opportunityId: `${key}-opportunity`,
        status: 'Review needed',
        facts: [{ label: 'RTO requirement', value: '4 hours' }],
      },
    ],
    chart: {
      title: `${key} measured comparison`,
      description: 'Recorded comparison data',
      primaryLabel: 'Baseline',
      primaryUnit: 'units',
      secondaryLabel: 'Candidate',
      secondaryUnit: 'units',
      points: [{ label: 'Example tier', primary: 5, secondary: 2 }],
    },
  };
}
function opportunity(key: AgentKey): Opportunity {
  return {
    id: `${key}-opportunity`,
    agentKey: key,
    title: `${key} evidence-backed proposal`,
    target: 'example-resource',
    description: 'A supplied finding description.',
    recommendation: 'Review this specific proposed change.',
    evidence: [{ label: 'Observed usage', value: '12 units' }],
    risk: 'Medium',
    riskNote: 'Review the owner and scope',
    confidence: 'Moderate confidence',
    source: 'Recorded evidence',
    monthlyUsd: null,
    carbonKg: null,
    status: 'pending',
    history: [],
  };
}
function fixture(key: AgentKey): ControlPlaneData {
  const agent = workspace(key);
  return {
    mode: 'recorded',
    asOf: null,
    runId: 'test-run',
    agents: [agent],
    opportunities: [opportunity(key)],
    ledger: [],
    executiveMetrics: [],
    trend: {
      title: 'Trend',
      description: '',
      primaryLabel: 'Recorded',
      primaryUnit: 'units',
      points: [],
    },
    selfAudit: [],
    usageDetails: [],
    filterNote: '',
  };
}
function render(key: AgentKey, change?: (data: ControlPlaneData, agent: AgentWorkspace) => void) {
  const data = fixture(key);
  const agent = data.agents[0];
  change?.(data, agent);
  return renderToStaticMarkup(createElement(AgentPages, { agent, data, onReview: vi.fn() }));
}

describe('complete reference-style agent workspaces', () => {
  it('offers an inline cache test without an eighth navigation page', () => {
    const html = render('ai');
    expect(html).toContain('Test cache optimization here');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('href="/dashboard/ai-efficiency-demo');
  });

  it('keeps sample cache-test entry separate from any recorded run', () => {
    const html = render('ai', (data) => {
      data.mode = 'sample';
    });
    expect(html).toContain('Test cache optimization here');
    expect(html).not.toContain('ai-efficiency-demo?run=');
  });

  it.each([
    ['ai', 'Model routing: cost &amp; carbon comparison', 'Your token-saving plan'],
    ['waste', 'Cleanup &amp; retention proposals', 'Waste profile'],
    ['carbon', 'Energy spikes &amp; regional comparison', 'Carbon-aware workload decisions'],
    ['arch', 'Infrastructure-as-Code eco-audit findings', 'Recommended change'],
    [
      'dr',
      'Hot standby vs. cold storage footprint',
      'RTO/RPO readiness &amp; recovery requirements',
    ],
    ['collab', 'Recording &amp; knowledge lifecycle', 'Before changing retention'],
    ['pipeline', 'Pipeline recommendations', 'Runner energy is modeled'],
  ] as const)('renders a dedicated %s page with its own domain layout', (key, first, second) => {
    const html = render(key);
    expect(html).toContain(first);
    expect(html).toContain(second);
    expect(html).toContain('Recorded analysis');
    expect(html).toContain('12');
    expect(html).not.toContain('42.8 Million');
    expect(html).not.toContain('100% Clean Grid');
    expect(html).not.toContain('Approve &amp; Execute');
  });

  it.each(['ai', 'waste', 'carbon', 'arch', 'dr', 'collab', 'pipeline'] as const)(
    'preserves a full %s layout when no recorded data is available',
    (key) => {
      const html = render(key, (data, agent) => {
        data.opportunities = [];
        agent.rows = [];
        agent.chart = undefined;
        agent.metrics = [];
      });
      expect(html).toContain(names[key]);
      expect(html).toMatch(
        /No (model-tier|matching|regional|architecture|matched|collaboration|pipeline)/,
      );
      expect(html).not.toContain('NaN');
      expect(html).not.toContain('100% Compliant');
      expect(html).not.toContain('$0');
    },
  );

  it('labels sample scenarios on each dedicated page', () => {
    for (const key of Object.keys(names) as AgentKey[]) {
      expect(
        render(key, (data) => {
          data.mode = 'sample';
        }),
      ).toContain('Sample scenario · illustrative data');
    }
  });

  it('presents exact supplied chart values and measurement units', () => {
    const html = render('ai');
    expect(html).toContain('Baseline (units)');
    expect(html).toContain('Candidate (units)');
    expect(html).toContain('Example tier');
    expect(html).toContain('<td>5</td><td>2</td>');
  });

  it('keeps recommendation actions scoped to the selected agent', () => {
    const html = render('waste', (data) => {
      data.opportunities.push(opportunity('ai'));
    });
    expect(html).toContain('Review fix: waste evidence-backed proposal');
    expect(html).not.toContain('ai evidence-backed proposal');
  });

  it('does not relabel finding counts as a model cost, grid, or recovery measurement', () => {
    for (const key of ['ai', 'carbon', 'dr'] as const) {
      const html = render(key, (_data, agent) => {
        agent.chart!.primaryUnit = 'findings';
      });
      expect(html).not.toContain('Example tier');
      expect(html).toMatch(/No (model-tier|time-aligned|matched)/);
    }
  });

  it('renders every supplied inventory column alongside the resource name', () => {
    const html = render('waste');
    expect(html).toContain('scope="col">Resource</th>');
    expect(html).toContain('scope="col">Region</th>');
    expect(html).toContain('scope="col">Evidence</th>');
    expect(html).toContain('Measured baseline');
  });

  it('does not offer a review button for a missing recommendation', () => {
    const html = render('waste', (data, agent) => {
      data.opportunities = [];
      agent.rows[0].opportunityId = 'not-in-supplied-data';
    });
    expect(html).toContain('No recommendation linked');
    expect(html).not.toContain('Review fix:');
  });

  it('shows IaC evidence without inventing a patch or cost saving', () => {
    const html = render('arch');
    expect(html).toContain('example-resource');
    expect(html).toContain('Observed usage');
    expect(html).toContain('12 units');
    expect(html).toContain('Cost impact not recorded');
    expect(html).not.toContain('$4,500');
    expect(html).toContain('Review refactor: arch evidence-backed proposal');
  });

  it('distinguishes a zero projected cost opportunity from missing cost', () => {
    const html = render('arch', (data) => {
      data.opportunities[0].monthlyUsd = 0;
    });
    expect(html).toContain('$0 / mo');
    expect(html).toContain('projected opportunity');
    expect(html).not.toContain('Cost impact not recorded');
  });

  it('shows supplied recovery objectives without turning them into compliance claims', () => {
    const html = render('dr');
    expect(html).toContain('RTO requirement');
    expect(html).toContain('4 hours');
    expect(html).toContain('Findings alone do not prove failover readiness');
    expect(html).not.toContain('100% Compliant');
  });

  it('provides an accessible collaboration search and clear result count', () => {
    const html = render('collab');
    expect(html).toContain('Search workspace assets');
    expect(html).toContain('type="search"');
    expect(html).toContain('1 of 1 workspace assets');
    expect(html).toContain('It does not remove recordings');
  });

  it('escapes untrusted target and recommendation content', () => {
    const html = render('arch', (data) => {
      data.opportunities[0].target = '<script>alert(1)</script>';
      data.opportunities[0].recommendation = '<img src=x onerror=alert(1)>';
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('workspace inventory filtering', () => {
  const rows = [
    {
      id: 'meeting',
      name: 'Meeting recording',
      cells: ['North', '90 days'],
      status: 'Review needed',
      facts: [{ label: 'Owner', value: 'Platform Team' }],
    },
    { id: 'archive', name: 'Transcript archive', cells: ['West', '14 days'], status: 'Retained' },
  ];
  it('matches names, cells, status, and evidence with case-insensitive queries', () => {
    expect(filterWorkspaceRows(rows, ' MEETING ')).toEqual([rows[0]]);
    expect(filterWorkspaceRows(rows, '14 DAYS')).toEqual([rows[1]]);
    expect(filterWorkspaceRows(rows, 'retained')).toEqual([rows[1]]);
    expect(filterWorkspaceRows(rows, 'platform')).toEqual([rows[0]]);
    expect(filterWorkspaceRows(rows, 'owner')).toEqual([rows[0]]);
  });
  it('returns an empty result when nothing matches without modifying input', () => {
    expect(filterWorkspaceRows(rows, 'missing')).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(filterWorkspaceRows(rows, ' ')).toBe(rows);
  });
});
