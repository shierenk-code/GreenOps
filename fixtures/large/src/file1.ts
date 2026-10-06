export function computeMetric(a: number, b: number): number {
  return a + b;
}

export class MetricCalculator {
  calculate(values: number[]): number {
    return values.reduce((sum, v) => computeMetric(sum, v), 0);
  }
}
