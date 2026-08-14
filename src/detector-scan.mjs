import fs from 'node:fs';
import path from 'node:path';
import { resolveHost } from './host.mjs';
import { runBundledImpeccable } from './impeccable-runtime.mjs';

export const DETECT_TIMEOUT_MS = 30_000;

// Match the bundled detector's directory traversal exclusions without
// importing its internals into the first-party orchestration boundary.
const DETECTOR_SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '__pycache__']);
const DETECTOR_HIDDEN_SOURCE_DIRECTORIES = new Set(['.vitepress', '.vuepress', '.storybook']);

function inside(base, candidate) {
  const item = path.relative(path.resolve(base), path.resolve(candidate));
  return item === '' || (item !== '..' && !item.startsWith(`..${path.sep}`) && !path.isAbsolute(item));
}

function portablePath(value) {
  return String(value).split(path.sep).join('/');
}

function canonicalProjectRoot(value) {
  const requested = path.resolve(value);
  try {
    return fs.lstatSync(requested).isDirectory() ? fs.realpathSync(requested) : requested;
  } catch {
    return requested;
  }
}

function readDetectorProvenance(pluginRoot) {
  const fallback = {
    source: 'bundled-impeccable',
    skillVersion: null,
    tag: null,
    commit: null,
    archiveSha256: null,
  };
  try {
    const modulePath = path.join(path.resolve(pluginRoot), 'modules', 'impeccable.json');
    const module = JSON.parse(fs.readFileSync(modulePath, 'utf8'));
    return {
      source: 'bundled-impeccable',
      skillVersion: module.version || null,
      tag: module.source?.tag || null,
      commit: module.source?.commit || null,
      archiveSha256: module.source?.archiveSha256 || null,
    };
  } catch {
    return fallback;
  }
}

function emptyCounts() {
  return { primary: 0, advisory: 0, total: 0 };
}

function diagnostic(code, message, target) {
  return {
    code,
    message,
    ...(target === undefined ? {} : { target: String(target) }),
  };
}

function targetError(code, message, target) {
  return Object.assign(new Error(message), { code, target });
}

function relativeTarget(projectRoot, candidate) {
  const relative = path.relative(projectRoot, candidate);
  return relative ? portablePath(relative) : '.';
}

function validateDirectoryBoundary(directory, projectRoot, inspectedDirectories) {
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    if (inspectedDirectories.has(current)) continue;
    inspectedDirectories.add(current);

    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      const target = relativeTarget(projectRoot, current);
      throw targetError('target-unreadable', `Cannot inspect directory target: ${target}: ${error.message}`, target);
    }

    for (const entry of entries) {
      if (DETECTOR_SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const candidate = path.join(current, entry.name);
      let stat;
      try {
        stat = fs.lstatSync(candidate);
      } catch (error) {
        const target = relativeTarget(projectRoot, candidate);
        throw targetError('target-unreadable', `Cannot inspect target entry: ${target}: ${error.message}`, target);
      }
      if (stat.isDirectory() && entry.name.startsWith('.') && !DETECTOR_HIDDEN_SOURCE_DIRECTORIES.has(entry.name)) continue;
      if (stat.isSymbolicLink()) {
        let physical;
        try {
          physical = fs.realpathSync(candidate);
        } catch (error) {
          const target = relativeTarget(projectRoot, candidate);
          throw targetError('target-symlink-invalid', `Target contains an unresolved symlink: ${target}: ${error.message}`, target);
        }
        if (!inside(projectRoot, physical)) {
          const target = relativeTarget(projectRoot, candidate);
          throw targetError('target-symlink-outside-project', `Target contains a symlink that resolves outside the project root: ${target}`, target);
        }
        continue;
      }
      if (stat.isDirectory()) pending.push(candidate);
    }
  }
}

function envelopeBase({ host, projectRoot, targets, pluginRoot }) {
  return {
    schemaVersion: 1,
    command: 'detect',
    status: 'blocked',
    host,
    projectRoot,
    targets,
    detector: readDetectorProvenance(pluginRoot),
    counts: emptyCounts(),
    findings: [],
    diagnostics: [],
  };
}

export function blockedDetectionResult({
  host,
  projectRoot = process.cwd(),
  targets = [],
  pluginRoot,
  code,
  message,
  target,
}) {
  let resolvedHost = null;
  try { resolvedHost = resolveHost(host); } catch { /* The diagnostic explains the invalid host. */ }
  const envelope = envelopeBase({
    host: resolvedHost,
    projectRoot: canonicalProjectRoot(projectRoot),
    targets: targets.map(String),
    pluginRoot,
  });
  envelope.diagnostics.push(diagnostic(code, message, target));
  return { exitCode: 1, envelope };
}

function validateTargets(projectRoot, targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw Object.assign(new Error('detect requires at least one explicit local target after --.'), { code: 'target-required' });
  }

  const requestedRoot = path.resolve(projectRoot);
  const rootStat = fs.lstatSync(requestedRoot);
  if (!rootStat.isDirectory()) {
    throw Object.assign(new Error(`Project root is not a directory: ${requestedRoot}`), { code: 'invalid-project-root' });
  }
  const physicalRoot = fs.realpathSync(requestedRoot);
  const seen = new Set();
  const inspectedDirectories = new Set();
  const validated = [];

  for (const rawTarget of targets) {
    const target = String(rawTarget);
    if (target.length === 0) {
      throw targetError('target-empty', 'Empty targets are not allowed; pass . explicitly to scan the project root.', target);
    }
    if (target === '-') {
      throw targetError('stdin-unsupported', 'stdin is not supported; pass an explicit local file or directory.', target);
    }
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(target);
    const isWindowsDrive = /^[a-z]:[\\/]/i.test(target);
    if (hasScheme && !isWindowsDrive) {
      throw Object.assign(new Error(`Only local project paths are supported: ${target}`), { code: 'unsupported-target', target });
    }
    const requested = path.resolve(requestedRoot, target);
    let physical;
    try {
      physical = fs.realpathSync(requested);
    } catch {
      throw Object.assign(new Error(`Target does not exist: ${target}`), { code: 'target-missing', target });
    }
    if (!inside(physicalRoot, physical)) {
      throw Object.assign(new Error(`Target resolves outside the project root: ${target}`), { code: 'target-outside-project', target });
    }
    const stat = fs.statSync(physical);
    if (!stat.isFile() && !stat.isDirectory()) {
      throw Object.assign(new Error(`Target is not a regular file or directory: ${target}`), { code: 'unsupported-target-type', target });
    }
    if (seen.has(physical)) continue;
    seen.add(physical);
    if (stat.isDirectory()) validateDirectoryBoundary(physical, physicalRoot, inspectedDirectories);
    validated.push({ absolute: physical, relative: relativeTarget(physicalRoot, physical) });
  }

  return { physicalRoot, targets: validated };
}

function normalizeFinding(finding, projectRoot) {
  if (!finding || typeof finding !== 'object' || Array.isArray(finding)) throw new Error('Detector finding is not an object.');
  const required = ['antipattern', 'name', 'description', 'file', 'snippet'];
  for (const field of required) {
    if (typeof finding[field] !== 'string' || !finding[field]) throw new Error(`Detector finding is missing ${field}.`);
  }
  let file = finding.file;
  if (/^[a-z][a-z0-9+.-]*:/i.test(file) && !/^[a-z]:[\\/]/i.test(file)) throw new Error(`Detector finding uses a non-local file: ${file}`);
  const resolvedFile = path.isAbsolute(file) ? path.resolve(file) : path.resolve(projectRoot, file);
  let physicalFile;
  try {
    physicalFile = fs.realpathSync(resolvedFile);
  } catch {
    throw new Error(`Detector finding file is unavailable: ${file}`);
  }
  if (!inside(projectRoot, physicalFile)) throw new Error(`Detector finding resolves outside the project root: ${file}`);
  if (!fs.statSync(physicalFile).isFile()) throw new Error(`Detector finding does not reference a regular file: ${file}`);
  const relativeFile = path.relative(projectRoot, physicalFile);
  file = relativeFile ? portablePath(relativeFile) : '.';
  return {
    ruleId: finding.antipattern,
    name: finding.name,
    severity: typeof finding.severity === 'string' && finding.severity ? finding.severity : 'warning',
    category: typeof finding.category === 'string' ? finding.category : null,
    advisory: finding.advisory === true,
    file,
    line: Number.isInteger(finding.line) && finding.line > 0 ? finding.line : null,
    snippet: finding.snippet,
    description: finding.description,
  };
}

function runtimeFailure(base, runtime) {
  const message = runtime.timedOut
    ? `Bundled detector timed out after ${DETECT_TIMEOUT_MS}ms.`
    : runtime.error || String(runtime.stderr || '').trim() || `Bundled detector exited with ${runtime.status}.`;
  return {
    exitCode: 1,
    envelope: {
      ...base,
      diagnostics: [diagnostic(runtime.timedOut ? 'detector-timeout' : 'detector-failed', message)],
    },
  };
}

export function runDetectorScan({
  projectRoot = process.cwd(),
  targets = [],
  pluginRoot,
  host,
  nodePath = process.execPath,
  timeout = DETECT_TIMEOUT_MS,
  runtime = runBundledImpeccable,
} = {}) {
  let resolvedHost;
  try {
    resolvedHost = resolveHost(host);
  } catch (error) {
    return blockedDetectionResult({ host, projectRoot, targets, pluginRoot, code: 'invalid-host', message: error.message });
  }

  let validated;
  try {
    validated = validateTargets(projectRoot, targets);
  } catch (error) {
    return blockedDetectionResult({
      host: resolvedHost,
      projectRoot,
      targets: [],
      pluginRoot,
      code: error.code || 'invalid-target',
      message: error.message,
      target: error.target,
    });
  }

  const relativeTargets = validated.targets.map((target) => target.relative);
  const base = envelopeBase({
    host: resolvedHost,
    projectRoot: validated.physicalRoot,
    targets: relativeTargets,
    pluginRoot,
  });
  const child = runtime({
    scriptId: 'detect',
    host: resolvedHost,
    pluginRoot,
    cwd: validated.physicalRoot,
    args: ['--json', ...validated.targets.map((target) => target.absolute)],
    timeout,
    nodePath,
  });

  if (!child.started || ![0, 2].includes(child.status)) return runtimeFailure(base, child);

  let rawFindings;
  try {
    rawFindings = JSON.parse(child.stdout);
    if (!Array.isArray(rawFindings)) throw new Error('Detector JSON must be an array.');
  } catch (error) {
    return {
      exitCode: 1,
      envelope: {
        ...base,
        diagnostics: [diagnostic('invalid-detector-json', error.message)],
      },
    };
  }

  let findings;
  try {
    findings = rawFindings.map((finding) => normalizeFinding(finding, validated.physicalRoot));
  } catch (error) {
    return {
      exitCode: 1,
      envelope: {
        ...base,
        diagnostics: [diagnostic('invalid-detector-finding', error.message)],
      },
    };
  }

  const advisory = findings.filter((finding) => finding.advisory).length;
  const primary = findings.length - advisory;
  const expectedExitCode = primary > 0 ? 2 : 0;
  if (child.status !== expectedExitCode) {
    return {
      exitCode: 1,
      envelope: {
        ...base,
        diagnostics: [diagnostic(
          'detector-exit-mismatch',
          `Detector exit ${child.status} contradicts ${primary} primary finding${primary === 1 ? '' : 's'}.`,
        )],
      },
    };
  }

  const detectorStderr = String(child.stderr || '').trim();
  const diagnostics = detectorStderr
    ? [diagnostic('detector-stderr', detectorStderr)]
    : [];
  return {
    exitCode: expectedExitCode,
    envelope: {
      ...base,
      status: primary > 0 ? 'findings' : advisory > 0 ? 'advisory-only' : 'no-findings',
      counts: { primary, advisory, total: findings.length },
      findings,
      diagnostics,
    },
  };
}
