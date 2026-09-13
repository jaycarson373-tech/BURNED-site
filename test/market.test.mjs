import test from 'node:test';import assert from 'node:assert/strict';import {getMarket} from '../api/market.js';import {STONK_MINT} from '../scripts/blast-config.mjs';
const now=1800000000000;
const payload=()=>({data:{token:{mint:STONK_MINT,symbol:'STONK',market:{priceUsd:.25,priceChange24h:-3.1}}},meta:{generatedAt:new Date(now).toISOString()}});
const options=data=>({env:{},now,marketCache:new Map(),fetchImpl:async()=>({ok:true,json:async()=>data})});
test('STONK quote verifies identity, timestamp and actual units',async()=>{const r=await getMarket('stonk',options(payload()));assert.equal(r.mint,STONK_MINT);assert.equal(r.priceUsd,.25);assert.equal(r.change24h,-3.1);});
test('missing BLAST mint never fetches old market',async()=>{assert.equal((await getMarket('blast',{env:{},fetchImpl:()=>{throw Error('must not fetch')}})).available,false);});
test('wrong mint, wrong symbol and stale quote are rejected',async()=>{for(const mutate of [p=>p.data.token.mint='wrong',p=>p.data.token.symbol='EMBER',p=>p.meta.generatedAt=new Date(now-181000).toISOString(),p=>p.data.token.market.priceUsd=0]){const p=payload();mutate(p);await assert.rejects(getMarket('stonk',options(p)));}});
test('quote cache bounds external API requests',async()=>{let calls=0;const o=options(payload());o.fetchImpl=async()=>{calls++;return {ok:true,json:async()=>payload()}};await getMarket('stonk',o);await getMarket('stonk',o);assert.equal(calls,1);});
