import test from 'node:test';
import assert from 'node:assert/strict';
import { hostInvocation, resolveHost } from '../src/host.mjs';

const originalHost = process.env.IMPECCABLE_HOST;
process.env.IMPECCABLE_HOST = 'codex';
const { resolveImpeccableProvider } = await import('../skills/impeccable/scripts/lib/provider.mjs');
if (originalHost === undefined) delete process.env.IMPECCABLE_HOST;
else process.env.IMPECCABLE_HOST = originalHost;

test('host resolution is explicit or comes from documented plugin adapter variables', () => {
  assert.equal(resolveHost('cursor', {}), 'cursor');
  assert.equal(resolveHost('codex', {}), 'codex');
  assert.equal(resolveHost('agent-plugin', {}), 'agent-plugin');
  assert.equal(resolveHost(null, { IMPECCABLE_HOST: 'codex', CURSOR_PLUGIN_ROOT: '/plugin' }), 'codex');
  assert.equal(resolveHost(null, { CURSOR_PLUGIN_ROOT: '/plugin' }), 'cursor');
  assert.equal(resolveHost(null, { PLUGIN_ROOT: '/plugin' }), 'codex');
  assert.throws(() => resolveHost(null, {}), /host is unknown/i);
  assert.throws(() => resolveHost('other', {}), /unsupported plugin host/i);
});

test('host invocations and Impeccable provider prefixes stay target-correct', () => {
  assert.equal(hostInvocation('cursor', 'design'), '/design');
  assert.equal(hostInvocation('codex', 'design'), '$design');
  assert.equal(hostInvocation('agent-plugin', 'design'), 'design');
  assert.equal(resolveImpeccableProvider({ IMPECCABLE_HOST: 'cursor' }), 'cursor');
  assert.equal(resolveImpeccableProvider({ IMPECCABLE_HOST: 'codex' }), 'codex');
  assert.equal(resolveImpeccableProvider({ IMPECCABLE_HOST: 'agent-plugin' }), 'agent-plugin');
  assert.equal(resolveImpeccableProvider({ CURSOR_PLUGIN_ROOT: '/plugin' }), 'cursor');
  assert.equal(resolveImpeccableProvider({ PLUGIN_ROOT: '/plugin' }), 'codex');
  assert.throws(() => resolveImpeccableProvider({}), /host is unknown/i);
  assert.throws(() => resolveImpeccableProvider({ IMPECCABLE_HOST: 'other' }), /unsupported IMPECCABLE_HOST/i);
});
