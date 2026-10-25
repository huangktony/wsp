// These tests cannot import the real database or make network calls.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, process: { env: { NODE_ENV: "test" } }, ...globals, require(name) {
    if (name in mocks) return mocks[name];
    throw Error(`Unmocked import: ${name}`);
  } });
  return exports;
}
const finding = load('lib/finding.ts');
const group = (status = null, planCount = 0) => ({ groupTier: '$', members: [{ setup_done: true }, { setup_done: true }],
  finding: { round: status ? { id: 10, status } : null, memberCount: 2, planCount, slot: 'Sun afternoon', maxDistanceMi: 5 } });

test('automatic trigger requires all current members; follows in-progress and fast new rounds only', () => {
  assert.equal(finding.shouldFindPlans(group()), true);
  const unfinished = group(); unfinished.members[1].setup_done = false;
  assert.equal(finding.shouldFindPlans(unfinished), false);
  assert.equal(finding.shouldFindPlans({ ...group(), members: [] }), false);
  assert.equal(finding.shouldFindPlans(group('generating')), true);
  assert.equal(finding.shouldFindPlans(group('voting', 3)), false);
  assert.equal(finding.shouldFindPlans(group('voting', 3), group().finding), true);
  assert.equal(finding.shouldFindPlans(group('voting', 3), group('voting', 3).finding), false);
  for (const status of ['final', 'failed', 'vetoed']) assert.equal(finding.shouldFindPlans(group(status, 3)), false);
});

test('finding data uses actual member preferences and includes failed state without exposing individual data', async () => {
  const data = load('lib/findingData.ts', { './finding': finding, '@/lib/db': {
    q: async () => [{ availability: ['Sun afternoon'], max_distance_mi: 9 }, { availability: ['Sun afternoon'], max_distance_mi: 5 }],
    q1: async () => ({ id: 10, status: 'failed', slot: null, group_tier: null, plan_count: 0 }),
  } });
  const result = await data.getFindingDetails(5);
  assert.equal(result.memberCount, 2);
  assert.equal(result.slot, 'Sun afternoon');
  assert.equal(result.maxDistanceMi, 5);
  assert.equal(result.round.status, 'failed');
  assert.equal(result.members, undefined);
});

function flowFixture(responses) {
  const events = [], calls = [];
  let time = 0;
  const controller = new AbortController();
  const dependencies = {
    api: async (url, method) => { calls.push([url, method]); const next = responses.shift(); if (next instanceof Error) throw next; assert.ok(next, 'unexpected request'); return next; },
    wait: async ms => { time += ms; events.push(['wait', ms]); controller.signal.throwIfAborted(); },
    now: () => time,
  };
  const { runFinding } = load('lib/findingFlow.ts', { './client': { api() { throw Error('unexpected live call'); } } });
  const callbacks = Object.fromEntries(['update', 'started', 'ready'].map(key => [key, value => events.push([key, value])]));
  return { calls, events, controller, run: fresh => runFinding('5', !!fresh, controller.signal, callbacks, dependencies) };
}

test('existing plans skip generation and animation immediately; final manual regeneration still works', async () => {
  for (const status of ['voting', 'final']) {
    const f = flowFixture([group(status, 3)]);
    await f.run();
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.events.map(x => x[0]), ['update', 'ready']);
  }
  const f = flowFixture([group('final', 3), { roundId: 10 }, group('voting', 2)]);
  await f.run(true);
  assert.equal(f.calls.filter(x => x[1] === 'POST').length, 1);
});

test('new generation waits at least 4 seconds, confirms saved plans, stays ready without a navigation timer', async () => {
  const f = flowFixture([group(), { roundId: 10 }, group('generating'), group('voting', 2)]);
  await f.run();
  assert.equal(f.calls.filter(x => x[1] === 'POST').length, 1);
  const readyIndex = f.events.findIndex(x => x[0] === 'ready');
  assert.equal(f.events.slice(0, readyIndex).filter(x => x[0] === 'wait').reduce((sum, x) => sum + x[1], 0), 4200);
  assert.deepEqual(f.events.slice(readyIndex).map(x => x[0]), ['ready']);
});

test('concurrent arrival observes existing generation; failure and abort never navigate', async () => {
  const f = flowFixture([group('generating'), group('voting', 3)]);
  await f.run();
  assert.equal(f.calls.filter(x => x[1] === 'POST').length, 0);
  const failed = flowFixture([group('generating'), group('failed')]);
  await assert.rejects(failed.run(), /Couldn't make plans/);
  assert.equal(failed.events.some(x => x[0] === 'navigate'), false);
  const aborted = flowFixture([group()]);
  aborted.controller.abort(Error('timed out'));
  await assert.rejects(aborted.run(), /timed out/);
  assert.equal(aborted.calls.length, 1);
  assert.equal(aborted.events.length, 0);
});

test('server advisory lock gives simultaneous callers one generation owner and reuses voting rounds', async () => {
  let last = null, inserts = 0, gate = Promise.resolve();
  const pool = { connect: async () => {
    let unlock;
    return { release() {}, query: async sql => {
      if (sql.includes('pg_advisory_xact_lock')) { const before = gate; gate = new Promise(resolve => unlock = resolve); await before; }
      else if (sql.startsWith('select id,status,attempt')) return { rows: last ? [last] : [] };
      else if (sql.startsWith('insert into plan_rounds')) { inserts++; last = { id: inserts, status: 'generating' }; return { rows: [last] }; }
      else if (sql === 'commit' || sql === 'rollback') unlock?.();
      return { rows: [] };
    } };
  } };
  const { startRound } = load('lib/pipeline.ts', {
    './db': { pool }, './finding': finding, './tier': {}, './serpapi': {}, './price': {}, './gemini': {},
  });
  const claims = await Promise.all([startRound(5), startRound(5)]);
  assert.equal(inserts, 1);
  assert.equal(claims.filter(x => x.created).length, 1);
  assert.equal(claims[0].roundId, claims[1].roundId);
  last.status = 'voting';
  assert.equal((await startRound(5)).created, false);
  assert.equal(inserts, 1);
});

test('hidden-tab polling skips requests and visibility resumes fetching', async () => {
  const effects = [], events = new Map(), intervals = [];
  const document = { visibilityState: 'visible', addEventListener: (k, f) => events.set(k, f), removeEventListener() {} };
  let reads = 0;
  const { useApi } = load('lib/client.ts', { react: {
    useState: value => [value, () => {}], useRef: value => ({ current: value }), useCallback: fn => fn, useEffect: fn => effects.push(fn),
  }, './constants': {} }, {
    document, window: { addEventListener() {}, removeEventListener() {} },
    fetch: async () => { reads++; return { ok: true, json: async () => ({}) }; },
    setInterval: (fn, ms) => { assert.equal(ms, 4000); intervals.push(fn); return 1; }, clearInterval() {},
  });
  useApi('/api/groups/5', 4000, true);
  effects[0]();
  assert.equal(reads, 1);
  document.visibilityState = 'hidden'; intervals[0]();
  assert.equal(reads, 1);
  document.visibilityState = 'visible'; events.get('visibilitychange')();
  assert.equal(reads, 2);
});

test('POST only fills the claimed round; concurrent/non-owner requests do not generate', async () => {
  let fills = 0, created = true;
  const { POST } = load('app/api/groups/[id]/plans/route.ts', {
    '@/lib/db': {}, '@/lib/voting': {},
    '@/lib/api': { requireUser: async () => 1, isMember: async () => true, setupDone: async () => true, json: value => value },
    '@/lib/pipeline': {
      startRound: async () => { const owner = created; created = false; return { roundId: 10, status: 'generating', created: owner }; },
      fillRound: async () => { fills++; },
    },
  });
  const params = { params: Promise.resolve({ id: '5' }) };
  const results = await Promise.all([POST({}, params), POST({}, params)]);
  assert.equal(fills, 1);
  assert.equal(results[0].roundId, results[1].roundId);
});

test('screen times out at 30 seconds, offers retry, and cancels work on unmount', async () => {
  const state = [], effects = [], timers = [];
  let index = 0, activeSignal;
  const page = load('app/groups/[id]/finding/page.tsx', {
    react: {
      use: value => value,
      useState: value => { const i = index++; if (!(i in state)) state[i] = value; return [state[i], next => state[i] = typeof next === 'function' ? next(state[i]) : next]; },
      useEffect: fn => effects.push(fn),
    },
    'next/link': { default: 'a' }, 'next/font/google': { Inter: () => ({ className: '' }) },
    '@/lib/useSetupGate': { useSetupGate() {} },
    'next/navigation': { useRouter: () => ({ replace() { throw Error('Must not navigate on failure'); } }) },
    'react/jsx-runtime': require('react/jsx-runtime'), '@/components/Smiley': { Smiley: 'svg' },
    '@/lib/findingFlow': { runFinding: (id, fresh, signal, callbacks) => {
      activeSignal = signal; callbacks.update(group()); callbacks.started();
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    } },
  }, {
    AbortController, URLSearchParams, window: { location: { search: '' } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  }).default;
  const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
  const text = n => n == null || typeof n === 'boolean' ? '' : typeof n !== 'object' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n.props?.children);
  const render = () => { index = 0; return page({ params: { id: '5' } }); };
  render();
  const cleanup = effects[0]();
  assert.equal(timers[0].ms, 30000);
  timers[0].fn();
  await new Promise(setImmediate);
  const tree = render();
  assert.ok(text(tree).includes('Finding plans took too long. Try again.'));
  const retry = nodes(tree).find(n => n.type === 'button' && text(n) === 'Try again');
  assert.ok(retry);
  retry.props.onClick();
  assert.equal(state[4], 1);
  cleanup();
  assert.equal(activeSignal.aborted, true);
});

test('See plans stays disabled until ready, then only a click pushes the plans route', () => {
  const state = [], effects = [], navigation = [];
  let index = 0, callbacks;
  const page = load('app/groups/[id]/finding/page.tsx', {
    react: {
      use: value => value,
      useState: value => { const i = index++; if (!(i in state)) state[i] = value; return [state[i], next => state[i] = typeof next === 'function' ? next(state[i]) : next]; },
      useEffect: fn => effects.push(fn),
    },
    'next/link': { default: 'a' }, 'next/font/google': { Inter: () => ({ className: '' }) },
    '@/lib/useSetupGate': { useSetupGate() {} },
    'next/navigation': { useRouter: () => ({ push: url => navigation.push(url), replace() { throw Error('No automatic navigation'); } }) },
    'react/jsx-runtime': require('react/jsx-runtime'), '@/components/Smiley': { Smiley: 'svg' },
    '@/lib/findingFlow': { runFinding: (id, fresh, signal, handlers) => { callbacks = handlers; return Promise.resolve(); } },
  }, {
    AbortController, URLSearchParams, window: { location: { search: '' } },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  }).default;
  const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
  const text = n => n == null || typeof n === 'boolean' ? '' : typeof n !== 'object' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n.props?.children);
  const render = () => { index = 0; return page({ params: { id: '5' } }); };
  const button = tree => nodes(tree).find(n => n.type === 'button' && text(n) === 'See plans');
  let tree = render();
  effects[0]();
  assert.equal(button(tree).props.disabled, true);
  assert.equal(button(tree).props['aria-disabled'], true);
  button(tree).props.onClick();
  assert.equal(navigation.length, 0);
  callbacks.update(group('voting', 3));
  callbacks.started();
  tree = render();
  assert.equal(button(tree).props.disabled, true);
  assert.ok(nodes(tree).some(n => n.props?.className?.includes('animate-bob')));
  callbacks.ready();
  tree = render();
  assert.equal(button(tree).props.disabled, false);
  assert.equal(button(tree).props['aria-disabled'], false);
  assert.ok(text(tree).includes('Your plans are ready.'));
  assert.ok(text(tree).includes('Plans are ready. Choose See plans to continue.'));
  assert.equal(nodes(tree).filter(n => n.type === 'li').length, 4);
  assert.equal(nodes(tree).filter(n => n.type === 'span' && n.props.className?.includes('bg-orchid')).length, 4);
  assert.equal(nodes(tree).some(n => n.props?.className?.includes('animate-bob')), false);
  assert.equal(navigation.length, 0);
  button(tree).props.onClick();
  assert.deepEqual(navigation, ['/groups/5/plans']);
});

test('loading preview is gated, makes no API calls, runs ten seconds, and cleans up timers', () => {
  for (const [env, enabled] of [
    [{ NODE_ENV: 'development' }, true],
    [{ NODE_ENV: 'production' }, false],
    [{ NODE_ENV: 'production', NEXT_PUBLIC_ENABLE_PREVIEW: 'true' }, true],
  ]) {
    const state = [], effects = [], intervals = [], timers = [], cleared = [];
    let index = 0, realRuns = 0;
    const page = load('app/groups/[id]/finding/page.tsx', {
      react: {
        use: value => value,
        useState: value => { const i = index++; if (!(i in state)) state[i] = value; return [state[i], next => state[i] = typeof next === 'function' ? next(state[i]) : next]; },
        useEffect: fn => effects.push(fn),
      },
      'next/link': { default: 'a' }, 'next/font/google': { Inter: () => ({ className: '' }) },
      '@/lib/useSetupGate': { useSetupGate() {} },
      'next/navigation': { useRouter: () => ({ push() { throw Error('Unexpected navigation'); } }) },
      'react/jsx-runtime': require('react/jsx-runtime'), '@/components/Smiley': { Smiley: 'svg' },
      '@/lib/findingFlow': { runFinding: () => { realRuns++; return Promise.resolve(); } },
    }, {
      process: { env }, AbortController, URLSearchParams,
      window: { location: { search: '?preview=loading' } },
      setTimeout: (fn, ms) => { timers.push({ fn, ms }); return 'timeout'; }, clearTimeout: id => cleared.push(id),
      setInterval: (fn, ms) => { intervals.push({ fn, ms }); return 'interval'; }, clearInterval: id => cleared.push(id),
    }).default;
    page({ params: { id: '5' } });
    const cleanup = effects[0]();
    assert.equal(realRuns, enabled ? 0 : 1);
    if (enabled) {
      assert.equal(state[2], 'running');
      assert.equal(timers[0].ms, 10000);
      assert.equal(intervals[0].ms, 1400);
      for (let i = 0; i < 6; i++) intervals[0].fn();
      assert.equal(state[1], 3);
      assert.equal(state[2], 'running');
      timers[0].fn();
      assert.equal(state[1], 4);
      assert.equal(state[2], 'ready');
      assert.equal(realRuns, 0);
    }
    cleanup();
    assert.ok(cleared.includes('timeout'));
    if (enabled) assert.ok(cleared.includes('interval'));
  }
});
