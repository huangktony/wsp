// No real database, network, or environment imports.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, ...globals, require(name) {
    if (name in mocks) return mocks[name];
      if (name === './availability' || name === '@/lib/availability') return require('../lib/availability.ts');
    if (name === '@/lib/roundParticipation') return load('lib/roundParticipation.ts', {});
      if (name === 'zod') return require('zod');
    throw Error(`Unmocked import: ${name}`);
  } });
  return exports;
}
const cities = load('lib/usCities.ts', {});
function fixture({ provider, memberFails = false, key = 'fake-test-key' } = {}) {
  const statements = [], requests = [];
  let connects = 0, released = 0;
  const search = load('lib/serpapi.ts', { './price': {} }, {
    URL, URLSearchParams, AbortSignal, process: { env: { SERPAPI_KEY: key } },
    fetch: async url => {
      const params = new URL(url).searchParams;
      params.delete('api_key'); requests.push(params);
      return provider ? provider() : { ok: true, json: async () => ({ local_results: [{ gps_coordinates: { latitude: 29.7604, longitude: -95.3698 } }] }) };
    },
  });
  const route = load('app/api/groups/route.ts', {
    '@/lib/pipeline': { settleRound: async () => 'voting' },
    '@/lib/api': { requireUser: async () => 29, json: body => ({ status: 200, body }), fail: (error, status = 400) => ({ status, body: { error } }) },
    '@/lib/serpapi': search, '@/lib/usCities': cities,
    '@/lib/inviteCode': { generateInviteCode: () => 'WSP-ABC' },
    '@/lib/db': { pool: { connect: async () => {
      connects++;
      return { release() { released++; }, query: async (sql, args) => {
        statements.push({ sql, args });
        if (memberFails && sql.startsWith('insert into memberships')) throw Error('SQL details must not escape');
        return { rows: sql.startsWith('insert into groups') ? [{ id: 33, invite_code: args[4] }] : [] };
      } };
    } } },
  });
  return { statements, requests, get connects() { return connects; }, get released() { return released; },
    create: city => route.POST({ json: async () => ({ name: 'Test', city }) }) };
}

test('Houston geocodes with the US qualifier, then atomically inserts coordinates and membership', async () => {
  const f = fixture();
  const result = await f.create('Houston, tx');
  assert.equal(result.status, 200);
  assert.equal(f.requests[0].get('engine'), 'google_maps');
  assert.equal(f.requests[0].get('type'), 'search');
  assert.equal(f.requests[0].get('q'), 'Houston, TX, United States');
  assert.equal(f.statements[0].sql, 'begin');
  const insert = f.statements[1];
  assert.equal(insert.args[1], 'Houston, TX');
  assert.equal(insert.args[2], 29.7604);
  assert.equal(insert.args[3], -95.3698);
  assert.match(f.statements[2].sql, /^insert into memberships/);
  assert.equal(f.statements[3].sql, 'commit');
  assert.equal(f.released, 1);
});

test('missing state, foreign/invalid states, and malformed cities are rejected before geocoding', async () => {
  for (const city of ['Houston', 'Toronto, ON', 'Houston, XX', 'Houston, Texas', '', ' , TX']) {
    const f = fixture();
    const result = await f.create(city);
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'Enter a US city like Houston, TX');
    assert.equal(f.requests.length, 0);
    assert.equal(f.connects, 0);
  }
});

test('missing key, quota, no result, and fetch errors return safe city errors without creating anything', async () => {
  const cases = [
    { key: '' },
    { provider: () => ({ ok: false }) },
    { provider: () => ({ ok: true, json: async () => ({ error: 'quota exceeded' }) }) },
    { provider: () => ({ ok: true, json: async () => ({ local_results: [] }) }) },
    { provider: () => { throw Error('provider URL and credentials must not escape'); } },
  ];
  for (const options of cases) {
    const f = fixture(options);
    const result = await f.create('Houston, TX');
    assert.equal(result.status, 422);
    assert.equal(result.body.error, "We couldn't find that city. Check the spelling or try again.");
    assert.equal(f.connects, 0);
    assert.equal(f.statements.length, 0);
  }
});

test('membership failure rolls back the group and releases the same connection', async () => {
  const f = fixture({ memberFails: true });
  const result = await f.create('Houston, TX');
  assert.equal(result.status, 500);
  assert.equal(result.body.error, "We couldn't create your group. Try again.");
  assert.equal(f.statements.at(-1).sql, 'rollback');
  assert.equal(f.statements.some(s => s.sql === 'commit'), false);
  assert.equal(f.released, 1);
});

test('suggestions cover 150–300 unique cities; unlisted US cities and DC are accepted', () => {
  assert.ok(cities.US_CITIES.length >= 150 && cities.US_CITIES.length <= 300);
  assert.equal(new Set(cities.US_CITIES).size, cities.US_CITIES.length);
  for (const city of cities.US_CITIES) assert.equal(cities.normalizeUSCity(city), city);
  assert.equal(cities.normalizeUSCity('Smalltown, tx'), 'Smalltown, TX');
  assert.equal(cities.normalizeUSCity('Washington, dc'), 'Washington, DC');
});

test('geocoder supports map center metadata and search parameter coordinates', async () => {
  for (const data of [
    { search_parameters: { ll: '@29.7604,-95.3698,14z' } },
    { search_metadata: { gps_coordinates: { latitude: 29.7604, longitude: -95.3698 } } },
    { place_results: { gps_coordinates: { latitude: 29.7604, longitude: -95.3698 } } },
  ]) {
    const f = fixture({ provider: () => ({ ok: true, json: async () => data }) });
    assert.equal((await f.create('Houston, TX')).status, 200);
    assert.equal(f.statements[1].args[2], 29.7604);
    assert.equal(f.statements[1].args[3], -95.3698);
  }
});
