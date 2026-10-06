import { SecretScanner } from "../../../src/analyzers/secret-scanner.js";

describe("SecretScanner", () => {
  it("calculates Shannon entropy correctly", () => {
    const lowEntropy = "aaaaaaaaaaaaaaaaaaaa";
    const highEntropy = "R3q87uX!vN#92$zB0pL@";

    expect(SecretScanner.calculateEntropy(lowEntropy)).toBe(0);
    expect(SecretScanner.calculateEntropy(highEntropy)).toBeGreaterThan(4.0);
  });

  it("detects high-entropy secret strings", () => {
    const secret = "R3q87uX!vN#92$zB0pL@mK9wQ4tY7sP";
    const normalCode = "const message = 'Hello World';";

    expect(SecretScanner.isHighEntropySecret(secret)).toBe(true);
    expect(SecretScanner.isHighEntropySecret(normalCode)).toBe(false);
  });
});
