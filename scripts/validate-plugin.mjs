#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import YAML from 'yaml';
import { flattenCapabilities, loadModules } from '../src/registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) throw new Error(message);
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

function sha256(relative) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
}

function filesBelow(relative) {
  const base = path.join(root, relative);
  const out = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) out.push(...filesBelow(child));
    else if (entry.isFile()) out.push(child.split(path.sep).join('/'));
  }
  return out.sort();
}

function frontmatter(relative) {
  const text = fs.readFileSync(path.join(root, relative), 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  check(!!match, `${relative} has no valid YAML frontmatter.`);
  const parsed = YAML.parse(match[1]);
  check(parsed && typeof parsed === 'object', `${relative} frontmatter is not an object.`);
  return parsed;
}

function expandManifestPath(value) {
  const relative = String(value).replace(/^\.\//, '');
  if (!relative.includes('*')) return [relative];
  const directory = path.dirname(relative);
  const pattern = new RegExp(`^${path.basename(relative).replace('.', '\\.').replace('*', '.*')}$`);
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => `${directory}/${entry.name}`)
    .sort();
}

function manifestValues(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function assertUnique(values, label) {
  check(new Set(values).size === values.length, `${label} must be unique.`);
}

function assertOnlyKeys(value, allowed, label) {
  check(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  for (const key of Object.keys(value || {})) check(allowed.has(key), `${label} contains unsupported field ${key}.`);
}

const nodeMajor = Number.parseInt(process.versions.node, 10);
check(nodeMajor >= 22, `Node 22+ required, found ${process.versions.node}.`);

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const pluginSchema = readJson('schemas/plugin.schema.json');
const packageManifest = readJson('package.json');
const manifest = readJson('.cursor-plugin/plugin.json');
const codexManifest = readJson('.codex-plugin/plugin.json');
const validateManifest = ajv.compile(pluginSchema);
check(validateManifest(manifest), `Plugin manifest is invalid: ${ajv.errorsText(validateManifest.errors)}`);
check(manifest.name === 'geldmacher-design', 'Unexpected plugin name.');
check(manifest.displayName === 'Design', 'Unexpected display name.');
check(manifest.version === '0.2.0', 'Cursor manifest version must be 0.2.0.');
check(packageManifest.version === manifest.version, 'Package and Cursor manifest versions differ.');
check(manifest.license === 'MIT', 'Wrapper license must be MIT.');
check(manifest.repository === 'https://github.com/geldmacher/geldmacher-design', 'Manifest repository must reference the public source repository.');
check(manifest.homepage === 'https://github.com/geldmacher/geldmacher-design#readme', 'Manifest homepage must reference the public README.');
for (const intentionallyAbsent of ['minClientVersions', 'mcpServers']) {
  check(!Object.hasOwn(manifest, intentionallyAbsent), `${intentionallyAbsent} must remain absent until real and verified.`);
}

assertOnlyKeys(codexManifest, new Set([
  'id', 'name', 'version', 'description', 'skills', 'apps', 'mcpServers', 'interface',
  'author', 'homepage', 'repository', 'license', 'keywords',
]), 'Codex manifest');
check(codexManifest.name === manifest.name, 'Cursor and Codex plugin names differ.');
check(codexManifest.version === manifest.version, 'Cursor and Codex manifest versions differ.');
check(codexManifest.description === manifest.description, 'Cursor and Codex descriptions differ.');
check(codexManifest.skills === './skills/', 'Codex manifest must discover the shared skills directory.');
check(!Object.hasOwn(codexManifest, 'hooks'), 'Codex manifest must use default hooks/hooks.json discovery for the current ingestion contract.');
for (const intentionallyAbsent of ['apps', 'mcpServers', 'agents']) {
  check(!Object.hasOwn(codexManifest, intentionallyAbsent), `Codex ${intentionallyAbsent} must remain absent.`);
}
check(codexManifest.author?.name === manifest.author.name, 'Cursor and Codex author names differ.');
check(codexManifest.interface?.displayName === 'Design', 'Unexpected Codex display name.');
check(codexManifest.interface?.developerName === 'Geldmacher', 'Unexpected Codex developer name.');
check(Array.isArray(codexManifest.interface?.capabilities), 'Codex capabilities must be an array.');
check(Array.isArray(codexManifest.interface?.defaultPrompt) && codexManifest.interface.defaultPrompt.length === 2, 'Codex starter prompts must contain the two explicit invocations.');
check(codexManifest.interface.defaultPrompt.every((prompt) => /\$(?:design|impeccable)/.test(prompt)), 'Codex starter prompts must use explicit skill mentions.');
check(fs.existsSync(path.join(root, codexManifest.interface.logo)), 'Codex logo path is missing.');

const marketplace = readJson('.agents/plugins/marketplace.json');
check(marketplace.name === 'geldmacher-design-local', 'Unexpected local marketplace name.');
check(marketplace.interface?.displayName === 'Geldmacher Local', 'Unexpected local marketplace display name.');
check(Array.isArray(marketplace.plugins) && marketplace.plugins.length === 1, 'Local marketplace must contain exactly this plugin.');
const marketplacePlugin = marketplace.plugins[0];
check(marketplacePlugin.name === manifest.name, 'Marketplace plugin name differs from the manifests.');
check(marketplacePlugin.source?.source === 'local' && marketplacePlugin.source.path === './', 'Marketplace must point at the repository plugin root.');
check(marketplacePlugin.policy?.installation === 'AVAILABLE', 'Marketplace installation policy must be AVAILABLE.');
check(marketplacePlugin.policy?.authentication === 'ON_USE', 'Marketplace authentication policy must be ON_USE.');

const schemaLock = readJson('schemas/plugin.schema.lock.json');
check(sha256('schemas/plugin.schema.json') === schemaLock.sha256, 'Vendored Cursor schema hash does not match its lock.');
check(/^[0-9a-f]{40}$/.test(schemaLock.commit), 'Cursor schema lock needs an exact commit.');

const skillPaths = manifestValues(manifest.skills).flatMap(expandManifestPath);
const skillFiles = skillPaths.map((relative) => `${relative}/SKILL.md`);
for (const relative of skillFiles) check(fs.existsSync(path.join(root, relative)), `Missing declared skill: ${relative}`);
const skillNames = skillFiles.map((relative) => frontmatter(relative).name);
assertUnique(skillNames, 'Skill names');
check(skillNames.includes('design') && skillNames.includes('impeccable'), 'Both design and impeccable skills must be declared.');
for (const skillPath of skillPaths) {
  const metadataPath = `${skillPath}/agents/openai.yaml`;
  check(fs.existsSync(path.join(root, metadataPath)), `Missing Codex skill metadata: ${metadataPath}`);
  const metadata = YAML.parse(fs.readFileSync(path.join(root, metadataPath), 'utf8'));
  check(metadata?.policy?.allow_implicit_invocation === false, `${metadataPath} must require explicit invocation.`);
  check(typeof metadata?.interface?.display_name === 'string' && metadata.interface.display_name, `${metadataPath} needs a display name.`);
  check(typeof metadata?.interface?.short_description === 'string' && metadata.interface.short_description, `${metadataPath} needs a short description.`);
}

const agentFiles = manifestValues(manifest.agents).flatMap(expandManifestPath);
check(agentFiles.length === 4, `Expected four Impeccable agents, found ${agentFiles.length}.`);
const agentNames = agentFiles.map((relative) => frontmatter(relative).name);
assertUnique(agentNames, 'Agent names');
for (const relative of agentFiles) {
  const agent = frontmatter(relative);
  check(agent.model === 'inherit', `${relative} must inherit the parent model.`);
}
const impeccableSkillText = fs.readFileSync(path.join(root, 'skills/impeccable/SKILL.md'), 'utf8');
for (const relative of agentFiles) {
  check(impeccableSkillText.includes(`../../${relative}`), `Codex role contract does not reference ${relative}.`);
}
check(impeccableSkillText.includes('no forked conversation history and no model override'), 'Codex role contract must require fresh inherited subagents.');

const cursorHookRelative = String(manifest.hooks).replace(/^\.\//, '');
check(cursorHookRelative === 'hooks/cursor-hooks.json', 'Cursor manifest must declare its target-specific hook file.');
check(fs.existsSync(path.join(root, cursorHookRelative)), 'Declared Cursor hook file is missing.');
const cursorHookManifest = readJson(cursorHookRelative);
const hookEntries = cursorHookManifest?.hooks?.preToolUse;
check(Array.isArray(hookEntries) && hookEntries.length === 1, 'Exactly one Cursor preToolUse hook is required.');
const hookEntry = hookEntries[0];
check(hookEntry.type === 'command', 'Plugin hook must be a command hook.');
check(hookEntry.failClosed === false, 'Infrastructure failure must be fail-open.');
check(hookEntry.command === 'node "${CURSOR_PLUGIN_ROOT}/hooks/impeccable-plugin-hook.mjs"', 'Hook must resolve through CURSOR_PLUGIN_ROOT.');
check(fs.existsSync(path.join(root, 'hooks/impeccable-plugin-hook.mjs')), 'Hook adapter target is missing.');

const codexHookRelative = 'hooks/hooks.json';
const codexHookManifest = readJson(codexHookRelative);
const codexPost = codexHookManifest?.hooks?.PostToolUse;
const codexStop = codexHookManifest?.hooks?.Stop;
check(Array.isArray(codexPost) && codexPost.length === 1, 'Exactly one Codex PostToolUse matcher is required.');
check(codexPost[0].matcher === 'Edit|Write|apply_patch', 'Codex PostToolUse matcher must cover UI edit tools.');
check(codexPost[0].hooks?.length === 1 && codexPost[0].hooks[0].timeout === 5, 'Codex PostToolUse hook must use the bounded immediate timeout.');
check(Array.isArray(codexStop) && codexStop.length === 1 && codexStop[0].hooks?.[0]?.timeout === 30, 'Codex Stop hook must use the deep-pass timeout.');
for (const entry of [codexPost[0].hooks[0], codexStop[0].hooks[0]]) {
  check(entry.type === 'command', 'Codex plugin hooks must be command hooks.');
  check(entry.command === 'node "${PLUGIN_ROOT}/hooks/impeccable-codex-hook.mjs"', 'Codex hooks must resolve through PLUGIN_ROOT.');
}
check(fs.existsSync(path.join(root, 'hooks/impeccable-codex-hook.mjs')), 'Codex hook adapter target is missing.');

const moduleSchema = readJson('modules/module.schema.json');
const validateModule = ajv.compile(moduleSchema);
const modules = loadModules(root);
check(modules.length === 2, `Version 0.2.0 must contain exactly design-core and impeccable modules, found ${modules.length}.`);
assertUnique(modules.map((module) => module.id), 'Module ids');
for (const module of modules) {
  check(validateModule(module), `Module ${module.id} is invalid: ${ajv.errorsText(validateModule.errors)}`);
}
const capabilities = flattenCapabilities(modules);
assertUnique(capabilities.map((capability) => `${capability.module}:${capability.id}`), 'Capability ids');
check(capabilities.filter((capability) => capability.fallback).length === 1, 'Exactly one fallback capability is required.');
check(capabilities.find((capability) => capability.fallback)?.skill === 'impeccable', 'Impeccable must own the fallback.');
check(modules.find((module) => module.id === 'design-core')?.version === manifest.version, 'First-party module version differs from the plugin package.');
check(modules.find((module) => module.id === 'impeccable')?.version === '4.0.4', 'Impeccable module must remain pinned to 4.0.4.');

const contributedSkills = modules.flatMap((module) => module.contributes.skills).sort();
const contributedAgents = modules.flatMap((module) => module.contributes.agents).sort();
assertUnique(contributedSkills, 'Contributed skill paths');
assertUnique(contributedAgents, 'Contributed agent paths');
check(JSON.stringify(contributedSkills) === JSON.stringify(skillPaths.sort()), 'Manifest skills and module-contributed skills differ.');
check(JSON.stringify(contributedAgents) === JSON.stringify(agentFiles.sort()), 'Manifest agents and module-contributed agents differ.');
for (const module of modules) {
  for (const field of ['skills', 'agents', 'rules', 'hooks', 'scripts']) {
    for (const relative of module.contributes[field]) check(fs.existsSync(path.join(root, relative)), `Orphan ${module.id} ${field} contribution: ${relative}`);
  }
  check(module.contributes.mcpServers.length === 0, `${module.id} must not contribute MCP in 0.2.0.`);
}
const contributedHooks = new Set(modules.flatMap((module) => module.contributes.hooks));
check(contributedHooks.has(cursorHookRelative), 'The Cursor hook must be owned by a module.');
check(contributedHooks.has(codexHookRelative), 'The Codex hook must be owned by a module.');

const lock = readJson('upstream/impeccable.lock.json');
check(lock.upstream.tag === 'skill-v4.0.4', 'Unexpected Impeccable tag.');
check(lock.upstream.tagObject === 'fb0942f57736841580a65088637f94da4a4ba87c', 'Unexpected annotated tag object.');
check(lock.upstream.commit === '9a949fb543d44cfb406f61bcab99d95d7f12cf1d', 'Unexpected Impeccable commit.');
check(lock.upstream.archive.sha256 === 'bc190f6e1b31c2578013546768903c0babf1af5a6d397c4131f2f2c7c298e770', 'Unexpected Impeccable archive hash.');
check(lock.upstream.license.destination === 'upstream/LICENSE', 'Unexpected Impeccable license destination.');
check(sha256(lock.upstream.license.destination) === lock.upstream.license.sha256, 'Impeccable license hash does not match lock.');
check(sha256(lock.import.patch) === lock.import.patchSha256, 'Transformation patch hash does not match lock.');
const allowedTransformations = new Set([
  'portable-dual-host-script-paths',
  'dual-host-provider-routing',
  'codex-generic-subagent-contract',
  'replace-project-hook-installation-with-plugin-hook',
  'disable-runtime-self-update',
  'redirect-standalone-installer',
  'recognize-plugin-hook',
]);
check(lock.import.transformations.every((id) => allowedTransformations.has(id)), 'Lock contains an unapproved transformation.');
assertUnique(lock.import.files.map((file) => file.destination), 'Upstream inventory destinations');
const patch = fs.readFileSync(path.join(root, lock.import.patch), 'utf8');
for (const file of lock.import.files) {
  check(fs.existsSync(path.join(root, file.destination)), `Missing vendored file ${file.destination}.`);
  check(sha256(file.destination) === file.vendoredSha256, `Vendored hash drift: ${file.destination}.`);
  check(file.transformations.every((id) => allowedTransformations.has(id)), `Unapproved file transformation: ${file.destination}.`);
  if (file.transformations.length === 0) check(file.sourceSha256 === file.vendoredSha256, `Untransformed file differs from source: ${file.destination}.`);
  else check(patch.includes(`a/${file.destination}`), `Transformed file is absent from patch: ${file.destination}.`);
}
const inventoried = lock.import.files.map((file) => file.destination).sort();
const firstPartyOverlays = new Set(['skills/impeccable/agents/openai.yaml']);
const vendored = [...filesBelow('skills/impeccable'), ...filesBelow('agents')]
  .filter((relative) => !firstPartyOverlays.has(relative))
  .sort();
check(JSON.stringify(inventoried) === JSON.stringify(vendored), 'Upstream inventory has missing or extra vendored files.');
check(
  sha256('skills/impeccable/agents/openai.yaml') === sha256('overlays/skills/impeccable/agents/openai.yaml'),
  'Impeccable Codex metadata differs from its first-party overlay.',
);

const runtimeText = [...filesBelow('skills/impeccable'), ...filesBelow('agents')]
  .filter((relative) => /\.(?:md|mjs|js|json)$/.test(relative))
  .map((relative) => fs.readFileSync(path.join(root, relative), 'utf8'))
  .join('\n');
check(!runtimeText.includes('.cursor/skills/impeccable'), 'Project-local Impeccable skill path remains in runtime content.');
check(!runtimeText.includes('${CURSOR_PLUGIN_ROOT}/skills/impeccable'), 'Cursor-only plugin skill path remains in shared runtime content.');
check(!runtimeText.includes('npx impeccable update'), 'Upstream runtime self-update remains in runtime content.');
check(runtimeText.includes('<IMPECCABLE_SKILL_ROOT>/scripts/context.mjs'), 'Dual-host skill paths were not applied.');
const contextScript = fs.readFileSync(path.join(root, 'skills/impeccable/scripts/context.mjs'), 'utf8');
check(contextScript.includes('PLUGIN_MANAGED_UPDATES = true'), 'Impeccable update poll is not plugin-guarded.');
check(contextScript.includes('PLUGIN_MANAGED_HOOK = true'), 'Impeccable hook discovery is not plugin-guarded.');
const adminScript = fs.readFileSync(path.join(root, 'skills/impeccable/scripts/hook-admin.mjs'), 'utf8');
check(adminScript.includes('PLUGIN_MANAGED_HOOK = true'), 'Impeccable hook admin is not plugin-managed.');
const providerScript = fs.readFileSync(path.join(root, 'skills/impeccable/scripts/lib/provider.mjs'), 'utf8');
check(providerScript.includes('resolveImpeccableProvider'), 'Impeccable provider is not dual-host aware.');
check(providerScript.includes('env.IMPECCABLE_HOST'), 'Impeccable provider does not honor the explicit host override.');
check(providerScript.includes('env.CURSOR_PLUGIN_ROOT') && providerScript.includes('env.PLUGIN_ROOT'), 'Impeccable provider is missing a documented adapter fallback.');
check(providerScript.includes('host is unknown'), 'Impeccable provider silently defaults an unknown host.');
const hostScript = fs.readFileSync(path.join(root, 'src/host.mjs'), 'utf8');
check(hostScript.includes('env.IMPECCABLE_HOST'), 'Shared host resolution does not honor IMPECCABLE_HOST.');
check(hostScript.includes('Plugin host is unknown'), 'Shared host resolution silently defaults an unknown host.');
const cliScript = fs.readFileSync(path.join(root, 'scripts/design-cli.mjs'), 'utf8');
check(cliScript.includes("arg === '--host'") && cliScript.includes("arg.startsWith('--host=')"), 'Design CLI does not expose both --host forms.');

process.stdout.write(`Plugin validation passed (${checks} checks).\n`);
