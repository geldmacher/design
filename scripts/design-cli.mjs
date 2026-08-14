#!/usr/bin/env node
import { runDesignCli } from '../skills/design/scripts/design-cli.mjs';

try {
  process.exitCode = runDesignCli();
} catch (error) {
  process.stderr.write(`Design CLI error: ${error.message}\n`);
  process.exitCode = 1;
}
