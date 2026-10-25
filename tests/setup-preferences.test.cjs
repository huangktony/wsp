const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { MeBody } = require('../lib/comfort.ts');
function fixture(ready) {
  const writes = [];
  const exports = {};
  const mocks = {
    '@/lib/db': {
      q1: async sql => { if (sql.includes('information_schema')) return { ready }; return { availability: ['2000-01-01 evening'] }; },
      q: async (sql, args) => { writes.push({ sql, args }); return []; },
    },
    '@/lib/api': { requireUser: async () => 42, isMember: async () => true, json: v => v, fail: (error, status = 400) => ({ error, status }) },
    '@/lib/comfort': { MeBody },
    '@/lib/availability': require('../lib/availability.ts'),
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/groups/[id]/me/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require(name) { assert.ok(name in mocks, name); return mocks[name]; } });
  return { writes, read: () => exports.GET({}, { params: Promise.resolve({ id: '7' }) }), save: body => exports.PUT({ json: async () => body }, { params: Promise.resolve({ id: '7' }) }) };
}
const body = { availability: ['Sat evening'], interests: ['creative'], max_distance_mi: 5, comfort_tier: '$', preferences: { interests_text: 'art\u0000music', avoids_text: 'crowds', travel: true, trip_budget: 250, trip_length: 'weekend' } };
test('setup saves only authenticated membership preferences and keeps existing fields', async () => {
  const f = fixture(true);
  const result = await f.save({ ...body, user_id: 999 });
  assert.equal(result.ok, true); assert.equal(result.preferencesSaved, true);
  const saved = f.writes.find(w => w.sql.startsWith('update memberships set preferences'));
  assert.deepEqual(Array.from(saved.args.slice(1)), [7, 42]);
  assert.equal(JSON.parse(saved.args[0]).interests_text, 'art music');
  assert.ok(!('travel' in JSON.parse(saved.args[0])), 'retired travel preferences are ignored');
  assert.match(saved.sql, /coalesce\(preferences,'\{\}'::jsonb\) \|\|/, 'merge preserves existing unknown JSON keys in storage');
  assert.ok(f.writes.some(w => w.sql.startsWith('update users set interests')));
  assert.ok(f.writes.some(w => w.sql.startsWith('update memberships set availability')));
});
test('missing optional column saves original setup without issuing SQL against that column', async () => {
  const f = fixture(false);
  const result = await f.save(body);
  assert.equal(result.ok, true); assert.equal(result.preferencesSaved, false);
  assert.ok(f.writes.length);
  assert.ok(f.writes.every(w => !w.sql.includes('preferences')));
});
test('new fields remain optional; missing time or overlong preference rejects before writes', async () => {
  const f = fixture(true);
  assert.equal((await f.save({ ...body, preferences: undefined })).ok, true);
  const before = f.writes.length;
  assert.equal((await f.save({ ...body, availability: [] })).status, 400);
  assert.equal((await f.save({ ...body, preferences: { interests_text: 'x'.repeat(2001) } })).status, 400);
  assert.equal(f.writes.length, before);
});

test('expired setup loads empty with a renewal message flag and performs no writes', async () => {
  const f=fixture(true); const result=await f.read();
  assert.equal(result.availability.length,0);
  assert.equal(result.availability_expired,true);
  assert.equal(f.writes.length,0);
});
