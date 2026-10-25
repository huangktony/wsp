const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

async function run({ mismatch = false, badSchema = false, connectFailure = false } = {}) {
  const calls = [], output = [];
  let schemas = 0, released = false, done;
  const finished = new Promise(resolve => { done = resolve; });
  const processMock = { exitCode: 0 };
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('information_schema.columns')) {
        schemas++;
        return { rows: [{ table_name: 'users', column_name: 'id', data_type: mismatch && schemas > 1 ? 'text' : 'integer' }] };
      }
      if (badSchema && sql.startsWith('explain')) throw Object.assign(new Error('private database detail'), { code: '42703' });
      return { rows: [] };
    },
    release() { released = true; },
  };
  const source = fs.readFileSync('scripts/migrate-travel.ts', 'utf8').replaceAll('import.meta.url', "'file:///repo/scripts/migrate-travel.ts'");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, {
    exports: {}, URL, process: processMock,
    console: { log: (...args) => output.push(args.join(' ')), error: (...args) => output.push(args.join(' ')) },
    require(name) {
      if (name === 'node:fs') return { readFileSync: () => fs.readFileSync('db/migrations/travel.sql', 'utf8') };
      if (name === '../lib/db') return { pool: { connect: async () => { if (connectFailure) throw Object.assign(new Error('secret host'), { code: 'ENOTFOUND' }); return client; }, end: async () => done() } };
      throw Error(name);
    },
  });
  await finished;
  return { calls, output: output.join('\n'), released, exitCode: processMock.exitCode };
}
test('Travel migration commits only after schema checks and does not seed data', async () => {
  const r = await run();
  assert.equal(r.calls[0], 'begin');
  assert.equal(r.calls.at(-1), 'commit');
  assert.ok(r.calls.some(s => s.includes('create table if not exists travel_trips')));
  assert.ok(!r.calls.some(s => /insert into|delete from|drop table/i.test(s)));
  assert.equal(r.released, true);
  assert.equal(r.exitCode, 0);
});
test('Travel migration rolls back on existing column changes or incomplete Travel schema', async () => {
  for (const args of [{ mismatch: true }, { badSchema: true }]) {
    const r = await run(args);
    assert.equal(r.calls.at(-1), 'rollback');
    assert.ok(!r.calls.includes('commit'));
    assert.equal(r.released, true);
    assert.equal(r.exitCode, 1);
    assert.ok(!r.output.includes('private database detail'));
  }
});
test('Travel migration connection failure executes no SQL and redacts connection details', async () => {
  const r = await run({ connectFailure: true });
  assert.equal(r.calls.length, 0);
  assert.equal(r.exitCode, 1);
  assert.match(r.output, /ENOTFOUND/);
  assert.ok(!r.output.includes('secret host'));
});
