import { cpus, freemem, totalmem, platform, arch, loadavg } from 'node:os';

/** OS counters only. CPU utilization is a delta, never an energy measurement. */
export function createSystemSampler() {
  let previous: { idle: number; total: number } | undefined;
  return () => {
    const processors = cpus();
    const current = processors.reduce(
      (sum, cpu) => ({
        idle: sum.idle + cpu.times.idle,
        total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0),
      }),
      { idle: 0, total: 0 },
    );
    const elapsed = previous ? current.total - previous.total : 0;
    const cpuPercent =
      previous && elapsed > 0
        ? Math.max(0, Math.min(100, 100 * (1 - (current.idle - previous.idle) / elapsed)))
        : null;
    previous = current;
    return {
      cpuPercent,
      memoryUsedBytes: totalmem() - freemem(),
      memoryTotalBytes: totalmem(),
      cpuCores: processors.length,
      platform: `${platform()} ${arch()}`,
      load1: loadavg()[0],
      processRssBytes: process.memoryUsage().rss,
    };
  };
}
