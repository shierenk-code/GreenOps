import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ConfigLoader } from '@codevitals/config';
import type { SustainabilityBug } from '@greenops/detect';
import { recordAssessment } from './architecture-command.js';

const ARM = 'https://management.azure.com';
const paths = {
  scaleSets: ['Microsoft.Compute/virtualMachineScaleSets', '2024-11-01'],
  autoscale: ['Microsoft.Insights/autoscalesettings', '2022-10-01'],
} as const;
type Collection = keyof typeof paths;
export function subscriptionId(input: string): string {
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(input))
    throw new Error('Provide an explicit Azure subscription UUID.');
  return input.toLowerCase();
}

/** Only this fixed credential command runs. No caller-controlled shell fragments. */
async function accessToken(subscription: string): Promise<string> {
  const args = [
    'account',
    'get-access-token',
    '--resource',
    `${ARM}/`,
    '--subscription',
    subscriptionId(subscription),
    '--output',
    'json',
    '--only-show-errors',
  ];
  return new Promise((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/d', '/s', '/c', `az ${args.join(' ')}`], {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore'],
          })
        : spawn('az', args, { shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(
        new Error(
          'Azure authentication unavailable. Install Azure CLI and run az login for your test subscription. Token and error output are not logged.',
        ),
      );
    };
    const timer = setTimeout(fail, 30_000);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 128 * 1024) fail();
      else chunks.push(chunk);
    });
    child.on('error', fail);
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        fail();
        return;
      }
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (
          typeof result.accessToken !== 'string' ||
          !/^[A-Za-z0-9_.-]+$/.test(result.accessToken)
        ) {
          fail();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result.accessToken);
      } catch {
        fail();
      }
    });
  });
}

/** GET only, bounded pagination, same subscription/collection, no redirects or raw output. */
export async function readAzureCollection(
  subscription: string,
  collection: Collection,
  token: string,
  request: typeof fetch = fetch,
): Promise<unknown[]> {
  const [provider, version] = paths[collection];
  const path = `/subscriptions/${subscriptionId(subscription)}/providers/${provider}`;
  let next: string | undefined = `${ARM}${path}?api-version=${version}`;
  const rows: unknown[] = [];
  const seen = new Set<string>();
  while (next) {
    const url = new URL(next);
    if (
      url.origin !== ARM ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname.toLowerCase() !== path.toLowerCase() ||
      seen.has(url.href) ||
      seen.size >= 10
    )
      throw new Error(
        'Azure pagination was invalid or exceeded the scan limit; no assessment was saved.',
      );
    seen.add(url.href);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await request(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          `Azure read failed (${response.status}). Check Reader permissions; no assessment was saved.`,
        );
      if (!response.body) throw new Error('Azure returned an empty response.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('Azure response exceeded 4 MiB. Narrow the test subscription.');
        }
        chunks.push(value);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(body.value) || rows.length + body.value.length > 2000)
        throw new Error('Azure inventory invalid or exceeds 2,000 resources.');
      rows.push(...body.value);
      if (body.nextLink != null && typeof body.nextLink !== 'string')
        throw new Error('Invalid Azure continuation.');
      next = body.nextLink || undefined;
    } finally {
      clearTimeout(timer);
    }
  }
  return rows;
}

/** Keep only allowlisted configuration evidence, not full Azure profiles/tags/secrets. */
export function azureFindings(
  subscription: string,
  scaleSets: unknown[],
  settings: unknown[],
): SustainabilityBug[] {
  const prefix = `/subscriptions/${subscriptionId(subscription)}/`;
  const record = (value: unknown): Record<string, any> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid Azure inventory row.');
    return value as Record<string, any>;
  };
  const enabled = new Set<string>();
  for (const item of settings) {
    const row = record(item);
    const properties = record(row.properties);
    if (
      typeof row.id !== 'string' ||
      !row.id.toLowerCase().startsWith(prefix) ||
      typeof properties.targetResourceUri !== 'string' ||
      !properties.targetResourceUri.toLowerCase().startsWith(prefix) ||
      typeof properties.enabled !== 'boolean'
    )
      throw new Error('Incomplete autoscale evidence; no assessment was saved.');
    if (properties.enabled) enabled.add(properties.targetResourceUri.toLowerCase());
  }
  const ids = new Set<string>();
  const bugs: SustainabilityBug[] = [];
  for (const item of scaleSets) {
    const row = record(item);
    if (
      typeof row.id !== 'string' ||
      !row.id.toLowerCase().startsWith(prefix) ||
      !/\/providers\/Microsoft\.Compute\/virtualMachineScaleSets\/[^/]+$/i.test(row.id) ||
      typeof row.name !== 'string' ||
      !row.name ||
      row.name.length > 200 ||
      typeof row.location !== 'string' ||
      !/^[a-z0-9]+$/i.test(row.location)
    )
      throw new Error('Incomplete VM scale-set evidence; no assessment was saved.');
    if (ids.has(row.id.toLowerCase())) throw new Error('Duplicate VM scale-set evidence.');
    ids.add(row.id.toLowerCase());
    if (enabled.has(row.id.toLowerCase())) continue;
    bugs.push({
      id: `bug_no-autoscale_${createHash('sha256').update(row.id.toLowerCase()).digest('hex').slice(0, 10)}`,
      agentId: 'architecture',
      agentName: 'Architecture Agent',
      category: 'no-autoscale',
      severity: 'low',
      title: `Review scaling policy for '${row.name}'`,
      location: {
        filePath: 'azure-readonly-inventory',
        startLine: 1,
        endLine: 1,
        symbol: row.name,
      },
      rationale:
        'No enabled Azure Monitor autoscale setting was found for this VM scale set. A custom controller or fixed-capacity requirement may be intentional; confirm ownership and demand before changing capacity.',
      evidence: {
        subscriptionId: subscription,
        resourceId: row.id,
        region: row.location,
        source: 'Azure Resource Manager read-only',
        autoscale: 'No enabled Azure Monitor setting found',
        measurementStatus: 'Configuration only; utilization, energy and savings unavailable',
      },
      estimatedWaste: {
        metric: 'configuration.review',
        perRun: 0,
        unit: 'no quantified saving',
        assumptions: [],
        gaps: [
          'No utilization history or metered energy. Zero credited savings is not measured zero consumption.',
        ],
      },
    });
  }
  return bugs;
}

export function registerAzureCommands(parent: Command) {
  parent
    .command('azure')
    .description('Read-only Azure test-subscription configuration checks')
    .command('scan')
    .requiredOption('--subscription <uuid>', 'Explicit permitted test subscription')
    .option('--ledger <path>', 'Assessment ledger', './.tmp/azure-readonly-review.json')
    .action(async (options: { subscription: string; ledger: string }) => {
      const policy = ConfigLoader.load(process.env.INIT_CWD || process.cwd()).greenops!;
      if (!policy.enabled || !policy.local.enabled)
        throw new Error('Repository policy disables this assessment.');
      const subscription = subscriptionId(options.subscription);
      const token = await accessToken(subscription);
      let scaleSets: unknown[], settings: unknown[];
      try {
        scaleSets = await readAzureCollection(subscription, 'scaleSets', token);
        settings = await readAzureCollection(subscription, 'autoscale', token);
      } catch {
        throw new Error(
          'Azure inventory could not be read completely. Check Azure CLI sign-in, Reader permissions, network and scan limits. No partial assessment was saved.',
        );
      }
      const bugs = azureFindings(subscription, scaleSets, settings);
      await recordAssessment('azure-readonly-inventory', options.ledger, bugs, {
        azureScaleSets: scaleSets.length,
        autoscaleSettings: settings.length,
      });
      console.log(
        'Coverage: VM scale sets and Azure Monitor autoscale only. No utilization, billing, energy measurement or resource writes. No data sent to an LLM.',
      );
    });
}
