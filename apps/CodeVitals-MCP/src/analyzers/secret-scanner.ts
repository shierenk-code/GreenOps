export class SecretScanner {
  static calculateEntropy(str: string): number {
    const frequencies: Record<string, number> = {};
    for (const char of str) {
      frequencies[char] = (frequencies[char] || 0) + 1;
    }
    let entropy = 0;
    const len = str.length;
    for (const char in frequencies) {
      const p = frequencies[char] / len;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  static isHighEntropySecret(str: string): boolean {
    if (str.length < 20) return false;
    const entropy = this.calculateEntropy(str);
    return entropy > 4.5;
  }
}
