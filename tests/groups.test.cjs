// Delete/leave group. Handlers run against an in-memory store that mimics the SQL's effects
// (no live database), so this checks permissions and outcomes, not the SQL text itself.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, ...globals, require(name) {
    if (name in mocks) return mocks[name];
      if (name === './availability' || name === '@/lib/availability') return require('../lib/availability.ts');
    if (name === '@/lib/roundParticipation') return load('lib/roundParticipation.ts', {});
    throw Error(`Unmocked import: ${name}`);
  } }, { filename: file });
  return exports;
}
const ctx = { params: Promise.resolve({ id: '5' }) };
function fixture(memberIds = [1, 2, 3]) {
  let user = 1;
  const s = { groups: new Map([[5, { created_by: 1, invite_code: 'ABC' }]]), members: new Set(memberIds), votes: [], skips: [], rounds: [10] };
  s.votes.push(...memberIds.map(u => ({ user_id: u, plan_id: 101 })));
  s.skips.push(...memberIds.map(u => ({ user_id: u, round_id: 10 })));
  const db = {
    q: async (sql, a) => {
      if (sql.startsWith('select user_id from memberships')) return [...s.members].filter(u => u !== a[1]).map(user_id => ({ user_id }));
      throw Error(`Unexpected query: ${sql}`);
    },
    q1: async (sql, a) => {
      if (sql.startsWith('select coalesce(sum(p.amount)')) return { owed: 0 };
      if (sql.startsWith('select created_by from groups')) return s.groups.get(a[0]) ?? null;
      if (sql.startsWith('select 1 from memberships')) return s.members.has(a[1]) ? { one: 1 } : null;
      if (sql.startsWith('delete from groups')) {
        const g = s.groups.get(a[0]);
        if (!g || g.created_by !== a[1]) return null;
        s.groups.delete(a[0]); s.members.clear(); s.votes.length = 0; s.skips.length = 0; s.rounds.length = 0;
        return { id: a[0] };
      }
      if (sql.startsWith('with xfer')) {
        const [gid, uid, newOwner, owner] = a, g = s.groups.get(gid);
        const xfer = owner && g.created_by === uid && s.members.has(newOwner);
        if (xfer) g.created_by = newOwner;
        const gone = s.members.has(uid) && (xfer || (!owner && g.created_by !== uid));
        if (!gone) return null;
        s.members.delete(uid);
        s.votes = s.votes.filter(v => v.user_id !== uid);
        s.skips = s.skips.filter(k => k.user_id !== uid);
        return { user_id: uid };
      }
      throw Error(`Unexpected query: ${sql}`);
    },
  };
  const api = { requireUser: async () => user, json: (body, status = 200) => ({ body, status }), fail: (error, status = 400) => ({ body: { error }, status }) };
  const mocks = { '@/lib/db': db, '@/lib/api': api, zod: require('zod') };
  mocks['@/lib/payments'] = load('lib/payments.ts', { ...mocks, '@/lib/nessie': {} });
  mocks['@/lib/groups'] = load('lib/groups.ts', mocks);
  mocks['@/lib/voting'] = { getVotingParticipation: async () => ({ votedMemberIds: [], voted: 0, memberCount: s.members.size, roundOpen: false }) };
  mocks['@/lib/findingData'] = { getFindingDetails: async () => null };
  mocks['@/lib/tier'] = { groupTier: async () => null };
  mocks['@/lib/pipeline'] = { settleRound: async () => 'voting' };
  mocks['@/lib/redraw'] = { redrawStatus: async () => null };
  const del = load('app/api/groups/[id]/route.ts', mocks).DELETE;
  const leave = load('app/api/groups/[id]/leave/route.ts', mocks).POST;
  return { s, setUser: u => user = u,
    del: () => del({}, ctx),
    leave: body => leave({ json: async () => body }, ctx) };
}

test('owner deletes the group and everything attached to it', async () => {
  const f = fixture();
  const r = await f.del();
  assert.equal(r.status, 200);
  assert.equal(f.s.groups.has(5), false); // invite code lives on the group row, so it is invalid too
  assert.equal(f.s.members.size + f.s.votes.length + f.s.skips.length + f.s.rounds.length, 0);
  f.setUser(2);
  assert.equal((await f.del()).status, 404);
});

test('non-owner cannot delete', async () => {
  const f = fixture();
  f.setUser(2);
  const r = await f.del();
  assert.equal(r.status, 403);
  assert.equal(f.s.groups.has(5), true);
  assert.equal(f.s.members.size, 3);
});

test('member leaves: membership, votes and skips go; others untouched', async () => {
  const f = fixture();
  f.setUser(2);
  assert.equal((await f.leave({})).status, 200);
  assert.deepEqual([...f.s.members], [1, 3]);
  assert.equal(f.s.votes.some(v => v.user_id === 2), false);
  assert.equal(f.s.skips.some(k => k.user_id === 2), false);
  assert.equal(f.s.votes.length, 2);
  assert.equal((await f.leave({})).status, 403); // no longer a member
});

test('owner must transfer before leaving; new owner gets permissions immediately', async () => {
  const f = fixture();
  assert.equal((await f.leave({})).status, 400);
  assert.equal((await f.leave({ newOwnerId: 99 })).status, 400); // not a member
  assert.equal((await f.leave({ newOwnerId: 1 })).status, 400); // themselves
  assert.equal(f.s.members.has(1), true);
  assert.equal(f.s.groups.get(5).created_by, 1);
  assert.equal((await f.leave({ newOwnerId: 2 })).status, 200);
  assert.equal(f.s.groups.get(5).created_by, 2);
  assert.equal(f.s.members.has(1), false);
  assert.equal(f.s.votes.some(v => v.user_id === 1), false);
  f.setUser(1);
  assert.equal((await f.del()).status, 403); // old owner is out
  f.setUser(2);
  assert.equal((await f.del()).status, 200);
});

test('solo owner cannot leave and is told to delete', async () => {
  const f = fixture([1]);
  const r = await f.leave({});
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Delete the group/);
  assert.equal(f.s.members.has(1), true);
});
