import {blastPublicConfig,STONK_MINT} from '../scripts/blast-config.mjs';
const cache=new Map();
export async function getMarket(asset,{env=process.env,fetchImpl=fetch,now=Date.now(),marketCache=cache}={}){
 if(!['stonk','blast'].includes(asset))throw new Error('Unsupported asset');
 const cfg=blastPublicConfig(env),mint=asset==='stonk'?STONK_MINT:cfg.topblastMint;
 if(!mint)return {available:false,reason:'BLAST market not configured'};
 const previous=marketCache.get(mint);if(previous&&now>=previous.at&&now-previous.at<15000)return previous.data;
 const response=await fetchImpl(`https://www.stonkfun.xyz/api/public/v1/tokens/${mint}`,{signal:AbortSignal.timeout(8000),headers:{accept:'application/json'}});
 if(!response.ok)throw new Error('Market source unavailable');
 const payload=await response.json(),token=payload?.data?.token,stamp=Date.parse(payload?.meta?.generatedAt);
 if(token?.mint!==mint||token.symbol!==(asset==='stonk'?'STONK':'BLAST')||asset==='blast'&&token.quote?.mint!==STONK_MINT)throw new Error('Market identity mismatch');
 if(!Number.isFinite(stamp)||stamp>now+30000||now-stamp>180000)throw new Error('Market data is stale');
 const price=token.market?.priceUsd,change=token.market?.priceChange24h;
 if(typeof price!=='number'||!Number.isFinite(price)||price<=0)throw new Error('Price unavailable');
 const data={available:true,mint,symbol:token.symbol,priceUsd:price,change24h:typeof change==='number'&&Number.isFinite(change)?change:null,asOf:new Date(stamp).toISOString(),source:'StonkFun'};
 marketCache.set(mint,{at:now,data});return data;
}
export default async function handler(req,res){
 if(req.method!=='GET'){res.status(405).json({error:'Method not allowed'});return;}
 try{const asset=new URL(req.url,'https://local').searchParams.get('asset')||'stonk';const data=await getMarket(asset);res.setHeader('Cache-Control','public, s-maxage=15, stale-while-revalidate=15');res.status(200).json(data);}catch{res.status(503).json({available:false,reason:'Market source unavailable'});}
}
