import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildPluginTargets, createTargetBuildWorkspace, removeTargetBuildWorkspace } from '../build-plugin-targets.mjs';
import { resolveEngine, enginePlatforms } from '../../src/impeccable-engine.mjs';

export function verifyCandidateRuntime(root, projection, destinations) {
  const scratch = mkdtempSync(join(tmpdir(), 'design-candidate-runtime-'));
  const build = createTargetBuildWorkspace();
  try {
    const source = join(scratch, 'source');
    cpSync(root, source, { recursive: true, filter: (file) => !['.git', '.build', 'node_modules', '.agents', '.cursor'].includes(relative(root, file).split(/[\\/]/)[0]) });
    for (const destination of destinations) {
      rmSync(join(source, destination), { recursive: true, force: true });
      cpSync(join(projection, destination), join(source, destination), { recursive: true });
    }
    const targets = buildPluginTargets(build.targets, source);
    const runtime = resolveEngine(source);
    for (const required of ['scripts/command-metadata.json', 'reference/hooks.md', 'reference/degraded/finish-reviewer.md']) readFileSync(join(source, 'skills/impeccable', required));
    for (const host of ['agent-plugin', 'cursor', 'codex']) {
      const target = targets[host].path;
      for (const platform of enginePlatforms) {
        const [os, arch] = platform.split('-');
        resolveEngine(target, { platform: os === 'windows' ? 'win32' : os, arch });
      }
      const project = join(scratch, `${host} project`);
      const home = join(scratch, `${host} home`);
      mkdirSync(project); mkdirSync(home);
      writeFileSync(join(project, 'Clean.jsx'), 'export default function Clean() { return <main>Hello</main>; }');
      const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: join(home, 'codex'), XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, IMPECCABLE_NO_UPDATE_CHECK: '1' };
      for (const name of ['IMPECCABLE_HOST', 'CURSOR_PLUGIN_ROOT', 'PLUGIN_ROOT', 'IMPECCABLE_STALENESS_CACHE']) delete env[name];
      if (host === 'cursor') env.CURSOR_PLUGIN_ROOT = target;
      if (host === 'codex') env.PLUGIN_ROOT = target;
      const run = (file, args, input) => {
        const nativeScript = !file.endsWith('.mjs');
        const executable = nativeScript ? (process.platform === 'win32' ? 'cmd.exe' : file) : process.execPath;
        const argv = nativeScript ? (process.platform === 'win32' ? ['/d', '/s', '/c', `"${[file, ...args].map(value => `"${value}"`).join(' ')}"`] : args) : [file, ...args];
        const result = spawnSync(executable, argv, { cwd: project, env, input, encoding: 'utf8', timeout: 10000, shell: false });
        if (result.error || result.status !== 0) throw new Error(`Candidate ${host} entrypoint failed (${args.join(' ')}): ${result.error?.message || result.stderr || result.status}`);
        return result.stdout;
      };
      const launcher = join(target, 'skills/impeccable/scripts', process.platform === 'win32' ? 'impeccable.cmd' : 'impeccable');
      if (run(launcher, ['engine-probe']).trim() !== `impeccable-engine ${runtime.engineVersion}`) throw new Error('Engine handshake differs from the skill pin.');
      const context = run(launcher, ['context']);
      if (!context.includes('RESOLVED_CONTEXT:') || !context.includes(`PLUGIN_HOOK_STATE: ${host}:`)) throw new Error('Candidate plugin context contract missing.');
      const doctor = JSON.parse(run(launcher, ['doctor']));
      if (!Array.isArray(doctor.findings) || doctor.pluginHook?.host !== host) throw new Error('Candidate plugin doctor contract missing.');
      const detect = JSON.parse(run(join(target, 'skills/design/scripts/design-cli.mjs'), ['--host', host, 'detect', '--json', '--', 'Clean.jsx']));
      if (detect.status !== 'no-findings' || detect.detector?.engineVersion !== runtime.engineVersion) throw new Error('Candidate Design detector contract missing.');
      if (host !== 'agent-plugin') {
        mkdirSync(join(project, '.impeccable'));
        writeFileSync(join(project, '.impeccable/config.json'), '{"hook":{"enabled":true}}');
        const content = '<style>.card { border-left: 4px solid #7c3aed; border-radius: 16px; }</style><div class="card">Hello</div>';
        writeFileSync(join(project, 'Card.html'), content);
        const event = { cwd: project, session_id: 'candidate', tool_name: 'Write', tool_input: { file_path: join(project, 'Card.html'), content } };
        const adapter = join(target, 'hooks', host === 'cursor' ? 'impeccable-plugin-hook.mjs' : 'impeccable-codex-hook.mjs');
        const post = JSON.parse(run(adapter, [], JSON.stringify({ ...event, hook_event_name: host === 'cursor' ? 'preToolUse' : 'PostToolUse' })));
        if (host === 'cursor' && (post.permission !== 'deny' || !post.user_message?.includes('side-tab'))) throw new Error('Candidate Cursor denial missing.');
        if (host === 'codex') {
          if (post.hookSpecificOutput?.hookEventName !== 'PostToolUse') throw new Error('Candidate Codex post-edit contract missing.');
          const stopEvent = JSON.stringify({ cwd: project, hook_event_name: 'Stop', session_id: 'candidate' });
          const stop = JSON.parse(run(adapter, [], stopEvent));
          if (stop.decision !== 'block' || !stop.reason?.includes('side-tab') || run(adapter, [], stopEvent).trim()) throw new Error('Candidate Codex Stop contract missing.');
        }
      }
    }
    return { engineVersion: runtime.engineVersion, platform: runtime.platform, targets: Object.keys(targets).filter((key) => key !== 'version') };
  } finally {
    removeTargetBuildWorkspace(build);
    rmSync(scratch, { recursive: true, force: true });
  }
}
