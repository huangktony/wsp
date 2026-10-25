const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require(name) { if (name in mocks) return mocks[name]; throw Error(`Unmocked import: ${name}`); } });
  return exports;
}
const stories = load('lib/groupStories.ts');
const voting = { id: 1, name: 'Austin Squad', round_status: 'voting', has_plans: true, can_vote: true, my_voted: false };
test('only latest voting rounds with plans are pinned, without duplicates, ordered newest first', () => {
  const input = [voting, { ...voting, id: 2, round_started_at: '2026-10-25' }, { ...voting, id: 3, round_status: 'final', last_activity_at: '2026-10-26' }, { ...voting, id: 4, has_plans: false }];
  const { open, other } = stories.splitGroupStories(input);
  assert.deepEqual(Array.from(open, g => g.id), [2, 1]);
  assert.deepEqual(Array.from(other, g => g.id), [3, 4]);
  assert.equal(new Set([...open, ...other].map(g => g.id)).size, input.length);
  assert.deepEqual(input.map(g => g.id), [1, 2, 3, 4], 'does not mutate API results');
});
test('final, vetoed and generating groups return to the activity-sorted list', () => {
  const { open, other } = stories.splitGroupStories(['final', 'vetoed', 'generating'].map((round_status, i) => ({ ...voting, id: i + 1, round_status, last_activity_at: `2026-10-${20 + i}` })));
  assert.equal(open.length, 0);
  assert.deepEqual(Array.from(other, g => g.id), [3, 2, 1]);
  assert.equal(stories.splitGroupStories([]).open.length, 0);
});
test('story colors are stable across filtering and sorting and cycle through three colors', () => {
  const color = stories.groupStoryColor(7);
  const reordered = stories.splitGroupStories([{ ...voting, id: 10 }, { ...voting, id: 7 }]).open;
  assert.equal(stories.groupStoryColor(reordered.find(g => g.id === 7).id), color);
  assert.equal(stories.groupStoryColor(10), color);
  assert.equal(new Set([1, 2, 3].map(stories.groupStoryColor)).size, 3);
});
test('badge requires an open vote, eligibility and no saved vote; labels explain each state', () => {
  assert.equal(stories.needsVoteBadge(voting), true);
  for (const change of [{ my_voted: true }, { can_vote: false }, { can_vote: undefined }, { has_plans: false }, { round_status: 'final' }]) {
    assert.equal(stories.needsVoteBadge({ ...voting, ...change }), false);
  }
  assert.equal(stories.groupStoryLabel(voting), "Austin Squad, voting open, you haven't voted");
  assert.equal(stories.groupStoryLabel({ ...voting, my_voted: true }), "Austin Squad, voting open, you've voted");
  assert.equal(stories.groupStoryLabel({ ...voting, can_vote: false }), "Austin Squad, voting open, you can't vote yet");
});
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
