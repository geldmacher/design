#!/usr/bin/env node
import { applyCandidate } from "./lib/impeccable-vendor.mjs";

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--candidate" || !argv[1]) {
    throw new Error("Usage: npm run apply:impeccable-update -- --candidate <iu-16-hex-id>");
  }
  return { candidateId: argv[1] };
}

try {
  const { candidateId } = parseArgs(process.argv.slice(2));
  const result = applyCandidate({ candidateId });
  process.stdout.write(`${JSON.stringify({ schema: 1, state: "candidate-applied", ...result })}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
