import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, routeRequest } from '../src/registry.mjs';

const modules = loadModules();

test('general website and web-app work routes to Impeccable', () => {
  const website = routeRequest('/design Improve this website navigation', modules);
  const app = routeRequest('$design Design a web app dashboard', modules);
  assert.equal(website.kind, 'route');
  assert.equal(website.skill, 'impeccable');
  assert.equal(app.skill, 'impeccable');
});

test('explicit Cursor and Codex Impeccable invocations bypass the wrapper', () => {
  assert.deepEqual(routeRequest('/impeccable audit src', modules), {
    kind: 'direct',
    skill: 'impeccable',
    reason: 'Explicit Impeccable invocation bypasses the wrapper.',
  });
  assert.equal(routeRequest('$impeccable audit src', modules).kind, 'direct');
});

test('a narrower module wins over the Impeccable fallback', () => {
  const narrow = {
    schemaVersion: 1,
    id: 'checkout-specialist',
    version: '1.0.0',
    license: 'MIT',
    source: { type: 'first-party', url: 'https://example.test' },
    capabilities: [{
      id: 'checkout-flow', title: 'Checkout flow', skill: 'checkout-design', specificity: 80,
      triggers: ['checkout'], scope: ['web-app'], fallback: false, combinableWith: [],
    }],
    contributes: { skills: [], agents: [], rules: [], hooks: [], scripts: [], mcpServers: [] },
  };
  const result = routeRequest('/design Improve our checkout', [...modules, narrow]);
  assert.equal(result.kind, 'route');
  assert.equal(result.skill, 'checkout-design');
});

test('equal narrow matches ask once instead of guessing', () => {
  const fixtures = ['alpha', 'beta'].map((id) => ({
    schemaVersion: 1, id, version: '1.0.0', license: 'MIT', source: { type: 'first-party', url: `https://${id}.example` },
    capabilities: [{ id: 'checkout', title: id, skill: `${id}-skill`, specificity: 80, triggers: ['checkout'], scope: ['web-app'], fallback: false, combinableWith: [] }],
    contributes: { skills: [], agents: [], rules: [], hooks: [], scripts: [], mcpServers: [] },
  }));
  const result = routeRequest('$design checkout', [...modules, ...fixtures]);
  assert.equal(result.kind, 'clarify');
  assert.equal(result.options.length, 2);
});
