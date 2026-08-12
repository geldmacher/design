#!/usr/bin/env node
import { prepareCandidate } from "./lib/impeccable-vendor.mjs";

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--to" || !argv[1]) {
    throw new Error("Usage: npm run prepare:impeccable-update -- --to <skill-vX.Y.Z>");
  }
  return { tag: argv[1] };
}

try {
  const { tag } = parseArgs(process.argv.slice(2));
  const result = await prepareCandidate({ tag });
  process.stdout.write(`${JSON.stringify({ schema: 1, state: "candidate-ready", ...result })}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
