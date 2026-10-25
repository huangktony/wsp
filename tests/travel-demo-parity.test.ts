import test from 'node:test';
import assert from 'node:assert/strict';
import { initialDemo, demoVote, demoConfirm, demoProgress, restoreDemo } from '../lib/travel/demo';

test('demo confirms ballots explicitly and locks only the confirmed traveler', () => {
  let state=initialDemo();
  state=demoVote(state,1,'approve'); state=demoVote(state,2,'approve');
  assert.equal(state.status,'voting');
  assert.equal(demoProgress(state).canConfirm,true);
  state=demoConfirm(state);
  assert.deepEqual(state.confirmed,[1]);
  assert.deepEqual(demoVote(state,1,'veto'),state);
  state={...state,voter:2};
  assert.equal(demoProgress(state).myConfirmed,false);
  assert.deepEqual(restoreDemo(JSON.stringify(state)),state);
});

test('demo removes majority-vetoed destinations and closes only after confirmations', () => {
  let state=initialDemo();
  for (const voter of [1,2,3]) {
    state={...state,voter};
    state=demoVote(state,1,'approve');
    state=demoVote(state,2,'veto');
    if(voter===2) assert.deepEqual(demoProgress(state).removedOptionIds,[2]);
    assert.equal(state.status,'voting');
    state=demoConfirm(state);
  }
  assert.equal(state.status,'final');
  assert.equal(state.winnerId,1);
  assert.deepEqual(restoreDemo(JSON.stringify(state)),state);
});
