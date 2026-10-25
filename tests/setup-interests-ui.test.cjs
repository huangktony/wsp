const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const preferences = require('../lib/setupPreferences.ts');
const walk = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(walk) : [n, ...walk(n.props?.children)];
const text = n => n == null || typeof n === 'boolean' ? '' : typeof n !== 'object' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n.props?.children);
function fixture(saved = {}) {
  const state = [], requests = [], pushes = [];
  let cursor = 0, initial = true, effects = [];
  const data = { availability: ['Sat evening'], interests: ['coffee'], max_distance_mi: 5, comfort_tier: '$', preferences: saved };
  const exports = {};
  const mocks = {
    react: { use: () => ({ id: '7' }), useState: value => {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof value === 'function' ? value() : value;
      return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v; }];
    }, useEffect: fn => { if (initial) effects.push(fn); } },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { useRouter: () => ({ push: value => pushes.push(value) }) },
    'next/font/google': { Inter: () => ({ className: 'inter' }) },
    '@/lib/setupPreferences': preferences,
    '@/lib/availability': require('../lib/availability.ts'),
    '@/components/AvailabilityPicker': { AvailabilityPicker: 'availability-picker' },
    '@/lib/useFindingRedirect': { useFindingRedirect() {} },
    '@/lib/finding': require('../lib/finding.ts'),
    '@/components/BackButton': { BackButton: 'back' },
    '@/components/Page': { Page: 'main', Err: 'error' },
    '@/components/LinkBank': { LinkBank: 'bank' },
    '@/components/ComfortPicker': { ComfortPicker: 'comfort' },
    '@/lib/client': { ...require('../lib/constants.ts'), toggle: (list, value) => list.includes(value) ? list.filter(v => v !== value) : [...list, value], useApi: path => ({ data: path.endsWith('/me') ? data : { id: 7 } }), api: async (path, method, body) => { requests.push({ path, method, body }); return method === 'PUT' ? { ok: true, preferencesSaved: true } : { id: 7 }; } },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/groups/[id]/setup/page.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require(name) { assert.ok(name in mocks, name); return mocks[name]; } });
  const render = () => { cursor = 0; const tree = exports.default({ params: null }); if (initial) { initial = false; effects.forEach(fn => fn()); effects = []; return render(); } return tree; };
  return { render, requests, pushes };
}
test('setup renders one interest control, accessible cycle, optional specifics, and no group Travel section', async () => {
  const f = fixture(); let tree = f.render();
  assert.match(text(tree), /Tap once if you like it, twice if you want to skip it/);
  assert.ok(!text(tree).includes('Travel'));
  assert.equal(walk(tree).filter(n => n.type === 'textarea').length, 0);
  for (const [before, after, color] of [['clear', 'into it', '#8FB78F'], ['into it', 'avoid', '#F3A5BC'], ['avoid', 'clear', 'bg-white']]) {
    walk(tree).find(n => n.props?.['aria-label'] === `Food, ${before}`).props.onClick();
    tree = f.render();
    const chip = walk(tree).find(n => n.props?.['aria-label'] === `Food, ${after}`);
    assert.ok(chip.props.className.includes(color));
    assert.equal(chip.props['aria-pressed'], after !== 'clear');
    if (after === 'avoid') assert.match(text(chip), /×Food/);
  }
  walk(tree).find(n => text(n) === '+ Add something specific' && n.type === 'button').props.onClick();
  tree = f.render();
  const input = walk(tree).find(n => n.props?.id === 'specific-interest');
  assert.equal(input.props.maxLength, 30);
  assert.equal(input.props.placeholder, "a band, a dish, a place you've been wanting to try");
  input.props.onChange({ target: { value: 'A ramen dish' } });
  tree = f.render();
  walk(tree).find(n => n.type === 'button' && text(n) === 'Add').props.onClick();
  tree = f.render();
  walk(tree).find(n => n.props?.['aria-label'] === 'Coffee, into it').props.onClick();
  tree = f.render();
  await walk(tree).find(n => n.type === 'button' && text(n) === 'Save').props.onClick();
  const saved = f.requests.find(r => r.method === 'PUT').body;
  assert.ok(!saved.interests.includes('coffee'));
  assert.deepEqual(Array.from(saved.preferences.avoids), ['coffee']);
  assert.deepEqual(JSON.parse(saved.preferences.interests_text), ['A ramen dish']);
  assert.ok(!('travel' in saved.preferences));
});
test('legacy free-text avoids remain visible and saved without a second text box', async () => {
  const f = fixture({ interests_text: 'music', avoids_text: 'loud bars', travel: true });
  const tree = f.render();
  assert.ok(walk(tree).some(n => n.props?.['aria-label'] === 'loud bars, avoid, custom'));
  assert.equal(walk(tree).filter(n => n.type === 'textarea').length, 0);
  await walk(tree).find(n => n.type === 'button' && text(n) === 'Save').props.onClick();
  assert.ok(f.requests.find(r => r.method === 'PUT').body.preferences.avoids.includes('loud bars'));
  assert.equal(f.requests.find(r => r.method === 'PUT').body.preferences.avoids_text, '');
});

test('custom chip UI supports Enter, duplicate feedback, cycling, removal and cancellation', () => {
  const f = fixture();
  let tree = f.render();
  const find = label => walk(tree).find(n => n.props?.['aria-label'] === label);
  const input = () => walk(tree).find(n => n.props?.id === 'specific-interest');
  const add = value => {
    input().props.onChange({ target: { value } }); tree = f.render();
    input().props.onKeyDown({ key: 'Enter', nativeEvent: {}, preventDefault() {} }); tree = f.render();
  };
  walk(tree).find(n => n.type === 'button' && text(n) === '+ Add something specific').props.onClick(); tree = f.render();
  assert.equal(input().props.autoFocus, true);
  add('Karaoke');
  assert.ok(find('Karaoke, into it, custom'));
  add('karaoke'); assert.match(text(tree), /already added/);
  find('Karaoke, into it, custom').props.onClick(); tree = f.render();
  assert.ok(find('Karaoke, avoid, custom'));
  find('Karaoke, avoid, custom').props.onClick(); tree = f.render();
  assert.ok(!find('Remove Karaoke'));
  add('Coffee'); assert.ok(find('Coffee, into it'));
  add('Jazz'); find('Remove Jazz').props.onClick(); tree = f.render();
  assert.ok(!find('Remove Jazz'));
  input().props.onKeyDown({ key: 'Escape', preventDefault() {} }); tree = f.render();
  assert.equal(input(), undefined);
});
test('reloading restores custom states and legacy comma-separated interests', () => {
  const f = fixture({ interests_text: 'Karaoke, Ramen', avoids: ['crowds'] });
  const tree = f.render();
  for (const label of ['Karaoke, into it, custom', 'Ramen, into it, custom', 'crowds, avoid, custom']) {
    assert.ok(walk(tree).some(n => n.props?.['aria-label'] === label));
  }
  assert.ok(walk(tree).some(n => n.props?.className?.includes('[&_*]:[font-family:inherit]')));
  assert.ok(walk(tree).filter(n => n.props?.className?.includes('label ')).every(n => n.props.className.includes('font-bold')));
});

test('five custom chips disable the last dashed button and show the limit message', () => {
  const f = fixture({ interests_text: 'Jazz, Ramen, Pottery, Kites, Karaoke' });
  const tree = f.render();
  const button = walk(tree).find(n => n.type === 'button' && text(n) === 'Limit reached');
  assert.equal(button.props.disabled, true);
  assert.match(button.props.className, /border-2 border-dashed border-\[#6F98A2\]/);
  assert.match(text(tree), /up to 5 custom interests/);
});
