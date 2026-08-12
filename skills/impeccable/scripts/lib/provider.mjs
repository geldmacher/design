import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

function isAgentPluginPackage() {
  const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  const manifestPath = path.join(pluginRoot, "plugin.json");
  if (!fs.existsSync(manifestPath)) return false;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8")).$schema === AGENT_PLUGIN_SCHEMA;
  } catch {
    return false;
  }
}

// Geldmacher Design resolves one explicit multi-target provider at runtime.
export function resolveImpeccableProvider(env = process.env) {
  const explicit = String(env.IMPECCABLE_HOST || "").trim().toLowerCase();
  if (explicit && !["agent-plugin", "cursor", "codex"].includes(explicit)) {
    throw new Error(`Unsupported IMPECCABLE_HOST: ${explicit}. Expected agent-plugin, cursor, or codex.`);
  }
  if (explicit) return explicit;
  if (env.CURSOR_PLUGIN_ROOT) return "cursor";
  if (env.PLUGIN_ROOT) return "codex";
  if (isAgentPluginPackage()) return "agent-plugin";
  throw new Error("Impeccable host is unknown. Set IMPECCABLE_HOST to agent-plugin, cursor, or codex.");
}

export const IMPECCABLE_PROVIDER_ID = resolveImpeccableProvider();
export const IMPECCABLE_COMMAND_PREFIX = IMPECCABLE_PROVIDER_ID === "cursor"
  ? "/"
  : IMPECCABLE_PROVIDER_ID === "codex"
    ? "$"
    : "";
export const IMPECCABLE_COMMAND = `${IMPECCABLE_COMMAND_PREFIX}impeccable`;
