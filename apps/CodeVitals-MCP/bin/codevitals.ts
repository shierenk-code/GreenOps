#!/usr/bin/env node
import { runCLI } from '../cli/index.js';

runCLI(process.argv.slice(2)).catch((err) => {
  console.error('GreenOps CLI Error:', err);
  process.exit(2);
});
