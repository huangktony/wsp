// Profile name/photo updates and theme persistence. Handlers run against an in-memory users row
// that mimics the update's effects (no live database).
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
    throw Error(`Unmocked import: ${name}`);
  } }, { filename: file });
  return exports;
}
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
function fixture() {
  const user = { name: 'Sam', avatar: null };
  let writes = 0;
  const db = { q: async (sql, a) => {
    assert.ok(sql.startsWith('update users set name=coalesce'), sql);
    writes++;
    if (a[0] !== null) user.name = a[0];
    if (a[1]) user.avatar = a[2];
    return [];
  } };
  const api = { requireUser: async () => 1, json: (body, status = 200) => ({ body, status }), fail: (error, status = 400) => ({ body: { error }, status }) };
  const mocks = { '@/lib/db': db, '@/lib/api': api, zod: require('zod') };
  mocks['@/lib/profile'] = load('lib/profile.ts', mocks);
  const patch = load('app/api/me/profile/route.ts', mocks).PATCH;
  return { user, writes: () => writes, patch: body => patch({ json: async () => body }) };
}

test('editing the name trims and saves; empty names are rejected', async () => {
  const f = fixture();
  assert.equal((await f.patch({ name: '  Samantha  ' })).status, 200);
  assert.equal(f.user.name, 'Samantha');
  for (const name of ['', '   ']) {
    const r = await f.patch({ name });
    assert.equal(r.status, 400, JSON.stringify(name));
    assert.equal(f.user.name, 'Samantha');
  }
  assert.equal((await f.patch({})).status, 400);
  assert.equal(f.writes(), 1);
  // a name change leaves the photo alone
  await f.patch({ avatar: PHOTO });
  await f.patch({ name: 'Sam' });
  assert.equal(f.user.avatar, PHOTO);
});

test('removing the photo resets to the default initial avatar', async () => {
  const f = fixture();
  const { Avatar } = load('components/Avatar.tsx', { 'react/jsx-runtime': require('react/jsx-runtime') });
  assert.equal((await f.patch({ avatar: 'data:image/svg+xml;base64,AAAA' })).status, 400); // only resized JPEGs
  assert.equal((await f.patch({ avatar: 'https://example.com/x.jpg' })).status, 400);
  assert.equal(f.user.avatar, null);
  assert.equal((await f.patch({ avatar: PHOTO })).status, 200);
  let el = Avatar({ name: f.user.name, src: f.user.avatar });
  assert.equal(el.type, 'img');
  assert.equal(el.props.src, PHOTO);
  assert.equal((await f.patch({ avatar: null })).status, 200);
  assert.equal(f.user.avatar, null);
  el = Avatar({ name: f.user.name, src: f.user.avatar });
  assert.equal(el.type, 'span');
  assert.equal(el.props.children, 'S');
});

test('theme choice persists across reloads and is applied to the page', () => {
  const storage = new Map();
  const localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  const attrs = {};
  const document = { documentElement: { getAttribute: k => attrs[k], setAttribute: (k, v) => { attrs[k] = v; } } };
  // A "page load": inline head script runs first, then the theme module is loaded.
  const boot = () => {
    const window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
    const theme = load('lib/theme.ts', {}, { localStorage, document, window });
    vm.runInNewContext(theme.themeScript, { window, document, localStorage });
    window.__applyTheme = () => vm.runInNewContext(theme.themeScript, { window, document, localStorage });
    return theme;
  };
  let theme = boot();
  assert.equal(theme.getThemePref(), 'system');
  assert.equal(attrs['data-theme'], 'light');
  theme.setThemePref('dark');
  assert.equal(attrs['data-theme'], 'dark'); // applied immediately
  delete attrs['data-theme'];
  theme = boot(); // reload
  assert.equal(theme.getThemePref(), 'dark');
  assert.equal(attrs['data-theme'], 'dark');
  assert.equal(theme.resolvedTheme(), 'dark');
  theme.setThemePref('light');
  assert.equal(boot().getThemePref(), 'light');
});

test('avatar shows first and last initials', () => {
  const { initials } = load('components/Avatar.tsx', { 'react/jsx-runtime': require('react/jsx-runtime') });
  assert.equal(initials('Demo Dana'), 'DD');
  assert.equal(initials('  sam  '), 'S');
  assert.equal(initials('Mary Ann Lee'), 'ML');
});
