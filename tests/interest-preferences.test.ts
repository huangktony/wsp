import test from "node:test";
import assert from "node:assert/strict";
import { GROUP_INTERESTS, SetupPreferences, cycleInterest, interestState, readPreferences } from "../lib/setupPreferences";
import { INTERESTS } from "../lib/constants";
import { roundSettings, settingsChanged } from "../lib/roundSettings";
import { filterAvoidedPlaces, matchesAvoid } from "../lib/venueAvoids";
import { categoriesFor, placeFromResult, queryFor, type Place } from "../lib/serpapi";
import { compareFlights } from "../lib/travel/flights";
import { budgetCheck } from "../lib/travel/finance";
import { validateSetup } from "../lib/travel/core";

test("chips cycle clear → into it → avoid → clear without changing other choices", () => {
  let state = { likes: ['coffee'], avoids: ['music'] as ('music' | 'food')[] };
  const original = structuredClone(state);
  assert.equal(interestState('food', state.likes, state.avoids), 'clear');
  state = cycleInterest('food', state.likes, state.avoids) as typeof state;
  assert.equal(interestState('food', state.likes, state.avoids), 'into it');
  state = cycleInterest('food', state.likes, state.avoids) as typeof state;
  assert.equal(interestState('food', state.likes, state.avoids), 'avoid');
  assert.ok(!state.likes.includes('food'));
  state = cycleInterest('food', state.likes, state.avoids) as typeof state;
  assert.equal(interestState('food', state.likes, state.avoids), 'clear');
  assert.deepEqual(state, original);
});
test("legacy four values and notes survive; retired group travel values are ignored", () => {
  assert.deepEqual(INTERESTS, ['food', 'coffee', 'outdoors', 'entertainment']);
  assert.deepEqual(GROUP_INTERESTS.slice(0, 4), INTERESTS);
  for (const interest of INTERESTS) assert.equal(interestState(interest, [...INTERESTS], []), 'into it');
  const old = { interests_text: 'live music', avoids_text: 'crowds', travel: true, trip_budget: 500, trip_length: 'weekend' };
  const saved = readPreferences(old);
  assert.equal(saved.interests_text, old.interests_text);
  assert.equal(saved.avoids_text, old.avoids_text);
  assert.ok(!('travel' in saved));
  assert.deepEqual(readPreferences(saved), saved);
  const long = readPreferences({ ...old, interests_text: 'a'.repeat(200) });
  assert.equal(long.interests_text.length, 200);
  assert.deepEqual(readPreferences(long), long);
  assert.equal(SetupPreferences.safeParse({ interests_text: 'a'.repeat(2001) }).success, false);
  assert.equal(readPreferences({ interests_text: 'art\u0000music' }).interests_text, 'art music');
  const member = { user_id: 1, availability: ['Sat afternoon'], interests: ['food'], max_distance_mi: 5, comfort_tier: '$', budget_tier: '$', preferences: old };
  const snapshot = roundSettings([member]);
  const ignoredChange = { ...member, preferences: { ...old, travel: false } };
  assert.equal(settingsChanged(snapshot, [ignoredChange]), false);
  assert.equal(settingsChanged(snapshot, [{ ...member, preferences: { ...old, avoids: ['nightlife'] } }]), true);
});
test("all twelve chips feed supported SerpAPI queries", () => {
  for (const tag of GROUP_INTERESTS) {
    assert.deepEqual(categoriesFor([tag]), [tag]);
    for (const tier of ['$', '$$', '$$$'] as const) assert.ok(queryFor(tag, tier));
  }
});
const place = (name: string, type: string, category = 'entertainment') => ({ name, type, category, price: '$', cost: 5, distanceMi: 1 } as Place);
test("avoids filter venue types across search categories, including secondary Google types", () => {
  const bar = placeFromResult({ title: 'Cafe Bar', type: 'Restaurant', types: ['restaurant', 'bar'], price: '$' }, 'food', '$');
  assert.equal(matchesAvoid(bar, 'nightlife'), true);
  assert.equal(matchesAvoid(place('Grill', 'Barbecue restaurant', 'food'), 'nightlife'), false);
  const pool = [bar, place('Park', 'Park', 'outdoors'), place('Museum', 'Art museum'), place('Cafe', 'Coffee shop', 'coffee')];
  const result = filterAvoidedPlaces(pool, [['nightlife']]);
  assert.deepEqual(result.places.map(p => p.name), ['Park', 'Museum', 'Cafe']);
  assert.deepEqual(result.active, ['nightlife']);
  assert.deepEqual(result.relaxed, []);
});
test("sparse candidate fallback relaxes one least-shared avoid and reports it", () => {
  const pool = [place('Bar', 'Bar'), place('Diner', 'Restaurant', 'food'), place('Park', 'Park', 'outdoors'), place('Gallery', 'Art gallery')];
  const result = filterAvoidedPlaces(pool, [['nightlife', 'food'], ['food']]);
  assert.deepEqual(result.relaxed, ['nightlife']);
  assert.deepEqual(result.active, ['food']);
  assert.deepEqual(result.places.map(p => p.name), ['Bar', 'Park', 'Gallery']);
  assert.match(result.note, /Nightlife avoid was relaxed/);
  assert.ok(result.places.every(p => pool.includes(p)), 'no invented or unfiltered venues added');
  const exhausted = filterAvoidedPlaces([pool[0]], [['nightlife', 'food']]);
  assert.equal(exhausted.places.length, 1);
  assert.deepEqual(filterAvoidedPlaces([pool[2]], [['nightlife']]).relaxed, [], 'no unnecessary relaxation when nothing is excluded');
});
test("Travel flight comparison and affordability still work without group preferences", async () => {
  const setup = validateSetup({ airport: 'AUS', budget: 300 });
  const candidates = [{ id: 1, airport: 'DEN', depart: '2027-01-10', return: '2027-01-12' }];
  const now = Date.now();
  const quotes = await compareFlights([setup.airport, 'IAH'], candidates, async (origin, candidate) => ({ origin, destination: candidate.airport, depart: candidate.depart, return: candidate.return, price: 150, airlines: ['Example'], stops: 0, duration: 90, local: false, source: 'serpapi', quotedAt: new Date(now).toISOString() }));
  assert.equal(quotes.size, 2);
  assert.equal(quotes.get('AUS/1')?.depart, candidates[0].depart);
  const funds = { available: 400, checkedAt: now, source: 'nessie-sandbox' as const };
  assert.equal(budgetCheck(quotes.get('AUS/1')!.price, setup.budget, funds, now), true);
  assert.equal(budgetCheck(quotes.get('IAH/1')!.price, 100, funds, now), false);
});
