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
const settingsModule = load('lib/roundSettings.ts', { './tiers': load('lib/tiers.ts') });
const searchMembers = [{ user_id: 1, availability: ['Sun afternoon'], interests: ['coffee'], max_distance_mi: 5, comfort_tier: '$', budget_tier: '$$' }];
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
  const data = load('lib/findingData.ts', { './roundSettings': settingsModule, './finding': finding, '@/lib/db': {
    q: async () => [{ availability: ['Sun afternoon'], max_distance_mi: 9 }, { availability: ['Sun afternoon'], max_distance_mi: 5 }],
    q1: async () => ({ id: 10, status: 'failed', slot: null, group_tier: null, plan_count: 0 }),
  } });
  const result = await data.getFindingDetails(5, 'Test city');
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
      else if (sql.startsWith('select city from groups')) return { rows: [{ city: 'Test city' }] };
      else if (sql.includes('information_schema.columns')) return { rows: [{ count: 5 }] };
      else if (sql.startsWith('select m.user_id')) return { rows: searchMembers };
      else if (sql.startsWith('select id,status,attempt')) return { rows: last ? [last] : [] };
      else if (sql.startsWith('insert into plan_rounds')) { inserts++; last = { id: inserts, status: 'generating', search_city: 'Test city', sample_places: false, search_settings: searchMembers }; return { rows: [last] }; }
      else if (sql === 'commit' || sql === 'rollback') unlock?.();
      return { rows: [] };
    } };
  } };
  const { startRound } = load('lib/pipeline.ts', {
    './db': { pool }, './roundSettings': settingsModule, './finding': finding, './split': load('lib/split.ts'), './tier': {}, './serpapi': {}, './price': {}, './gemini': {},
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
    '@/lib/finding': finding, '@/lib/db': {}, '@/lib/voting': {}, '@/lib/serpapi': {},
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

test('new rounds snapshot current city and distance; only same-city in-progress rounds are reused', async () => {
  let city = 'Houston, TX', last = null, inserts = 0;
  class MissingCityError extends Error {}
  const pool = { connect: async () => ({ release() {}, query: async (sql, args) => {
    if (sql.startsWith('select city')) return { rows: [{ city }] };
    if (sql.includes('information_schema.columns')) return { rows: [{ count: 5 }] };
    if (sql.startsWith('select m.user_id')) return { rows: searchMembers };
    if (sql.startsWith('select id,status')) return { rows: last ? [last] : [] };
    if (sql.startsWith('insert into plan_rounds')) {
      last = { id: ++inserts, status: 'generating', search_city: args[3], search_distance_mi: args[4], sample_places: args[5], search_settings: JSON.parse(args[7]), group_tier: args[6] };
      return { rows: [last] };
    }
    return { rows: [] };
  } }) };
  const { startRound } = load('lib/pipeline.ts', { './db': { pool }, './roundSettings': settingsModule, './finding': finding, './split': load('lib/split.ts'), './tier': {}, './serpapi': { MissingCityError }, './price': {}, './gemini': {} });
  assert.equal((await startRound(5)).created, true);
  assert.equal(last.search_city, 'Houston, TX');
  assert.equal(last.search_distance_mi, 5);
  city = ' houston, tx ';
  assert.equal((await startRound(5)).created, false);
  city = 'Seattle, WA';
  assert.equal((await startRound(5)).created, true);
  assert.equal(last.search_city, 'Seattle, WA');
  last.search_city = null; // Legacy Austin rounds must not be reused for Seattle.
  assert.equal((await startRound(5)).created, true);
  city = ' ';
  await assert.rejects(startRound(5), MissingCityError);
});

test('generation uses the round snapshot for search and prompt, not later group edits', async () => {
  const calls = [];
  const { fillRound } = load('lib/pipeline.ts', {
    './roundSettings': settingsModule, './finding': finding, './split': load('lib/split.ts'),
    './db': {
      q1: async sql => { assert.ok(sql.includes("to_jsonb(r)->>'search_city' search_city")); assert.ok(sql.includes('g.city current_city')); return { group_id: 5, search_city: 'Dallas, TX', current_city: 'Seattle, WA', lat: 47.6062, lng: -122.3321, search_distance_mi: 5, sample_places: false }; },
      q: async sql => sql.startsWith('select m.availability') ? [{ availability: ['Sun afternoon'], interests: ['coffee'] }] : [],
    },
    './tier': { groupTier: async () => '$' },
    './serpapi': { categoriesFor: x => x, MissingCityError: class extends Error {}, PlaceSearchError: class extends Error {} },
    './price': { planLevel: () => '$' },
    './gemini': { generatePlans: async ctx => { calls.push(ctx); return [{ title: 'Cafe', summary: '', stops: [{ place: 'Cafe', time: '2 PM' }], est_cost_per_person: 12, why_fits: '' }]; } },
  });
  await fillRound(10, async (cats, city, tier, distance, options) => {
    assert.equal(city, 'Dallas, TX'); assert.equal(distance, 5); assert.equal(options.sample, false);
    assert.equal(options.center, undefined); // Never use another city's current coordinates for the snapshot.
    return [{ name: 'Cafe', address: 'Dallas, TX', cost: 12, price: '$' }];
  });
  assert.equal(calls[0].city, 'Dallas, TX');
});

test('changed-city rounds are replaced instead of immediately showing old plans as ready', async () => {
  const old = group('voting', 3); old.finding.cityChanged = true;
  const f = flowFixture([old, { roundId: 10 }, group('voting', 2)]);
  await f.run(true);
  assert.equal(f.calls.filter(x => x[1] === 'POST').length, 1);
  assert.ok(f.events.some(x => x[0] === 'started'));
  assert.equal(finding.shouldFindPlans(old), false);
});


test('legacy metadata reads use optional JSON fields and fall back without hiding database errors', async () => {
  const data = load('lib/findingData.ts', { './roundSettings': settingsModule, './finding': finding, '@/lib/db': {
    q: async () => [{ availability: ['Sun afternoon'], max_distance_mi: 8 }],
    q1: async sql => {
      for (const key of ['search_city', 'sample_places', 'search_error', 'search_distance_mi']) {
        assert.ok(sql.includes(`to_jsonb(r)->>'${key}'`));
        assert.ok(!sql.includes(`r.${key}`));
      }
      return { id: 1, status: 'voting', plan_count: 2, search_city: null, sample_places: null };
    },
  } });
  const result = await data.getFindingDetails(1, 'Houston, TX');
  assert.equal(result.city, 'Austin, TX');
  assert.equal(result.round.search_city, 'Austin, TX');
  assert.equal(result.maxDistanceMi, 8);
  assert.equal(result.needsNewSearch, true);
  const broken = load('lib/findingData.ts', { './roundSettings': settingsModule, './finding': finding, '@/lib/db': {
    q: async () => [], q1: async () => { throw Error('database unavailable'); },
  } });
  await assert.rejects(broken.getFindingDetails(1, 'Houston, TX'), /database unavailable/);
});

test('pending migration rejects regenerating untracked legacy rounds before insertion', async () => {
  let last = { id: 1, status: 'voting', search_city: null, sample_places: null };
  const statements = [];
  const pool = { connect: async () => ({ release() {}, query: async sql => {
    statements.push(sql);
    if (sql.startsWith('select city')) return { rows: [{ city: 'Austin, TX' }] };
    if (sql.startsWith('select id,status')) return { rows: last ? [last] : [] };
    if (sql.includes('information_schema.columns')) return { rows: [{ count: 0 }] };
    return { rows: [] };
  } }) };
  const { startRound, SearchSchemaPendingError } = load('lib/pipeline.ts', {
    './db': { pool }, './roundSettings': settingsModule, './finding': finding, './split': load('lib/split.ts'), './tier': {}, './serpapi': {}, './price': {}, './gemini': {},
  });
  await assert.rejects(startRound(5), SearchSchemaPendingError);
  last = null;
  await assert.rejects(startRound(5), SearchSchemaPendingError);
  assert.equal(statements.some(sql => sql.startsWith('insert')), false);
  assert.equal(statements.at(-1), 'rollback');
});


test('round city resolver preserves Houston snapshots and resolves NULL or absent snapshots to Austin', () => {
  const houston = { city: 'Houston, TX', lat: 29.7604, lng: -95.3698 };
  const saved = finding.resolveRoundCity({ search_city: 'Houston, TX' }, houston);
  assert.equal(saved.city, 'Houston, TX');
  assert.equal(saved.coords.lat, houston.lat);
  assert.equal(saved.coords.lng, houston.lng);
  for (const round of [{ search_city: null }, {}]) {
    const legacy = finding.resolveRoundCity(round, houston);
    assert.equal(legacy.city, 'Austin, TX');
    assert.equal(legacy.coords.lat, 30.2672);
    assert.equal(legacy.coords.lng, -97.7431);
  }
});

test('legacy generation passes Austin coordinates and city to search and plan writer, never Houston', async () => {
  for (const snapshot of [{ search_city: null }, {}]) {
    let promptCity;
    const { fillRound } = load('lib/pipeline.ts', {
      './roundSettings': settingsModule, './finding': finding, './split': load('lib/split.ts'),
      './db': {
        q1: async () => ({ ...snapshot, group_id: 5, current_city: 'Houston, TX', lat: 29.7604, lng: -95.3698, search_distance_mi: 5 }),
        q: async sql => sql.startsWith('select m.availability') ? [{ availability: ['Sun afternoon'], interests: ['coffee'] }] : [],
      },
      './tier': { groupTier: async () => '$' },
      './serpapi': { categoriesFor: x => x, MissingCityError: class extends Error {}, PlaceSearchError: class extends Error {} },
      './price': { planLevel: () => '$' },
      './gemini': { generatePlans: async ctx => {
        promptCity = ctx.city;
        return [{ title: 'Cafe', summary: '', stops: [{ place: 'Cafe', time: '2 PM' }], est_cost_per_person: 12, why_fits: '' }];
      } },
    });
    await fillRound(10, async (cats, city, tier, distance, options) => {
      assert.equal(city, 'Austin, TX');
      assert.equal(options.center.latitude, 30.2672);
      assert.equal(options.center.longitude, -97.7431);
      return [{ name: 'Cafe', cost: 12, price: '$' }];
    });
    assert.equal(promptCity, 'Austin, TX');
  }
});

test('merged setup gate protects normal finding but keeps the allowed loading preview local', async () => {
  for (const [env, allowPreview, query, expectedCalls] of [
    [{ NODE_ENV: 'development' }, true, '?preview=loading', 0],
    [{ NODE_ENV: 'production' }, true, '?preview=loading', 1],
    [{ NODE_ENV: 'production', NEXT_PUBLIC_ENABLE_PREVIEW: 'true' }, true, '?preview=loading', 0],
    [{ NODE_ENV: 'development' }, false, '?preview=loading', 1],
    [{ NODE_ENV: 'development' }, true, '', 1],
  ]) {
    const effects = [], redirects = [];
    let calls = 0;
    const { useSetupGate } = load('lib/useSetupGate.ts', {
      react: { useEffect: fn => effects.push(fn) },
      'next/navigation': { useRouter: () => ({ replace: path => redirects.push(path) }) },
      './client': { api: async () => { calls++; return { availability: [] }; } },
    }, { process: { env }, window: { location: { search: query } }, URLSearchParams, AbortController });
    useSetupGate('5', allowPreview);
    const cleanup = effects[0]();
    await Promise.resolve();
    assert.equal(calls, expectedCalls);
    assert.equal(redirects.length, expectedCalls);
    if (expectedCalls) assert.equal(redirects[0], '/groups/5/setup');
    cleanup?.();
  }
});

test('merged plans POST rejects unfinished setup before claiming or generating a round', async () => {
  const { POST } = load('app/api/groups/[id]/plans/route.ts', {
    '@/lib/finding': finding, '@/lib/db': {}, '@/lib/voting': {}, '@/lib/serpapi': {},
    '@/lib/api': { requireUser: async () => 1, isMember: async () => true, setupDone: async () => false,
      fail: (error, status) => ({ error, status }) },
    '@/lib/pipeline': { startRound: () => { throw Error('Must not start a round'); } },
  });
  const response = await POST({}, { params: Promise.resolve({ id: '5' }) });
  assert.equal(response.status, 409);
  assert.equal(response.error, 'finish your setup first');
});

test('editing any search setting creates a fresh round with current Houston distance and tier', async () => {
  let members = JSON.parse(JSON.stringify(searchMembers)), last = null, inserts = 0;
  const pool = { connect: async () => ({ release() {}, query: async (sql, args) => {
    if (sql.startsWith('select city')) return { rows: [{ city: 'Houston, TX' }] };
    if (sql.startsWith('select m.user_id')) return { rows: members };
    if (sql.includes('information_schema.columns')) return { rows: [{ count: 5 }] };
    if (sql.startsWith('select id,status')) return { rows: last ? [last] : [] };
    if (sql.startsWith('insert into plan_rounds')) {
      last = { id: ++inserts, status: 'voting', search_city: args[3], search_distance_mi: args[4], sample_places: args[5], group_tier: args[6], search_settings: JSON.parse(args[7]) };
      return { rows: [last] };
    }
    return { rows: [] };
  } }) };
  const { startRound } = load('lib/pipeline.ts', {
    './roundSettings': settingsModule, './db': { pool }, './finding': finding, './split': load('lib/split.ts'),
    './tier': {}, './serpapi': {}, './price': {}, './gemini': {},
  });
  await startRound(5);
  assert.equal((await startRound(5)).created, false);
  for (const edit of [{ max_distance_mi: 15 }, { comfort_tier: '$$$' }, { interests: ['outdoors'] }, { availability: ['Fri evening'] }]) {
    members = members.map(m => ({ ...m, ...edit }));
    assert.equal((await startRound(5)).created, true);
    assert.equal((await startRound(5)).created, false);
  }
  assert.equal(inserts, 5);
  assert.equal(last.search_city, 'Houston, TX');
  assert.equal(last.search_distance_mi, 15);
  assert.equal(last.group_tier, '$$$');
});

test('finding details flag changed settings but show saved search values without exposing members snapshot', async () => {
  const saved = settingsModule.roundSettings(searchMembers);
  const data = load('lib/findingData.ts', { './roundSettings': settingsModule, './finding': finding, '@/lib/db': {
    q: async () => searchMembers.map(m => ({ ...m, max_distance_mi: 15, comfort_tier: '$$$' })),
    q1: async () => ({ id: 10, status: 'voting', search_city: 'Houston, TX', search_settings: saved, search_distance_mi: 5, group_tier: '$', plan_count: 3 }),
  } });
  const result = await data.getFindingDetails(5, 'Houston, TX');
  assert.equal(result.settingsChanged, true);
  assert.equal(result.needsNewSearch, true);
  assert.equal(result.maxDistanceMi, 5);
  assert.equal(result.round.group_tier, '$');
  assert.equal('search_settings' in result.round, false);
});

test('generation uses saved preferences and persists a disclosed radius expansion in the plan and Finding data', async () => {
  const writes = [];
  const { fillRound } = load('lib/pipeline.ts', {
    './roundSettings': settingsModule, './finding': finding, './split': load('lib/split.ts'),
    './db': {
      q1: async () => ({ group_id: 5, search_city: 'Houston, TX', current_city: 'Houston, TX', lat: 29.7604, lng: -95.3698,
        search_settings: settingsModule.roundSettings(searchMembers), search_distance_mi: 1, group_tier: '$' }),
      q: async (sql, args) => { assert.ok(!sql.startsWith('select m.availability')); writes.push([sql, args]); return []; },
    },
    './tier': { groupTier: async () => { throw Error('Must use saved tier'); } },
    './serpapi': { categoriesFor: x => x, MissingCityError: class extends Error {}, PlaceSearchError: class extends Error {} },
    './price': { planLevel: () => '$' },
    './gemini': { generatePlans: async ctx => {
      assert.equal(ctx.tier, '$'); assert.equal(ctx.maxDistanceMi, 1); assert.deepEqual(Array.from(ctx.interests), ['coffee']);
      return [{ title: 'Cafe', summary: '', stops: [{ place: 'Cafe', time: '2 PM' }], est_cost_per_person: 12, why_fits: 'Fits.' }];
    } },
  });
  await fillRound(10, async (cats, city, tier, distance) => {
    assert.equal(tier, '$'); assert.equal(distance, 1);
    return [{ name: 'Cafe', cost: 12, price: '$', searchRadiusMi: 1.5, radiusNote: 'Search expanded to 1.5 mi.' }];
  });
  assert.ok(writes.find(([sql]) => sql.startsWith('insert into plans'))[1][6].includes('Search expanded to 1.5 mi.'));
  assert.equal(writes.find(([sql]) => sql.startsWith('update plan_rounds set search_distance_mi'))[1][1], 1.5);
});


test('home action follows latest status and actual plans, independent of legacy city metadata', () => {
  for (const legacy of [false, true]) {
    for (const [status, count, label, destination, fresh] of [
      [null, 0, 'Find plans', 'finding', false],
      ['failed', 0, 'Find plans', 'finding', false],
      ['failed', 2, 'Find plans', 'finding', false],
      ['voting', 0, 'Find plans', 'finding', false],
      ['abandoned', 0, 'Find plans', 'finding', false],
      ['generating', 0, 'Finding plans…', 'finding', false],
      ['voting', 3, 'Vote on plans', 'plans', false],
      ['vetoed', 3, 'Find new plans', 'finding', true],
      ['final', 3, 'Find new plans', 'finding', true],
      ['confirmed', 3, 'Find new plans', 'finding', true],
    ]) {
      const round = status ? { status, search_city: legacy ? null : 'Houston, TX' } : null;
      const action = finding.groupHomeAction(round, count);
      assert.equal(action.label, label); assert.equal(action.destination, destination); assert.equal(action.fresh, fresh);
    }
  }
});
