// Pure unit tests: database and authentication imports are replaced before execution.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, {
    exports,
    require: (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'zod') return require('zod');
      throw new Error(`Unexpected import (no database access allowed): ${name}`);
    },
  }, { filename: file });
  return exports;
}
const api = {
  requireUser: async () => 7,
  json: (body) => ({ body, status: 200, headers: new Headers() }),
  fail: (error, status = 400) => ({ body: { error }, status }),
};
const request = (body) => ({ json: async () => body });

test('generator uses crypto.randomInt with the exact readable alphabet', () => {
  let index = 0;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const helper = load('lib/inviteCode.ts', {
    'node:crypto': { randomInt: (max) => { assert.equal(max, alphabet.length); return index++ % max; } },
  });
  let generated = '';
  for (let i = 0; i < 8; i++) generated += helper.generateInviteCode(4).slice(4);
  assert.equal(generated, alphabet);
  assert.match(helper.generateInviteCode(), /^WSP-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{3}$/);
});

function createRoute(q1, generate = () => 'WSP-BCD', q = async () => []) {
  return load('app/api/groups/route.ts', {
    '@/lib/pipeline': { settleRound: async () => 'voting' },
    '@/lib/db': { q, pool: { connect: async () => ({ release() {}, query: async (sql, params) => {
      if (sql.startsWith('insert into groups')) { const row = await q1(sql, params); return { rows: row ? [row] : [] }; }
      if (sql.startsWith('insert into memberships')) return { rows: await q(sql, params) };
      return { rows: [] };
    } }) } }, '@/lib/api': api,
    '@/lib/usCities': load('lib/usCities.ts', {}),
    '@/lib/serpapi': { geocodeCity: async () => ({ latitude: 29.7604, longitude: -95.3698 }) },
    '@/lib/inviteCode': { generateInviteCode: generate },
  });
}

test('create ignores client codes and returns the server-generated saved code', async () => {
  const route = createRoute(async (sql, params) => {
    assert.match(sql, /on conflict \(invite_code\) do nothing/);
    assert.equal(params[4], 'WSP-BCD');
    return { id: 42, invite_code: params[4] };
  });
  const result = await route.POST(request({ name: 'Test', city: 'Austin, TX', inviteCode: 'client-chosen' }));
  assert.equal(result.body.inviteCode, 'WSP-BCD');
  assert.equal(result.body.id, 42);
});

test('ten insert collisions switch to four characters; further collisions retry', async () => {
  const lengths = [];
  let inserts = 0, memberships = 0;
  const route = createRoute(async () => {
    inserts++;
    return inserts <= 11 ? null : { id: 42, invite_code: 'WSP-ABCD' };
  }, (length) => { lengths.push(length); return length === 3 ? 'WSP-ABC' : 'WSP-ABCD'; },
  async () => { memberships++; return []; });
  const result = await route.POST(request({ name: 'Test', city: 'Austin, TX' }));
  assert.deepEqual(lengths, [...Array(10).fill(3), 4, 4]);
  assert.equal(memberships, 1);
  assert.equal(result.body.inviteCode, 'WSP-ABCD');
});

test('name/city validation keeps existing errors without querying', async () => {
  const route = createRoute(async () => { throw new Error('Must not query'); });
  for (const body of [null, {}, { name: '', city: 'Austin, TX' }]) {
    assert.equal((await route.POST(request(body))).body.error, 'name and city required');
  }
});

test('unrelated database failures are not retried', async () => {
  const route = createRoute(async () => { throw new Error('connection unavailable'); });
  const result = await route.POST(request({ name: 'Test', city: 'Austin, TX' }));
  assert.equal(result.status, 500);
  assert.equal(result.body.error, "We couldn't create your group. Try again.");
});

test('unauthenticated creation never queries or generates a code', async () => {
  const unexpected = () => { throw new Error('Must not run'); };
  const route = load('app/api/groups/route.ts', {
    '@/lib/pipeline': { settleRound: async () => 'voting' },
    '@/lib/db': { pool: { connect: unexpected }, q: unexpected },
    '@/lib/serpapi': { geocodeCity: unexpected },
    '@/lib/usCities': load('lib/usCities.ts', {}),
    '@/lib/api': { ...api, requireUser: async () => api.fail('not signed in', 401) },
    '@/lib/inviteCode': { generateInviteCode: unexpected },
  });
  assert.equal((await route.POST(request({ name: 'Test', city: 'Austin, TX' }))).status, 401);
});

test('join trims and case-folds new and legacy codes', async () => {
  for (const code of ['legacy', 'wsp-ab2']) {
    const route = load('app/api/groups/join/route.ts', {
      '@/lib/api': api,
      '@/lib/db': { q: async () => [], q1: async (sql, params) => {
        assert.match(sql, /upper\(invite_code\)=\$1/);
        assert.equal(params[0], code.toUpperCase());
        return { id: 42 };
      } },
    });
    assert.equal((await route.POST(request({ code: ` ${code} ` }))).body.id, 42);
  }
});

test('preview endpoint and client preview flow are removed', () => {
  assert.equal(fs.existsSync('app/api/groups/invite-code/route.ts'), false);
  const page = fs.readFileSync('app/groups/new/page.tsx', 'utf8');
  assert.doesNotMatch(page, /inviteCode|invite-code|clipboard|Copied|INVITE CODE|Code will be created/);
});
