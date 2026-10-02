import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';

const launcher = path.resolve(import.meta.dirname, '../src/impeccable-launcher.mjs');
const manifest = '.impeccable/review/components.json';

// Independently generated texture fixtures, with real PNG checksums and pixels.
function texture(size, shade = 0) {
  const chunk = (type, body) => {
    const data = Buffer.concat([Buffer.from(type), body]);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const head = Buffer.alloc(4), tail = Buffer.alloc(4);
    head.writeUInt32BE(body.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = y * (1 + size * 4) + 1 + x * 4;
    raw.set([40 + shade + (x + y) % 5, 95 + (x * 3 + y) % 7, 155 + (x + y * 2) % 9, 255], offset);
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design plan review '));
  const cwd = path.join(root, 'project'), home = path.join(root, 'home');
  fs.mkdirSync(path.join(cwd, 'assets/plates'), { recursive: true }); fs.mkdirSync(home);
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, 'codex'), XDG_CONFIG_HOME: path.join(home, 'config'), XDG_CACHE_HOME: path.join(home, 'cache'), XDG_DATA_HOME: path.join(home, 'data'), IMPECCABLE_HOST: 'codex', IMPECCABLE_NO_UPDATE_CHECK: '1', IMPECCABLE_QUESTION_FORCE: '1' };
  delete env.PLUGIN_ROOT; delete env.CURSOR_PLUGIN_ROOT; delete env.IMPECCABLE_COMPONENT_REVIEW_TOOL; delete env.IMPECCABLE_COMPONENT_REVIEW_SESSIONS; delete env.IMPECCABLE_QUESTION_DISABLED;
  const servers = new Set();
  t.after(async () => {
    for (const server of servers) { server.child.kill('SIGTERM'); await server.closed; }
    fs.rmSync(root, { recursive: true, force: true });
    assert.equal(fs.existsSync(root), false);
  });
  const run = (args, extra = {}) => spawnSync(process.execPath, [launcher, ...args], { cwd, env: { ...env, ...extra }, encoding: 'utf8', timeout: 10000 });
  const pass = (...args) => { const result = run(args); assert.equal(result.status, 0, result.stderr || result.stdout); return result.stdout; };
  fs.writeFileSync(path.join(cwd, 'comp.png'), texture(32));
  const plate = path.join(cwd, 'assets/plates/ground.png'); fs.writeFileSync(plate, texture(64, 1));
  let regions = { regions: [
    { id: 'ground', kind: 'texture', note: 'Fine blue textured background', box: { x: 0, y: 0, w: 1, h: 1 }, bleed: true },
    { id: 'frame', kind: 'chrome', note: 'Simple rectangular frame drawn in CSS', box: { x: 0.25, y: 0.25, w: 0.25, h: 0.25 }, codeDrawn: true },
  ] };
  const measure = () => { fs.writeFileSync(path.join(cwd, 'regions.json'), JSON.stringify(regions)); pass('comp-spec', '--comp', 'comp.png', '--regions', 'regions.json'); };
  pass('build-phase', 'start', '--comp', 'comp.png', '--artifact', 'index.html');
  measure();
  pass('build-phase', 'advance');
  pass('component-review', 'plan');
  const packet = JSON.parse(fs.readFileSync(path.join(cwd, manifest), 'utf8'));
  assert.equal(packet.schemaVersion, 3);
  assert.equal(packet.stage, 'components');
  assert.ok(packet.components.some(c => c.preview.kind === 'comp-crop'));
  assert.ok(packet.components.some(c => c.preview.kind === 'image'));
  const capture = () => JSON.parse(pass('component-review', 'capture', '--manifest', manifest));
  const captured = capture();
  assert.ok(captured.capture.components.some(c => c.views.preview.kind === 'comp-crop'));
  assert.ok(captured.capture.components.some(c => c.views.preview.kind === 'raster-source'));

  const serve = async (idle = 10) => {
    const child = spawn(process.execPath, [launcher, 'component-review', 'serve', '--session', captured.session, '--idle-timeout', String(idle)], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const server = { child, closed: new Promise((resolve, reject) => { child.once('close', (code, signal) => resolve({ code, signal })); child.once('error', reject); }) };
    servers.add(server);
    let stdout = '', stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`review readiness timed out: ${stderr}`)), 8000);
      child.stdout.on('data', chunk => {
        stdout += chunk;
        const line = stdout.match(/COMPONENT REVIEW: (\{[^\n]+\})/);
        if (line) { clearTimeout(timer); resolve(JSON.parse(line[1]).url); }
      });
      server.closed.then(() => { clearTimeout(timer); reject(new Error(`review closed before readiness: ${stdout} ${stderr}`)); });
    });
    server.url = url;
    server.closed.then(() => servers.delete(server));
    return server;
  };
  const decision = async (server, action = 'approve') => {
    const response = await fetch(new URL('packet', server.url)); assert.equal(response.status, 200);
    const { packet } = await response.json();
    const submission = { schemaVersion: 1, requestId: packet.id, packetRevision: packet.revision,
      decisions: Object.fromEntries(packet.components.map(c => [c.id, { revision: c.revision, action, feedback: action === 'revise' ? 'Please revise this fixture asset.' : '', split: false }])), missing: [], inventoryConfirmed: true };
    const submitted = await fetch(new URL('decision', server.url), { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(server.url).origin, 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify(submission) });
    assert.equal(submitted.status, 200, await submitted.clone().text());
    return submitted.json();
  };
  const blocked = () => {
    const verified = run(['component-review', 'verify', '--manifest', manifest]);
    assert.equal(verified.status, 1, verified.stdout);
    const gate = run(['build-phase', 'advance']);
    assert.equal(gate.status, 2, gate.stderr || gate.stdout);
    assert.match(gate.stdout, /plan and asset review|review.*(?:accepted|spec)/i);
    assert.equal(JSON.parse(pass('build-phase', 'status', '--json')).phase, 'plates');
    assert.equal(fs.existsSync(path.join(cwd, 'index.html')), false);
    return verified.stderr;
  };
  return { cwd, plate, run, pass, capture, captured, serve, decision, blocked, measure,
    reviseSpec() { regions.regions[1].note = 'Revised simple frame drawn in CSS'; measure(); } };
}

test('native plan review gates pending, changes requested and current approval', { timeout: 40000 }, async (t) => {
  const f = fixture(t);
  assert.match(f.blocked(), /pending|needs work/);
  const first = await f.serve();
  const revised = await f.decision(first, 'revise');
  assert.equal(revised.visualDecision, 'changes-requested');
  assert.equal((await first.closed).code, 0);
  f.blocked();
  f.reviseSpec(); f.pass('component-review', 'plan'); f.capture();
  const second = await f.serve();
  const approved = await f.decision(second);
  assert.equal(approved.visualDecision, 'approved');
  assert.equal(approved.captureVerified, true);
  assert.equal((await second.closed).code, 0);
  assert.equal(JSON.parse(f.pass('component-review', 'verify', '--manifest', manifest)).visualDecision, 'approved');
  f.pass('build-phase', 'advance');
  assert.equal(JSON.parse(f.pass('build-phase', 'status', '--json')).phase, 'hero');
});

test('changed spec and replaced plates invalidate accepted plan review', { timeout: 40000 }, async (t) => {
  const f = fixture(t);
  const first = await f.serve(); await f.decision(first); await first.closed;
  f.reviseSpec();
  assert.match(f.blocked(), /changed|stale|current/);
  f.pass('component-review', 'plan'); f.capture();
  const second = await f.serve(); await f.decision(second); await second.closed;
  fs.writeFileSync(f.plate, texture(64, 2));
  assert.match(f.blocked(), /changed|stale|current/);
});

test('browserless and idle review exits remain pending and keep the build gate closed', { timeout: 15000 }, async (t) => {
  const f = fixture(t);
  const browserless = f.run(['component-review', 'serve', '--session', f.captured.session], { IMPECCABLE_QUESTION_DISABLED: '1' });
  assert.equal(browserless.status, 2, browserless.stderr);
  assert.match(browserless.stdout, /pending/);
  f.blocked();
  const server = await f.serve(1);
  assert.equal((await server.closed).code, 4);
  const status = JSON.parse(f.pass('component-review', 'status', '--session', f.captured.session));
  assert.equal(status.receipt, null);
  assert.equal(status.service, null);
  f.blocked();
});
