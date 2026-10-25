const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, require(name) { if (name in mocks) return mocks[name];
      if (name === './availability' || name === '@/lib/availability') return require('../lib/availability.ts'); throw Error(`Unmocked import: ${name}`); },
  });
  return exports;
}
const finding = load('lib/finding.ts');
test('groupHref uses the existing final/voting rule for list and detail responses', () => {
  for (const [status, suffix] of [['final', '/final'], ['voting', '/plans'], ['generating', ''], ['vetoed', ''], ['failed', ''], ['confirmed', '']]) {
    assert.equal(finding.groupHref({ id: 5, round_status: status }), `/groups/5${suffix}`);
    assert.equal(finding.groupHref({ id: '5', round: { status } }), `/groups/5${suffix}`);
  }
  assert.equal(finding.groupHref({ id: 5 }), '/groups/5');
});
test('home redirect waits for data, only redirects final, and respects exact home=1 escape', () => {
  assert.equal(finding.groupHomeRedirect(null), null);
  assert.equal(finding.groupHomeRedirect(undefined), null);
  const group = { id: 5, round: { status: 'final' } };
  assert.equal(finding.groupHomeRedirect(group), '/groups/5/final');
  assert.equal(finding.groupHomeRedirect(group, '1'), null);
  assert.equal(finding.groupHomeRedirect(group, '0'), '/groups/5/final');
  assert.equal(finding.groupHomeRedirect({ ...group, round: { status: 'generating' } }), null);
  assert.equal(finding.groupHomeRedirect({ ...group, round: { status: 'voting' } }), null);
});
test('new-plan entry preserves redraw rules and never claims a final round directly', async () => {
  const calls = [], events = [];
  const group = { me: 1, members: [{ id: 1, setup_done: true }], finding: { round: { id: 10, status: 'final' }, planCount: 3 }, redraw: { locked: true } };
  const { runFinding } = load('lib/findingFlow.ts', { './finding': finding, './client': {} });
  const signal = { throwIfAborted() {} };
  await runFinding('5', signal, { update: () => events.push('update'), started: () => events.push('started'), ready: () => events.push('ready'), redraw: () => events.push('redraw') }, {
    api: async (url, method) => { calls.push(method); return group; }, wait() { throw Error('Must not wait'); }, now: () => 0,
  }, true);
  assert.deepEqual(calls, ['GET']);
  assert.deepEqual(events, ['update', 'redraw']);
});
