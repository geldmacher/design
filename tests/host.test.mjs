import test from 'node:test';
import assert from 'node:assert/strict';
import { impeccableRuntimeEnvironment } from '../src/impeccable-runtime.mjs';
import { hostInvocation, resolveHost } from '../src/host.mjs';

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
  for (const host of ['cursor', 'codex', 'agent-plugin']) {
    assert.equal(impeccableRuntimeEnvironment(host, '/plugin', {}).IMPECCABLE_PROVIDER_ID, host);
  }
});
