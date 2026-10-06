import { add } from '../src/math';

describe('math', () => {
  it('adds two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});
