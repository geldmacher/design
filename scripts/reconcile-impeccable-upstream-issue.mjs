#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { reconcileUpdateIssue } from "./lib/impeccable-maintenance.mjs";

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--result" || !argv[1]) {
    throw new Error("Usage: node scripts/reconcile-impeccable-upstream-issue.mjs --result <upstream-check.json>");
  }
  return { resultPath: path.resolve(argv[1]) };
}

try {
  const { resultPath } = parseArgs(process.argv.slice(2));
  const result = JSON.parse(readFileSync(resultPath, "utf8"));
  if (result.schema !== 1 || result.tool !== "impeccable-upstream-check") throw new Error("Upstream result schema is invalid.");
  const outcome = await reconcileUpdateIssue({ result });
  process.stdout.write(`${JSON.stringify({ schema: 1, ...outcome })}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
