import fs from 'node:fs';
import path from 'node:path';
import { root, validatePin, prepare, prepareRemote, apply, check } from './motion-vendor.mjs';

export async function runMotionCommand(operation, args = process.argv.slice(2)) {
  const allowed = { check: ['json'], prepare: ['to', 'archive', 'sha256', 'source', 'json'], apply: ['candidate', 'json'], sync: ['archive', 'source', 'apply', 'replace', 'json'] }[operation];
  try {
    const options = {};
    for (let i = 0; i < args.length; i++) {
      const key = args[i].replace(/^--/, '');
      if (!args[i].startsWith('--') || !allowed?.includes(key) || Object.hasOwn(options, key)) throw new Error(`Unknown or repeated Motion argument: ${args[i]}`);
      if (['json', 'apply', 'replace'].includes(key)) options[key] = true;
      else { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing Motion value: ${key}`); options[key] = args[++i]; }
    }
    if (fs.realpathSync(process.cwd()) !== fs.realpathSync(root) || JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).name !== 'geldmacher-design') throw new Error('Run Motion maintenance from the Design source root.');
    let result;
    if (operation === 'check') result = await check();
    else if (operation === 'apply') result = apply({ id: options.candidate });
    else if (operation === 'prepare') {
      if ((options.source || options.sha256) && !options.archive) throw new Error('Local input options require --archive.');
      if (options.archive && !/^[a-f0-9]{64}$/.test(options.sha256 || '')) throw new Error('Local preparation requires --sha256.');
      result = options.archive ? prepare({ commit: options.to, archive: path.resolve(options.archive), source: options.source && path.resolve(options.source), expectedHash: options.sha256 }) : await prepareRemote({ commit: options.to });
    } else {
      if (!options.archive || (options.replace && !options.apply)) throw new Error('Sync requires --archive; --replace requires --apply.');
      const pin = validatePin(JSON.parse(fs.readFileSync(path.join(root, 'upstream/motion.pin.json'))));
      // Preview only stages ignored, reviewable content. Applying still uses the single candidate writer.
      result = prepare({ commit: pin.commit, archive: path.resolve(options.archive), source: options.source && path.resolve(options.source), expectedHash: pin.archive.sha256 });
      if (options.apply) {
        if (fs.existsSync(path.join(root, 'skills/motion')) && !options.replace) throw new Error('Existing Motion import requires reviewed --apply --replace.');
        result = apply({ id: result.id });
      }
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.state === 'unverifiable') process.exitCode = 2;
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
