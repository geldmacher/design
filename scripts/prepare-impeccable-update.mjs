#!/usr/bin/env node
import { prepareCandidate } from "./lib/impeccable-vendor.mjs";

function parseArgs(argv) {
  if (![2, 3].includes(argv.length) || argv[0] !== "--to" || !argv[1] || (argv.length === 3 && argv[2] !== "--from-working-tree")) {
    throw new Error("Usage: npm run prepare:impeccable-update -- --to <skill-vX.Y.Z> [--from-working-tree]");
  }
  return { tag: argv[1], fromWorkingTree: argv.length === 3 };
}

try {
  const options = parseArgs(process.argv.slice(2));
  const result = await prepareCandidate(options);
  process.stdout.write(`${JSON.stringify({ schema: 1, state: "candidate-ready", ...result })}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
