import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { enginePlatforms, engineFile, engineRelativePath, validateEngine } from '../../src/impeccable-engine.mjs';
import { sha256Bytes } from './impeccable-maintenance.mjs';

// Only the explicit candidate preparer calls this network boundary.
export async function prepareEngine({ version, repository, directory, fetchImpl, headers }) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Unknown upstream engine VERSION.');
  const tag = `engine-v${version}`;
  const response = await fetchImpl(`https://api.github.com/repos/pbakaus/impeccable/releases/tags/${tag}`, { headers });
  if (!response.ok) throw new Error(`Engine release lookup failed: ${response.status}`);
  const release = await response.json();
  if (release.draft || release.prerelease || release.tag_name !== tag) throw new Error('Engine release is not stable.');
  execFileSync('git', ['-C', repository, 'fetch', '--quiet', '--depth=1', 'origin', `refs/tags/${tag}:refs/tags/${tag}`]);
  const git = (ref) => execFileSync('git', ['-C', repository, 'rev-parse', ref], { encoding: 'utf8' }).trim();
  const engine = { version, tag, tagObject: git(tag), commit: git(`${tag}^{commit}`), releaseId: release.id, assets: {} };
  for (const platform of enginePlatforms) {
    const name = engineFile(platform);
    const url = `https://github.com/pbakaus/impeccable/releases/download/${tag}/${name}`;
    const asset = release.assets?.find((item) => item.name === name);
    const checksum = release.assets?.find((item) => item.name === `${name}.sha256`);
    if (asset?.browser_download_url !== url || checksum?.browser_download_url !== `${url}.sha256`
      || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) throw new Error(`Missing verified engine asset: ${platform}`);
    const downloadHeaders = { 'User-Agent': headers['User-Agent'] };
    const sumResponse = await fetchImpl(checksum.browser_download_url, { headers: downloadHeaders });
    if (!sumResponse.ok) throw new Error(`Engine checksum download failed: ${platform}`);
    const sum = (await sumResponse.text()).trim().split(/\s+/);
    if (!/^[a-f0-9]{64}$/.test(sum[0]) || (sum.length > 1 && sum[1].replace(/^\*/, '') !== name)
      || sum[0] !== asset.digest.slice(7)) throw new Error(`Engine checksum provenance conflict: ${platform}`);
    const binaryResponse = await fetchImpl(url, { headers: downloadHeaders });
    if (!binaryResponse.ok) throw new Error(`Engine download failed: ${platform}`);
    const bytes = Buffer.from(await binaryResponse.arrayBuffer());
    if (bytes.length !== asset.size || sha256Bytes(bytes) !== sum[0]) throw new Error(`Engine asset bytes differ: ${platform}`);
    const destination = join(directory, engineRelativePath(platform));
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes, { mode: 0o755 });
    engine.assets[platform] = { id: asset.id, url, sha256: sum[0], size: bytes.length };
  }
  return validateEngine(engine);
}
