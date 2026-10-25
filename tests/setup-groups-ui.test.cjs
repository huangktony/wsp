const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { exports, URLSearchParams, require(name) {
    if (name in mocks) return mocks[name];
    if (name === 'react/jsx-runtime') return require(name);
    if (name === '@/lib/finding') return load('lib/finding.ts');
    if (name === '@/lib/groupStories') return load('lib/groupStories.ts');
    if (name === '@/lib/roundParticipation') return load('lib/roundParticipation.ts');
    if (name === '@/components/RoundInclusion') return { InclusionBanner: 'banner', RerunPlans: 'rerun' };
    throw Error(`Unmocked import: ${name}`);
  } });
  return exports;
}
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
const text = n => n == null || typeof n === 'boolean' ? '' : typeof n !== 'object' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n.props?.children);
const react = { useState: v => [v, () => {}], useRef: v => ({ current: v }), useEffect() {}, Suspense: 'suspense' };
function groups(data, query = '', owed = []) {
  const Page = load('app/groups/page.tsx', {
    react, 'next/link': { default: 'a' }, 'next/font/google': { Inter: () => ({ className: 'inter' }) },
    'next/navigation': { useRouter: () => ({ replace() {} }), usePathname: () => '/groups', useSearchParams: () => new URLSearchParams({ q: query }) },
    '@/components/Page': { Page: 'main' }, '@/components/Smiley': { Smiley: 'svg' },
    '@/lib/format': { formatMoney: v => `$${v}` },
    '@/lib/client': { useApi: url => ({ data: url === '/api/groups' ? data : owed }) },
  }).default;
  const inner = Page().props.children;
  return inner.type(inner.props);
}
const fixtures = [
  { id: 5, name: 'Final friends', city: 'Houston, TX', members: 3, status: 'FINAL', round_status: 'final' },
  { id: 4, name: 'Coffee club', city: 'Austin, TX', members: 2, status: 'VOTING OPEN', round_status: 'voting', has_plans: true, can_vote: true, my_voted: false },
  { id: 3, name: 'Setup friends', city: 'Houston, TX', members: 1, status: 'SET UP' },
  { id: 2, name: 'Park club', city: 'Austin, TX', members: 4, status: 'VOTING OPEN', round_status: 'voting', has_plans: true, can_vote: true, my_voted: true },
];
for (const [label, data, ids] of [
  ['zero', fixtures.filter(g => g.status !== 'VOTING OPEN'), []],
  ['one', fixtures.slice(0, 3), [4]],
  ['multiple', fixtures, [4, 2]],
]) test(`${label} open voting groups: cards in order, others listed once, no final/setup voting CTA`, () => {
  const tree = groups(data);
  assert.match(text(tree), /WSP HANGOUT/);
  const cards = nodes(tree).filter(n => n.type === 'article' && n.props.className.includes('snap-start'));
  assert.deepEqual(cards.map(n => Number(n.key)), ids);
  const row = nodes(tree).find(n => n.props?.['aria-label'] === 'Groups with voting open');
  assert.equal(!!row, ids.length > 0);
  if (row) {
    assert.match(row.props.className, /overflow-x-auto/);
    assert.match(row.props.className, /snap-mandatory/);
    for (const card of cards) assert.match(card.props.className, /snap-start/);
  }
  const actions = nodes(tree).find(n => n.props?.['aria-label'] === 'Needs action');
  assert.equal(!!actions, ids.length > 0);
  assert.equal(text(tree).includes('Needs Action'), ids.length > 0);
  if (actions) {
    assert.equal(nodes(actions).filter(n => n.type === 'a').length, ids.length);
    assert.ok(!nodes(actions).some(n => n.props?.href === '/groups/new'));
  }
  const content = nodes(tree).find(n => n.props?.className === 'flex flex-col gap-4 px-6');
  for (const g of data) {
    assert.equal(nodes(content).filter(n => n.type === 'h2' && text(n) === g.name).length, 1);
  }
  const voteLinks = nodes(content).filter(n => n.type === 'a' && /Vote now|Change vote/.test(text(n)));
  assert.deepEqual(voteLinks.map(n => n.props.href), ids.map(id => `/groups/${id}/plans`));
  if (ids.includes(2)) assert.match(text(voteLinks.at(-1)), /Change vote/);
});
test('groups search filters cards and remaining list, preserving empty state and reminders', () => {
  const tree = groups(fixtures, 'Houston');
  assert.equal(nodes(tree).filter(n => n.type === 'article' && n.props.className.includes('snap-start')).length, 0);
  assert.equal(nodes(tree).filter(n => n.type === 'h2').length, 2);
  assert.ok(text(groups(fixtures, 'no match')).includes('No groups match'));
  assert.ok(text(groups([])).includes('No groups yet'));
  const reminder = { id: 1, group_id: 5, payer_name: 'Pat', amount: 12, group_name: 'Final friends' };
  assert.ok(text(groups(fixtures, '', [reminder])).includes('You owe Pat'));
  assert.ok(!text(groups(fixtures, 'Houston', [reminder])).includes('You owe Pat'));
});
const tiers = load('lib/tiers.ts');
const comfort = load('lib/comfort.ts', { './price': load('lib/price.ts'), './tiers': tiers, zod: require('zod'), './constants': load('lib/constants.ts') });
function picker(suggested, picked, onPick = () => {}) {
  const { ComfortPicker } = load('components/ComfortPicker.tsx', {
    react, '@/lib/comfort': comfort, '@/lib/tiers': tiers,
  });
  return ComfortPicker({ suggested, picked, avg: null, onPick });
}
test('all comfort options expose canonical ranges even without a linked account or selection', () => {
  for (const [suggested, picked] of [[null, null], ['$$', null], ['$$', '$']]) {
    const tree = picker(suggested, picked);
    const radios = nodes(tree).filter(n => n.props?.role === 'radio');
    assert.equal(radios.length, 3);
    assert.deepEqual(radios.map(n => text(n)), ['$Up to $12', '$$Over $12 through $30', '$$$Over $30']);
    assert.equal(radios.filter(n => n.props.tabIndex === 0).length, 1);
    for (const radio of radios) assert.match(radio.props['aria-label'], /per person per stop/);
    assert.match(text(tree), /Prices are estimates/);
    assert.equal(text(tree).includes('Use suggested'), picked === '$');
  }
});
test('comfort keyboard selection wraps and choosing suggestion resets override', () => {
  const picked = [];
  const radios = nodes(picker('$$', '$', v => picked.push(v))).filter(n => n.props?.role === 'radio');
  let prevented = false;
  radios[0].props.onKeyDown({ key: 'ArrowLeft', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  radios[1].props.onClick();
  assert.deepEqual(picked, ['$$$', null]);
});

test('Groups API settles voting candidates before labeling deadline/all-votes final rounds', async () => {
  for (const outcome of ['final', 'vetoed', 'voting']) {
    let settled = false;
    const { GET } = load('app/api/groups/route.ts', {
      zod: require('zod'), '@/lib/api': { requireUser: async () => 1, json: value => value },
      '@/lib/inviteCode': {}, '@/lib/serpapi': {}, '@/lib/usCities': {},
      '@/lib/pipeline': { settleRound: async id => { assert.equal(id, 10); settled = true; } },
      '@/lib/db': { q: async sql => {
        assert.match(sql, /order by \(status='final'\) desc,id desc/);
        if (!sql.includes('left join lateral')) return [{ id: 10 }];
        assert.equal(settled, true);
        return [{ id: 5, round_status: outcome, has_plans: true, my_voted: true }];
      } },
    });
    const result = await GET();
    assert.equal(result[0].status, outcome === 'final' ? 'FINAL' : outcome === 'voting' ? 'VOTING OPEN' : 'SET UP');
  }
});

test('failed plans show the provider error and a keyboard-accessible retry instead of a loading skeleton', () => {
  const page = load('app/groups/[id]/plans/page.tsx', {
    react: { ...react, use: value => value, useMemo: fn => fn() },
    'next/link': { default: 'a' }, 'next/font/google': { Inter: () => ({ className: 'inter' }) },
    'next/navigation': { useRouter: () => ({ replace() {} }) }, '@/lib/useSetupGate': { useSetupGate() {} },
    '@/components/Page': { Page: 'main', Err: 'error' }, '@/components/TierBadge': { TierBadge: 'badge' },
    '@/components/Skeleton': { Skeleton: 'skeleton', SkeletonBlock: 'block' },
    '@/lib/client': { useApi: () => ({ data: { round: { status: 'failed', search_error: 'Search service unavailable. Try again.' }, plans: [] } }) },
  }).default;
  const tree = page({ params: { id: '5' } });
  assert.match(text(tree), /Search service unavailable/);
  assert.equal(nodes(tree).find(n => n.type === 'a' && text(n) === 'Try again').props.href, '/groups/5/finding');
  assert.equal(nodes(tree).some(n => n.type === 'skeleton'), false);
});
