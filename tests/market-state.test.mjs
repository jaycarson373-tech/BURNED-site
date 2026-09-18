import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateCandles, allocateLossWeighted, positionState, replayLedger} from '../src/market-state.mjs';

const A='0x1111111111111111111111111111111111111111';
const B='0x2222222222222222222222222222222222222222';
const e=(type,n,extra={})=>({id:`e${n}`,type,blockNumber:n,logIndex:0,timestamp:n,epochId:1,...extra});

test('verified buys establish and update weighted average entry',()=>{
  const ledger=replayLedger([
    e('buy',1,{wallet:A,tokenAmountRaw:100n*10n**18n,quoteAmountRaw:100n*10n**18n}),
    e('buy',2,{wallet:A,tokenAmountRaw:100n*10n**18n,quoteAmountRaw:300n*10n**18n}),
  ]);
  const state=positionState(ledger.positions.get(A.toLowerCase()),15n*10n**17n,ledger.epochExclusions,1);
  assert.equal(state.averageEntryRaw,2n*10n**18n);
  assert.equal(state.status,'blasted');
  assert.equal(state.burnDepthBps,2500n);
  assert.equal(state.eligible,true);
});

test('partial sell preserves average entry and excludes the epoch',()=>{
  const ledger=replayLedger([
    e('buy',1,{wallet:A,tokenAmountRaw:100n,quoteAmountRaw:200n}),
    e('sell',2,{wallet:A,tokenAmountRaw:25n}),
  ]);
  const p=ledger.positions.get(A.toLowerCase());
  assert.deepEqual([p.trackedUnitsRaw,p.costQuoteRaw],[75n,150n]);
  assert.equal(positionState(p,1n*10n**18n,ledger.epochExclusions,1).exclusionReason,'sold_this_epoch');
});

test('full sell clears basis and rebuy creates a fresh entry',()=>{
  const ledger=replayLedger([
    e('buy',1,{wallet:A,tokenAmountRaw:100n,quoteAmountRaw:200n}),
    e('sell',2,{wallet:A,tokenAmountRaw:100n}),
    {...e('buy',3,{wallet:A,tokenAmountRaw:50n,quoteAmountRaw:150n}),epochId:2},
  ]);
  const p=ledger.positions.get(A.toLowerCase());
  assert.deepEqual([p.trackedUnitsRaw,p.costQuoteRaw],[50n,150n]);
  assert.equal(positionState(p,2n*10n**18n,ledger.epochExclusions,2).averageEntryRaw,3n*10n**18n);
});

test('incoming transfer creates no basis and outgoing transfer excludes sender',()=>{
  const ledger=replayLedger([
    e('buy',1,{wallet:A,tokenAmountRaw:100n,quoteAmountRaw:100n}),
    e('transfer',2,{from:A,to:B,tokenAmountRaw:40n}),
  ]);
  assert.deepEqual([ledger.positions.get(A.toLowerCase()).trackedUnitsRaw,ledger.positions.get(A.toLowerCase()).costQuoteRaw],[60n,60n]);
  assert.equal(ledger.positions.get(B.toLowerCase()).trackedUnitsRaw,0n);
  assert.equal(ledger.epochExclusions.get('1').get(A.toLowerCase()),'sent_this_epoch');
});

test('self transfer is neutral and duplicate events apply once',()=>{
  const buy=e('buy',1,{wallet:A,tokenAmountRaw:100n,quoteAmountRaw:100n});
  const ledger=replayLedger([buy,buy,e('transfer',2,{from:A,to:A,tokenAmountRaw:40n})]);
  assert.deepEqual([ledger.positions.get(A.toLowerCase()).trackedUnitsRaw,ledger.positions.get(A.toLowerCase()).costQuoteRaw],[100n,100n]);
});

test('loss weighted allocation is deterministic and conserves reward plus dust',()=>{
  const result=allocateLossWeighted(100n,[
    {wallet:A,eligible:true,lossQuoteRaw:1n},
    {wallet:B,eligible:true,lossQuoteRaw:3n},
  ]);
  assert.deepEqual(result.allocations.map(x=>x.amountRaw),[25n,75n]);
  assert.equal(result.dustRaw,0n);
});

test('price crossings change Blast status without rewriting entry',()=>{
  const ledger=replayLedger([e('buy',1,{wallet:A,tokenAmountRaw:100n,quoteAmountRaw:200n})]);
  const p=ledger.positions.get(A.toLowerCase());
  const above=positionState(p,21n*10n**17n,ledger.epochExclusions,1);
  const below=positionState(p,19n*10n**17n,ledger.epochExclusions,1);
  const recovered=positionState(p,22n*10n**17n,ledger.epochExclusions,1);
  assert.deepEqual([above.status,below.status,recovered.status],['clear','blasted','clear']);
  assert.equal(above.averageEntryRaw,below.averageEntryRaw);
  assert.equal(below.eligible,true);
});

test('sell exclusion is scoped to its epoch',()=>{
  const ledger=replayLedger([
    e('buy',1,{wallet:A,tokenAmountRaw:100n,quoteAmountRaw:200n}),
    e('sell',2,{wallet:A,tokenAmountRaw:10n}),
  ]);
  const p=ledger.positions.get(A.toLowerCase());
  assert.equal(positionState(p,1n*10n**18n,ledger.epochExclusions,1).eligible,false);
  assert.equal(positionState(p,1n*10n**18n,ledger.epochExclusions,2).eligible,true);
});

test('sell then rebuy keeps the wallet excluded until the next epoch',()=>{
  const ledger=replayLedger([
    e('buy',1,{wallet:A,tokenAmountRaw:100n,quoteAmountRaw:200n}),
    e('sell',2,{wallet:A,tokenAmountRaw:100n}),
    e('buy',3,{wallet:A,tokenAmountRaw:50n,quoteAmountRaw:150n}),
  ]),position=ledger.positions.get(A.toLowerCase());
  assert.equal(positionState(position,2n*10n**18n,ledger.epochExclusions,1).eligible,false);
  assert.equal(positionState(position,2n*10n**18n,ledger.epochExclusions,2).eligible,true);
});

test('incoming transfers never increase an existing verified position',()=>{
  const ledger=replayLedger([
    e('buy',1,{wallet:B,tokenAmountRaw:20n,quoteAmountRaw:40n}),
    e('buy',2,{wallet:A,tokenAmountRaw:100n,quoteAmountRaw:100n}),
    e('transfer',3,{from:A,to:B,tokenAmountRaw:60n}),
  ]);
  assert.deepEqual([ledger.positions.get(B.toLowerCase()).trackedUnitsRaw,ledger.positions.get(B.toLowerCase()).costQuoteRaw],[20n,40n]);
});

test('moving more tokens than the verified position cannot create negative basis',()=>{
  const ledger=replayLedger([e('buy',1,{wallet:A,tokenAmountRaw:10n,quoteAmountRaw:30n}),e('transfer',2,{from:A,to:B,tokenAmountRaw:999n})]);
  assert.deepEqual([ledger.positions.get(A.toLowerCase()).trackedUnitsRaw,ledger.positions.get(A.toLowerCase()).costQuoteRaw],[0n,0n]);
});

test('price exactly at entry is clear and ineligible',()=>{
  const ledger=replayLedger([e('buy',1,{wallet:A,tokenAmountRaw:100n,quoteAmountRaw:200n})]);
  const state=positionState(ledger.positions.get(A.toLowerCase()),2n*10n**18n,ledger.epochExclusions,1);
  assert.equal(state.status,'clear');assert.equal(state.eligible,false);assert.equal(state.burnDepthBps,0n);
});

test('allocation ignores clear and excluded wallets',()=>{
  const result=allocateLossWeighted(99n,[
    {wallet:A,eligible:false,lossQuoteRaw:100n},
    {wallet:B,eligible:true,lossQuoteRaw:3n},
  ]);
  assert.deepEqual(result.allocations,[{wallet:B.toLowerCase(),amountRaw:99n}]);
});

test('entry and loss math supports different token and quote decimals',()=>{
  const ledger=replayLedger([e('buy',1,{wallet:A,tokenAmountRaw:2n*10n**6n,quoteAmountRaw:4n*10n**18n})]);
  const state=positionState(ledger.positions.get(A.toLowerCase()),15n*10n**17n,ledger.epochExclusions,1,{token:6,quote:18});
  assert.equal(state.averageEntryRaw,2n*10n**18n);
  assert.equal(state.lossQuoteRaw,1n*10n**18n);
});

test('real trades aggregate into genuine OHLCV candles',()=>{
  assert.deepEqual(aggregateCandles([
    {timestamp:61,price:1,volumeQuote:2},
    {timestamp:75,price:3,volumeQuote:5},
    {timestamp:119,price:2,volumeQuote:7},
  ],60),[{time:60,open:1,high:3,low:1,close:2,volume:14}]);
});
