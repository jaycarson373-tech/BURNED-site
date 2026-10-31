import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context={window:{}};vm.runInNewContext(readFileSync('public/index-data.js','utf8'),context);
const clock=context.window.TopBlastIndex.epochRemainingSeconds;
test('epoch clock uses the backend due time, including a nineteen-minute first target',()=>{
 const now=Date.parse('2026-10-31T12:00:00Z');
 assert.equal(clock({next_epoch_at:'2026-10-31T12:19:00Z'},now),1140);
 assert.equal(clock({next_epoch_at:'2026-10-31T12:19:00Z'},now+1140000),0);
 assert.equal(clock({next_epoch_at:'2026-10-31T12:19:00Z'},now+1200000),0);
});
test('missing scheduler state does not invent a quarter-hour countdown',()=>{
 assert.equal(clock({current_epoch:100},Date.now()),null);
 assert.equal(clock({next_epoch_at:'invalid'},Date.now()),null);
});
test('explicit quarter-hour schedule counts down without claiming a payout is active',()=>{
 const schedule=context.window.TopBlastIndex.scheduledEpochRemainingSeconds;
 for(const minute of [0,15,30,45]){
  const start=Date.UTC(2026,9,31,12,minute);
  assert.equal(schedule(start),900);
  assert.equal(schedule(start+899000),1);
  assert.equal(schedule(start+900000),900);
 }
 assert.equal(schedule(Date.parse('2026-10-31T12:07:30Z')),450);
 assert.equal(schedule(NaN),null);
});
