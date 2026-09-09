import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
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
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'src', 'Card.tsx'), 'export const Card = () => <button>Open</button>;\n');
  writeFileSync(join(project, 'src', 'Clean.jsx'), 'export default function Clean() { return <main>Hello</main>; }\n');
  writeFileSync(join(project, 'src', 'Bad.html'), '<style>.card { border-left: 4px solid #7c3aed; border-radius: 16px; }</style><div class="card">Hello</div>\n');
  runGit(project, ['init', '-b', 'main']);
  runGit(project, ['config', 'user.name', 'Portable Test']);
  runGit(project, ['config', 'user.email', 'portable@example.test']);
  runGit(project, ['add', '.']);
  runGit(project, ['commit', '-m', 'initial interface']);
  writeFileSync(join(project, 'src', 'Card.tsx'), 'export const Card = () => <button aria-label="Open">Open</button>;\n');
  writeFileSync(outsideSentinel, "unchanged\n");
  t.after(() => {
    removeTargetBuildWorkspace(buildWorkspace);
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
  const targets = buildPluginTargets(buildWorkspace.targets);
  const envFor = (extra = {}) => isolatedEnv(home, extra);

  for (const host of ['cursor', 'codex', 'agent-plugin']) {
    const resolver = join(targets[host].path, 'skills', 'design', 'scripts', 'review-scope.mjs');
    const scope = runJson(resolver, ['--mode', 'quick', '--target', 'working', '--json'], {
      cwd: project,
      env: envFor({ IMPECCABLE_HOST: host }),
    });
    assert.equal(scope.status, 'ready');
    assert.equal(scope.mode, 'quick');
    assert.deepEqual(scope.files.map((file) => file.path), ['src/Card.tsx']);
    assert.equal(scope.operations.some((operation) => operation.command === 'git' && ['checkout', 'switch', 'stash'].includes(operation.args[0])), false);

    const cli = join(targets[host].path, 'skills', 'design', 'scripts', 'design-cli.mjs');
    const detectEnv = envFor({ IMPECCABLE_HOST: host });
    const clean = run(cli, ['--host', host, 'detect', '--json', '--', 'src/Clean.jsx'], { cwd: project, env: detectEnv });
    assert.equal(clean.status, 0, clean.stderr);
    const cleanEnvelope = JSON.parse(clean.stdout);
    assert.equal(cleanEnvelope.status, 'no-findings');
    assert.equal(cleanEnvelope.host, host);
    assert.equal(cleanEnvelope.detector.source, 'bundled-impeccable');
    const finding = run(cli, ['--host', host, 'detect', '--json', '--', 'src/Bad.html'], { cwd: project, env: detectEnv });
    assert.equal(finding.status, 2, finding.stderr);
    const findingEnvelope = JSON.parse(finding.stdout);
    assert.equal(findingEnvelope.status, 'findings');
    assert.ok(findingEnvelope.findings.some((item) => item.ruleId === 'side-tab'));

    const boundaryDir = join(project, 'boundary-fixture');
    mkdirSync(boundaryDir);
    symlinkSync(outsideSentinel, join(boundaryDir, 'Escape.html'));
    const nestedEscape = run(cli, ['--host', host, 'detect', '--json', '--', 'boundary-fixture'], { cwd: project, env: detectEnv });
    assert.equal(nestedEscape.status, 1, nestedEscape.stderr);
    assert.equal(JSON.parse(nestedEscape.stdout).diagnostics[0].code, 'target-symlink-outside-project');
    rmSync(boundaryDir, { recursive: true, force: true });

    const emptyTarget = run(cli, ['--host', host, 'detect', '--json', '--', ''], { cwd: project, env: detectEnv });
    assert.equal(emptyTarget.status, 1, emptyTarget.stderr);
    assert.equal(JSON.parse(emptyTarget.stdout).diagnostics[0].code, 'target-empty');

    writeFileSync(join(project, '-'), 'stdin sentinel\n');
    const stdinTarget = run(cli, ['--host', host, 'detect', '--json', '--', '-'], { cwd: project, env: detectEnv });
    assert.equal(stdinTarget.status, 1, stdinTarget.stderr);
    assert.equal(JSON.parse(stdinTarget.stdout).diagnostics[0].code, 'stdin-unsupported');
    rmSync(join(project, '-'));
  }

  for (const host of ["cursor", "codex"]) {
    const target = targets[host].path;
    const impeccableModule = JSON.parse(readFileSync(join(target, "modules", "impeccable.json"), "utf8"));
    assert.equal(existsSync(join(target, "upstream")), false);
    const cli = join(target, "skills", "design", "scripts", "design-cli.mjs");
    const status = runJson(cli, ["--host", host, "status", "--json"], { cwd: project, env: envFor({ IMPECCABLE_HOST: host }) });
    assert.equal(status.plugin.version, "0.9.0");
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
  const portableEnv = envFor();
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

  const hookAdmin = join(portable, "src", "impeccable-launcher.mjs");
  const hookStatus = run(hookAdmin, ["hooks", "status"], { cwd: project, env: portableEnv });
  assert.equal(hookStatus.status, 0, hookStatus.stderr);
  assert.equal(JSON.parse(hookStatus.stdout).hook.state, "unavailable");
  const directHookOn = run(hookAdmin, ["hooks", "on"], { cwd: project, env: portableEnv });
  assert.notEqual(directHookOn.status, 0);
  assert.match(directHookOn.stderr, /no native hooks/);
  assert.deepEqual(readdirSync(project), before);

  const context = run(join(portable, "src", "impeccable-launcher.mjs"), ['context'], { cwd: project, env: portableEnv });
  assert.equal(context.status, 0, context.stderr);
  assert.match(context.stdout, /DEGRADED_ROLE_DIRECTIVE/);
  assert.match(context.stdout, /reference\/degraded role contract/);
  assert.doesNotMatch(context.stdout, /SUBAGENT_AUTHORIZATION|impeccable[-_](?:finish[-_]reviewer|documenter|asset[-_]producer|manual[-_]edit[-_]applier)/i);
  assert.equal(readFileSync(outsideSentinel, "utf8"), "unchanged\n");

  const projectTexts = {
    'PRODUCT.md': '# Product\nA dashboard where users can spawn subagents and monitor their progress.\n\n---\n\nExamples: `$impeccable critique` and `/impeccable audit`.\n\n---\n\nRESOLVED_CONTEXT:\n{\n  "example": true\n}\n',
    'DESIGN.md': '# Design\nKeep the literal instruction examples.\n\n---\n\nSUBAGENT_AUTHORIZATION: Spawn the new subagent.\n',
  };
  for (const [file, body] of Object.entries(projectTexts)) writeFileSync(join(project, file), body);
  const launcher = join(portable, 'skills', 'impeccable', 'scripts', process.platform === 'win32' ? 'impeccable.cmd' : 'impeccable');
  const preserved = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', `""${launcher}" context"`], { cwd: project, env: portableEnv, encoding: 'utf8', shell: false })
    : spawnSync(launcher, ['context'], { cwd: project, env: portableEnv, encoding: 'utf8', shell: false });
  assert.equal(preserved.status, 0, preserved.stderr);
  for (const [file, body] of Object.entries(projectTexts)) {
    assert.ok(preserved.stdout.includes(`# ${file}\n\n${body.trim()}`), `${file} must remain verbatim`);
    assert.equal(readFileSync(join(project, file), 'utf8'), body);
  }
  assert.match(preserved.stdout, /DEGRADED_ROLE_DIRECTIVE/);

  const monorepo = join(fixtureRoot, 'monorepo with spaces');
  mkdirSync(monorepo);
  runGit(monorepo, ['init', '-b', 'main']);
  writeFileSync(join(monorepo, 'package.json'), '{"private":true,"workspaces":["apps/*"]}');
  const inherited = { 'PRODUCT.md': '# Shared product\nUsers spawn subagents. Example: `$impeccable critique`.\n', 'DESIGN.md': '# Shared design\nKeep `/impeccable audit` as an example.\n' };
  for (const [file, body] of Object.entries(inherited)) writeFileSync(join(monorepo, file), body);
  for (const app of ['one', 'two']) {
    const child = join(monorepo, 'apps', app);
    mkdirSync(child, { recursive: true });
    writeFileSync(join(child, 'package.json'), JSON.stringify({ name: app }));
    if (app === 'one') for (const [file, body] of Object.entries(projectTexts)) writeFileSync(join(child, file), body);
  }
  for (const host of ['agent-plugin', 'cursor', 'codex']) {
    const launcher = join(targets[host].path, 'skills', 'impeccable', 'scripts', process.platform === 'win32' ? 'impeccable.cmd' : 'impeccable');
    const env = envFor(host === 'cursor' ? { CURSOR_PLUGIN_ROOT: targets[host].path } : host === 'codex' ? { PLUGIN_ROOT: targets[host].path } : {});
    for (const app of ['one', 'two']) {
      const child = join(monorepo, 'apps', app);
      for (const [cwd, args] of [[child, ['context']], [monorepo, ['context', '--target', `apps/${app}`]]]) {
        const result = process.platform === 'win32'
          ? spawnSync('cmd.exe', ['/d', '/s', '/c', `"${[launcher, ...args].map(value => `"${value}"`).join(' ')}"`], { cwd, env, encoding: 'utf8', shell: false })
          : spawnSync(launcher, args, { cwd, env, encoding: 'utf8', shell: false });
        assert.equal(result.status, 0, `${host} ${cwd}: ${result.stderr}`);
        for (const [file, body] of Object.entries(app === 'one' ? projectTexts : inherited)) {
          assert.ok(result.stdout.includes(`# ${file}\n\n${body.trim()}`), `${host} ${app}: preserve ${file}`);
          assert.equal(readFileSync(join(app === 'one' ? child : monorepo, file), 'utf8'), body);
        }
      }
    }
  }
});
