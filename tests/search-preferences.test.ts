import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { findPlaces, categoriesFor, queryFor, zoomForMiles } from '../lib/serpapi';
import { roundSettings, searchPreferences, settingsChanged, type SearchMember } from '../lib/roundSettings';

const oldKey = process.env.SERPAPI_KEY, oldSample = process.env.USE_SAMPLE_PLACES;
before(() => { process.env.SERPAPI_KEY = 'test-only'; delete process.env.USE_SAMPLE_PLACES; });
after(() => {
  if (oldKey === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = oldKey;
  if (oldSample === undefined) delete process.env.USE_SAMPLE_PLACES; else process.env.USE_SAMPLE_PLACES = oldSample;
});
const center = { latitude: 0, longitude: 0 };
const venue = (title: string, miles: number, price?: string, type = 'Restaurant') => ({
  title, price, type, rating: 4.5, reviews: 50, address: `${title} Street`,
  gps_coordinates: { latitude: miles / 69.09, longitude: 0 },
});
function transport(rows: any[]) {
  const calls: Record<string, string>[] = [];
  const request = (async (url: any) => {
    const params = new URL(url).searchParams;
    params.delete('api_key');
    calls.push(Object.fromEntries(params));
    return { ok: true, json: async () => ({ local_results: rows }) } as Response;
  }) as typeof fetch;
  return { calls, request };
}

test('1 versus 10 miles changes zoom, keeps strict GPS limits, and retrieves more distant candidates', async () => {
  const rows = [...Array.from({ length: 8 }, (_, i) => venue(`Near ${i}`, 0.2 + i * 0.05, '$')),
    ...Array.from({ length: 4 }, (_, i) => venue(`Far ${i}`, 4 + i, '$')), venue('Outside', 30, '$')];
  const f = transport(rows);
  const near = await findPlaces(['food'], 'Houston, TX', '$', 1, { center, fetch: f.request });
  const far = await findPlaces(['food'], 'Houston, TX', '$', 10, { center, fetch: f.request });
  assert.equal(near.length, 8);
  assert.equal(far.length, 12);
  assert.ok(near.every(p => p.distanceMi! <= 1));
  assert.ok(far.every(p => p.distanceMi! <= 10));
  assert.deepEqual(f.calls.map(c => c.ll), ['@0,0,15z', '@0,0,12z']);
  assert.ok(f.calls.every(c => c.start === '0')); // enough candidates: never page two
  assert.deepEqual([1, 2, 5, 10, 20, 100].map(zoomForMiles), [15, 14, 13, 12, 11, 10]);
});

test('budget filters actual price levels, numeric ranges, and unknown restaurant prices', async () => {
  const f = transport([venue('Cheap', 0.2, '$'), venue('Moderate', 0.2, '$$'), venue('Pricey', 0.2, '$$$'),
    venue('Luxury', 0.2, '$$$$'), venue('Range', 0.2, '$10–20'), venue('Unknown restaurant', 0.2),
    venue('Park', 0.2, undefined, 'Park'), venue('Paid park', 0.2, undefined, 'Amusement park')]);
  const cheap = await findPlaces(['food'], 'Houston, TX', '$', 1, { center, fetch: f.request });
  assert.deepEqual(cheap.map(p => p.name).sort(), ['Cheap', 'Park']);
  const higher = await findPlaces(['food'], 'Houston, TX', '$$$', 1, { center, fetch: f.request });
  for (const name of ['Cheap', 'Moderate', 'Pricey', 'Range']) assert.ok(higher.some(p => p.name === name));
  assert.ok(!higher.some(p => p.name === 'Luxury'));
  const luxury = await findPlaces(['food'], 'Houston, TX', '$$$$', 1, { center, fetch: f.request });
  assert.ok(luxury.some(p => p.name === 'Luxury'));
});

test('sparse searches page once then widen only one band, always attaching a disclosure', async () => {
  const f = transport([venue('Near', 0.3, '$'), venue('Extra 1', 1.3, '$'), venue('Extra 2', 1.4, '$'),
    venue('Too far', 3, '$'), venue('Too pricey', 1.2, '$$$')]);
  const places = await findPlaces(['food'], 'Houston, TX', '$', 1, { center, fetch: f.request });
  assert.equal(places.length, 3);
  assert.ok(places.every(p => p.distanceMi! <= 1.5 && p.radiusNote?.includes('expanded to 1.5 mi')));
  assert.deepEqual(f.calls.map(c => [c.ll, c.start]), [['@0,0,15z', '0'], ['@0,0,15z', '20'], ['@0,0,14z', '0']]);
});

test('identical requests are cached for 12 hours; zoom, query, and page are separate keys', async () => {
  const f = transport(Array.from({ length: 8 }, (_, i) => venue(`Place ${i}`, 0.2, '$')));
  const clock = Date.now;
  let now = clock(); Date.now = () => now;
  try {
    await Promise.all([1, 1].map(mi => findPlaces(['food'], 'Houston, TX', '$', mi, { center, fetch: f.request })));
    assert.equal(f.calls.length, 1); // concurrent requests share the in-flight fetch
    await findPlaces(['food'], 'Houston, TX', '$', 10, { center, fetch: f.request });
    await findPlaces(['outdoors'], 'Houston, TX', '$', 10, { center, fetch: f.request });
    assert.equal(f.calls.length, 3);
    now += 12 * 60 * 60 * 1000 + 1;
    await findPlaces(['food'], 'Houston, TX', '$', 1, { center, fetch: f.request });
    assert.equal(f.calls.length, 4);
  } finally { Date.now = clock; }
});

test('interests retain their own distinct queries instead of being padded with unrelated categories', () => {
  for (const interest of ['food', 'outdoors', 'indoor games', 'nightlife', 'creative']) {
    assert.deepEqual(categoriesFor([interest]), [interest]);
  }
  const queries = ['food', 'outdoors', 'indoor games', 'nightlife', 'creative'].map(i => queryFor(i, '$'));
  assert.equal(new Set(queries).size, queries.length);
});

const members: SearchMember[] = [
  { user_id: 1, availability: ['Sat evening'], interests: ['food'], max_distance_mi: 10, comfort_tier: '$$$', budget_tier: '$' },
  { user_id: 2, availability: ['Sun afternoon'], interests: ['outdoors'], max_distance_mi: 5, comfort_tier: '$', budget_tier: '$$$' },
  { user_id: 3, availability: [], interests: [], max_distance_mi: 1, comfort_tier: '$$', budget_tier: '$$' },
];
test('distance uses only finished members; budget is the lowest effective member tier', () => {
  assert.deepEqual(searchPreferences(members), { distance: 5, tier: '$' });
  assert.equal(searchPreferences(members.map(m => ({ ...m, availability: [] }))).distance, null);
});

test('any changed member setting, joining/leaving, or absent legacy snapshot makes a round stale', () => {
  const saved = roundSettings(members);
  assert.equal(settingsChanged(saved, [...members].reverse()), false);
  for (const edit of [{ max_distance_mi: 15 }, { comfort_tier: '$$' }, { interests: ['creative'] }, { availability: ['Fri evening'] }]) {
    assert.equal(settingsChanged(saved, members.map((m, i) => i === 0 ? { ...m, ...edit } : m)), true);
  }
  assert.equal(settingsChanged(saved, members.slice(1)), true);
  assert.equal(settingsChanged(null, members), true);
});
