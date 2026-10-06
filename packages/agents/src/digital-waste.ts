/**
 * Digital Waste Agent (cloud / AKS).
 *
 * Reads a mock cloud/AKS inventory and flags:
 *   - overprovisioned compute: pods/nodes using a fraction of requested CPU,
 *   - unattached storage: persistent volumes with no owner,
 *   - oversized images: container images far larger than needed,
 *   - verbose logging: log volume/retention far above what is useful.
 *
 * Mock fixture shape (JSON): see fixtures/greenops-mock/cloud-inventory.json.
 */

import type { SustainabilityBug } from '@greenops/detect';
import type { SpecializedAgent, SpecializedFinding } from './contract.js';
import { bugId, readJsonFixture } from './util.js';
import { isBaselineFile, loadBaselineBundle, scanDigitalWasteBaseline } from './baseline-scan.js';
import {
  discoverWaste,
  KubectlWasteReader,
  type WasteTarget,
  type WasteReader,
  type WasteInventory,
  type WasteUsage,
} from './waste-inventory.js';
import { planDigitalWaste } from './waste-planner.js';

interface Pod {
  name: string;
  requestedCpuCores: number;
  usedCpuCores: number;
  replicas: number;
}
interface Volume {
  name: string;
  gb: number;
  attached: boolean;
}
interface Image {
  name: string;
  sizeMb: number;
}
interface LogConfig {
  name: string;
  gbPerDay: number;
  retentionDays: number;
}
interface CloudFixture {
  cluster: string;
  pods: Pod[];
  volumes: Volume[];
  images: Image[];
  logs: LogConfig[];
}

export class DigitalWasteAgent implements SpecializedAgent {
  discover(target: WasteTarget, reader: WasteReader = new KubectlWasteReader(), now = new Date()) {
    return discoverWaste(target, reader, now);
  }

  plan(inventory: WasteInventory, usage: WasteUsage[] = [], now = new Date()) {
    return planDigitalWaste(inventory, usage, now);
  }
  readonly id = 'digital-waste';
  readonly name = 'Digital Waste Agent';
  readonly description =
    'Finds cloud/AKS waste: overprovisioned compute, unattached storage, bloated images, verbose logs.';

  scan(sourcePath: string): SpecializedFinding {
    if (isBaselineFile(sourcePath)) {
      const result = scanDigitalWasteBaseline(loadBaselineBundle(sourcePath));
      return { agentId: this.id, agentName: this.name, ...result };
    }
    const fx = readJsonFixture<CloudFixture>(sourcePath);
    const bugs: SustainabilityBug[] = [];

    // 1) Overprovisioned compute (used < 40% of requested).
    for (const p of fx.pods) {
      if (p.requestedCpuCores <= 0) continue;
      const util = p.usedCpuCores / p.requestedCpuCores;
      if (util < 0.4) {
        const wastedCores = (p.requestedCpuCores - p.usedCpuCores) * Math.max(1, p.replicas);
        bugs.push({
          id: bugId('overprovisioned-compute', `${fx.cluster}:${p.name}`),
          category: 'overprovisioned-compute',
          severity: util < 0.2 ? 'high' : 'medium',
          title: `Pod '${p.name}' uses ${(util * 100).toFixed(0)}% of requested CPU (${p.replicas} replicas)`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: p.name },
          rationale:
            `'${p.name}' requests ${p.requestedCpuCores} cores but uses ${p.usedCpuCores} (${(util * 100).toFixed(0)}%) ` +
            `across ${p.replicas} replicas. Review representative utilization before reducing reserved capacity. ` +
            `Unused CPU requests are not measured electricity or guaranteed billing savings.`,
          evidence: {
            requestedCpuCores: p.requestedCpuCores,
            usedCpuCores: p.usedCpuCores,
            replicas: p.replicas,
            wastedCores,
          },
          estimatedWaste: {
            metric: 'cpu.core_hours',
            perRun: wastedCores * 24,
            unit: 'idle core-hours/day',
            assumptions: [],
          },
        });
      }
    }

    // 2) Unattached storage.
    for (const v of fx.volumes) {
      if (!v.attached) {
        bugs.push({
          id: bugId('unattached-storage', `${fx.cluster}:${v.name}`),
          category: 'unattached-storage',
          severity: v.gb >= 100 ? 'high' : 'medium',
          title: `Unattached volume '${v.name}' (${v.gb} GB) still provisioned`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: v.name },
          rationale:
            `Volume '${v.name}' (${v.gb} GB) is not attached to any workload but remains provisioned, ` +
            `and is a cleanup candidate. Absence of an attachment does not prove data is unused; ` +
            `confirm ownership, backups and retention before any removal.`,
          evidence: { gb: v.gb, attached: String(v.attached) },
          estimatedWaste: {
            metric: 'storage.gb_months',
            perRun: v.gb,
            unit: 'GB-months',
            assumptions: [],
          },
        });
      }
    }

    // 3) Oversized images (> 800 MB).
    for (const img of fx.images) {
      if (img.sizeMb > 800) {
        const excess = img.sizeMb - 300; // 300MB = reasonable slim target
        bugs.push({
          id: bugId('oversized-image', `${fx.cluster}:${img.name}`),
          category: 'oversized-image',
          severity: img.sizeMb > 2000 ? 'medium' : 'low',
          title: `Image '${img.name}' is ${img.sizeMb} MB`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: img.name },
          rationale:
            `Image '${img.name}' is ${img.sizeMb} MB. Large images are stored, replicated across nodes and ` +
            `pulled repeatedly on every scale-up, multiplying storage and network energy. A slim base cuts it.`,
          evidence: { sizeMb: img.sizeMb, excessMb: excess },
          estimatedWaste: {
            metric: 'storage.gb_months',
            perRun: (excess / 1024) * Math.max(1, fx.pods.length),
            unit: 'GB-months (stored+replicated)',
            assumptions: [],
          },
        });
      }
    }

    // 4) Verbose logging (high volume x long retention).
    for (const l of fx.logs) {
      const gbMonths = l.gbPerDay * l.retentionDays;
      if (gbMonths > 50) {
        bugs.push({
          id: bugId('verbose-logging', `${fx.cluster}:${l.name}`),
          category: 'verbose-logging',
          severity: gbMonths > 300 ? 'medium' : 'low',
          title: `Log stream '${l.name}': ${l.gbPerDay} GB/day x ${l.retentionDays}d retention`,
          location: { filePath: sourcePath, startLine: 1, endLine: 1, symbol: l.name },
          rationale:
            `'${l.name}' writes ${l.gbPerDay} GB/day kept for ${l.retentionDays} days (${gbMonths.toFixed(0)} GB stored). ` +
            `Review access and retention requirements before proposing a change; audit logs may have mandatory retention.`,
          evidence: { gbPerDay: l.gbPerDay, retentionDays: l.retentionDays, gbStored: gbMonths },
          estimatedWaste: {
            metric: 'storage.gb_months',
            perRun: gbMonths,
            unit: 'GB-months',
            assumptions: [],
          },
        });
      }
    }

    return {
      agentId: this.id,
      agentName: this.name,
      scanned: {
        pods: fx.pods.length,
        volumes: fx.volumes.length,
        images: fx.images.length,
        logs: fx.logs.length,
      },
      bugs,
    };
  }
}
