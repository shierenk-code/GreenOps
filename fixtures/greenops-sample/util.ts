// Sample utility used by service.ts.

export function formatPrompt(question: string): string {
  return `Q: ${question.trim()}`;
}
