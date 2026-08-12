#!/usr/bin/env node
import path from "node:path";
import { syncPinned } from "./lib/impeccable-vendor.mjs";

function parseArgs(argv) {
  const out = { apply: false, replace: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--replace") out.replace = true;
    else if (arg === "--source") out.source = argv[++index];
    else if (arg === "--archive") out.archive = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.source || !out.archive) {
    throw new Error("Usage: npm run sync:impeccable -- --source <tag-checkout> --archive <universal.zip> [--apply] [--replace]");
  }
  if (out.replace && !out.apply) throw new Error("--replace requires --apply.");
  return out;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = syncPinned({
    source: path.resolve(args.source),
    archive: path.resolve(args.archive),
    apply: args.apply,
    replace: args.replace,
  });
  if (result.mode === "verified") {
    process.stdout.write(`Verified ${result.pin.tag}: ${result.files} vendored files, ${result.transformed} transformed files. No repository files were changed.\n`);
  } else {
    process.stdout.write(`Imported ${result.pin.tag}: ${result.files} vendored files, ${result.transformed} transformed files.\n`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
