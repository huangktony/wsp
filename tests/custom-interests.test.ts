import test from 'node:test';
import assert from 'node:assert/strict';
import { addCustomInterest, cycleCustomInterest, readPreferences, restoreInterestChoices, sanitizeCustom, saveInterestChoices, SetupPreferences, type CustomInterest } from '../lib/setupPreferences';

test('custom additions normalize safely, reject duplicates/empty/long values and cap at five', () => {
  assert.equal(sanitizeCustom('  <Ka\u0000raoke>   night  '), 'Karaoke night');
  let chips = addCustomInterest('  <Karaoke>   night ', []).customs;
  assert.deepEqual(chips, [{ text: 'Karaoke night', state: 'into it' }]);
  assert.match(addCustomInterest('karaoke NIGHT', chips).error, /already/);
  for (const empty of ['', '   ', '<>\u0000']) assert.deepEqual(addCustomInterest(empty, chips).customs, chips);
  assert.match(addCustomInterest('a'.repeat(31), chips).error, /30/);
  assert.equal(addCustomInterest(' FOOD ', chips).builtin, 'food');
  for (const text of ['Jazz', 'Ramen', 'Pottery', 'Kites']) chips = addCustomInterest(text, chips).customs;
  assert.equal(chips.length, 5);
  assert.match(addCustomInterest('Sushi', chips).error, /5/);
  assert.equal(addCustomInterest('Coffee', chips).builtin, 'coffee');
});
test('custom chips cycle into it, avoid, removed without mutating other chips', () => {
  const original: CustomInterest[] = [{ text: 'Jazz', state: 'into it' }, { text: 'Ramen', state: 'into it' }];
  const avoid = cycleCustomInterest(original, 0);
  assert.equal(avoid[0].state, 'avoid');
  assert.equal(original[0].state, 'into it');
  assert.deepEqual(cycleCustomInterest(avoid, 0), [original[1]]);
});
test('custom preferences survive save/validation/reload including comma-containing labels', () => {
  const original: CustomInterest[] = [{ text: 'Earth, Wind & Fire', state: 'into it' }, { text: 'Karaoke', state: 'avoid' }];
  const saved = SetupPreferences.parse(saveInterestChoices(readPreferences({ avoids: ['nightlife'] }), original));
  assert.deepEqual(JSON.parse(saved.interests_text), ['Earth, Wind & Fire']);
  assert.deepEqual(saved.avoids, ['nightlife', 'Karaoke']);
  const loaded = restoreInterestChoices(['food'], readPreferences(saved));
  assert.deepEqual(loaded.customs, original);
  assert.deepEqual(loaded.avoids, ['nightlife']);
  assert.deepEqual(loaded.likes, ['food']);
});
test('old comma-separated notes load as chips without losing long or excess legacy entries', () => {
  const long = 'A favorite venue with a name longer than thirty characters';
  const loaded = restoreInterestChoices([], readPreferences({ interests_text: `Jazz, Ramen, <Karaoke>, FOOD, jazz, ${long}, Pottery, Kites`, avoids: ['karaoke'] }));
  assert.deepEqual(loaded.likes, ['food']);
  assert.equal(loaded.customs.length, 6);
  assert.ok(loaded.customs.some(c => c.text === long));
  assert.equal(loaded.customs.find(c => c.text.toLowerCase() === 'karaoke')?.state, 'avoid');
  const again = restoreInterestChoices(loaded.likes, readPreferences(saveInterestChoices(readPreferences({}), loaded.customs)));
  assert.deepEqual(again.customs.map(c => [c.text, c.state]).sort(), loaded.customs.map(c => [c.text, c.state]).sort());
});
