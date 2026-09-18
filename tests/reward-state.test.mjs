import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadRewardState,saveRewardState} from '../server/reward-state.mjs';

const token='0x1111111111111111111111111111111111111111',distributor='0x2222222222222222222222222222222222222222';

test('reward journal persists a pending epoch across process restarts',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'topblast-rewards-')),path=join(directory,'state.json');
  try{
    let state=await loadRewardState(path,{token,distributor});
    state.pendingEpoch='81';state=await saveRewardState(path,state);
    const restored=await loadRewardState(path,{token,distributor});
    assert.equal(restored.pendingEpoch,'81');assert.equal(restored.lastHandledEpoch,null);assert.ok(restored.updatedAt);
    const stored=JSON.parse(await readFile(path,'utf8'));assert.equal(stored.pendingEpoch,'81');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('reward journal refuses state from another deployment',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'topblast-rewards-')),path=join(directory,'state.json');
  try{
    await saveRewardState(path,{version:1,token:token.toLowerCase(),distributor:distributor.toLowerCase(),pendingEpoch:'9',lastHandledEpoch:null});
    const restored=await loadRewardState(path,{token,distributor:'0x3333333333333333333333333333333333333333'});
    assert.equal(restored.pendingEpoch,null);
  }finally{await rm(directory,{recursive:true,force:true});}
});
