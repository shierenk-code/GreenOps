import type { GridCarbonProvider } from './carbon-grid.js';
import type { CarbonKubeApi } from './carbon-kubernetes.js';
import type { WasteReader } from './waste-inventory.js';

export interface OperationalObserver {
  tool<T>(name: string, call: () => Promise<T>): Promise<T>;
}
export function observeGrid(
  provider: GridCarbonProvider,
  observer: OperationalObserver,
): GridCarbonProvider {
  return {
    forecast: (id, now) => observer.tool('grid.forecast', () => provider.forecast(id, now)),
  };
}
export function observeWaste(reader: WasteReader, observer: OperationalObserver): WasteReader {
  return {
    list: (target, resource) =>
      observer.tool(`kubernetes.list.${resource}`, () => reader.list(target, resource)),
  };
}
export function observeCarbonApi(api: CarbonKubeApi, observer: OperationalObserver): CarbonKubeApi {
  return {
    mode: api.mode,
    getJob: (r, n) => observer.tool('kubernetes.get-job', () => api.getJob(r, n)),
    podCount: (r, uid) => observer.tool('kubernetes.count-pods', () => api.podCount(r, uid)),
    regionAvailable: (r) =>
      observer.tool('kubernetes.region-availability', () => api.regionAvailable(r)),
    dryRun: (r, j) => observer.tool('kubernetes.dry-run', () => api.dryRun(r, j)),
    claim: (r, j, id) => observer.tool('kubernetes.claim', () => api.claim(r, j, id)),
    create: (r, j) => observer.tool('kubernetes.create-job', () => api.create(r, j)),
    resume: (r, j) => observer.tool('kubernetes.resume-job', () => api.resume(r, j)),
  };
}
