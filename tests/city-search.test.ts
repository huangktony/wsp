import test from "node:test";
import assert from "node:assert/strict";
import { findPlaces, PlaceSearchError, MissingCityError } from "../lib/serpapi";

async function withEnv(values: Record<string, string | undefined>, run: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value;
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
}
const response = (data: unknown, ok = true) => ({ ok, json: async () => data }) as Response;

test("two cities geocode independently and send city-specific Maps queries and ll, even with USE_MOCKS", async () => {
  await withEnv({ SERPAPI_KEY: 'test-only', USE_MOCKS: 'true', USE_SAMPLE_PLACES: undefined }, async () => {
    const requests: URLSearchParams[] = [];
    const points: Record<string, { latitude: number; longitude: number }> = {
      'Dallas, TX': { latitude: 32.7767, longitude: -96.797 },
      'Seattle, WA': { latitude: 47.6062, longitude: -122.3321 },
    };
    const fakeFetch = (async (url: any, options: any) => {
      const params = new URL(url).searchParams;
      // Retain only non-secret parameters in assertion output.
      params.delete('api_key'); requests.push(params);
      assert.equal(params.get('engine'), 'google_maps');
      assert.equal(params.has('location'), false);
      assert.equal(options.cache, 'no-store');
      const query = params.get('q')!;
      if (query in points) return response({ place_results: { gps_coordinates: points[query] } });
      const city = Object.keys(points).find(city => query.endsWith(city))!;
      assert.ok(city);
      return response({ local_results: [{ title: `Cafe in ${city}`, type: 'Coffee shop', address: `Main Street, ${city}`, gps_coordinates: points[city] }] });
    }) as typeof fetch;
    for (const city of Object.keys(points)) {
      const found = await findPlaces(['coffee'], city, '$', 5, { fetch: fakeFetch });
      assert.equal(found.length, 1);
      assert.ok(found[0].address.endsWith(city));
    }
    assert.deepEqual(requests.filter(p => !p.has('ll') || (p.get('start') === '0' && p.get('ll')?.endsWith('13z'))).map(p => p.get('q')), ['Dallas, TX', 'coffee shops in Dallas, TX', 'Seattle, WA', 'coffee shops in Seattle, WA']);
    assert.equal(requests[1].get('ll'), '@32.7767,-96.797,13z');
    assert.equal(requests.find(p => p.get('q') === 'coffee shops in Seattle, WA')!.get('ll'), '@47.6062,-122.3321,13z');
  });
});

test("missing or blank key is a visible error, never sample data", async () => {
  for (const key of [undefined, '', '   ']) await withEnv({ SERPAPI_KEY: key, USE_MOCKS: 'true', USE_SAMPLE_PLACES: undefined }, async () => {
    let calls = 0;
    await assert.rejects(findPlaces(['food'], 'Dallas, TX', '$', 5, { fetch: (async () => { calls++; throw Error('must not fetch'); }) as typeof fetch }),
      { message: "We couldn't search places right now. Try again." });
    assert.equal(calls, 0);
  });
});

test("HTTP failure, provider error, timeout and unresolved geocode never return fixtures or leak errors", async () => {
  await withEnv({ SERPAPI_KEY: 'test-only', USE_SAMPLE_PLACES: undefined }, async () => {
    const failures = [
      async () => response({}, false),
      async () => response({ error: 'rate limited' }),
      async () => { throw Error('unsafe provider URL'); },
      async () => response({ local_results: [] }),
    ];
    for (const fake of failures) await assert.rejects(findPlaces(['food'], 'Dallas, TX', '$', 5, { fetch: fake as typeof fetch }), PlaceSearchError);
  });
});

test("distance filter excludes outside-radius and unlocated results; empty searches stay empty", async () => {
  await withEnv({ SERPAPI_KEY: 'test-only', USE_SAMPLE_PLACES: undefined }, async () => {
    let count = 0;
    const fake = (async () => ++count === 1
      ? response({ place_results: { gps_coordinates: { latitude: 0, longitude: 0 } } })
      : response({ local_results: [
        { title: 'Nearby', gps_coordinates: { latitude: 0.01, longitude: 0 }, price: '$' },
        { title: 'Too far', gps_coordinates: { latitude: 1, longitude: 0 }, price: '$' },
        { title: 'Unknown location', price: '$' },
      ] })) as typeof fetch;
    const found = await findPlaces(['food'], 'Test city', '$', 5, { fetch: fake });
    assert.deepEqual(found.map(p => p.name), ['Nearby']);
    const empty = (async () => response({ place_results: { gps_coordinates: { latitude: 0, longitude: 0 } }, local_results: [] })) as typeof fetch;
    assert.deepEqual(await findPlaces(['food'], 'Test city', '$', 5, { fetch: empty }), []);
  });
});

test("only explicit sample mode returns clearly synthetic venues; missing city always fails", async () => {
  await withEnv({ SERPAPI_KEY: undefined, USE_SAMPLE_PLACES: 'true' }, async () => {
    const found = await findPlaces(['coffee'], 'Dallas, TX', '$', 5, { fetch: (async () => { throw Error('no network in sample mode'); }) as typeof fetch });
    assert.ok(found[0].address.includes('Sample location in Dallas, TX'));
    await assert.rejects(findPlaces(['coffee'], '  ', '$', 5), MissingCityError);
  });
});

test("stored coordinates are used directly in ll without another geocoding request", async () => {
  await withEnv({ SERPAPI_KEY: 'test-only', USE_SAMPLE_PLACES: undefined }, async () => {
    const queries: string[] = [];
    const fake = (async (url: any) => {
      const params = new URL(url).searchParams;
      queries.push(params.get('q')!);
      assert.match(params.get('ll')!, /^@29\.7604,-95\.3698,1[23]z$/);
      return response({ local_results: [{ title: 'Nearby cafe', type: 'Coffee shop', gps_coordinates: { latitude: 29.7604, longitude: -95.3698 }, address: 'Houston, TX' }] });
    }) as typeof fetch;
    const places = await findPlaces(['coffee'], 'Houston, TX', '$', 5, { fetch: fake, center: { latitude: 29.7604, longitude: -95.3698 } });
    assert.ok(queries.length <= 3);
    assert.ok(queries.every(q => q === 'coffee shops in Houston, TX'));
    assert.equal(places.length, 1);
  });
});
