// Paying dues with Nessie transfers, and leaving a group with unpaid dues. Handlers run against an in-memory db and a fake Nessie
// (no network, no database), so this checks behavior and the requests we send, not the SQL text.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, console, process: { env: { NESSIE_API_KEY: 'k', USE_MOCKS: 'false' } }, AbortSignal, Promise, Date, Math, Number, JSON, ...globals, require(name) {
    if (name in mocks) return mocks[name];
    if (name.startsWith('./')) return (mocks[name] = load(path.join('lib', name.slice(2) + '.ts'), mocks, globals));
    throw Error(`Unmocked import: ${name}`);
  } }, { filename: file });
  return exports;
}

// Fake Nessie. Balances never move, like the real sandbox.
function fakeNessie(accounts) {
  const s = { accounts, transfers: {}, deposits: {}, withdrawals: {}, failTransfer: false, calls: [] };
  let n = 0;
  const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
  s.fetch = async (url, init = {}) => {
    const u = new URL(url), method = init.method ?? 'GET', m = u.pathname.match(/^\/accounts\/([^/]+)(?:\/(\w+))?$/);
    s.calls.push(`${method} ${u.pathname}`);
    if (!m || !(m[1] in s.accounts)) return res(404, { message: 'not found' });
    const [, id, kind] = m;
    if (!kind) return res(200, { _id: id, balance: s.accounts[id] });
    const store = s[kind];
    if (method === 'GET') return store[id]?.length ? res(200, store[id]) : res(404, { message: 'none' });
    if (kind === 'transfers' && s.failTransfer) return res(400, { message: 'rejected' });
    const row = { _id: `${kind}-${++n}`, ...JSON.parse(init.body) };
    (store[id] ??= []).push(row);
    return res(201, { objectCreated: row });
  };
  return s;
}

function paymentsFixture({ memberAcct = 'acctM', payerAcct = 'acctP', balances = { acctM: 100, acctP: 100 }, amount = 12.5 } = {}) {
  const nessie = fakeNessie({ ...balances });
  const s = { pay: { id: 7, amount, status: 'owed', transfer_id: null, paid_at: null, transfer_status: null }, nessie };
  const db = {
    q1: async (sql, a) => {
      if (sql.includes('from payments p join plan_rounds r on r.id=p.round_id join groups g')) return a[1] === 2 ? { ...s.pay, from_acct: memberAcct, to_acct: payerAcct, name: 'Friday Crew' } : null;
      if (sql.startsWith('update payments set transfer_id=\'sending\'')) {
        if (s.pay.status !== 'owed' || s.pay.transfer_id) return null;
        s.pay.transfer_id = 'sending'; return { id: 7 };
      }
      if (sql.startsWith('select coalesce(sum(p.amount)')) return { owed: s.pay.status === 'owed' ? s.pay.amount : 0 };
      throw Error(`Unexpected q1: ${sql}`);
    },
    q: async (sql, a) => {
      if (sql.startsWith("update payments set status='paid'")) { Object.assign(s.pay, { status: 'paid', transfer_id: a[1], transfer_status: a[2] }); return []; }
      if (sql.startsWith('update payments set transfer_id=null')) { if (s.pay.status === 'owed') s.pay.transfer_id = null; return []; }
      throw Error(`Unexpected q: ${sql}`);
    },
  };
  const mocks = { '@/lib/db': db };
  const nessieMod = load('lib/nessie.ts', { ...mocks }, { fetch: nessie.fetch });
  mocks['@/lib/nessie'] = nessieMod;
  const payments = load('lib/payments.ts', mocks);
  return { s, nessie, payments, mocks, db };
}

test('a successful payment posts a transfer, marks the row paid and saves the transfer id', async () => {
  const { s, nessie, payments } = paymentsFixture();
  const r = await payments.payDue(7, 2);
  assert.equal(r.ok, true);
  assert.equal(s.pay.status, 'paid');
  assert.equal(s.pay.transfer_id, nessie.transfers.acctM[0]._id);
  assert.match(nessie.transfers.acctM[0].description, /^SideQuest: Friday Crew/);
  assert.equal(nessie.transfers.acctM[0].amount, 13);
});

test('a failed Nessie transfer leaves the payment owed and retryable', async () => {
  const { s, nessie, payments } = paymentsFixture();
  nessie.failTransfer = true;
  const r = await payments.payDue(7, 2);
  assert.equal(r.status, 502);
  assert.match(r.error, /nothing was charged/);
  assert.equal(s.pay.status, 'owed');
  assert.equal(s.pay.transfer_id, null);
  nessie.failTransfer = false;
  assert.equal((await payments.payDue(7, 2)).ok, true);
});

test('insufficient funds and a missing account keep the payment owed with a clear error', async () => {
  const poor = paymentsFixture({ balances: { acctM: 5, acctP: 100 } });
  const r1 = await poor.payments.payDue(7, 2);
  assert.match(r1.error, /Insufficient funds/);
  assert.equal(poor.s.pay.status, 'owed');
  assert.deepEqual(poor.nessie.transfers, {});
  const missing = paymentsFixture({ payerAcct: null });
  const r2 = await missing.payments.payDue(7, 2);
  assert.match(r2.error, /hasn't linked a bank account/);
  assert.equal(missing.s.pay.status, 'owed');
});

test('double pay: a paid row, an existing transfer id, or a second tap sends nothing more', async () => {
  const { s, nessie, payments } = paymentsFixture();
  const [a, b] = await Promise.all([payments.payDue(7, 2), payments.payDue(7, 2)]);
  assert.equal([a, b].filter(r => r.ok).length, 1);
  assert.equal(nessie.transfers.acctM.length, 1);
  assert.equal((await payments.payDue(7, 2)).status, 409);
  s.pay.status = 'owed'; s.pay.transfer_id = 'transfers-9';
  assert.equal((await payments.payDue(7, 2)).status, 409);
  assert.equal(nessie.transfers.acctM.length, 1);
});

test("someone else's payment cannot be paid", async () => {
  const { s, payments } = paymentsFixture();
  assert.equal((await payments.payDue(7, 3)).status, 403);
  assert.equal(s.pay.status, 'owed');
});

test('after a transfer both sides see it: money sent on the member, money received on the payer, row paid', async () => {
  const { s, nessie, payments } = paymentsFixture();
  await payments.payDue(7, 2);
  const { parseSplitDescription } = load('lib/ledger.ts', {});
  const out = nessie.withdrawals.acctM, inn = nessie.deposits.acctP;
  assert.equal(out.length, 1);
  assert.equal(inn.length, 1);
  assert.deepEqual([parseSplitDescription(out[0].description).payId, parseSplitDescription(out[0].description).acct, parseSplitDescription(out[0].description).cents], [7, 'acctP', 1250]);
  assert.deepEqual([parseSplitDescription(inn[0].description).payId, parseSplitDescription(inn[0].description).acct], [7, 'acctM']);
  assert.equal(s.pay.status, 'paid'); // the same row is what the payer's and every member's screen read
  assert.equal(s.pay.transfer_status, 'completed');
});

test('a retry after a half-finished payment reuses the transfer instead of sending a second one', async () => {
  const { nessie, payments } = paymentsFixture();
  await payments.payDue(7, 2);
  const again = paymentsFixture();
  again.nessie.transfers.acctM = [{ _id: 'transfers-old', description: 'SideQuest: Friday Crew (pay 7, $12.50)', status: 'completed' }];
  await again.payments.payDue(7, 2);
  assert.equal(again.nessie.transfers.acctM.length, 1);
  assert.equal(again.s.pay.transfer_id, 'transfers-old');
});

function leaveFixture(owes) {
  const f = paymentsFixture();
  if (!owes) f.s.pay.status = 'paid';
  const group = { created_by: 1 };
  const members = new Set([1, 2, 3]);
  const q1 = f.db.q1;
  f.db.q1 = async (sql, a) => {
    if (sql.startsWith('select created_by from groups')) return group;
    if (sql.startsWith('select 1 from memberships')) return members.has(a[1]) ? { one: 1 } : null;
    if (sql.startsWith('with xfer')) { members.delete(a[1]); return { user_id: a[1] }; }
    return q1(sql, a);
  };
  const q = f.db.q;
  f.db.q = async (sql, a) => sql.startsWith('select user_id from memberships') ? [...members].filter(u => u !== a[1]).map(user_id => ({ user_id })) : q(sql, a);
  f.groups = load('lib/groups.ts', { '@/lib/db': f.db, '@/lib/payments': f.payments });
  f.members = members;
  return f;
}

test('leaving is blocked while dues are owed, for members and for an owner transferring ownership', async () => {
  const f = leaveFixture(true);
  const member = await f.groups.leaveGroup(5, 2);
  assert.equal(member.status, 409);
  assert.equal(member.error, 'You owe $12.50 in this group. Pay your dues before leaving.');
  assert.ok(f.members.has(2));
  f.s.pay.user_id = 1; // the same check covers the owner (user 1)
  const owner = await f.groups.leaveGroup(5, 1, 2);
  assert.equal(owner.status, 409);
  assert.ok(f.members.has(1));
});

test('leaving works once the dues are paid', async () => {
  const f = leaveFixture(true);
  await f.payments.payDue(7, 2);
  assert.equal((await f.groups.leaveGroup(5, 2)).ok, true);
  assert.ok(!f.members.has(2));
  assert.equal((await leaveFixture(false).groups.leaveGroup(5, 2)).ok, true);
});
