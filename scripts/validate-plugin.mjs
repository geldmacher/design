#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';
import { flattenCapabilities, loadModules } from '../src/registry.mjs';
import { readPin } from './lib/impeccable-maintenance.mjs';

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
const pinDocument = readJson('upstream/impeccable.pin.json');
const validatePinDocument = ajv.compile(readJson('upstream/impeccable.pin.schema.json'));
check(validatePinDocument(pinDocument), `Impeccable pin is invalid: ${ajv.errorsText(validatePinDocument.errors)}`);
const pin = readPin(root);
const pluginSchema = readJson('schemas/plugin.schema.json');
const packageManifest = readJson('package.json');
const manifest = readJson('.cursor-plugin/plugin.json');
const codexManifest = readJson('.codex-plugin/plugin.json');
const validateManifest = ajv.compile(pluginSchema);
check(validateManifest(manifest), `Plugin manifest is invalid: ${ajv.errorsText(validateManifest.errors)}`);
check(manifest.name === 'geldmacher-design', 'Unexpected plugin name.');
check(manifest.displayName === 'Design', 'Unexpected display name.');
check(manifest.version === '0.7.1', 'Cursor manifest version must be 0.7.1.');
check(packageManifest.version === manifest.version, 'Package and Cursor manifest versions differ.');
check(manifest.license === 'MIT', 'Wrapper license must be MIT.');
check(manifest.repository === 'https://github.com/geldmacher/design', 'Manifest repository must reference the public source repository.');
check(manifest.homepage === 'https://github.com/geldmacher/design#readme', 'Manifest homepage must reference the public README.');
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
check(marketplace.name === 'geldmacher-design', 'Unexpected Codex catalog name.');
check(marketplace.interface?.displayName === 'Geldmacher Design', 'Unexpected Codex catalog display name.');
check(Array.isArray(marketplace.plugins) && marketplace.plugins.length === 1, 'Codex catalog must contain exactly this plugin.');
const marketplacePlugin = marketplace.plugins[0];
check(marketplacePlugin.name === manifest.name, 'Marketplace plugin name differs from the manifests.');
check(marketplacePlugin.source?.source === 'local' && marketplacePlugin.source.path === './', 'Marketplace must point at the repository plugin root.');
check(marketplacePlugin.policy?.installation === 'AVAILABLE', 'Marketplace installation policy must be AVAILABLE.');
check(marketplacePlugin.policy?.authentication === 'ON_USE', 'Marketplace authentication policy must be ON_USE.');

const cursorMarketplace = readJson('.cursor-plugin/marketplace.json');
check(cursorMarketplace.name === 'geldmacher', 'Unexpected Cursor Marketplace name.');
check(cursorMarketplace.owner?.name === 'Geldmacher', 'Unexpected Cursor Marketplace owner.');
check(Array.isArray(cursorMarketplace.plugins) && cursorMarketplace.plugins.length === 1, 'Cursor Marketplace must contain exactly this plugin.');
check(cursorMarketplace.plugins[0]?.name === manifest.name, 'Cursor Marketplace plugin name differs from the manifest.');
check(cursorMarketplace.plugins[0]?.source === '.', 'Cursor Marketplace must point at the repository plugin root.');

check(packageManifest.scripts?.['release:plugin'] === 'node scripts/plugin-github-release.mjs', 'release:plugin must be the no-argument release harness.');
for (const releaseSurface of [
  '.agents/skills/release-plugin/SKILL.md',
  '.agents/skills/release-plugin/agents/openai.yaml',
  '.cursor/commands/release-plugin.md',
  'scripts/plugin-github-release.mjs',
  'docs/installation.md',
  'docs/release-validation.md',
]) {
  check(fs.existsSync(path.join(root, releaseSurface)), `Missing release surface: ${releaseSurface}`);
}
const releaseSkill = frontmatter('.agents/skills/release-plugin/SKILL.md');
check(releaseSkill.name === 'release-plugin', 'Unexpected release skill name.');
check(/explicitly invokes \$release-plugin/.test(releaseSkill.description), 'Release skill must require explicit invocation.');
const releaseMetadata = YAML.parse(fs.readFileSync(path.join(root, '.agents/skills/release-plugin/agents/openai.yaml'), 'utf8'));
check(releaseMetadata?.policy?.allow_implicit_invocation === false, 'Release skill metadata must disable implicit invocation.');
check(/npm run release:plugin/.test(fs.readFileSync(path.join(root, '.cursor/commands/release-plugin.md'), 'utf8')), 'Cursor release command must use the release harness.');

const schemaLock = readJson('schemas/plugin.schema.lock.json');
check(sha256('schemas/plugin.schema.json') === schemaLock.sha256, 'Vendored Cursor schema hash does not match its lock.');
check(/^[0-9a-f]{40}$/.test(schemaLock.commit), 'Cursor schema lock needs an exact commit.');
const agentPluginSchemaLock = readJson('schemas/agent-plugin/1.0.0/source.lock.json');
check(agentPluginSchemaLock.specification === '1.0.0', 'Unexpected Agent Plugins schema version.');
check(sha256('schemas/agent-plugin/1.0.0/plugin.schema.json') === agentPluginSchemaLock.sha256, 'Vendored Agent Plugins schema hash does not match its lock.');
check(agentPluginSchemaLock.source === 'https://raw.githubusercontent.com/agentplugins/agent-plugins-spec/main/schemas/1.0.0/plugin.schema.json', 'Unexpected Agent Plugins schema source.');
const agentPluginManifest = readJson('manifests/agent-plugin.json');
const validateAgentPluginManifest = new Ajv2020({ allErrors: true, strict: false }).compile(readJson('schemas/agent-plugin/1.0.0/plugin.schema.json'));
check(validateAgentPluginManifest(agentPluginManifest), `Agent Plugins manifest template is invalid: ${JSON.stringify(validateAgentPluginManifest.errors)}`);
check(agentPluginManifest.name === manifest.name && agentPluginManifest.version === manifest.version, 'Agent Plugins manifest identity or version differs from native manifests.');
check(agentPluginManifest.repository === manifest.repository && agentPluginManifest.homepage === manifest.homepage, 'Agent Plugins repository metadata differs from native manifests.');
check(!Object.hasOwn(agentPluginManifest, 'extensions'), 'Agent Plugins manifest must not invent an extension namespace.');
check(!fs.existsSync(path.join(root, 'plugin.json')), 'The source workspace must not masquerade as the generated Agent Plugins package.');

const skillPaths = manifestValues(manifest.skills).flatMap(expandManifestPath);
const skillFiles = skillPaths.map((relative) => `${relative}/SKILL.md`);
for (const relative of skillFiles) check(fs.existsSync(path.join(root, relative)), `Missing declared skill: ${relative}`);
const agentSkillFields = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const skillFrontmatters = skillFiles.map((relative) => ({ relative, value: frontmatter(relative) }));
for (const { relative, value } of skillFrontmatters) {
  assertOnlyKeys(value, agentSkillFields, `${relative} frontmatter`);
  check(typeof value.description === 'string' && value.description.length > 0 && value.description.length <= 1024, `${relative} needs a valid Agent Skills description.`);
  check(value.license === undefined || typeof value.license === 'string', `${relative} license must be a string.`);
  check(value.compatibility === undefined || (typeof value.compatibility === 'string' && value.compatibility.length <= 500), `${relative} compatibility is invalid.`);
  if (value.metadata !== undefined) {
    check(value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata), `${relative} metadata must be an object.`);
    check(Object.values(value.metadata).every((entry) => typeof entry === 'string'), `${relative} metadata values must be strings.`);
  }
}
const skillNames = skillFrontmatters.map(({ value }) => value.name);
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
check(modules.length === 2, `Version 0.7.1 must contain exactly design-core and impeccable modules, found ${modules.length}.`);
assertUnique(modules.map((module) => module.id), 'Module ids');
for (const module of modules) {
  check(validateModule(module), `Module ${module.id} is invalid: ${ajv.errorsText(validateModule.errors)}`);
}
const capabilities = flattenCapabilities(modules);
assertUnique(capabilities.map((capability) => `${capability.module}:${capability.id}`), 'Capability ids');
check(capabilities.filter((capability) => capability.fallback).length === 1, 'Exactly one fallback capability is required.');
check(capabilities.find((capability) => capability.fallback)?.skill === 'impeccable', 'Impeccable must own the fallback.');
const designCoreModule = modules.find((module) => module.id === 'design-core');
check(designCoreModule?.source?.type === 'first-party' && designCoreModule?.source?.url === 'urn:geldmacher:design', 'Design core capabilities must remain first-party owned.');
const reviewCapability = capabilities.find((capability) => capability.module === 'design-core' && capability.id === 'change-interface-review');
check(reviewCapability?.skill === 'design', 'Change review must remain inside the Design router.');
check(reviewCapability?.specificity === 90 && reviewCapability?.fallback === false, 'Change review must be a narrow non-fallback capability at specificity 90.');
check(JSON.stringify(reviewCapability?.triggers) === JSON.stringify(['review']), 'Change review must have the single explicit review trigger.');
const detectorCapability = capabilities.find((capability) => capability.module === 'design-core' && capability.id === 'detector-scan');
check(detectorCapability?.skill === 'design', 'Detector scan must remain inside the Design router.');
check(detectorCapability?.specificity === 100 && detectorCapability?.fallback === false, 'Detector scan must be an explicit non-fallback capability at specificity 100.');
check(JSON.stringify(detectorCapability?.triggers) === JSON.stringify(['detect']), 'Detector scan must have the single explicit detect trigger.');
const questionnaireCapability = capabilities.find((capability) => capability.module === 'design-core' && capability.id === 'stakeholder-questionnaire');
check(questionnaireCapability?.skill === 'design', 'Stakeholder questionnaire must remain inside the Design router.');
check(questionnaireCapability?.specificity === 100 && questionnaireCapability?.fallback === false, 'Stakeholder questionnaire must be an explicit non-fallback capability at specificity 100.');
check(JSON.stringify(questionnaireCapability?.triggers) === JSON.stringify(['questionnaire']), 'Stakeholder questionnaire must have the single explicit questionnaire trigger.');
check(designCoreModule?.version === manifest.version, 'First-party module version differs from the plugin package.');
const impeccableModule = modules.find((module) => module.id === 'impeccable');
check(impeccableModule?.version === pin.version, 'Impeccable module version differs from the approved pin.');
check(impeccableModule?.source?.url === pin.repository, 'Impeccable module repository differs from the approved pin.');
check(impeccableModule?.source?.tag === pin.tag, 'Impeccable module tag differs from the approved pin.');
check(impeccableModule?.source?.commit === pin.commit, 'Impeccable module commit differs from the approved pin.');
check(impeccableModule?.source?.archiveSha256 === pin.archive.sha256, 'Impeccable module archive hash differs from the approved pin.');

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
  check(module.contributes.mcpServers.length === 0, `${module.id} must not contribute MCP in 0.7.1.`);
}
const designModule = modules.find((module) => module.id === 'design-core');
check(designModule?.contributes.scripts.includes('skills/design/scripts/review-scope.mjs'), 'Design module must own the review scope resolver.');
const contributedHooks = new Set(modules.flatMap((module) => module.contributes.hooks));
check(contributedHooks.has(cursorHookRelative), 'The Cursor hook must be owned by a module.');
check(contributedHooks.has(codexHookRelative), 'The Codex hook must be owned by a module.');

const lock = readJson('upstream/impeccable.lock.json');
check(lock.upstream.repository === pin.repository, 'Impeccable lock repository differs from the approved pin.');
check(lock.upstream.tag === pin.tag, 'Impeccable lock tag differs from the approved pin.');
check(lock.upstream.tagObject === pin.tagObject, 'Impeccable lock annotated tag object differs from the approved pin.');
check(lock.upstream.commit === pin.commit, 'Impeccable lock commit differs from the approved pin.');
check(lock.upstream.archive.url === pin.archive.url, 'Impeccable lock archive URL differs from the approved pin.');
check(lock.upstream.archive.sha256 === pin.archive.sha256, 'Impeccable lock archive hash differs from the approved pin.');
check(impeccableModule.source.archiveSha256 === lock.upstream.archive.sha256, 'Packaged Impeccable archive provenance differs from the upstream lock.');
const expectedNotice = [
  'Geldmacher Design includes a modified, vendored Cursor build of Impeccable.',
  '',
  `Impeccable source: ${pin.repository}`,
  `Pinned tag: ${pin.tag}`,
  `Pinned commit: ${pin.commit}`,
].join('\n');
check(fs.readFileSync(path.join(root, 'upstream/NOTICE'), 'utf8').startsWith(expectedNotice), 'Impeccable NOTICE differs from the approved pin.');
const thirdPartyNotice = fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
check(thirdPartyNotice.includes(`- Source: ${pin.repository}`), 'Third-party notice repository differs from the approved pin.');
check(thirdPartyNotice.includes(`- Pinned release: \`${pin.tag}\``), 'Third-party notice release differs from the approved pin.');
check(lock.upstream.license.destination === 'upstream/LICENSE', 'Unexpected Impeccable license destination.');
check(sha256(lock.upstream.license.destination) === lock.upstream.license.sha256, 'Impeccable license hash does not match lock.');
check(sha256(lock.import.patch) === lock.import.patchSha256, 'Transformation patch hash does not match lock.');
const allowedTransformations = new Set([
  'agent-skills-frontmatter',
  'portable-dual-host-script-paths',
  'dual-host-provider-routing',
  'codex-generic-subagent-contract',
  'agent-plugin-provider-routing',
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
check(runtimeText.includes('<IMPECCABLE_SKILL_ROOT>/scripts/'), 'Dual-host skill paths were not applied.');
const contextScript = fs.readFileSync(path.join(root, 'skills/impeccable/scripts/context.mjs'), 'utf8');
check(contextScript.includes('PLUGIN_MANAGED_UPDATES = true'), 'Impeccable update poll is not plugin-guarded.');
check(contextScript.includes('PLUGIN_MANAGED_HOOK = true'), 'Impeccable hook discovery is not plugin-guarded.');
const adminScript = fs.readFileSync(path.join(root, 'skills/impeccable/scripts/hook-admin.mjs'), 'utf8');
check(adminScript.includes('PLUGIN_MANAGED_HOOK = true'), 'Impeccable hook admin is not plugin-managed.');
const providerScript = fs.readFileSync(path.join(root, 'skills/impeccable/scripts/lib/provider.mjs'), 'utf8');
check(providerScript.includes('resolveImpeccableProvider'), 'Impeccable provider is not dual-host aware.');
check(providerScript.includes('env.IMPECCABLE_HOST'), 'Impeccable provider does not honor the explicit host override.');
check(providerScript.includes('env.CURSOR_PLUGIN_ROOT') && providerScript.includes('env.PLUGIN_ROOT'), 'Impeccable provider is missing a documented adapter fallback.');
check(providerScript.includes('AGENT_PLUGIN_SCHEMA') && providerScript.includes('agent-plugin'), 'Impeccable provider is missing canonical Agent Plugins detection.');
check(providerScript.includes('host is unknown'), 'Impeccable provider silently defaults an unknown host.');
const hostScript = fs.readFileSync(path.join(root, 'src/host.mjs'), 'utf8');
check(hostScript.includes('env.IMPECCABLE_HOST'), 'Shared host resolution does not honor IMPECCABLE_HOST.');
check(hostScript.includes('Plugin host is unknown'), 'Shared host resolution silently defaults an unknown host.');
const cliScript = fs.readFileSync(path.join(root, 'skills/design/scripts/design-cli.mjs'), 'utf8');
check(cliScript.includes("arg === '--host'") && cliScript.includes("arg.startsWith('--host=')"), 'Design CLI does not expose both --host forms.');
check(cliScript.includes("command === 'detect'") && cliScript.includes('runDetectorScan'), 'Design CLI does not own the explicit detector scan path.');
for (const relative of ['src/impeccable-runtime.mjs', 'src/detector-scan.mjs']) {
  check(fs.existsSync(path.join(root, relative)), `Missing first-party detector orchestration runtime: ${relative}`);
  check(!fs.readFileSync(path.join(root, relative), 'utf8').includes('npx impeccable'), `${relative} must not invoke the upstream installer CLI.`);
}
const detectorRuntimeText = fs.readFileSync(path.join(root, 'src/impeccable-runtime.mjs'), 'utf8');
check(detectorRuntimeText.includes("shell: false") && detectorRuntimeText.includes("IMPECCABLE_NO_UPDATE_CHECK: '1'"), 'Detector runtime must disable shell execution and upstream self-update checks.');
const designSkillText = fs.readFileSync(path.join(root, 'skills/design/SKILL.md'), 'utf8');
check(designSkillText.includes('design-core:detector-scan') && designSkillText.includes('detect -- <target>'), 'Design skill is missing the explicit detector contract.');
check(designSkillText.includes('design-core:stakeholder-questionnaire') && designSkillText.includes('references/questionnaire.md'), 'Design skill is missing the stakeholder questionnaire contract.');
check(fs.existsSync(path.join(root, 'skills/design/references/questionnaire.md')), 'Stakeholder questionnaire reference is missing.');

process.stdout.write(`Plugin validation passed (${checks} checks).\n`);
