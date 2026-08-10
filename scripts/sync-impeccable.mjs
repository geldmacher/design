#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const overlayRoot = path.join(pluginRoot, 'overlays', 'skills', 'impeccable');
const PIN = Object.freeze({
  tag: 'skill-v4.0.4',
  tagObject: 'fb0942f57736841580a65088637f94da4a4ba87c',
  commit: '9a949fb543d44cfb406f61bcab99d95d7f12cf1d',
  repository: 'https://github.com/pbakaus/impeccable',
  archiveUrl: 'https://github.com/pbakaus/impeccable/releases/download/skill-v4.0.4/universal.zip',
  archiveSha256: 'bc190f6e1b31c2578013546768903c0babf1af5a6d397c4131f2f2c7c298e770',
});

function parseArgs(argv) {
  const out = { apply: false, replace: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--replace') out.replace = true;
    else if (arg === '--source') out.source = argv[++index];
    else if (arg === '--archive') out.archive = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.source || !out.archive) throw new Error('Usage: npm run sync:impeccable -- --source <tag-checkout> --archive <universal.zip> [--apply] [--replace]');
  return out;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function git(source, args) {
  return execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
}

function walkFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files.sort();
}

function mustReplace(text, search, replacement, label) {
  if (!text.includes(search)) throw new Error(`Upstream structure drift: missing patch anchor ${label}`);
  return text.replace(search, replacement);
}

function replaceSection(text, start, end, replacement, label) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Upstream structure drift: missing section ${label}`);
  return `${text.slice(0, startIndex)}${replacement}${text.slice(endIndex)}`;
}

function portableMarkdown(text) {
  return text
    .replace(/node \.cursor\/skills\/impeccable\/([A-Za-z0-9_./-]+\.(?:mjs|js|json))/g, 'node "<IMPECCABLE_SKILL_ROOT>/$1"')
    .replace(/\.cursor\/skills\/impeccable/g, '<IMPECCABLE_SKILL_ROOT>');
}

function transformSkillFile(relative, original) {
  let text = original;
  const operations = [];
  if (relative.endsWith('.md')) {
    if (relative === 'SKILL.md') {
      text = mustReplace(
        text,
        'This skill gives you the tools and permission to create design',
        [
          '## Geldmacher Design host contract',
          '',
          'This bundled skill targets Cursor and Codex. Cursor invokes it as `/impeccable`; Codex invokes it as `$impeccable`. Before running any command, replace `<IMPECCABLE_SKILL_ROOT>` with the absolute directory containing this `SKILL.md`; never execute an unresolved placeholder. Runtime scripts derive the host from `IMPECCABLE_HOST`, then `CURSOR_PLUGIN_ROOT`, and otherwise use Codex semantics.',
          '',
          'Cursor resolves the four bundled files under `../../agents/` as native agents. On Codex, read the matching canonical role prompt and spawn a fresh generic subagent with no forked conversation history and no model override: [asset producer](../../agents/impeccable-asset-producer.md), [documenter](../../agents/impeccable-documenter.md), [finish reviewer](../../agents/impeccable-finish-reviewer.md), or [manual edit applier](../../agents/impeccable-manual-edit-applier.md). Pass only the role input contract and task evidence. If the host exposes no subagent capability, use the corresponding `reference/degraded/` fallback and disclose the degradation.',
          '',
          'This skill gives you the tools and permission to create design',
        ].join('\n'),
        'SKILL dual-host contract',
      );
      operations.push('dual-host-provider-routing', 'codex-generic-subagent-contract');
      text = replaceSection(
        text,
        '**Pin / Unpin:**',
        '**Hooks:**',
        '**Pin / Unpin:** Standalone shortcut installation is disabled in Geldmacher Design. Use the host-native Design or Impeccable skill invocation; update the vendored skill only through the plugin maintainer sync.\n\n',
        'SKILL Pin / Unpin',
      );
      operations.push('redirect-standalone-installer');
    }
    if (relative === 'reference/hooks.md') {
      text = mustReplace(
        text,
        '# /impeccable hooks\n',
        '# /impeccable hooks\n\n> Geldmacher Design integration: Cursor and Codex use plugin-registered host adapters. This command changes only `.impeccable/` config and never installs or edits a project-local hook manifest.\n',
        'hooks integration banner',
      );
      text = text.replace(
        'record local hook consent as accepted, and install/repair provider hook manifests when the skill is installed.',
        'record local hook consent as accepted, and use the already registered Geldmacher Design host adapter without writing provider hook manifests.',
      );
      text = text.replace(
        /- The hook is bundled with the Impeccable skill and installed through project-local manifests:[^\n]*\n/,
        '- In Geldmacher Design, the detector is bundled with the Impeccable skill and invoked through the active host adapter. Project-local hook manifests are diagnostics-only conflicts and are never installed, repaired, or removed.\n',
      );
      operations.push('replace-project-hook-installation-with-plugin-hook');
    }
    const updateRedirected = text.replaceAll('npx impeccable update', 'the Design doctor command');
    if (updateRedirected !== text) operations.push('disable-runtime-self-update');
    text = updateRedirected;
    const portable = portableMarkdown(text);
    if (portable !== text) operations.push('portable-dual-host-script-paths');
    text = portable;
  }

  if (relative === 'scripts/hook-admin.mjs') {
    text = text.replaceAll('.cursor/skills/impeccable', '<IMPECCABLE_SKILL_ROOT>');
    text = mustReplace(text, "const STATUS_MESSAGE = 'Checking UI changes';", "const STATUS_MESSAGE = 'Checking UI changes';\nconst PLUGIN_MANAGED_HOOK = true;", 'hook admin plugin constant');
    text = mustReplace(
      text,
      '  const cfg = readConfig(cwd);\n  const envKill = process.env.IMPECCABLE_HOOK_DISABLED;',
      "  const cfg = readConfig(cwd);\n  const explicitEnabled = hookSection(local.raw)?.enabled ?? hookSection(shared.raw)?.enabled ?? false;\n  const envKill = process.env.IMPECCABLE_HOOK_DISABLED;",
      'hook admin strict status',
    );
    text = mustReplace(text, "`  state:        ${cfg.enabled ? 'enabled' : 'disabled'}`", "`  state:        ${explicitEnabled ? 'enabled' : 'disabled'}`", 'hook admin state line');
    text = mustReplace(
      text,
      '  const repaired = repairHookManifests(cwd);',
      "  const repaired = PLUGIN_MANAGED_HOOK\n    ? { written: [], already: ['geldmacher-design plugin'], backups: [] }\n    : repairHookManifests(cwd);",
      'hook admin manifest bypass',
    );
    operations.push('replace-project-hook-installation-with-plugin-hook');
  }

  if (relative === 'scripts/context.mjs') {
    text = mustReplace(text, 'const FETCH_TIMEOUT_MS = 1200;', 'const FETCH_TIMEOUT_MS = 1200;\nconst PLUGIN_MANAGED_UPDATES = true;\nconst PLUGIN_MANAGED_HOOK = true;', 'context plugin guards');
    text = text.replaceAll('npx impeccable update', 'the Design doctor command');
    text = mustReplace(
      text,
      'async function computeUpdateDirective(now = Date.now()) {\n  try {',
      'async function computeUpdateDirective(now = Date.now()) {\n  try {\n    if (PLUGIN_MANAGED_UPDATES) return null;',
      'context update short circuit',
    );
    text = mustReplace(
      text,
      '  let enabled = true;\n  for (const name of',
      '  let enabled = PLUGIN_MANAGED_HOOK ? false : true;\n  for (const name of',
      'strict plugin hook default',
    );
    text = mustReplace(
      text,
      "  if (!hookEnabledAt(activeRoot)) return 'none';\n  const manifests = HOOK_MANIFESTS_BY_PROVIDER[IMPECCABLE_PROVIDER_ID] || [];",
      "  if (!hookEnabledAt(activeRoot)) return 'none';\n  if (PLUGIN_MANAGED_HOOK) return STOP_REVIEW_PROVIDERS.has(IMPECCABLE_PROVIDER_ID) ? 'stop' : 'per-edit';\n  const manifests = HOOK_MANIFESTS_BY_PROVIDER[IMPECCABLE_PROVIDER_ID] || [];",
      'plugin managed automatic hook mode',
    );
    operations.push('disable-runtime-self-update', 'recognize-plugin-hook');
  }

  if (relative === 'scripts/lib/provider.mjs') {
    text = [
      '// Geldmacher Design resolves one explicit dual-target provider at runtime.',
      'export function resolveImpeccableProvider(env = process.env) {',
      '  const explicit = String(env.IMPECCABLE_HOST || "").trim().toLowerCase();',
      '  if (explicit && explicit !== "cursor" && explicit !== "codex") {',
      '    throw new Error(`Unsupported IMPECCABLE_HOST: ${explicit}. Expected cursor or codex.`);',
      '  }',
      '  if (explicit) return explicit;',
      '  if (env.CURSOR_PLUGIN_ROOT) return "cursor";',
      '  if (env.PLUGIN_ROOT) return "codex";',
      '  throw new Error("Impeccable host is unknown. Set IMPECCABLE_HOST to cursor or codex.");',
      '}',
      '',
      'export const IMPECCABLE_PROVIDER_ID = resolveImpeccableProvider();',
      'export const IMPECCABLE_COMMAND_PREFIX = IMPECCABLE_PROVIDER_ID === "cursor" ? "/" : "$";',
      'export const IMPECCABLE_COMMAND = `${IMPECCABLE_COMMAND_PREFIX}impeccable`;',
      '',
    ].join('\n');
    operations.push('dual-host-provider-routing');
  }

  if (relative === 'scripts/lib/staleness-deep.mjs') {
    text = mustReplace(
      text,
      'export function checkHookInstallation({ projectRoot, repoRoot, providerId }) {\n  const findings = [];',
      "export function checkHookInstallation({ projectRoot, repoRoot, providerId }) {\n  const findings = [];\n  if (['cursor', 'codex'].includes(providerId)) return findings;",
      'doctor plugin hook recognition',
    );
    operations.push('recognize-plugin-hook');
  }

  if (relative === 'scripts/pin.mjs') {
    text = `#!/usr/bin/env node\n/** Geldmacher Design owns skill packaging; project-local shortcut installation is intentionally disabled. */\nprocess.stdout.write('Geldmacher Design bundles Impeccable. Standalone shortcut installation is disabled; use the host-native Design or Impeccable invocation. Maintainers update the bundle through npm run sync:impeccable.\\n');\n`;
    operations.push('redirect-standalone-installer');
  }
  return { text, operations };
}

function transformAgentFile(original) {
  const text = portableMarkdown(original);
  return {
    text,
    operations: text === original ? [] : ['portable-dual-host-script-paths'],
  };
}

function normalizePatch(raw) {
  return raw
    .replaceAll('a/original-agents/', 'a/agents/')
    .replaceAll('b/transformed-agents/', 'b/agents/')
    .replaceAll('a/original-agents', 'a/agents')
    .replaceAll('b/transformed-agents', 'b/agents')
    .replaceAll('a/original/', 'a/skills/impeccable/')
    .replaceAll('b/transformed/', 'b/skills/impeccable/')
    .replaceAll('a/original', 'a/skills/impeccable')
    .replaceAll('b/transformed', 'b/skills/impeccable');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = path.resolve(args.source);
  const archive = path.resolve(args.archive);
  assertEqual(git(source, ['rev-parse', PIN.tag]), PIN.tagObject, 'tag object');
  assertEqual(git(source, ['rev-parse', 'HEAD']), PIN.commit, 'commit');
  assertEqual(sha256File(archive), PIN.archiveSha256, 'release archive SHA-256');

  const sourceSkill = path.join(source, '.cursor', 'skills', 'impeccable');
  const sourceAgents = path.join(source, '.cursor', 'agents');
  if (!fs.existsSync(sourceSkill) || !fs.existsSync(sourceAgents)) throw new Error('Pinned Cursor build is missing the expected skill or agents directory.');

  const syncRoot = fs.mkdtempSync(path.join(pluginRoot, 'upstream', '.sync-'));
  const originalDir = path.join(syncRoot, 'original');
  const transformedDir = path.join(syncRoot, 'transformed');
  const originalAgentsDir = path.join(syncRoot, 'original-agents');
  const transformedAgentsDir = path.join(syncRoot, 'transformed-agents');
  fs.cpSync(sourceSkill, originalDir, { recursive: true });
  fs.cpSync(sourceSkill, transformedDir, { recursive: true });
  fs.cpSync(sourceAgents, originalAgentsDir, { recursive: true });
  fs.cpSync(sourceAgents, transformedAgentsDir, { recursive: true });

  const changed = [];
  for (const filePath of walkFiles(transformedDir)) {
    const relative = path.relative(transformedDir, filePath).split(path.sep).join('/');
    const originalPath = path.join(originalDir, relative);
    const before = fs.readFileSync(originalPath, 'utf8');
    const result = transformSkillFile(relative, before);
    if (result.text !== before) {
      fs.writeFileSync(filePath, result.text);
      changed.push({
        path: `skills/impeccable/${relative}`,
        sourceSha256: sha256File(originalPath),
        vendoredSha256: sha256File(filePath),
        transformations: result.operations,
      });
    }
  }

  for (const filePath of walkFiles(transformedAgentsDir)) {
    const relative = path.relative(transformedAgentsDir, filePath).split(path.sep).join('/');
    const originalPath = path.join(originalAgentsDir, relative);
    const before = fs.readFileSync(originalPath, 'utf8');
    const result = transformAgentFile(before);
    if (result.text !== before) {
      fs.writeFileSync(filePath, result.text);
      changed.push({
        path: `agents/${relative}`,
        sourceSha256: sha256File(originalPath),
        vendoredSha256: sha256File(filePath),
        transformations: result.operations,
      });
    }
  }

  const skillDiff = spawnSync('git', ['diff', '--no-index', '--', 'original', 'transformed'], {
    cwd: syncRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const agentDiff = spawnSync('git', ['diff', '--no-index', '--', 'original-agents', 'transformed-agents'], {
    cwd: syncRoot,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  for (const diff of [skillDiff, agentDiff]) {
    if (![0, 1].includes(diff.status) || diff.error) throw diff.error || new Error(diff.stderr || 'Unable to generate transformation patch.');
  }
  const patchText = normalizePatch(`${skillDiff.stdout || ''}${agentDiff.stdout || ''}`);

  const inventory = [];
  for (const filePath of walkFiles(originalDir)) {
    const relative = path.relative(originalDir, filePath).split(path.sep).join('/');
    const target = path.join(transformedDir, relative);
    const transformation = changed.find((item) => item.path === `skills/impeccable/${relative}`);
    inventory.push({
      source: `.cursor/skills/impeccable/${relative}`,
      destination: `skills/impeccable/${relative}`,
      sourceSha256: sha256File(filePath),
      vendoredSha256: sha256File(target),
      transformations: transformation?.transformations || [],
    });
  }
  for (const filePath of walkFiles(originalAgentsDir)) {
    const relative = path.relative(originalAgentsDir, filePath).split(path.sep).join('/');
    const target = path.join(transformedAgentsDir, relative);
    const transformation = changed.find((item) => item.path === `agents/${relative}`);
    inventory.push({
      source: `.cursor/agents/${relative}`,
      destination: `agents/${relative}`,
      sourceSha256: sha256File(filePath),
      vendoredSha256: sha256File(target),
      transformations: transformation?.transformations || [],
    });
  }

  const lock = {
    schemaVersion: 1,
    upstream: {
      name: 'Impeccable',
      repository: PIN.repository,
      tag: PIN.tag,
      tagObject: PIN.tagObject,
      commit: PIN.commit,
      archive: { url: PIN.archiveUrl, sha256: PIN.archiveSha256 },
      license: {
        source: 'LICENSE',
        destination: 'upstream/LICENSE',
        sha256: sha256File(path.join(source, 'LICENSE')),
      },
    },
    import: {
      sourceDirectory: '.cursor/skills/impeccable',
      agentsDirectory: '.cursor/agents',
      transformations: [
        'portable-dual-host-script-paths',
        'dual-host-provider-routing',
        'codex-generic-subagent-contract',
        'replace-project-hook-installation-with-plugin-hook',
        'disable-runtime-self-update',
        'redirect-standalone-installer',
        'recognize-plugin-hook',
      ],
      patch: 'upstream/patches/impeccable-plugin.patch',
      patchSha256: crypto.createHash('sha256').update(patchText).digest('hex'),
      files: inventory.sort((a, b) => a.destination.localeCompare(b.destination)),
    },
  };

  if (!args.apply) {
    fs.rmSync(syncRoot, { recursive: true, force: true });
    process.stdout.write(`Verified ${PIN.tag} (${PIN.commit}); ${inventory.length} files, ${changed.length} transformed. Re-run with --apply to write.\n`);
    return;
  }

  const skillTarget = path.join(pluginRoot, 'skills', 'impeccable');
  const agentsTarget = path.join(pluginRoot, 'agents');
  if ((fs.existsSync(skillTarget) || fs.existsSync(agentsTarget)) && !args.replace) {
    fs.rmSync(syncRoot, { recursive: true, force: true });
    throw new Error('Vendored targets already exist. Re-run with --replace after reviewing the generated upstream change.');
  }
  if (args.replace) {
    fs.rmSync(skillTarget, { recursive: true, force: true });
    fs.rmSync(agentsTarget, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(skillTarget), { recursive: true });
  fs.cpSync(transformedDir, skillTarget, { recursive: true });
  fs.cpSync(transformedAgentsDir, agentsTarget, { recursive: true });
  if (fs.existsSync(overlayRoot)) fs.cpSync(overlayRoot, skillTarget, { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, 'upstream', 'patches'), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, 'upstream', 'patches', 'impeccable-plugin.patch'), patchText);
  fs.copyFileSync(path.join(source, 'LICENSE'), path.join(pluginRoot, 'upstream', 'LICENSE'));
  fs.writeFileSync(path.join(pluginRoot, 'upstream', 'impeccable.lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
  fs.rmSync(syncRoot, { recursive: true, force: true });
  process.stdout.write(`Imported ${PIN.tag}: ${inventory.length} files, ${changed.length} transformed.\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Impeccable sync failed: ${error.message}\n`);
  process.exitCode = 1;
}
