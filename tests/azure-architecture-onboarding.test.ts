import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ArchitectureAgent, validateArchitecture } from '../packages/agents/src/architecture';
import { azureFindings, readAzureCollection, subscriptionId } from '../apps/cli/src/azure-command';

const subscription = '11111111-2222-3333-4444-555555555555';
const id = `/subscriptions/${subscription}/resourceGroups/test/providers/Microsoft.Compute/virtualMachineScaleSets/test-pool`;
const row = {
  id,
  name: 'test-pool',
  location: 'eastus',
  properties: { secret: 'never-export-this' },
};
const setting = (enabled: boolean) => ({
  id: `/subscriptions/${subscription}/resourceGroups/test/providers/Microsoft.Insights/autoscalesettings/scale`,
  properties: { enabled, targetResourceUri: id },
});

describe('read-only Azure and architecture onboarding', () => {
  it('accepts explicit subscription UUIDs only', () => {
    expect(subscriptionId(subscription)).toBe(subscription);
    for (const value of ['all', '', 'a & echo bad', '../other'])
      expect(() => subscriptionId(value)).toThrow();
  });
  it('requires complete autoscale evidence and never exports raw resource profiles', () => {
    const findings = azureFindings(subscription, [row], []);
    expect(findings).toHaveLength(1);
    expect(findings[0].agentId).toBe('architecture');
    expect(findings[0].estimatedWaste.metric).toBe('configuration.review');
    expect(JSON.stringify(findings)).not.toContain('never-export-this');
    expect(azureFindings(subscription, [row], [setting(true)])).toHaveLength(0);
    expect(azureFindings(subscription, [row], [setting(false)])).toHaveLength(1);
    expect(() => azureFindings(subscription, [row], [{ properties: {} }])).toThrow();
    expect(() => azureFindings(subscription, [row, row], [])).toThrow();
    expect(() =>
      azureFindings(subscription, [{ ...row, id: '/subscriptions/other/foo' }], []),
    ).toThrow();
  });
  it('uses GET with no redirects and follows bounded same-collection pagination', async () => {
    const nextLink = `https://management.azure.com/subscriptions/${subscription}/providers/Microsoft.Compute/virtualMachineScaleSets?api-version=2024-11-01&skiptoken=next`;
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ value: [row], nextLink }))
      .mockResolvedValueOnce(Response.json({ value: [] }));
    expect(await readAzureCollection(subscription, 'scaleSets', 'test-token', request)).toEqual([
      row,
    ]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error' });
  });
  it.each([
    'https://evil.example/collect',
    `https://management.azure.com/subscriptions/${subscription}/providers/Microsoft.KeyVault/vaults`,
  ])('does not forward a token to unsafe continuation %s', async (nextLink) => {
    const request = vi.fn().mockResolvedValue(Response.json({ value: [], nextLink }));
    await expect(
      readAzureCollection(subscription, 'scaleSets', 'test-token', request),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects denied, malformed and oversize responses instead of treating them as empty inventory', async () => {
    await expect(
      readAzureCollection(
        subscription,
        'autoscale',
        'test-token',
        vi.fn().mockResolvedValue(new Response('', { status: 403 })),
      ),
    ).rejects.toThrow('403');
    await expect(
      readAzureCollection(
        subscription,
        'autoscale',
        'test-token',
        vi.fn().mockResolvedValue(Response.json({ value: {} })),
      ),
    ).rejects.toThrow();
    await expect(
      readAzureCollection(
        subscription,
        'autoscale',
        'test-token',
        vi.fn().mockResolvedValue(Response.json({ value: Array(2001).fill({}) })),
      ),
    ).rejects.toThrow();
  });
  it('validates architecture input and produces three review-only findings from the synthetic example', () => {
    const path = 'fixtures/architecture-review/architecture.json';
    const input = JSON.parse(readFileSync(path, 'utf8'));
    expect(validateArchitecture(input).resources).toHaveLength(2);
    expect(new ArchitectureAgent().scan(path).bugs.map((bug) => bug.category)).toEqual([
      'no-autoscale',
      'high-carbon-region',
      'inefficient-sizing',
    ]);
    for (const bad of [
      { autoscale: 'false' },
      { instanceCores: -1 },
      { neededCores: null },
      { gridIntensityKgPerKwh: 500 },
    ]) {
      expect(() =>
        validateArchitecture({ ...input, resources: [{ ...input.resources[0], ...bad }] }),
      ).toThrow();
    }
    expect(() =>
      validateArchitecture({ ...input, resources: [input.resources[0], input.resources[0]] }),
    ).toThrow();
  });
});
