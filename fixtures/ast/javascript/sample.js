import { helper } from './helper.js';

class Calculator {
  add(a, b) {
    return helper(a, b);
  }
}

export function compute(x, y) {
  const calc = new Calculator();
  return calc.add(x, y);
}
