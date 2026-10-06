import { MetricCalculator } from './file1';

export class ServiceHandler {
  private calc = new MetricCalculator();

  process(items: number[]): number {
    return this.calc.calculate(items);
  }
}
