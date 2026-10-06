// GreenOps sample workload.
// This file deliberately contains Sustainability Bugs for the demo:
//   1. A redundant/uncached AI-like call repeated in a loop (redundant-call).
//   2. Dead code: an unused helper never referenced anywhere (dead-code).
//   3. A duplicate import of the same module (duplicate-import).
//
// Generic, no client data, no branding.

import { formatPrompt } from './util.js';
// Duplicate import of the same module (duplicate-import bug):
import { formatPrompt as formatPromptAgain } from './util.js';

interface Answer {
  question: string;
  text: string;
}

// Simulates an expensive AI/API request. In a real workload this costs tokens.
function fetchCompletion(question: string): Answer {
  return { question, text: `answer to: ${question}` };
}

// Answers the same three questions for every user — the SAME completions are
// requested again and again with no cache. Every repeat is wasted tokens.
export function answerForUsers(users: string[]): Answer[] {
  const questions = ['What is your plan?', 'What is your status?', 'What is your blocker?'];
  const out: Answer[] = [];
  for (const _user of users) {
    // Redundant, uncached calls repeated per user (redundant-call bug):
    const a1 = fetchCompletion(formatPrompt(questions[0] ?? ''));
    const a2 = fetchCompletion(formatPrompt(questions[1] ?? ''));
    const a3 = fetchCompletion(formatPrompt(questions[2] ?? ''));
    const a4 = fetchCompletion(formatPrompt(questions[0] ?? ''));
    const a5 = fetchCompletion(formatPrompt(questions[1] ?? ''));
    const a6 = fetchCompletion(formatPromptAgain(questions[2] ?? ''));
    out.push(a1, a2, a3, a4, a5, a6);
  }
  return out;
}

// DEAD CODE: never referenced anywhere in the project (dead-code bug).
function computeUnusedStatistics(values: number[]): number {
  let total = 0;
  for (const v of values) {
    total += v * v;
  }
  const mean = total / Math.max(1, values.length);
  return Math.sqrt(mean);
}
