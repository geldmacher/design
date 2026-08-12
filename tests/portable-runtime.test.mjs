import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  buildPluginTargets,
  createTargetBuildWorkspace,
  removeTargetBuildWorkspace,
} from "../scripts/build-plugin-targets.mjs";

function isolatedEnv(home, extra = {}) {
  const env = {
    ...process.env,
    HOME: home,
    CODEX_HOME: join(home, "codex-home"),
    LOCAL_PLUGIN_HOME: join(home, "local-plugin-home"),
    XDG_CONFIG_HOME: join(home, "xdg", "config"),
    XDG_CACHE_HOME: join(home, "xdg", "cache"),
    XDG_DATA_HOME: join(home, "xdg", "data"),
    XDG_STATE_HOME: join(home, "xdg", "state"),
    IMPECCABLE_UPDATE_CACHE: join(home, "impeccable", "update-check.json"),
    IMPECCABLE_NO_UPDATE_CHECK: "1",
    ...extra,
  };
  delete env.IMPECCABLE_HOST;
  delete env.CURSOR_PLUGIN_ROOT;
  delete env.PLUGIN_ROOT;
  if (Object.hasOwn(extra, "IMPECCABLE_HOST")) env.IMPECCABLE_HOST = extra.IMPECCABLE_HOST;
  if (Object.hasOwn(extra, "CURSOR_PLUGIN_ROOT")) env.CURSOR_PLUGIN_ROOT = extra.CURSOR_PLUGIN_ROOT;
  if (Object.hasOwn(extra, "PLUGIN_ROOT")) env.PLUGIN_ROOT = extra.PLUGIN_ROOT;
  return env;
}

function run(script, args, options = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd,
    env: options.env,
    input: options.input,
    encoding: "utf8",
  });
  return result;
}

function runJson(script, args, options = {}) {
  const result = run(script, args, options);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("built targets run self-contained lifecycle and hook simulations", (t) => {
  const buildWorkspace = createTargetBuildWorkspace();
  const fixtureRoot = mkdtempSync(join(tmpdir(), "design-portable-runtime-"));
  const project = join(fixtureRoot, "project");
  const home = join(fixtureRoot, "home");
  const outsideSentinel = join(fixtureRoot, "outside-project-sentinel.txt");
  mkdirSync(project, { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(outsideSentinel, "unchanged\n");
  t.after(() => {
    removeTargetBuildWorkspace(buildWorkspace);
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
  const targets = buildPluginTargets(buildWorkspace.targets);
  const envFor = (extra = {}) => isolatedEnv(home, extra);

  for (const host of ["cursor", "codex"]) {
    const target = targets[host].path;
    const impeccableModule = JSON.parse(readFileSync(join(target, "modules", "impeccable.json"), "utf8"));
    assert.equal(existsSync(join(target, "upstream")), false);
    const cli = join(target, "skills", "design", "scripts", "design-cli.mjs");
    const status = runJson(cli, ["--host", host, "status", "--json"], { cwd: project, env: envFor({ IMPECCABLE_HOST: host }) });
    assert.equal(status.plugin.version, "0.3.0");
    assert.equal(status.upstream.archiveSha256, impeccableModule.source.archiveSha256);
    assert.equal(status.hook.mode, host === "cursor" ? "pre-write" : "post-write-stop");
    const preview = runJson(cli, ["--host", host, "setup", "--json"], { cwd: project, env: envFor({ IMPECCABLE_HOST: host }) });
    assert.equal(preview.applied, false);
    const doctor = runJson(cli, ["--host", host, "doctor", "--json"], { cwd: project, env: envFor({ IMPECCABLE_HOST: host }) });
    assert.equal(doctor.upstream.skillVersion, impeccableModule.version);
  }

  const cursorHook = run(
    join(targets.cursor.path, "hooks", "impeccable-plugin-hook.mjs"),
    [],
    {
      cwd: project,
      env: envFor({ IMPECCABLE_HOST: "cursor", CURSOR_PLUGIN_ROOT: targets.cursor.path }),
      input: JSON.stringify({ hook_event_name: "preToolUse", cwd: project }),
    },
  );
  assert.equal(cursorHook.status, 0, cursorHook.stderr);
  assert.equal(JSON.parse(cursorHook.stdout).permission, "allow");

  const codexHook = run(
    join(targets.codex.path, "hooks", "impeccable-codex-hook.mjs"),
    [],
    {
      cwd: project,
      env: envFor({ IMPECCABLE_HOST: "codex", PLUGIN_ROOT: targets.codex.path }),
      input: JSON.stringify({ hook_event_name: "PostToolUse", cwd: project, tool_name: "Write", tool_input: {} }),
    },
  );
  assert.equal(codexHook.status, 0, codexHook.stderr);
  assert.equal(codexHook.stdout, "");

  const portable = targets["agent-plugin"].path;
  const cli = join(portable, "skills", "design", "scripts", "design-cli.mjs");
  const before = readdirSync(project);
  const portableEnv = envFor({ IMPECCABLE_HOST: "agent-plugin" });
  const status = runJson(cli, ["--host", "agent-plugin", "status", "--json"], { cwd: project, env: portableEnv });
  assert.deepEqual(status.hook, { state: "unavailable", enabled: false, explicit: false, path: null, mode: "none" });
  const preview = runJson(cli, ["--host", "agent-plugin", "setup", "--json"], { cwd: project, env: portableEnv });
  assert.deepEqual(preview.plan.writes, []);
  assert.match(preview.plan.offers[0], /Offer the loaded impeccable skill's init/);
  assert.doesNotMatch(preview.plan.offers.join("\n"), /\bimpeccable\s+(?:init|document)\b/);
  const applied = runJson(cli, ["--host", "agent-plugin", "setup", "--apply", "--json"], { cwd: project, env: portableEnv });
  assert.equal(applied.applied, true);
  assert.deepEqual(applied.written, []);
  assert.deepEqual(readdirSync(project), before);
  const hook = run(cli, ["--host", "agent-plugin", "hook", "on", "--json"], { cwd: project, env: portableEnv });
  assert.notEqual(hook.status, 0);
  assert.match(hook.stderr, /Hook management is unavailable/);

  const hookAdmin = join(portable, "skills", "impeccable", "scripts", "hook-admin.mjs");
  const hookStatus = run(hookAdmin, ["status"], { cwd: project, env: portableEnv });
  assert.equal(hookStatus.status, 0, hookStatus.stderr);
  assert.match(hookStatus.stdout, /Hook management is unavailable/);
  const directHookOn = run(hookAdmin, ["on"], { cwd: project, env: portableEnv });
  assert.notEqual(directHookOn.status, 0);
  assert.match(directHookOn.stderr, /Hook management is unavailable/);
  assert.deepEqual(readdirSync(project), before);

  const providerUrl = pathToFileURL(resolve(portable, "skills", "impeccable", "scripts", "lib", "provider.mjs")).href;
  const provider = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", `const provider = await import(${JSON.stringify(providerUrl)}); process.stdout.write(JSON.stringify({ id: provider.IMPECCABLE_PROVIDER_ID, command: provider.IMPECCABLE_COMMAND }));`],
    { cwd: project, env: portableEnv, encoding: "utf8" },
  );
  assert.equal(provider.status, 0, provider.stderr);
  assert.deepEqual(JSON.parse(provider.stdout), { id: "agent-plugin", command: "operation:" });

  const context = run(join(portable, "skills", "impeccable", "scripts", "context.mjs"), [], { cwd: project, env: portableEnv });
  assert.equal(context.status, 0, context.stderr);
  assert.match(context.stdout, /DEGRADED_ROLE_DIRECTIVE/);
  assert.match(context.stdout, /reference\/degraded role file/);
  assert.match(context.stdout, /`operation: init`/);
  assert.doesNotMatch(context.stdout, /Impeccable-operation:|operation:impeccable/);
  assert.doesNotMatch(context.stdout, /SUBAGENT_AUTHORIZATION|impeccable[-_](?:finish[-_]reviewer|documenter|asset[-_]producer|manual[-_]edit[-_]applier)/i);

  const instructionsUrl = pathToFileURL(resolve(portable, "skills", "impeccable", "scripts", "live", "instructions.mjs")).href;
  const liveInstruction = spawnSync(process.execPath, [
    "--input-type=module",
    "--eval",
    `const live = await import(${JSON.stringify(instructionsUrl)}); process.stdout.write(live.instructionsForEvent({ type: "manual_edit_apply", id: "event-1", batch: { entries: [] } }, { scriptsPath: "/fixture/scripts" }));`,
  ], { cwd: project, env: portableEnv, encoding: "utf8" });
  assert.equal(liveInstruction.status, 0, liveInstruction.stderr);
  assert.match(liveInstruction.stdout, /reference\/degraded\/manual-edit-applier\.md/);
  assert.doesNotMatch(liveInstruction.stdout, /impeccable[-_]manual[-_]edit[-_]applier|subagent/i);
  assert.equal(readFileSync(outsideSentinel, "utf8"), "unchanged\n");
});
