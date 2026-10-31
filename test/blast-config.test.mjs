import test from 'node:test';
import assert from 'node:assert/strict';
import {blastPublicConfig} from '../scripts/blast-config.mjs';
test('new Pump launch cannot inherit old market, keys or payment switch',()=>{const c=blastPublicConfig({PUBLIC_TOPBLAST_MINT:'4LYhX3kXcKr9rTHCN4c65Hfye2aTukri3JtBbwZhUQv9',BURNED_REWARDS_ACTIVE:'true',PUBLIC_BURNED_SUPABASE_URL:'https://old.supabase.co'});assert.equal(c.topblastMint,'');assert.equal(c.rewardMint,'');assert.equal(c.quoteDecimals,6);assert.equal(c.projectId,'topblast-pump-v1');assert.equal(c.venue,'pumpfun');assert.equal(c.rewardsActive,false);assert.equal(c.supabaseUrl,'');});
test('old market, non-PUMP rewards and wrong namespace fail closed',()=>{assert.throws(()=>blastPublicConfig({PUBLIC_BLAST_MINT:'ApS8Sb3oXpFV5zcok9ii83PhCo2DSUV3N5UMzcYcWhHs'}));assert.throws(()=>blastPublicConfig({PUBLIC_BLAST_REWARD_MINT:'6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx'}));assert.throws(()=>blastPublicConfig({BLAST_PROJECT_ID:'blast-stonk-v1'}));});
test('market, public index and rewards require explicit separate verification',()=>{assert.throws(()=>blastPublicConfig({BLAST_MARKET_VERIFIED:'true'}));assert.throws(()=>blastPublicConfig({PUBLIC_BLAST_MINT:'11111111111111111111111111111112',BLAST_INDEX_VERIFIED:'true'}));assert.equal(blastPublicConfig({BLAST_REWARDS_ACTIVE:'true'}).rewardsActive,false);});
test('verified Pump mint creates canonical Jupiter and Dexscreener links',()=>{const mint='5'.repeat(44),c=blastPublicConfig({PUBLIC_BLAST_MINT:mint,BLAST_MARKET_VERIFIED:'true'});assert.equal(c.buyUrl,`https://jup.ag/swap/pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn-${mint}`);assert.equal(c.dexscreenerUrl,`https://dexscreener.com/solana/${mint}`);});
test('PUMP quote and reward mint are consistent and SOL cannot be substituted',()=>{const mint='5'.repeat(44),pump='pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn',c=blastPublicConfig({PUBLIC_BLAST_MINT:mint,PUBLIC_BLAST_REWARD_MINT:pump,BLAST_MARKET_VERIFIED:'true'});assert.equal(c.rewardMint,pump);assert.equal(c.quoteSymbol,'PUMP');assert.equal(c.quoteDecimals,6);assert.throws(()=>blastPublicConfig({PUBLIC_BLAST_MINT:mint,PUBLIC_BLAST_REWARD_MINT:'So11111111111111111111111111111111111111112',BLAST_MARKET_VERIFIED:'true'}),/verified PUMP reward mint/);});

test('supplied launch address can be copied while its market remains unverified',()=>{
 const config=blastPublicConfig({PUBLIC_BLAST_MINT:'topCZozV3CkivaLGXT2DmaUv8nuh4nY4vN1XfYMVWsM'});
 assert.equal(config.pendingMint,'topCZozV3CkivaLGXT2DmaUv8nuh4nY4vN1XfYMVWsM');
 assert.equal(config.topblastMint,'');
 assert.equal(config.buyUrl,'');
 assert.equal(config.indexVerified,false);
 assert.equal(config.rewardsActive,false);
});
