const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, ...globals, require(name) { if (name in mocks) return mocks[name];
      if (name === './availability' || name === '@/lib/availability') return require('../lib/availability.ts'); throw Error(`Unmocked import: ${name}`); } });
  return exports;
}
const voting = { id: 1, name: 'Austin Squad', round_status: 'voting', has_plans: true, can_vote: true, my_voted: false };
test('list reads are member-scoped; eligibility uses the saved inclusion predicate after settlement', async () => {
  const participation = load('lib/roundParticipation.ts');
  let calls = 0;
  const { GET } = load('app/api/groups/route.ts', {
    '@/lib/roundParticipation': participation,
    '@/lib/pipeline': { settleRound: async () => { throw Error('No voting candidates in this fixture'); } },
    zod: require('zod'), '@/lib/inviteCode': {}, '@/lib/serpapi': {}, '@/lib/usCities': {},
    '@/lib/api': { requireUser: async () => 42, json: data => data },
    '@/lib/db': { q: async (sql, args) => {
      calls++;
      assert.equal(args[0], 42);
      if (!sql.includes('left join lateral')) {
        assert.match(sql, /where m.user_id=\$1/);
        return [];
      }
      assert.match(sql, /where mm.user_id=\$1/);
      assert.match(sql, /order by \(status='final'\) desc,id desc limit 1/);
      assert.ok(sql.includes(participation.includedVoteSql('r', 'mm.user_id')));
      assert.doesNotMatch(sql, /\b(insert|update|delete)\b/i);
      return [{ ...voting }, { ...voting, id: 2, has_plans: false }];
    } },
  });
  const rows = await GET();
  assert.equal(calls, 2);
  assert.equal(rows[0].status, 'VOTING OPEN');
  assert.equal(rows[1].status, 'SET UP');
});


test('a settlement failure logs its group and does not prevent other groups from loading', async () => {
  const attempted = [], logged = [];
  const failure = new Error('settlement unavailable');
  let reads = 0;
  const { GET } = load('app/api/groups/route.ts', {
    '@/lib/roundParticipation': load('lib/roundParticipation.ts'),
    '@/lib/pipeline': { settleRound: async id => { attempted.push(id); if (id === 10) throw failure; } },
    zod: require('zod'), '@/lib/inviteCode': {}, '@/lib/serpapi': {}, '@/lib/usCities': {},
    '@/lib/api': { requireUser: async () => 42, json: data => data },
    '@/lib/db': { q: async () => ++reads === 1
      ? [{ id: 10, group_id: 1 }, { id: 20, group_id: 2 }]
      : [voting, { ...voting, id: 2, round_status: 'final' }] },
  }, { console: { error: (...args) => logged.push(args) } });
  const rows = await GET();
  assert.deepEqual(attempted, [10, 20]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].status, 'FINAL');
  assert.equal(logged.length, 1);
  assert.match(logged[0][0], /round 10 for group 1/);
  assert.equal(logged[0][1], failure);
});
