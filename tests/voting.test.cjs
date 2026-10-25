// No live database imports: exercise handlers using in-memory votes and SQLite
// for the actual participation-count SQL (Postgres's ::int cast removed only).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
function load(file, mocks, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, ...globals, require(name) {
    if (name in mocks) return mocks[name];
      if (name === "@/lib/finding") return load("lib/finding.ts", {});
      if (name === './roundParticipation' || name === '@/lib/roundParticipation') return load('lib/roundParticipation.ts', {});
      if (name === '@/components/RoundInclusion') return { InclusionBanner: 'banner', RerunPlans: 'rerun' };
    throw Error(`Unmocked import: ${name}`);
  } }, { filename: file });
  return exports;
}
function fixture() {
  let user = 1, roundStatus = 'voting';
  const votes = new Map();
  const plans = [{ id: 101, round_id: 10 }, { id: 102, round_id: 10 }, { id: 201, round_id: 20 }];
  const members = [{ id: 1, name: 'One', setup_done: false }, { id: 2, name: 'Two', setup_done: false }];
  const api = { setupDone: async () => true, requireUser: async () => user, isMember: async (g, u) => g === 5 && members.some(m => m.id === u), json: body => ({ body }), fail: (error, status) => ({ error, status }) };
  const db = {
    q: async (sql, args) => {
      if (sql.includes('select m.user_id, exists')) {
        const python = `import sqlite3,json,sys
x=json.load(sys.stdin)
c=sqlite3.connect(':memory:')
c.executescript('CREATE TABLE votes(plan_id,user_id,value); CREATE TABLE plans(id,round_id); CREATE TABLE memberships(user_id,group_id);')
c.executemany('INSERT INTO votes VALUES(?,?,?)',[(v['plan_id'],v['user_id'],v['value']) for v in x['votes']])
c.executemany('INSERT INTO plans VALUES(?,?)',[(p['id'],p['round_id']) for p in x['plans']])
c.executemany('INSERT INTO memberships VALUES(?,?)',[(m['id'],5) for m in x['members']])
print(json.dumps([dict(user_id=r[0],has_voted=bool(r[1])) for r in c.execute(x['sql'],{str(i+1):v for i,v in enumerate(x['args'])}).fetchall()]))`;
        const result = spawnSync('python3', ['-c', python], { input: JSON.stringify({ sql, args, votes: [...votes.values()], plans, members }), encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        return JSON.parse(result.stdout);
      }
      if (sql.startsWith('insert into votes')) votes.set(`${args[0]}:${args[1]}`, { plan_id: args[0], user_id: args[1], value: args[2] });
      else if (sql.startsWith('delete from votes')) votes.delete(`${args[0]}:${args[1]}`);
      else if (sql.includes('left join votes')) return plans.filter(p => p.round_id === args[0]).map(p => ({ ...p, my_vote: votes.get(`${p.id}:${args[1]}`)?.value ?? null, approve: 0, veto: 0 }));
      else if (sql.includes('from memberships m join users')) return members;
      else throw Error(`Unexpected query: ${sql}`);
      return [];
    },
    q1: async (sql, args) => {
      if (sql.includes('from plans p join plan_rounds')) return { round_id: 10, group_id: 5, status: 'voting' };
      if (sql.includes('from groups')) return { name: 'Test group', created_by: 1 };
      if (sql.includes('from plan_rounds')) return roundStatus === null ? null : { id: 10, status: roundStatus, seconds_left: 3600 };

      throw Error(`Unexpected query: ${sql}`);
    },
  };
  const mocks = { '@/lib/finding': load('lib/finding.ts', {}), '@/lib/serpapi': { MissingCityError: class extends Error {}, PlaceSearchError: class extends Error {} }, '@/lib/db': db, '@/lib/api': api, '@/lib/pipeline': { settleRound: async () => 'voting', withStopCosts: stops => stops ?? [] } };
  mocks['@/lib/voting'] = load('lib/voting.ts', mocks);
  mocks['@/lib/findingData'] = { getFindingDetails: async () => null };
  mocks['@/lib/tier'] = { groupTier: async () => null };
  mocks['@/lib/redraw'] = { redrawStatus: async () => null };
  mocks['@/lib/payments'] = { refreshTransferStatuses: async () => {}, duesInGroup: async () => 0 };
  mocks['@/lib/groups'] = { deleteGroup: async () => ({ ok: true }) };
  const home = load('app/api/groups/[id]/route.ts', mocks).GET;
  const post = load('app/api/plans/[id]/vote/route.ts', mocks).POST;
  const get = load('app/api/groups/[id]/plans/route.ts', mocks).GET;
  return { votes, setRound: status => roundStatus = status,
    home: async () => (await home({}, { params: Promise.resolve({ id: '5' }) })).body,
    setUser: id => user = id,
    vote: (id, value) => post({ json: async () => ({ value }) }, { params: Promise.resolve({ id: String(id) }) }),
    read: async () => (await get({}, { params: Promise.resolve({ id: '5' }) })).body };
}

test('partial votes persist, restore selected values, count each current member once, and undo', async () => {
  const f = fixture();
  assert.equal((await f.read()).voted, 0);
  await f.vote(101, 'approve');
  let data = await f.read();
  assert.equal(data.voted, 1); // only one of two plans voted on
  assert.equal(data.plans[0].my_vote, 'approve');
  assert.equal(data.plans[0].approve, undefined); // anonymity retained
  await f.vote(101, 'veto');
  assert.equal(f.votes.size, 1);
  assert.equal((await f.read()).plans[0].my_vote, 'veto');
  await f.vote(102, 'approve');
  assert.equal((await f.read()).voted, 1);
  f.setUser(2);
  await f.vote(101, 'approve');
  assert.equal((await f.read()).voted, 2);
  await f.vote(101, null);
  assert.equal((await f.read()).voted, 1);
  f.setUser(1);
  assert.equal((await f.read()).plans[0].my_vote, 'veto');
  await f.vote(101, null);
  await f.vote(102, null);
  assert.equal((await f.read()).voted, 0);
});

test('progress excludes former members and votes from other rounds', async () => {
  const f = fixture();
  f.votes.set('101:99', { plan_id: 101, user_id: 99, value: 'approve' });
  f.votes.set('201:1', { plan_id: 201, user_id: 1, value: 'approve' });
  assert.equal((await f.read()).voted, 0);
  f.setUser(99);
  assert.equal((await f.vote(101, 'approve')).status, 403);
});

function hooks() {
  const state = [], effects = [], refs = [];
  let s = 0, r = 0;
  return { state, effects, reset() { s = 0; r = 0; }, react: {
    useState(initial) { const i = s++; if (!(i in state)) state[i] = initial; return [state[i], v => state[i] = typeof v === 'function' ? v(state[i]) : v]; },
    useRef(initial) { const i = r++; return refs[i] ??= { current: initial }; },
    useEffect(fn) { effects.push(fn); }, useCallback: fn => fn,
  } };
}

test('useApi fetches fresh on mount/focus, rejects stale responses and cleans up', async () => {
  const h = hooks(), requests = [], events = new Map();
  const target = { addEventListener: (k, f) => events.set(k, f), removeEventListener: k => events.delete(k) };
  const client = load('lib/client.ts', { react: h.react, './constants': {} }, {
    window: target, document: { ...target, visibilityState: 'visible' },
    fetch: (url, options) => new Promise(resolve => { assert.equal(options.cache, 'no-store'); requests.push(resolve); }),
    setInterval() { throw Error('No polling expected'); }, clearInterval() {},
  });
  const hook = client.useApi('/test');
  const cleanup = h.effects[0]();
  assert.equal(requests.length, 1);
  const latest = hook.reload();
  requests[1]({ ok: true, json: async () => ({ voted: 1 }) });
  await latest;
  requests[0]({ ok: true, json: async () => ({ voted: 0 }) });
  await new Promise(setImmediate);
  assert.equal(h.state[0].voted, 1);
  events.get('focus')();
  assert.equal(requests.length, 3);
  cleanup();
  requests[2]({ ok: true, json: async () => ({ voted: 2 }) });
  await new Promise(setImmediate);
  assert.equal(h.state[0].voted, 1);
  assert.equal(events.size, 0);
});

test('voting UI updates participation immediately, confirms selections, and rolls back failures', async () => {
  const h = hooks();
  const server = { me: 1, members: [{ id: 1, setup_done: true }], inclusion: { canVote: true }, group: { name: 'Test' }, round: { status: 'voting', seconds_left: 600, attempt: 1 },
    plans: [{ id: 101, my_vote: null, title: 'One', cost: 10, stops: [] }, { id: 102, my_vote: null, title: 'Two', cost: 10, stops: [] }], voted: 0, memberCount: 2 };
  let current = structuredClone(server), failNext = false, release;
  const page = load('app/groups/[id]/plans/page.tsx', {
    'next/link': { default: 'a' },
    'next/font/google': { Inter: () => ({ className: '' }) },
    react: { ...h.react, use: p => p, useMemo: fn => fn() },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: 'a' },
    '@/lib/useSetupGate': { useSetupGate() {} },
    'next/navigation': { useRouter: () => ({ replace() {} }) },
    '@/components/Page': { Page: 'main', Err: 'error' },
    '@/components/TierBadge': { TierBadge: 'badge' },
    '@/components/Skeleton': { Skeleton: 'status', SkeletonBlock: 'block' },
    '@/lib/client': {
      useApi: () => ({ data: current, error: '', reload: async () => { current = structuredClone(server); return current; } }),
      api: (url, method, body) => new Promise((resolve, reject) => {
        release = () => {
          if (failNext) { failNext = false; reject(Error('save failed')); return; }
          server.plans[0].my_vote = body.value;
          server.voted = Number(body.value !== null);
          resolve({ ok: true });
        };
      }),
    },
  }, { setInterval: () => 1, clearInterval() {} }).default;
  const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
  const text = n => n == null || typeof n === 'boolean' ? '' : typeof n !== 'object' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n.props?.children);
  function render() { h.reset(); h.effects.length = 0; return page({ params: { id: '5' } }); }
  function settleEffects() { for (const effect of [...h.effects]) effect(); return render(); }
  let tree = render();
  const approve = () => nodes(tree).find(n => n.type === 'button' && text(n).includes('Approve'));
  approve().props.onClick();
  tree = render();
  assert.ok(text(tree).includes('1 of 2 have voted'));
  assert.equal(approve().props['aria-pressed'], true);
  assert.equal(approve().props.disabled, true);
  release(); await new Promise(setImmediate);
  tree = render(); tree = settleEffects();
  assert.equal(approve().props['aria-pressed'], true);
  assert.equal(Object.keys(h.state[1]).length, 0); // no permanent optimistic override
  // A later server response can now change the selection.
  server.plans[0].my_vote = 'veto'; current = structuredClone(server);
  tree = render();
  assert.equal(approve().props['aria-pressed'], false);
  failNext = true;
  approve().props.onClick(); tree = render();
  release(); await new Promise(setImmediate);
  tree = render();
  assert.equal(approve().props['aria-pressed'], false);
  assert.ok(nodes(tree).some(n => n.type === 'error' && n.props.msg === 'save failed'));
  const veto = nodes(tree).find(n => n.type === 'button' && text(n).includes('Veto'));
  veto.props.onClick(); tree = render();
  assert.ok(text(tree).includes('0 of 2 have voted'));
  release(); await new Promise(setImmediate);
  tree = render(); tree = settleEffects();
  assert.equal(Object.keys(h.state[1]).length, 0);
  // A viewer excluded from the snapshot can read cards but cannot submit votes.
  current.inclusion = { canVote: false };
  tree = render();
  assert.equal(approve().props.disabled, true);
  assert.ok(text(tree).includes('Make your setup to vote'));
  assert.ok(nodes(tree).some(n => n.props?.href === '/groups/5/setup'));
});


test('home shares partial-ballot progress and falls back to setup without an open round', async () => {
  const f = fixture();
  await f.vote(101, 'approve');
  let data = await f.home();
  assert.equal(data.voted, 1);
  assert.equal(data.memberCount, 2);
  assert.equal(data.roundOpen, true);
  assert.equal(data.members[0].has_voted, true);
  assert.equal(data.members[1].has_voted, false);
  assert.equal(data.voted, (await f.read()).voted);
  const h = hooks();
  const page = load('app/groups/[id]/page.tsx', {
    react: { ...h.react, use: p => p },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: 'a' },
    '@/components/Avatar': { Avatar: 'avatar' },
    '@/components/BackButton': { BackButton: 'a' },
    '@/components/Skeleton': { Skeleton: 'status', SkeletonBlock: 'block' },
    '@/components/RedrawVote': { RedrawVote: 'redraw' },
    '@/lib/useFindingRedirect': { useFindingRedirect() {} },
    '@/lib/finding': load('lib/finding.ts', {}),
    'next/font/google': { Inter: () => ({ className: '' }) },
    '@/lib/useSetupGate': { useSetupGate() { throw Error('Home must allow unfinished setup'); } },
    'next/navigation': { useRouter: () => ({ push() {} }) },
    '@/lib/client': { useApi: () => ({ data, error: '' }), api: async () => ({}) },
  }).default;
  const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
  const text = n => n == null || typeof n === 'boolean' ? '' : typeof n !== 'object' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n.props?.children);
  function render() { h.reset(); return page({ params: { id: '5' } }); }
  let tree = render();
  assert.ok(!text(tree).includes('Set up my plans'));
  assert.equal(nodes(tree).find(n => text(n) === 'Make my setup' && n.props?.href).props.href, '/groups/5/setup');
  data = { ...data, invite_code: 'WSP-TEST' };
  tree = render();
  assert.ok(nodes(tree).some(n => n.props?.['aria-label'] === 'Invite code'));
  data = { ...data, members: data.members.map(m => ({ ...m, setup_done: true })) };
  tree = render();
  assert.ok(text(tree).includes('Edit my setup'));
  assert.ok(!text(tree).includes('Set up my plans'));
  assert.ok(nodes(tree).some(n => n.props?.['aria-label'] === 'Invite code'));
  assert.ok(text(tree).includes('1 of 2 voted · voting'));
  assert.ok(text(tree).includes('Voted'));
  assert.ok(text(tree).includes('Not voted yet'));
  assert.ok(text(tree).includes('Two has not voted yet. Voting closes at the deadline or once everyone has voted on every plan.'));
  assert.equal(nodes(tree).find(n => n.props?.role === 'progressbar').props['aria-valuenow'], 50);
  f.setUser(2);
  await f.vote(101, 'veto');
  data = await f.home();
  tree = render();
  assert.ok(text(tree).includes('2 of 2 voted · voting'));
  assert.ok(text(tree).includes('Everyone has voted.'));
  // The progress card names the phase it is counting; the ready count itself does not change.
  const phase = { final: 'final plan picked', generating: 'finding plans', null: 'setup' };
  for (const status of ['final', 'generating', null]) {
    f.setRound(status);
    data = await f.home();
    assert.equal(data.roundOpen, false);
    tree = render();
    assert.ok(text(tree).includes(`0 of 2 ready · ${phase[status]}`), `${status}: ${text(tree).slice(0, 200)}`);
    assert.ok(!(status === 'final' && text(tree).includes('· setup')), 'a final plan must not say setup');
    assert.ok(text(tree).includes('Setting up'));
    assert.equal(nodes(tree).find(n => n.props?.role === 'progressbar').props['aria-valuenow'], 0);
  }
});
