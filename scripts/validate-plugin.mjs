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

const nodeMajor = Number.parseInt(process.versions.node, 10);
check(nodeMajor >= 22, `Node 22+ required, found ${process.versions.node}.`);

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const pluginSchema = readJson('schemas/plugin.schema.json');
const manifest = readJson('.cursor-plugin/plugin.json');
const validateManifest = ajv.compile(pluginSchema);
check(validateManifest(manifest), `Plugin manifest is invalid: ${ajv.errorsText(validateManifest.errors)}`);
check(manifest.name === 'geldmacher-design', 'Unexpected plugin name.');
check(manifest.displayName === 'Design', 'Unexpected display name.');
check(manifest.version === '0.1.0', 'Manifest version must be 0.1.0.');
check(manifest.license === 'MIT', 'Wrapper license must be MIT.');
check(manifest.repository === 'https://github.com/geldmacher/geldmacher-design', 'Manifest repository must reference the public source repository.');
check(manifest.homepage === 'https://github.com/geldmacher/geldmacher-design#readme', 'Manifest homepage must reference the public README.');
for (const intentionallyAbsent of ['minClientVersions', 'mcpServers']) {
  check(!Object.hasOwn(manifest, intentionallyAbsent), `${intentionallyAbsent} must remain absent until real and verified.`);
}

const schemaLock = readJson('schemas/plugin.schema.lock.json');
check(sha256('schemas/plugin.schema.json') === schemaLock.sha256, 'Vendored Cursor schema hash does not match its lock.');
check(/^[0-9a-f]{40}$/.test(schemaLock.commit), 'Cursor schema lock needs an exact commit.');

const skillPaths = manifestValues(manifest.skills).flatMap(expandManifestPath);
const skillFiles = skillPaths.map((relative) => `${relative}/SKILL.md`);
for (const relative of skillFiles) check(fs.existsSync(path.join(root, relative)), `Missing declared skill: ${relative}`);
const skillNames = skillFiles.map((relative) => frontmatter(relative).name);
assertUnique(skillNames, 'Skill names');
check(skillNames.includes('design') && skillNames.includes('impeccable'), 'Both design and impeccable skills must be declared.');

const agentFiles = manifestValues(manifest.agents).flatMap(expandManifestPath);
check(agentFiles.length === 4, `Expected four Impeccable agents, found ${agentFiles.length}.`);
const agentNames = agentFiles.map((relative) => frontmatter(relative).name);
assertUnique(agentNames, 'Agent names');

const hookRelative = String(manifest.hooks).replace(/^\.\//, '');
check(fs.existsSync(path.join(root, hookRelative)), 'Declared plugin hook file is missing.');
const hookManifest = readJson(hookRelative);
const hookEntries = hookManifest?.hooks?.preToolUse;
check(Array.isArray(hookEntries) && hookEntries.length === 1, 'Exactly one plugin preToolUse hook is required.');
const hookEntry = hookEntries[0];
check(hookEntry.type === 'command', 'Plugin hook must be a command hook.');
check(hookEntry.failClosed === false, 'Infrastructure failure must be fail-open.');
check(hookEntry.command === 'node "${CURSOR_PLUGIN_ROOT}/hooks/impeccable-plugin-hook.mjs"', 'Hook must resolve through CURSOR_PLUGIN_ROOT.');
check(fs.existsSync(path.join(root, 'hooks/impeccable-plugin-hook.mjs')), 'Hook adapter target is missing.');

const moduleSchema = readJson('modules/module.schema.json');
const validateModule = ajv.compile(moduleSchema);
const modules = loadModules(root);
check(modules.length === 2, `Version 0.1.0 must contain exactly design-core and impeccable modules, found ${modules.length}.`);
assertUnique(modules.map((module) => module.id), 'Module ids');
for (const module of modules) {
  check(validateModule(module), `Module ${module.id} is invalid: ${ajv.errorsText(validateModule.errors)}`);
}
const capabilities = flattenCapabilities(modules);
assertUnique(capabilities.map((capability) => `${capability.module}:${capability.id}`), 'Capability ids');
check(capabilities.filter((capability) => capability.fallback).length === 1, 'Exactly one fallback capability is required.');
check(capabilities.find((capability) => capability.fallback)?.skill === 'impeccable', 'Impeccable must own the fallback.');

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
  check(module.contributes.mcpServers.length === 0, `${module.id} must not contribute MCP in 0.1.0.`);
}
const contributedHooks = new Set(modules.flatMap((module) => module.contributes.hooks));
check(contributedHooks.has(hookRelative), 'The declared plugin hook must be owned by a module.');

const lock = readJson('upstream/impeccable.lock.json');
check(lock.upstream.tag === 'skill-v4.0.4', 'Unexpected Impeccable tag.');
check(lock.upstream.tagObject === 'fb0942f57736841580a65088637f94da4a4ba87c', 'Unexpected annotated tag object.');
check(lock.upstream.commit === '9a949fb543d44cfb406f61bcab99d95d7f12cf1d', 'Unexpected Impeccable commit.');
check(lock.upstream.archive.sha256 === 'bc190f6e1b31c2578013546768903c0babf1af5a6d397c4131f2f2c7c298e770', 'Unexpected Impeccable archive hash.');
check(lock.upstream.license.destination === 'upstream/LICENSE', 'Unexpected Impeccable license destination.');
check(sha256(lock.upstream.license.destination) === lock.upstream.license.sha256, 'Impeccable license hash does not match lock.');
check(sha256(lock.import.patch) === lock.import.patchSha256, 'Transformation patch hash does not match lock.');
const allowedTransformations = new Set([
  'portable-plugin-script-paths',
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
const vendored = [...filesBelow('skills/impeccable'), ...filesBelow('agents')].sort();
check(JSON.stringify(inventoried) === JSON.stringify(vendored), 'Upstream inventory has missing or extra vendored files.');

const runtimeText = [...filesBelow('skills/impeccable'), ...filesBelow('agents')]
  .filter((relative) => /\.(?:md|mjs|js|json)$/.test(relative))
  .map((relative) => fs.readFileSync(path.join(root, relative), 'utf8'))
  .join('\n');
check(!runtimeText.includes('.cursor/skills/impeccable'), 'Project-local Impeccable skill path remains in runtime content.');
check(!runtimeText.includes('npx impeccable update'), 'Upstream runtime self-update remains in runtime content.');
check(runtimeText.includes('${CURSOR_PLUGIN_ROOT}/skills/impeccable'), 'Portable plugin paths were not applied.');
const contextScript = fs.readFileSync(path.join(root, 'skills/impeccable/scripts/context.mjs'), 'utf8');
check(contextScript.includes('PLUGIN_MANAGED_UPDATES = true'), 'Impeccable update poll is not plugin-guarded.');
const adminScript = fs.readFileSync(path.join(root, 'skills/impeccable/scripts/hook-admin.mjs'), 'utf8');
check(adminScript.includes('PLUGIN_MANAGED_HOOK = true'), 'Impeccable hook admin is not plugin-managed.');

process.stdout.write(`Plugin validation passed (${checks} checks).\n`);
