import fs from 'node:fs';
import path from 'node:path';
import { runBundledImpeccable } from './impeccable-runtime.mjs';

// The engine owns app selection and context inheritance. Keep its diagnostics
// behind the bundled, read-only doctor projection, never a second resolver.
export function readProjectContext({ projectRoot, pluginRoot, host, target, runtime = runBundledImpeccable, env = process.env }) {
  try {
    const result = runtime({ pluginRoot, cwd: projectRoot, host, command: 'doctor', args: target ? ['--target', target] : [], timeout: 10000, env });
    if (!result.started || result.status !== 0 || result.error) throw new Error(result.error || result.stderr || 'Bundled context diagnosis did not complete.');
    const report = JSON.parse(result.stdout);
    if (!path.isAbsolute(report.projectRoot || '') || !path.isAbsolute(report.repoRoot || '')
        || !Array.isArray(report.workspaces) || !Array.isArray(report.findings)) throw new Error('Unknown project diagnosis format.');
    const root = fs.realpathSync(report.projectRoot);
    const repo = fs.realpathSync(report.repoRoot);
    const inside = file => { const relative = path.relative(repo, file); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
    if (!inside(root) || !fs.statSync(root).isDirectory()) throw new Error('Project diagnosis escapes its repository.');
    const context = {};
    for (const [name, key] of [['product', 'productPath'], ['design', 'designPath']]) {
      const value = report[key];
      if (value !== null && (typeof value !== 'string' || !value)) throw new Error(`Unknown ${key} in project diagnosis.`);
      const file = value === null ? null : fs.realpathSync(path.resolve(projectRoot, value));
      if (file && (!inside(file) || !fs.statSync(file).isFile())) throw new Error(`Invalid resolved ${key}.`);
      context[name] = { state: file ? 'present' : 'missing', path: file, inherited: !!file && path.dirname(file) !== root };
    }
    if (!report.findings.every(finding => typeof finding.id === 'string' && typeof (finding.summary ?? finding.message) === 'string' && typeof finding.severity === 'string')
        || !report.workspaces.every(app => typeof app.name === 'string' && typeof app.path === 'string' && !path.isAbsolute(app.path) && inside(path.resolve(repo, app.path)))) {
      throw new Error('Unknown project diagnosis findings or workspace inventory.');
    }
    return { status: 'available', projectRoot: root, repoRoot: repo, context, findings: report.findings,
      ruleRegistryAvailable: typeof report.ruleRegistryAvailable === 'boolean' ? report.ruleRegistryAvailable : null,
      selectionRequired: !target && root === repo && report.workspaces.length > 0, candidates: report.workspaces };
  } catch (error) {
    return { status: 'unavailable', error: error.message };
  }
}
