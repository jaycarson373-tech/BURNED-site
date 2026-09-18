import {validatePublicSupabaseKey} from './public-key.mjs';
export const STONK_MINT='6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx';
const address=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const oldMints=new Set(['ApS8Sb3oXpFV5zcok9ii83PhCo2DSUV3N5UMzcYcWhHs','4LYhX3kXcKr9rTHCN4c65Hfye2aTukri3JtBbwZhUQv9','FsiDU4zcDKvuZRk3Ft4RHnRczKh4TdSi5GpdynkCuCTS','BH52uMovQJkSTxgXPW8RtrwKRxbN2PnfGfWyvgPqXbvA']);
export function blastPublicConfig(env={}){
 const read=k=>String(env[k]??'').trim();
 const mint=read('PUBLIC_BLAST_MINT'),rewardMint=read('PUBLIC_BLAST_STONK_MINT')||STONK_MINT;
 const indexVerified=read('BLAST_INDEX_VERIFIED')==='true',marketVerified=indexVerified||read('BLAST_MARKET_VERIFIED')==='true';
 const projectId=read('BLAST_PROJECT_ID')||'blast-stonk-v1';
 if(!/^blast-stonk-[a-z0-9-]{1,40}$/.test(projectId))throw new Error('Use a separate BLAST / STONK project');
 if(rewardMint!==STONK_MINT)throw new Error('STONK mint must match the verified Stonk registry');
 if(mint&&(!address.test(mint)||oldMints.has(mint)||mint===rewardMint))throw new Error('A new verified BLAST mint is required');
 if(marketVerified&&!mint)throw new Error('Verify the BLAST mint before enabling the market');
 const supabaseUrl=read('PUBLIC_BLAST_SUPABASE_URL'),supabaseKey=read('PUBLIC_BLAST_SUPABASE_KEY');
 if(Boolean(supabaseUrl)!==Boolean(supabaseKey))throw new Error('Configure both public index values');
 if(supabaseUrl){const u=new URL(supabaseUrl);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('Invalid public index URL');validatePublicSupabaseKey(supabaseKey);}
 if(indexVerified&&(!supabaseUrl||!supabaseKey))throw new Error('Verify the isolated BLAST index before enabling data');
 const xUrl=read('PUBLIC_BLAST_X_URL'),siteUrl=read('PUBLIC_BLAST_SITE_URL');
 if(xUrl&&!/^https:\/\/(?:www\.)?x\.com\/[A-Za-z0-9_]{1,15}\/?$/.test(xUrl))throw new Error('Invalid X URL');
 if(siteUrl){const u=new URL(siteUrl);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('Invalid site URL');}
 return {name:'Topblast',ticker:'BLAST',quoteSymbol:'STONK',quoteDecimals:9,projectId,topblastMint:marketVerified?mint:'',rewardMint,indexVerified,marketVerified,rewardsActive:indexVerified&&read('BLAST_REWARDS_ACTIVE')==='true',reviewedEpoch:null,supabaseUrl:indexVerified?supabaseUrl:'',supabaseKey:indexVerified?supabaseKey:'',xUrl,siteUrl,dexscreenerUrl:marketVerified?`https://dexscreener.com/solana/${mint}`:''};
}
