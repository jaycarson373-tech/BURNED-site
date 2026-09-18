import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface,getAddress,zeroPadValue} from 'ethers';
import {findTokenLaunch,PONS_V2_FACTORY} from '../server/pons-discovery.mjs';

const token=getAddress('0x1111111111111111111111111111111111111111');
const curve=getAddress('0x2222222222222222222222222222222222222222');
const deployer=getAddress('0x3333333333333333333333333333333333333333');
const pair=getAddress('0x4444444444444444444444444444444444444444');
const iface=new Interface(['event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)']);
const encoded=iface.encodeEventLog(iface.getEvent('TokenLaunched'),[token,curve,deployer,pair,7n,99n]);
const launchLog={address:PONS_V2_FACTORY,topics:encoded.topics,data:encoded.data,blockNumber:950,transactionHash:`0x${'ab'.repeat(32)}`,index:0};

test('discovers a finalized Pons launch using only the token address',async()=>{
  const calls=[];
  const provider={
    async getBlockNumber(){return 1_000},
    async getLogs(filter){calls.push(filter);return filter.fromBlock<=950&&filter.toBlock>=950?[launchLog]:[]},
  };
  const result=await findTokenLaunch({provider,tokenAddress:token,confirmations:4,chunkSize:100});
  assert.equal(result.curve,curve);assert.equal(result.pairToken,pair);assert.equal(result.launchBlock,950);
  assert.equal(calls[0].topics[1],zeroPadValue(token,32));
});

test('fails closed when a token has no Pons launch event',async()=>{
  const provider={async getBlockNumber(){return 50},async getLogs(){return[]}};
  await assert.rejects(()=>findTokenLaunch({provider,tokenAddress:token,confirmations:4,chunkSize:20}),/not launched/);
});

