#!/usr/bin/env node
import { checkUpstream } from "./lib/impeccable-maintenance.mjs";

function parseArgs(argv) {
  const options = { json: false };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const result = await checkUpstream();
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (result.state === "current") {
    process.stdout.write(`Impeccable ${result.current.tag} is current.\n`);
  } else if (result.state === "update-available") {
    process.stdout.write(`Impeccable update available: ${result.current.tag} -> ${result.latest.tag}.\n`);
  } else {
    process.stderr.write(`Impeccable upstream is unverifiable (${result.error.code}): ${result.error.message}\n`);
  }
  if (result.state === "unverifiable") process.exitCode = 2;
} catch (error) {
  const result = {
    schema: 1,
    tool: "impeccable-upstream-check",
    checkedAt: new Date().toISOString(),
    state: "unverifiable",
    current: null,
    latest: null,
    error: { code: "local-validation-failed", message: String(error.message || error) },
  };
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(result)}\n`);
  else process.stderr.write(`Impeccable upstream is unverifiable (${result.error.code}): ${result.error.message}\n`);
  process.exitCode = 2;
}
