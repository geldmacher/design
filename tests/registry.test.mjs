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

test('explicit Design review requests use the first-party change review capability', () => {
  for (const request of ['/design review', '$design review full pr 482', '/design review working']) {
    const result = routeRequest(request, modules);
    assert.equal(result.kind, 'route');
    assert.equal(result.module, 'design-core');
    assert.equal(result.capability, 'change-interface-review');
    assert.equal(result.skill, 'design');
    assert.equal(result.specificity, 90);
  }
  assert.equal(routeRequest('/design critique this dashboard', modules).skill, 'impeccable');
  assert.equal(routeRequest('$design polish this dashboard using review finding 1', modules).skill, 'impeccable');
  assert.equal(routeRequest('/design improve the reviewed dashboard', modules).skill, 'impeccable');
});

test('only a leading explicit Design detect request uses the detector capability', () => {
  for (const request of ['/design detect -- src', '$design detect -- src/Card.tsx']) {
    const result = routeRequest(request, modules);
    assert.equal(result.kind, 'route');
    assert.equal(result.module, 'design-core');
    assert.equal(result.capability, 'detector-scan');
    assert.equal(result.skill, 'design');
    assert.equal(result.specificity, 100);
  }
  assert.equal(routeRequest('/design fix the detected issue', modules).skill, 'impeccable');
  assert.equal(routeRequest('$design improve detector output', modules).skill, 'impeccable');
});

test('only a leading explicit Design questionnaire request uses the stakeholder questionnaire capability', () => {
  for (const request of [
    '/design questionnaire checkout approval',
    '$design questionnaire onboarding research',
    'questionnaire pricing decision',
  ]) {
    const result = routeRequest(request, modules);
    assert.equal(result.kind, 'route');
    assert.equal(result.module, 'design-core');
    assert.equal(result.capability, 'stakeholder-questionnaire');
    assert.equal(result.skill, 'design');
    assert.equal(result.specificity, 100);
  }
  assert.equal(routeRequest('/design improve this questionnaire', modules).skill, 'impeccable');
  assert.equal(routeRequest('$design review the stakeholder questionnaire', modules).capability, 'change-interface-review');
  assert.equal(routeRequest('/design polish questionnaire layout', modules).skill, 'impeccable');
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
