import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { readHookActivation, detectProjectConflicts } from './project-state.mjs';

const subagentDirective = "SUBAGENT_AUTHORIZATION: If your harness gates subagent or agent-tool use on an explicit user request, the user's invocation of this skill is that request for the skill's shipped subagents; spawn them where a reference file directs, without re-asking. Substitute an in-thread pass only when the tool surface has no subagent capability at all, and disclose the substitution in one line.";
const inlineDirective = 'DEGRADED_ROLE_DIRECTIVE: Agent Plugins v1 provides no native hooks or subagents. Load the matching reference/degraded role contract and perform it inline; disclose this limitation.';
const blocked = new Set(['skills', 'help', 'install', 'link', 'update', 'check', 'pin', 'unpin']);
const configNames = ['config.json', 'config.local.json'];

function configPath(root, name) {
  const directory = path.join(root, '.impeccable');
  for (const file of [directory, path.join(directory, name)]) {
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('Refusing symlinked Impeccable configuration.');
  }
  return path.join(directory, name);
}

function readConfig(root, name) {
  const file = configPath(root, name);
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Impeccable configuration must be an object.');
  return value;
}

function writeConfig(root, name, value) {
  const file = configPath(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

export function interceptPluginCommand({ command, args, host, cwd, run }) {
  if (blocked.has(command)) throw new Error('Standalone installation, shortcuts and self-update are disabled. Use the Design maintainer workflow.');
  if (command === 'doctor' && (args.includes('--help') || args.includes('-h'))) return { status: 0, stdout: 'Usage: bundled impeccable doctor [--json] [--target <path>]\nReport project drift and plugin configuration. Read-only; review and authorize project migrations separately.\n', stderr: '' };
  if (command === 'doctor' && args.includes('--fix')) throw new Error('Plugin doctor is read-only. Review and explicitly authorize project migration edits separately.');
  const directIgnore = ['ignore', 'ignores'].includes(command);
  if (!directIgnore && !['hooks', 'hook-admin'].includes(command)) return null;
  const action = (args[0] || 'status').toLowerCase();
  const activation = readHookActivation(cwd);
  if (!directIgnore && action === 'status') return { status: 0, stdout: `${JSON.stringify({ host, hook: host === 'agent-plugin' ? { state: 'unavailable', enabled: false } : activation, conflicts: detectProjectConflicts(cwd, { host }) })}\n`, stderr: '' };
  if (activation.state === 'malformed') throw new Error('Malformed configuration requires deliberate repair.');
  const configs = Object.fromEntries(configNames.map((name) => [name, readConfig(cwd, name)]));
  if (!directIgnore && ['on', 'off', 'reset'].includes(action)) {
    if (host === 'agent-plugin') throw new Error('Agent Plugins v1 has no native hooks.');
    if (args.length > 1) throw new Error('Unexpected hook lifecycle arguments.');
    if (action === 'on' && detectProjectConflicts(cwd, { host }).some((item) => item.severity === 'conflict')) throw new Error('Hook activation conflicts with a project installation.');
    for (const name of configNames) {
      const value = configs[name];
      if (action === 'reset') {
        if (!value) continue;
        delete value.hook;
        delete value.detector;
        writeConfig(cwd, name, value);
      } else if (name === 'config.json' || value?.hook?.enabled !== undefined) {
        writeConfig(cwd, name, { ...value, hook: { ...value?.hook, enabled: action === 'on' } });
      }
    }
    if (action === 'reset') for (const name of ['hook.cache.json', 'hook.pending.json']) fs.rmSync(configPath(cwd, name), { force: true });
    return { status: 0, stdout: `Plugin hooks ${action}; only .impeccable/ changed.\n`, stderr: '' };
  }
  if (!directIgnore && !['ignore-rule', 'ignore-file', 'ignore-value'].includes(action)) throw new Error(`Unknown hook action: ${action}`);
  // Upstream local-ignore administration writes Git exclusions. Run its exact
  // parser in an owned scratch project and transfer only canonical config files.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'design-ignore-'));
  try {
    for (const name of configNames) if (configs[name]) writeConfig(scratch, name, configs[name]);
    const result = run(scratch);
    if (result.status === 0) for (const name of configNames) {
      const next = readConfig(scratch, name);
      if (next && JSON.stringify(next) !== JSON.stringify(configs[name])) writeConfig(cwd, name, next);
    }
    return { ...result, stdout: result.stdout.replaceAll(scratch, cwd) };
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}

function resolvedProject(report) {
  if (typeof report.projectRoot !== 'string' || !path.isAbsolute(report.projectRoot)
      || typeof report.repoRoot !== 'string' || !path.isAbsolute(report.repoRoot)) throw new Error('Unknown engine project resolution.');
  const root = fs.realpathSync(report.projectRoot);
  const repo = fs.realpathSync(report.repoRoot);
  const relative = path.relative(repo, root);
  if (!fs.statSync(root).isDirectory() || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Engine project resolution escapes its repository.');
  return root;
}

const selectionInstructions = 'Show each app with its productStatus/productPath and designStatus/designPath so the user can see child overrides, inherited root files, fallback files, or missing files before choosing. Ask the user which app Impeccable should use, then rerun Impeccable helper commands from that child app cwd using this same scripts directory. Use `--target <path>` only as a fallback when changing cwd is not possible, or when the user explicitly named a file/path.';
const migrationInstruction = 'By severity: `auto` is a migration the next write to that file performs anyway, so apply it then and do not raise it with the user.';
const migrationPolicy = 'By severity: `auto` describes a proposed mechanical migration. Report its scope and obtain explicit user authorization before changing project context; never migrate it automatically.';

function projectMaintenanceFinding(finding) {
  if (!finding || typeof finding.id !== 'string' || typeof finding.fix !== 'string') throw new Error('Unknown engine maintenance finding format.');
  if (finding.id === 'hook-script-missing' || finding.id === 'hook-enabled-conflict') {
    return { ...finding, fix: 'Report the project-local hook manifest conflict. Preserve the manifest; review and explicitly authorize any separate repair. Plugin hook administration changes only .impeccable/ configuration.' };
  }
  if (finding.severity === 'auto') {
    if (!['legacy-live-state', 'design-sidecar-legacy-path'].includes(finding.id) || !finding.fix.endsWith('No user decision is needed.')) throw new Error('Unknown engine migration proposal format.');
    return { ...finding, fix: finding.fix.replace('No user decision is needed.', 'This is a proposal only. Preview the exact file changes and obtain explicit user authorization before applying them.') };
  }
  return finding;
}

function portableInstruction(text) {
  const liveRole = 'Delegate the source edits to the impeccable_manual_edit_applier subagent when available (pass cwd, scripts path, event id, page URL, chunk/deadline, batch, evidencePath); it must not poll or reply.';
  text = text.replaceAll(liveRole, 'Load reference/degraded/manual-edit-applier.md and follow the role inline (pass cwd, scripts path, event id, page URL, chunk/deadline, batch, evidencePath); the inline role must not poll or reply.');
  text = text.replace(/([` ])(?:\$|\/)impeccable(?= )/g, '$1operation:');
  if (text.includes('SUBAGENT_AUTHORIZATION:') || /(?:spawn|delegate)[^\n]*subagent/i.test(text)) throw new Error('Engine emitted an unsupported portable role directive.');
  return text;
}

// The engine embeds these files verbatim (trimmed) before its resolution record.
// Protect complete byte spans, including Markdown separators or directive examples.
function protectProjectContext(stdout, cwd) {
  const records = [...stdout.matchAll(/(?:^|\n\n---\n\n)RESOLVED_CONTEXT:\n(\{[\s\S]*?\n\})(?=\n\n---\n\n|$)/g)];
  if (!records.length) throw new Error('Unknown engine context resolution format.');
  const record = records.at(-1);
  const report = JSON.parse(record[1]);
  resolvedProject(report);
  const spans = [];
  let cursor = 0;
  for (const [file, heading] of [[report.productPath, '# PRODUCT.md'], [report.designPath, '# DESIGN.md'], [report.surfaceBriefPath, `# SURFACE BRIEF (${report.surfaceBriefPath})`]]) {
    if (file == null) continue;
    if (typeof file !== 'string') throw new Error('Unknown engine context file path.');
    // Engine context paths are relative to its invocation cwd, including inherited files.
    const body = fs.readFileSync(path.resolve(cwd, file), 'utf8').trim();
    if (!body) continue;
    const block = `${heading}\n\n${body}`;
    const start = stdout.indexOf(block, cursor);
    if (start < 0 || start + block.length > record.index) throw new Error('Engine project context differs from its resolved file.');
    cursor = start + block.length;
    spans.push({ start, block, token: `PROJECT_CONTEXT_${randomUUID()}` });
  }
  for (const span of spans.sort((a, b) => b.start - a.start)) stdout = stdout.slice(0, span.start) + span.token + stdout.slice(span.start + span.block.length);
  return { stdout, tokens: new Set(spans.map(span => span.token)), restore: text => spans.reduce((value, span) => value.replace(span.token, () => span.block), text) };
}

export function projectEngineOutput({ command, stdout, host, cwd }) {
  if (command === 'context') {
    if (stdout.startsWith('TARGET_SELECTION_REQUIRED:\n')) {
      const parts = stdout.trim().split('\n\n');
      const report = JSON.parse(parts[0].slice('TARGET_SELECTION_REQUIRED:\n'.length));
      resolvedProject(report);
      if (report.targetPath !== null || !Array.isArray(report.targetCandidates) || !report.targetCandidates.length
          || !report.targetCandidates.every(item => typeof item.name === 'string' && typeof item.path === 'string')
          || parts.length !== 2 || parts[1] !== selectionInstructions) throw new Error('Unknown engine target selection format.');
      return stdout;
    }
    const protectedContext = protectProjectContext(stdout, cwd);
    const sections = protectedContext.stdout.split('\n\n---\n\n');
    const resolved = sections.filter(section => section.startsWith('RESOLVED_CONTEXT:\n'));
    if (resolved.length !== 1) throw new Error('Unknown engine context resolution format.');
    const root = resolvedProject(JSON.parse(resolved[0].slice('RESOLVED_CONTEXT:\n'.length)));
    if (!sections.some(section => section.trim() === subagentDirective)) throw new Error('Unknown engine context authorization format.');
    const activation = readHookActivation(root);
    stdout = sections.map(section => {
      if (section.trim() === subagentDirective && host === 'agent-plugin') return inlineDirective;
      if (section.startsWith('CONTEXT_STALE:\n')) {
        if (!section.includes(migrationInstruction)) throw new Error('Unknown engine migration instruction format.');
        const end = section.indexOf('\n]');
        if (end < 0) throw new Error('Unknown engine staleness payload format.');
        const findings = JSON.parse(section.slice('CONTEXT_STALE:\n'.length, end + 2));
        if (!Array.isArray(findings)) throw new Error('Unknown engine staleness findings format.');
        section = `CONTEXT_STALE:\n${JSON.stringify(findings.map(finding => { const projected = projectMaintenanceFinding(finding); return host === 'agent-plugin' ? { ...projected, fix: portableInstruction(projected.fix) } : projected; }), null, 2)}${section.slice(end + 2)}`;
        section = section.replace(migrationInstruction, migrationPolicy).replace('They are already throttled, so say them plainly rather than hedging about whether they matter.', 'Report them once per task; the plugin isolates the notice cache for each invocation.');
      }
      if (activation.enabled && host !== 'agent-plugin' && !detectProjectConflicts(root, { host }).length
          && section.startsWith('MANUAL_DETECTOR_REQUIRED: No automatic Impeccable design hook is active this session. ')) {
        return `PLUGIN_DETECTOR: The ${host} adapter is configured (${host === 'cursor' ? 'pre-write' : 'post-write and Stop'}). A fresh host event is required to prove activation.`;
      }
      if (host === 'agent-plugin' && !protectedContext.tokens.has(section) && !section.startsWith('RESOLVED_CONTEXT:') && !section.startsWith('CONTEXT_STALE:')) return portableInstruction(section);
      return section;
    }).join('\n\n---\n\n');
    stdout = protectedContext.restore(stdout);
    stdout += `\nPLUGIN_HOOK_STATE: ${host}: ${host === 'agent-plugin' ? 'unavailable' : activation.state}. This describes plugin configuration, not fresh host activation evidence.\n`;
    return stdout;
  }
  if (command === 'doctor') {
    const report = JSON.parse(stdout);
    if (!Array.isArray(report.findings)) throw new Error('Unknown engine doctor report format.');
    const root = resolvedProject(report);
    report.pluginHook = { host, ...readHookActivation(root), evidence: 'configuration-only' };
    if (host === 'agent-plugin') report.pluginHook = { host, state: 'unavailable', enabled: false };
    report.findings = report.findings.map(finding => { const projected = projectMaintenanceFinding(finding); return host === 'agent-plugin' ? { ...projected, fix: portableInstruction(projected.fix) } : projected; });
    report.findings.push(...detectProjectConflicts(root, { host }));
    report.migrationPolicy = 'Report proposed migrations; obtain explicit user authorization before editing project context. Plugin doctor never applies migrations.';
    stdout = `${JSON.stringify(report, null, 2)}\n`;
  }
  if (host === 'agent-plugin' && /^live(?:-|$)/.test(command)) return portableInstruction(stdout);
  return stdout;
}
