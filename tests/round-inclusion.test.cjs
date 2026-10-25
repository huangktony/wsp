// Database-free: real helpers/handlers, injected query and network boundaries.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, process: { env: {} }, require(name) {
    if (name in mocks) return mocks[name];
    throw Error(`Unexpected import ${name}`);
  } });
  return exports;
}
const inclusion = load('lib/roundParticipation.ts');
const settings = load('lib/roundSettings.ts', { './tiers': load('lib/tiers.ts') });
const members = [
  { id: 1, name: 'Alex Smith', setup_done: true },
  { id: 2, name: 'Maya Jones', setup_done: false },
  { id: 3, name: 'Ravi Singh', setup_done: false },
];
const source = members.map(m => ({ user_id: m.id, availability: m.setup_done ? ['Sat evening'] : [], interests: ['coffee'], max_distance_mi: 5, comfort_tier: m.setup_done ? '$$' : '$' }));
const round = { status: 'voting', search_settings: settings.roundSettings(source) };

test('snapshot persists included IDs and total membership; unfinished budgets do not constrain the plans', () => {
  const saved = JSON.parse(JSON.stringify(round));
  assert.deepEqual(Array.from(inclusion.includedIds(saved)), [1]);
  assert.equal(inclusion.roundInclusion(saved, members, 1).totalAtStart, 3);
  assert.equal(settings.searchPreferences(source).tier, '$$');
  source[1].availability = ['Sun afternoon'];
  assert.deepEqual(Array.from(inclusion.includedIds(saved)), [1], 'later setup edits cannot change the snapshot');
  source[1].availability = [];
});

test('banners name one or two excluded members and summarize larger lists', () => {
  assert.equal(inclusion.roundInclusion(round, members, 1).banner, "Based on 1 of 3 setups. Maya and Ravi aren't included yet.");
  const two = { ...round, search_settings: round.search_settings.slice(0, 2) };
  assert.equal(inclusion.roundInclusion(two, members.slice(0, 2), 1).banner, "Based on 1 of 2 setups. Maya isn't included yet.");
  const more = [...members, { id: 4, name: 'Sam', setup_done: false }];
  const four = { ...round, search_settings: [...round.search_settings, { user_id: 4, included: false }] };
  assert.equal(inclusion.roundInclusion(four, more, 1).banner, "Based on 1 of 4 setups. 3 members aren't included yet.");
});

test('re-run requires a now-finished excluded member and never replaces a final round', () => {
  assert.equal(inclusion.roundInclusion(round, members, 1).canRerun, false);
  const finished = members.map(m => ({ ...m, setup_done: true }));
  assert.equal(inclusion.roundInclusion(round, finished, 2).canRerun, true);
  assert.equal(inclusion.roundInclusion(round, finished, 2).canVote, false);
  for (const status of ['final', 'confirmed', 'generating']) {
    assert.equal(inclusion.roundInclusion({ ...round, status }, finished, 2).canRerun, false);
  }
  const fresh = { ...round, search_settings: settings.roundSettings(source.map(m => ({ ...m, availability: ['Sat evening'] }))) };
  assert.equal(inclusion.roundInclusion(fresh, finished, 2).canVote, true);
  assert.equal(inclusion.roundInclusion(fresh, finished, 2).banner, null);
});

test('legacy snapshots and missing columns count everyone included', () => {
  for (const legacy of [{}, { search_settings: null }, { search_settings: source }]) {
    const result = inclusion.roundInclusion(legacy, members, 1);
    assert.deepEqual(Array.from(result.includedMemberIds), [1, 2, 3]);
    assert.equal(result.banner, null);
    assert.equal(result.canRerun, false);
    assert.equal(result.canVote, true);
  }
});

test('participation ignores excluded votes even if they exist in storage', async () => {
  const voting = load('lib/voting.ts', {
    './roundParticipation': inclusion,
    '@/lib/db': { q: async () => [{ user_id: 1, has_voted: true }, { user_id: 2, has_voted: true }, { user_id: 3, has_voted: false }] },
  });
  const result = await voting.getVotingParticipation(5, { ...round, id: 10 });
  assert.equal(result.voted, 1);
  assert.equal(result.memberCount, 1);
  assert.deepEqual(Array.from(result.votedMemberIds), [1]);
});

test('vote API refuses excluded and unfinished members before storing or settling', async () => {
  let user = 2, setup = true, writes = 0, settles = 0;
  const { POST } = load('app/api/plans/[id]/vote/route.ts', {
    '@/lib/roundParticipation': inclusion,
    '@/lib/api': { requireUser: async () => user, isMember: async () => true, setupDone: async () => setup, fail: (error, status) => ({ error, status }), json: value => value },
    '@/lib/db': { q1: async () => ({ ...round, round_id: 10, group_id: 5 }), q: async () => { writes++; } },
    '@/lib/pipeline': { settleRound: async () => { settles++; return 'voting'; } },
  });
  const vote = () => POST({ json: async () => ({ value: 'approve' }) }, { params: Promise.resolve({ id: '101' }) });
  assert.equal((await vote()).error, 'Make your setup to vote');
  user = 1; setup = false;
  assert.equal((await vote()).status, 409);
  assert.equal(writes, 0); assert.equal(settles, 0);
  setup = true;
  assert.equal((await vote()).ok, true);
  assert.equal(writes, 1); assert.equal(settles, 1);
});

test('round creation saves inclusion and re-running after setup creates a fresh round', async () => {
  let current = source.map(m => ({ ...m })), last, inserts = [], replaced = [];
  const queries = [];
  const query = async (sql, args) => {
    queries.push(sql);
    if (sql.startsWith('select city')) return { rows: [{ city: 'Houston, TX' }] };
    if (sql.includes('select m.user_id')) return { rows: current };
    if (sql.includes('information_schema')) return { rows: [{ count: 5 }] };
    if (sql.startsWith('select id,status')) return { rows: last ? [last] : [] };
    if (sql.startsWith('insert into plan_rounds')) {
      inserts.push(JSON.parse(args[7]));
      last = { id: inserts.length, status: 'voting', search_city: args[3], sample_places: false, search_settings: inserts.at(-1) };
      return { rows: [{ id: last.id }] };
    }
    if (sql.includes("status='replaced'")) replaced.push(args[0]);
    return { rows: [] };
  };
  const pipeline = load('lib/pipeline.ts', {
    './roundParticipation': inclusion, './roundSettings': settings, './finding': load('lib/finding.ts'),
    './db': { pool: { connect: async () => ({ query, release() {} }) } },
    './tier': {}, './serpapi': {}, './price': {}, './gemini': {}, './split': {},
  });
  await pipeline.startRound(5);
  assert.equal(inserts[0].length, 3);
  assert.deepEqual(inserts[0].map(m => [m.user_id, m.included]), [[1, true], [2, false], [3, false]]);
  current[1] = { ...current[1], availability: ['Sat evening'] };
  await pipeline.startRound(5);
  assert.deepEqual(inserts[1].map(m => m.included), [true, true, false]);
  assert.deepEqual(replaced, [1]);
  assert.equal(queries.some(sql => sql.includes('insert into votes')), false);
});

test('winner tallies and automatic closing apply the same inclusion predicate', async () => {
  const sqlSeen = [];
  const pipeline = load('lib/pipeline.ts', {
    './roundParticipation': inclusion, './roundSettings': settings, './finding': load('lib/finding.ts'),
    './db': {
      q1: async sql => {
        sqlSeen.push(sql);
        // One included voter, one plan, one vote: excluded members must not keep it open.
        assert.ok(sql.includes(inclusion.includedVoteSql()), 'member and ballot totals must be restricted');
        assert.equal(sql.split(inclusion.includedVoteSql()).length - 1, 2);
        return { id: 10, status: 'voting', group_id: 5, expired: false, plans: 1, members: 1, votes: 1 };
      },
      q: async sql => {
        sqlSeen.push(sql);
        if (sql.includes('left join votes')) {
          assert.ok(sql.includes(inclusion.includedVoteSql('r', 'v.user_id')));
          return [{ id: 101, cost: 10, approves: 1, vetoes: 0 }];
        }
        return [];
      },
    },
    './tier': {}, './serpapi': {}, './price': {}, './gemini': {}, './split': {},
  });
  assert.equal(await pipeline.settleRound(10), 'final');
  assert.ok(sqlSeen.some(sql => sql.includes("status='final'")));
});
