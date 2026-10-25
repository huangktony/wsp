// No real DB, network, or environment credentials: real modules with injected boundaries.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
function load(file, mocks, globals = {}) {
  const exports = {};
  const pure = new Set(['./serpapi', './price', './slot', './setupPreferences']);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, console: { error() {} }, AbortSignal, process: { env: { GEMINI_API_KEY: 'fake-test-key', USE_MOCKS: 'false' } }, ...globals,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === './availability' || name === '@/lib/availability') return require('../lib/availability.ts');
      if (name === '@/components/TimeNotice') return { TimeNotice: 'time-notice' };
      if (name === 'zod') return require('zod');
      if (pure.has(name)) return require(path.resolve(path.dirname(file), `${name}.ts`));
      throw Error(`Unmocked import ${name}`);
    },
  });
  return exports;
}
function fixture(ready = true) {
  const state = new Map(); let writes = 0;
  const db = {
    q1: async (sql, a) => {
      if (sql.includes('information_schema')) return { ready };
      if (sql.startsWith('select to_jsonb')) return { state: state.get(a[0]) };
      assert.match(sql, /and not .*\? \$2::text/);
      const current = state.get(a[0]) ?? {};
      if (current[a[1]]) return null;
      current[a[1]] = { status: 'started' }; state.set(a[0], current); writes++;
      return { id: a[0] };
    },
    q: async (_, a) => { state.get(a[0])[a[1]] = JSON.parse(a[2]); writes++; return []; },
  };
  return { cache: load('lib/geminiCache.ts', { './db': db }), state, writes: () => writes };
}
test('atomic round/kind claims permit one concurrent attempt and survive failed generation', async () => {
  const f = fixture();
  assert.deepEqual(await Promise.all([f.cache.claimGeneration(1, 'hangout'), f.cache.claimGeneration(1, 'hangout')]), [true, false]);
  assert.equal(await f.cache.claimGeneration(2, 'hangout'), true);
  assert.equal(await f.cache.claimGeneration(1, 'hangout'), false);
  await f.cache.saveGeneration(1, 'hangout', []);
  assert.equal(await f.cache.claimGeneration(1, 'hangout'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(await f.cache.readGeneration(1, 'hangout'))), []);
  const missing = fixture(false);
  assert.equal(await missing.cache.claimGeneration(1, 'hangout'), false);
  assert.equal(missing.writes(), 0);
});
test('hangout calls Gemini only once per persisted round; missing migration uses old builder', async () => {
  const f = fixture(); let calls = 0;
  const input = { roundId: 10, city: 'Austin, TX', slot: 'Sat afternoon', tier: '$', interests: ['art'], places: [
    { name: 'Park', category: 'outdoors', price: '$', cost: 0 }, { name: 'Cafe', category: 'food', price: '$', cost: 12 }, { name: 'Gallery', category: 'art', price: '$', cost: 10 },
  ] };
  const fetch = async () => { calls++; return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ plans: input.places.map((p, i) => ({ title: p.name, stops: [{ candidate_id: `c${i + 1}` }], why_fits: 'Art interests fit.', est_cost_per_person: p.cost })) }) }] } }] }) }; };
  const gemini = load('lib/gemini.ts', { './geminiCache': f.cache }, { fetch });
  const first = await gemini.generatePlans(input);
  const second = await gemini.generatePlans(input);
  assert.equal(first.length, 3); assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.equal(calls, 1);
  const unavailable = load('lib/gemini.ts', { './geminiCache': fixture(false).cache }, { fetch });
  const fallback = await unavailable.generatePlans(input);
  assert.ok(fallback.length); assert.ok(fallback.every(p => !p.generated_by)); assert.equal(calls, 1);
});
