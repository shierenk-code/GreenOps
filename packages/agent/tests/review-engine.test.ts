import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SustainabilityReviewEngine, formatSustainabilityReview } from '../src/index.js';
import { OfflineReasoner } from '../src/offline-reasoner.js';
import { recordSustainabilityReview } from '../src/review-ledger.js';
import { SustainabilityLedger } from '@greenops/ledger';
import type { SustainabilityBug } from '@greenops/detect';

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('SustainabilityReviewEngine', () => {
  const fixture = join(process.cwd(), 'fixtures', 'greenops-sample');

  it('produces the shared evidence-rich finding model', async () => {
    const review = await new SustainabilityReviewEngine(undefined, new OfflineReasoner()).review(
      fixture,
    );

    expect(review.summary.findings).toBeGreaterThan(0);
    expect(review.findings[0]).toMatchObject({
      confidence: expect.stringMatching(/high|medium|low/),
      evidence: expect.any(Object),
      rootCause: expect.any(String),
      fix: expect.objectContaining({ available: expect.any(Boolean) }),
      verification: 'not_run',
    });
    expect(review.summary.estimatedEnergyKwh).toBeGreaterThanOrEqual(0);
  });

  it('uses the same findings for text, JSON, and Markdown output', async () => {
    const review = await new SustainabilityReviewEngine(undefined, new OfflineReasoner()).review(
      fixture,
    );
    const json = JSON.parse(formatSustainabilityReview(review, 'json')) as typeof review;

    expect(json.findings).toEqual(review.findings);
    expect(formatSustainabilityReview(review, 'text')).toContain('GreenOps Sustainability Review');
    expect(formatSustainabilityReview(review, 'markdown')).toContain(
      '<!-- greenops-sustainability-review -->',
    );
  });

  it('limits diff reviews to changed files', async () => {
    const full = await new SustainabilityReviewEngine(undefined, new OfflineReasoner()).review(
      fixture,
    );
    const file = full.findings[0]?.file;
    expect(file).toBeDefined();

    const review = await new SustainabilityReviewEngine(undefined, new OfflineReasoner()).review(
      fixture,
      {
        changedFiles: file ? [file] : [],
      },
    );
    expect(review.mode).toBe('diff');
    expect(review.findings.every((finding) => finding.file === file)).toBe(true);
  });

  it('preserves per-finding provenance and code suggestions through review and ledger serialization', async () => {
    const root = mkdtempSync(join(tmpdir(), 'greenops-review-provenance-'));
    temporaryDirectories.push(root);
    const ledgerPath = join(root, 'ledger.json');
    const offline = new OfflineReasoner();
    const analysis = {
      provider: 'gemini',
      model: 'gemini-test',
      status: 'generated',
      tokensUsed: 31,
    } as const;
    const investigate = vi.fn(async (bug: SustainabilityBug, snippet?: string) => {
      expect(snippet).toContain(' | ');
      return {
        ...(await offline.investigate(bug)),
        reasoning: 'A model explanation tied to this finding.',
        tokensUsed: 31,
        analysis,
        suggestedCode: '// Suggested replacement',
      };
    });
    const review = await new SustainabilityReviewEngine(undefined, {
      name: 'mock-gemini',
      investigate,
    }).review(fixture);
    const finding = review.findings[0]!;
    expect(finding).toMatchObject({
      analysis,
      tokensUsed: 31,
      reasoning: 'A model explanation tied to this finding.',
      codeSnippet: expect.stringContaining(' | '),
      suggestedCode: '// Suggested replacement',
    });
    expect(JSON.parse(formatSustainabilityReview(review, 'json')).findings[0]).toMatchObject({
      analysis,
    });

    recordSustainabilityReview(review, ledgerPath, { source: 'local' });
    recordSustainabilityReview(review, ledgerPath, { source: 'local' });
    const ledger = new SustainabilityLedger(ledgerPath);
    const entries = ledger.allEntries().filter((entry) => entry.bugId === finding.id);
    expect(entries).toHaveLength(5);
    expect(entries.find((entry) => entry.stage === 'detect')?.data.codeSnippet).toBe(
      finding.codeSnippet,
    );
    expect(entries.find((entry) => entry.stage === 'investigate')?.data).toMatchObject({
      analysis,
      tokensUsed: 31,
    });
    expect(entries.find((entry) => entry.stage === 'compare')?.data).toMatchObject({
      reasoning: finding.reasoning,
      suggestedCode: finding.suggestedCode,
    });
    expect(ledger.allOutcomes()).toHaveLength(0);
  });
});
