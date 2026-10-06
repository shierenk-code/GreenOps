import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

const cliBin = path.resolve(__dirname, '../apps/cli/dist/cli.js');
const greenopsBin = path.resolve(__dirname, '../apps/cli/dist/greenops-cli.js');
const cliPackage = JSON.parse(
  readFileSync(path.resolve(__dirname, '../apps/cli/package.json'), 'utf-8'),
) as { version: string };
const fixturesDir = path.resolve(__dirname, '../fixtures');
const previousCredentialDir = process.env.GREENOPS_CREDENTIAL_DIR;
let isolatedCredentialDir: string;
beforeAll(() => {
  isolatedCredentialDir = mkdtempSync(path.join(tmpdir(), 'greenops-cli-credentials-'));
  process.env.GREENOPS_CREDENTIAL_DIR = isolatedCredentialDir;
});
afterAll(() => {
  if (previousCredentialDir === undefined) delete process.env.GREENOPS_CREDENTIAL_DIR;
  else process.env.GREENOPS_CREDENTIAL_DIR = previousCredentialDir;
  rmSync(isolatedCredentialDir, { recursive: true, force: true });
});

describe('CLI Integration', () => {
  it('resolves primary CLI scan paths from the pnpm invocation directory', () => {
    const output = execFileSync(
      process.execPath,
      [greenopsBin, 'scan', 'tiny-ts', '--format', 'json'],
      {
        encoding: 'utf-8',
        cwd: path.resolve(__dirname, '../apps/cli'),
        env: { ...process.env, INIT_CWD: fixturesDir },
      },
    );
    expect(JSON.parse(output).languages.typescript).toBeGreaterThan(0);
  });
  it('exposes GreenOps sustainability commands without a nested product prefix', () => {
    const output = execFileSync(process.execPath, [greenopsBin, '--help'], { encoding: 'utf-8' });
    expect(output).toContain('Usage: greenops');
    expect(output).toContain('GreenOps Digital Sustainability Control Plane');
    expect(output).toContain('run [options] [path]');
    expect(output).toContain('review [options] [path]');
    expect(output).toContain('code-review [options] [path]');
    expect(output).not.toContain('CodeVitals');
  });

  it('retains the full-detail review option on both CLI entry points', () => {
    for (const args of [
      [greenopsBin, 'review', '--help'],
      [cliBin, 'greenops', 'review', '--help'],
    ]) {
      const output = execFileSync(process.execPath, args, { encoding: 'utf-8' });
      expect(output).toContain('--verbose');
      expect(output).toContain('full finding detail');
    }
  });

  it('runs the primary GreenOps CLI offline and retains the legacy entry point', () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'greenops-primary-cli-'));
    try {
      const output = execFileSync(
        process.execPath,
        [
          greenopsBin,
          'run',
          path.join(fixturesDir, 'greenops-mock'),
          '--fleet',
          '--provider',
          'offline',
          '--ledger',
          path.join(outputDir, 'ledger.json'),
        ],
        // A full 34-finding fleet run in a child process; allow for a loaded test runner.
        { encoding: 'utf-8', timeout: 60000 },
      );
      expect(output).toContain('Reasoner configured: offline-rule-reasoner');
      const legacy = execFileSync(process.execPath, [cliBin, 'greenops', 'run', '--help'], {
        encoding: 'utf-8',
      });
      expect(legacy).toContain('--fleet');
      const semantic = execFileSync(process.execPath, [greenopsBin, 'code-review', '--help'], {
        encoding: 'utf-8',
      });
      expect(semantic).toContain('--diff');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, 90000);

  it('reviews source through the primary GreenOps command', () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'greenops-primary-review-'));
    try {
      const output = execFileSync(
        process.execPath,
        [
          greenopsBin,
          'review',
          path.join(fixturesDir, 'greenops-sample'),
          '--format',
          'json',
          '--ledger',
          path.join(outputDir, 'ledger.json'),
        ],
        { encoding: 'utf-8', env: { ...process.env, GREENOPS_LLM_PROVIDER: 'offline' } },
      );
      expect(JSON.parse(output).findings.length).toBeGreaterThan(0);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
  it('displays help message with --help', () => {
    const output = execSync(`node ${cliBin} --help`, { encoding: 'utf-8' });
    expect(output).toMatch(/Usage: (greenops|codevitals)/);
    expect(output).toMatch(/(GreenOps|CodeVitals)/);
  });

  it('displays version with --version', () => {
    const output = execSync(`node ${cliBin} --version`, { encoding: 'utf-8' });
    expect(output.trim()).toBe(cliPackage.version);
  });

  it('scans a repository and outputs text summary', () => {
    const target = path.join(fixturesDir, 'tiny-ts');
    const output = execSync(`node ${cliBin} scan ${target}`, { encoding: 'utf-8' });
    expect(output).toContain('GreenOps Repository Scan');
    expect(output).toContain('Repository');
    expect(output).toContain('TypeScript');
  });

  it('scans a repository and outputs valid JSON format', () => {
    const target = path.join(fixturesDir, 'mixed-project');
    const output = execSync(`node ${cliBin} scan ${target} --format json`, { encoding: 'utf-8' });
    const parsed = JSON.parse(output.trim());
    expect(parsed.repository).toBeDefined();
    expect(parsed.files).toBeDefined();
    expect(parsed.languages.typescript).toBe(1);
    expect(parsed.languages.python).toBe(1);
  });

  it('reviews Sustainability Bugs with machine-readable output', () => {
    const target = path.join(fixturesDir, 'greenops-sample');
    const outputDir = mkdtempSync(path.join(tmpdir(), 'greenops-cli-review-'));
    const ledger = path.join(outputDir, 'ledger.json');
    try {
      const output = execFileSync(
        process.execPath,
        [cliBin, 'greenops', 'review', target, '--format', 'json', '--ledger', ledger],
        { encoding: 'utf-8', env: { ...process.env, GREENOPS_LLM_PROVIDER: 'offline' } },
      );
      const review = JSON.parse(output) as {
        findings: Array<{ file: string; evidence: unknown; recommendation?: string }>;
      };
      expect(review.findings.length).toBeGreaterThan(0);
      expect(review.findings[0]?.file).toContain('service.ts');
      expect(review.findings[0]?.evidence).toBeDefined();
      expect(review.findings.some((finding) => finding.recommendation)).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('returns useful error message for invalid path', () => {
    try {
      execSync(`node ${cliBin} scan /path/to/nonexistent-xyz-123`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      expect.fail('Should have thrown an error');
    } catch (err: unknown) {
      const stderr = (err as { stderr?: Buffer }).stderr?.toString() || '';
      expect(stderr).toContain('GreenOps could not find the repository');
    }
  });

  it('honors an explicit offline provider over a configured cloud provider', () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'greenops-provider-test-'));
    const ledger = path.join(outputDir, 'ledger.json');
    try {
      const output = execFileSync(
        process.execPath,
        [
          cliBin,
          'greenops',
          'run',
          path.join(fixturesDir, 'greenops-mock'),
          '--fleet',
          '--provider',
          'offline',
          '--ledger',
          ledger,
        ],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            GREENOPS_LLM_PROVIDER: 'openai',
            OPENAI_API_KEY: 'test-unused-key',
          },
          timeout: 15000,
        },
      );
      expect(output).toContain('Reasoner configured: offline-rule-reasoner');
      const run = JSON.parse(readFileSync(ledger, 'utf-8'));
      expect(run.outcomes[0].bugsDetected).toBeGreaterThan(0);
      expect(run.outcomes[0].selfCost.tokens).toBe(0);
      expect(
        run.entries
          .filter((entry: { stage: string }) => entry.stage === 'investigate')
          .every(
            (entry: { data: { analysis: { status: string } } }) =>
              entry.data.analysis.status === 'offline',
          ),
      ).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('rejects an invalid LLM provider before making requests', () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [cliBin, 'greenops', 'run', '--provider', 'unknown-provider'],
        { encoding: 'utf-8', stdio: 'pipe' },
      ),
    ).toThrow(/provider/i);
  });

  it('returns useful error message for invalid command', () => {
    try {
      execSync(`node ${cliBin} invalidcommand`, { encoding: 'utf-8', stdio: 'pipe' });
      expect.fail('Should have thrown an error');
    } catch (err: unknown) {
      const stderr = (err as { stderr?: Buffer }).stderr?.toString() || '';
      expect(stderr).toContain("Unknown command 'invalidcommand'");
    }
  });
});
