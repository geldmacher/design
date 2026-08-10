// Geldmacher Design resolves one explicit dual-target provider at runtime.
export function resolveImpeccableProvider(env = process.env) {
  const explicit = String(env.IMPECCABLE_HOST || "").trim().toLowerCase();
  if (explicit && explicit !== "cursor" && explicit !== "codex") {
    throw new Error(`Unsupported IMPECCABLE_HOST: ${explicit}. Expected cursor or codex.`);
  }
  if (explicit) return explicit;
  if (env.CURSOR_PLUGIN_ROOT) return "cursor";
  if (env.PLUGIN_ROOT) return "codex";
  throw new Error("Impeccable host is unknown. Set IMPECCABLE_HOST to cursor or codex.");
}

export const IMPECCABLE_PROVIDER_ID = resolveImpeccableProvider();
export const IMPECCABLE_COMMAND_PREFIX = IMPECCABLE_PROVIDER_ID === "cursor" ? "/" : "$";
export const IMPECCABLE_COMMAND = `${IMPECCABLE_COMMAND_PREFIX}impeccable`;
