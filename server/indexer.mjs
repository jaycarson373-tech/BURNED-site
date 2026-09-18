import http from 'node:http';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {Contract,Interface,JsonRpcProvider,formatUnits,getAddress,id,keccak256,toUtf8Bytes} from 'ethers';
import {aggregateCandles,buildRewardSnapshot,positionState,replayLedger} from '../src/market-state.mjs';
import {PONS_V2_FACTORY,QQQ_TOKEN,readPonsLaunchRecord,resolvePonsLaunch} from './pons-discovery.mjs';

const required=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value};
const optionalAddress=(name)=>{const value=process.env[name]?.trim();return value?getAddress(value):''};
const positive=(value,fallback,label)=>{const parsed=Number(value||fallback);if(!Number.isSafeInteger(parsed)||parsed<1)throw new Error(`${label} must be positive`);return parsed};
const config={
  rpcUrl:required('RH_RPC_URL'),token:getAddress(required('TOPBLAST_TOKEN_ADDRESS')),quote:getAddress(process.env.QQQ_TOKEN_ADDRESS||QQQ_TOKEN),
  expectedSymbol:(process.env.EXPECTED_TOKEN_SYMBOL||'TOPBLAST').trim().toUpperCase(),confirmations:positive(process.env.INDEX_CONFIRMATIONS,4,'INDEX_CONFIRMATIONS'),
  pollMs:positive(process.env.INDEX_POLL_MS,2000,'INDEX_POLL_MS'),logChunk:positive(process.env.INDEX_LOG_CHUNK,2000,'INDEX_LOG_CHUNK'),
  port:positive(process.env.PORT,8787,'PORT'),statePath:process.env.INDEX_STATE_PATH||'./data/topblast-index.json',
  corsOrigins:new Set((process.env.CORS_ORIGIN||'').split(',').map(value=>value.trim()).filter(Boolean)),
  distributor:optionalAddress('TOPBLAST_DISTRIBUTOR_ADDRESS'),internalToken:process.env.INTERNAL_API_TOKEN?.trim()||'',
  epochSeconds:positive(process.env.EPOCH_SECONDS,1800,'EPOCH_SECONDS'),staleSeconds:positive(process.env.INDEX_STALE_SECONDS,30,'INDEX_STALE_SECONDS'),
};
const provider=new JsonRpcProvider(config.rpcUrl,4663,{staticNetwork:true});
const curveInterface=new Interface([
  'event CurveBuy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee,uint256 tax)',
  'event CurveSell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee,uint256 tax)',
]);
const transferInterface=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const rewardInterface=new Interface(['event RewardPaid(uint256 indexed epochId,address indexed recipient,uint256 amount)','event EpochFinished(uint256 indexed epochId,uint256 distributedAmount)']);
const topics={buy:id('CurveBuy(address,address,uint256,uint256,uint256,uint256)'),sell:id('CurveSell(address,address,uint256,uint256,uint256,uint256)'),transfer:id('Transfer(address,address,uint256)'),reward:id('RewardPaid(uint256,address,uint256)'),finished:id('EpochFinished(uint256,uint256)')};
const ZERO='0x0000000000000000000000000000000000000000';
let launch=null,curve=null,token=null;
let persisted={lastBlock:0,lastRewardBlock:0,events:[],trades:[],rewards:[],completedEpochs:[],zoneStates:{},zoneEvents:[]};
let market={status:'connecting',rewardStatus:config.distributor?'connecting':'paused',lastUpdated:null,lastFinalizedBlock:null,stale:false,phase:'discovering',config:null,candles:[],buys:[],events:[],leaderboard:[],totals:{trackedPositions:0,walletsInZone:0,rewardsDistributed:null,epochs:null},epoch:{id:null,nextAt:null,status:config.distributor?'connecting':'unconfigured'}};
let walletViews=[],latestSnapshot=null,polling=false;
const clients=new Set(),blockTimes=new Map(),rate=new Map();

const eventId=log=>`${log.transactionHash}:${log.index}`;
const q=(value,decimals)=>Number(formatUnits(value,decimals));
const priceRawFrom=(quoteRaw,tokenRaw)=>BigInt(quoteRaw)*10n**BigInt(launch.tokenDecimals)*10n**18n/(BigInt(tokenRaw)*10n**BigInt(launch.pairDecimals));
const currentEpoch=timestamp=>String(Math.floor(timestamp/config.epochSeconds));
const originFor=request=>config.corsOrigins.has(request.headers.origin)?request.headers.origin:(config.corsOrigins.size?'':'*');

async function discover(){
  launch=await resolvePonsLaunch({provider,tokenAddress:config.token,expectedPair:config.quote,confirmations:config.confirmations});
  if(launch.symbol.toUpperCase()!==config.expectedSymbol)throw new Error(`Verified token symbol is ${launch.symbol}, expected ${config.expectedSymbol}`);
  curve=new Contract(launch.curve,['function getReserves() view returns (uint256 quoteReserve,uint256 tokenReserve)','function graduated() view returns (bool)','function feeBps() view returns (uint256)','function creatorTaxBps() view returns (uint256)'],provider);
  token=new Contract(launch.token,['function totalSupply() view returns (uint256)'],provider);
  persisted.lastBlock=launch.launchBlock-1;persisted.lastRewardBlock=launch.launchBlock-1;
}
async function load(){
  try{const parsed=JSON.parse(await readFile(config.statePath,'utf8'));if(parsed.token?.toLowerCase()===config.token.toLowerCase()&&parsed.curve?.toLowerCase()===launch.curve.toLowerCase())persisted={...persisted,...parsed};}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
async function save(){await mkdir(dirname(config.statePath),{recursive:true});const temporary=`${config.statePath}.tmp`;await writeFile(temporary,JSON.stringify({...persisted,token:launch.token,curve:launch.curve,pairToken:launch.pairToken},null,2));await rename(temporary,config.statePath);}
async function blockTime(blockNumber){if(blockTimes.has(blockNumber))return blockTimes.get(blockNumber);const block=await provider.getBlock(blockNumber);if(!block)throw new Error(`Missing block ${blockNumber}`);const timestamp=Number(block.timestamp);blockTimes.set(blockNumber,timestamp);return timestamp;}

async function ingestRange(fromBlock,toBlock){
  const [curveLogs,transferLogs]=await Promise.all([
    provider.getLogs({address:launch.curve,topics:[[topics.buy,topics.sell]],fromBlock,toBlock}),
    provider.getLogs({address:launch.token,topics:[topics.transfer],fromBlock,toBlock}),
  ]);
  const tradesByTx=new Map();
  for(const log of curveLogs){
    const decoded=curveInterface.parseLog(log),timestamp=await blockTime(log.blockNumber);
    if(decoded.name==='CurveBuy'){
      const row={id:eventId(log),type:'buy',wallet:getAddress(decoded.args.recipient),actor:getAddress(decoded.args.buyer),quoteAmountRaw:decoded.args.quoteIn.toString(),tokenAmountRaw:decoded.args.tokensOut.toString(),feeRaw:decoded.args.fee.toString(),taxRaw:decoded.args.tax.toString(),transactionHash:log.transactionHash,blockNumber:Number(log.blockNumber),transactionIndex:Number(log.transactionIndex||0),logIndex:Number(log.index),timestamp};
      persisted.events.push(row);persisted.trades.push({...row,side:'buy'});tradesByTx.set(log.transactionHash,{type:'buy',wallet:row.wallet.toLowerCase()});
    }else{
      const row={id:eventId(log),type:'sell',wallet:getAddress(decoded.args.seller),recipient:getAddress(decoded.args.recipient),quoteAmountRaw:decoded.args.quoteOut.toString(),tokenAmountRaw:decoded.args.tokensIn.toString(),feeRaw:decoded.args.fee.toString(),taxRaw:decoded.args.tax.toString(),transactionHash:log.transactionHash,blockNumber:Number(log.blockNumber),transactionIndex:Number(log.transactionIndex||0),logIndex:Number(log.index),timestamp};
      persisted.events.push(row);persisted.trades.push({...row,side:'sell'});tradesByTx.set(log.transactionHash,{type:'sell',wallet:row.wallet.toLowerCase()});
    }
  }
  for(const log of transferLogs){
    const decoded=transferInterface.parseLog(log),from=getAddress(decoded.args.from),to=getAddress(decoded.args.to),trade=tradesByTx.get(log.transactionHash);
    if(from===ZERO)continue;
    if(trade?.type==='buy'&&from.toLowerCase()===launch.curve.toLowerCase()&&to.toLowerCase()===trade.wallet)continue;
    if(trade?.type==='sell'&&to.toLowerCase()===launch.curve.toLowerCase()&&from.toLowerCase()===trade.wallet)continue;
    persisted.events.push({id:eventId(log),type:'transfer',from,to,tokenAmountRaw:decoded.args.value.toString(),transactionHash:log.transactionHash,blockNumber:Number(log.blockNumber),transactionIndex:Number(log.transactionIndex||0),logIndex:Number(log.index),timestamp:await blockTime(log.blockNumber)});
  }
  persisted.events=[...new Map(persisted.events.map(row=>[row.id,row])).values()];persisted.trades=[...new Map(persisted.trades.map(row=>[row.id,row])).values()];
}
async function ingestRewards(fromBlock,toBlock){
  if(!config.distributor)return;
  const logs=await provider.getLogs({address:config.distributor,topics:[[topics.reward,topics.finished]],fromBlock,toBlock});
  for(const log of logs){
    const decoded=rewardInterface.parseLog(log),timestamp=await blockTime(log.blockNumber);
    if(decoded.name==='RewardPaid'){
      const row={id:eventId(log),type:'reward',epochId:decoded.args.epochId.toString(),wallet:getAddress(decoded.args.recipient),rewardAmountRaw:decoded.args.amount.toString(),amountRaw:decoded.args.amount.toString(),transactionHash:log.transactionHash,blockNumber:Number(log.blockNumber),transactionIndex:Number(log.transactionIndex||0),logIndex:Number(log.index),timestamp};persisted.rewards.push(row);persisted.events.push(row);
    }else persisted.completedEpochs.push({id:eventId(log),epochId:decoded.args.epochId.toString(),amountRaw:decoded.args.distributedAmount.toString(),transactionHash:log.transactionHash,blockNumber:Number(log.blockNumber),timestamp});
  }
  persisted.rewards=[...new Map(persisted.rewards.map(row=>[row.id,row])).values()];persisted.completedEpochs=[...new Map(persisted.completedEpochs.map(row=>[row.id,row])).values()];persisted.events=[...new Map(persisted.events.map(row=>[row.id,row])).values()];
}

async function rebuild(finalizedBlock){
  const record=await readPonsLaunchRecord({provider,tokenAddress:launch.token,blockTag:finalizedBlock});
  launch={...launch,...record};
  if(record.phase!==0){
    market={...market,status:'paused',rewardStatus:'paused',phase:['curve','swept','pool','rescued'][record.phase]||`phase_${record.phase}`,lastFinalizedBlock:finalizedBlock,stale:true,
      config:{...(market.config||{}),chainId:4663,token:launch.token,curve:launch.curve,pairToken:launch.pairToken,factory:PONS_V2_FACTORY,launchBlock:launch.launchBlock,launchTransaction:launch.launchTransaction,creatorFeeRecipient:record.creatorFeeRecipient,name:launch.name,symbol:launch.symbol,pairSymbol:launch.pairSymbol,tokenDecimals:launch.tokenDecimals,pairDecimals:launch.pairDecimals,phase:record.phase,poolFee:record.poolFee,tickSpacing:record.tickSpacing,creatorTaxBps:record.creatorTaxBps,buybackEnabled:record.buybackEnabled}};
    return;
  }
  const [reserves,supply,block,feeBps,creatorTaxBps]=await Promise.all([curve.getReserves({blockTag:finalizedBlock}),token.totalSupply({blockTag:finalizedBlock}),provider.getBlock(finalizedBlock),curve.feeBps(),curve.creatorTaxBps()]);
  if(!block)throw new Error(`Missing finalized block ${finalizedBlock}`);
  const spotRaw=priceRawFrom(reserves[0],reserves[1]),price=Number(formatUnits(spotRaw,18)),now=Number(block.timestamp),epochId=currentEpoch(now);
  const ledger=replayLedger(persisted.events.map(row=>({...row,epochId:row.type==='reward'?row.epochId:currentEpoch(row.timestamp)}))),views=[];
  for(const position of ledger.positions.values()){
    const state=positionState(position,spotRaw,ledger.epochExclusions,epochId,{token:launch.tokenDecimals,quote:launch.pairDecimals});if(!position.trackedUnitsRaw)continue;
    const averageEntry=Number(formatUnits(state.averageEntryRaw,18));
    views.push({wallet:getAddress(position.wallet),trackedBalance:q(position.trackedUnitsRaw,launch.tokenDecimals),averageEntry,currentPrice:price,returnPercent:averageEntry?((price-averageEntry)/averageEntry)*100:null,status:state.status,eligible:state.eligible,exclusionReason:state.exclusionReason,blastDepth:Number(state.burnDepthBps)/100,rewardsReceived:q(position.rewardsRaw,launch.pairDecimals),firstBuyAt:position.firstBuyAt,lastBuyAt:position.lastBuyAt});
  }
  const trades=persisted.trades.map(row=>{const tradePriceRaw=priceRawFrom(row.quoteAmountRaw,row.tokenAmountRaw);return {...row,price:Number(formatUnits(tradePriceRaw,18)),priceRaw:tradePriceRaw.toString(),volumeQuote:q(row.quoteAmountRaw,launch.pairDecimals),tokenAmount:q(row.tokenAmountRaw,launch.tokenDecimals),quoteAmount:q(row.quoteAmountRaw,launch.pairDecimals)};});
  walletViews=views;const prior=trades.filter(row=>row.timestamp<=now-86400).at(-1),change24h=prior?.price?((price-prior.price)/prior.price)*100:null;
  const cause=trades.filter(row=>row.blockNumber<=finalizedBlock).at(-1);
  for(const view of views){
    const key=view.wallet.toLowerCase(),previous=persisted.zoneStates[key];
    if(previous&&previous!==view.status&&cause){persisted.zoneEvents.push({id:`zone:${key}:${finalizedBlock}:${view.status}`,type:view.status==='blasted'?'entered_zone':'left_zone',wallet:view.wallet,label:view.status==='blasted'?'ENTERED BLAST ZONE':'LEFT BLAST ZONE',amountLabel:view.status==='blasted'?`${view.returnPercent.toFixed(2)}% BELOW ENTRY`:'BACK ABOVE ENTRY',timestamp:new Date(now*1000).toISOString(),transactionHash:cause.transactionHash,blockNumber:finalizedBlock});}
    persisted.zoneStates[key]=view.status;
  }
  persisted.zoneEvents=[...new Map(persisted.zoneEvents.map(row=>[row.id,row])).values()].slice(-500);
  const viewByWallet=new Map(views.map(row=>[row.wallet.toLowerCase(),row]));
  const rewardEvents=persisted.rewards.map(row=>({id:row.id,type:'reward',wallet:row.wallet,label:'QQQ RECEIVED',amountLabel:`${q(row.amountRaw,launch.pairDecimals).toLocaleString(undefined,{maximumFractionDigits:4})} QQQ`,timestamp:new Date(row.timestamp*1000).toISOString(),transactionHash:row.transactionHash,currentStatus:viewByWallet.get(row.wallet.toLowerCase())?.status,returnPercent:viewByWallet.get(row.wallet.toLowerCase())?.returnPercent}));
  const tradeEvents=trades.map(row=>({id:row.id,type:row.type,wallet:row.wallet,label:row.type==='buy'?'TOPBLAST BUY':'SELL',amountLabel:row.type==='buy'?`${row.tokenAmount.toLocaleString(undefined,{maximumFractionDigits:2})} TOPBLAST · ENTRY ${row.price.toPrecision(6)}`:`${row.quoteAmount.toLocaleString(undefined,{maximumFractionDigits:4})} QQQ`,timestamp:new Date(row.timestamp*1000).toISOString(),transactionHash:row.transactionHash,currentStatus:viewByWallet.get(row.wallet.toLowerCase())?.status,returnPercent:viewByWallet.get(row.wallet.toLowerCase())?.returnPercent}));
  const snapshotBase=buildRewardSnapshot({chainId:4663,tokenAddress:launch.token,curveAddress:launch.curve,snapshotBlock:finalizedBlock,priceRaw:spotRaw,epochId,ledger,decimals:{token:launch.tokenDecimals,quote:launch.pairDecimals}});
  latestSnapshot={...snapshotBase,snapshotHash:keccak256(toUtf8Bytes(snapshotBase.canonical)),snapshotBlock:finalizedBlock,epochId,priceRaw:spotRaw.toString(),price,eligibleWallets:snapshotBase.rows.length};
  const nextAt=new Date((Math.floor(now/config.epochSeconds)*config.epochSeconds+config.epochSeconds)*1000).toISOString();
  market={status:'live',rewardStatus:config.distributor?'paused':'unconfigured',lastUpdated:new Date(now*1000).toISOString(),lastFinalizedBlock:finalizedBlock,stale:false,phase:'curve',
    config:{chainId:4663,token:launch.token,curve:launch.curve,pairToken:launch.pairToken,factory:PONS_V2_FACTORY,launchBlock:launch.launchBlock,launchTransaction:launch.launchTransaction,creatorFeeRecipient:launch.creatorFeeRecipient,name:launch.name,symbol:launch.symbol,pairSymbol:launch.pairSymbol,tokenDecimals:launch.tokenDecimals,pairDecimals:launch.pairDecimals,feeBps:Number(feeBps),creatorTaxBps:Number(creatorTaxBps),phase:record.phase,poolFee:record.poolFee,tickSpacing:record.tickSpacing,buybackEnabled:record.buybackEnabled},
    price,change24h,marketCap:price*q(supply,launch.tokenDecimals),candles:aggregateCandles(trades,60),buys:trades.filter(row=>row.side==='buy').map(row=>({id:row.id,time:row.timestamp,price:row.price,wallet:row.wallet,tokenAmount:row.tokenAmount,quoteAmount:row.quoteAmount,transactionHash:row.transactionHash,status:'finalized',currentStatus:viewByWallet.get(row.wallet.toLowerCase())?.status,returnPercent:viewByWallet.get(row.wallet.toLowerCase())?.returnPercent})),
    events:[...rewardEvents,...tradeEvents,...persisted.zoneEvents].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0,100),leaderboard:views.filter(row=>row.status==='blasted').sort((a,b)=>a.returnPercent-b.returnPercent),
    totals:{trackedPositions:views.length,walletsInZone:views.filter(row=>row.status==='blasted').length,rewardsDistributed:persisted.rewards.length?persisted.rewards.reduce((sum,row)=>sum+q(row.amountRaw,launch.pairDecimals),0):null,epochs:persisted.completedEpochs.length||null},epoch:{id:config.distributor?epochId:null,nextAt:config.distributor?nextAt:null,status:config.distributor?'paused':'unconfigured'}};
}

async function finalizedSnapshotForEpoch(epochId){
  const parsed=BigInt(epochId);if(parsed<0n)throw new Error('Invalid epoch');
  const endTimestamp=Number((parsed+1n)*BigInt(config.epochSeconds));
  const finalizedHead=await provider.getBlock(persisted.lastBlock);if(!finalizedHead||Number(finalizedHead.timestamp)<endTimestamp)throw new Error('Epoch is not finalized yet');
  let low=launch.launchBlock,high=persisted.lastBlock,snapshotBlock=0;
  while(low<=high){const middle=Math.floor((low+high)/2),block=await provider.getBlock(middle);if(!block)throw new Error(`Missing block ${middle}`);if(Number(block.timestamp)<endTimestamp){snapshotBlock=middle;low=middle+1;}else high=middle-1;}
  if(snapshotBlock<launch.launchBlock)throw new Error('Epoch predates the token launch');
  const reserves=await curve.getReserves({blockTag:snapshotBlock}),priceRaw=priceRawFrom(reserves[0],reserves[1]);
  const events=persisted.events.filter(row=>row.type!=='reward'&&row.blockNumber<=snapshotBlock).map(row=>({...row,epochId:currentEpoch(row.timestamp)})),ledger=replayLedger(events);
  const base=buildRewardSnapshot({chainId:4663,tokenAddress:launch.token,curveAddress:launch.curve,snapshotBlock,priceRaw,epochId:String(parsed),ledger,decimals:{token:launch.tokenDecimals,quote:launch.pairDecimals}});
  return {...base,snapshotHash:keccak256(toUtf8Bytes(base.canonical)),snapshotBlock,epochId:String(parsed),priceRaw:priceRaw.toString(),price:Number(formatUnits(priceRaw,18)),eligibleWallets:base.rows.length,curveAddress:launch.curve,tokenAddress:launch.token};
}

function broadcast(){const body=`data: ${JSON.stringify({id:`block-${persisted.lastBlock}`,type:'market',data:market})}\n\n`;for(const response of clients)response.write(body);}
async function poll(){
  if(polling)return;polling=true;
  try{const latest=await provider.getBlockNumber(),finalized=latest-config.confirmations;
    while(persisted.lastBlock<finalized){const from=persisted.lastBlock+1,to=Math.min(finalized,from+config.logChunk-1);await ingestRange(from,to);persisted.lastBlock=to;}
    while(config.distributor&&persisted.lastRewardBlock<finalized){const from=persisted.lastRewardBlock+1,to=Math.min(finalized,from+config.logChunk-1);await ingestRewards(from,to);persisted.lastRewardBlock=to;}
    await rebuild(finalized);await save();broadcast();
  }catch(error){console.error(new Date().toISOString(),error);market={...market,status:market.lastUpdated?'delayed':'connecting',stale:Boolean(market.lastUpdated)};broadcast();}
  finally{polling=false;}
}
function json(request,response,status,body){const origin=originFor(request),headers={'content-type':'application/json','cache-control':'no-store'};if(origin)headers['access-control-allow-origin']=origin;response.writeHead(status,headers);response.end(JSON.stringify(body));}
function allowed(request){const key=request.socket.remoteAddress||'unknown',now=Date.now(),row=rate.get(key)||{start:now,count:0};if(now-row.start>=60_000){row.start=now;row.count=0;}row.count+=1;rate.set(key,row);return row.count<=180;}
const server=http.createServer(async(request,response)=>{
  const url=new URL(request.url,'http://localhost'),origin=originFor(request);
  if(request.method==='OPTIONS'){response.writeHead(204,origin?{'access-control-allow-origin':origin,'access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'authorization,content-type'}:{});return response.end();}
  if(request.method!=='GET')return json(request,response,405,{error:'method_not_allowed'});if(!allowed(request))return json(request,response,429,{error:'rate_limited'});
  if(url.pathname==='/health')return json(request,response,200,{ok:market.status==='live',marketStatus:market.status,rewardStatus:market.rewardStatus,phase:market.phase,lastBlock:persisted.lastBlock,lastUpdated:market.lastUpdated});
  if(url.pathname==='/v1/config')return json(request,response,200,market.config||{status:'discovering'});
  if(url.pathname==='/v1/market'){
    const seconds={'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400}[url.searchParams.get('interval')]||60;
    const trades=persisted.trades.map(row=>({timestamp:row.timestamp,price:Number(formatUnits(priceRawFrom(row.quoteAmountRaw,row.tokenAmountRaw),18)),volumeQuote:q(row.quoteAmountRaw,launch.pairDecimals)}));
    const viewByWallet=new Map(walletViews.map(row=>[row.wallet.toLowerCase(),row]));
    const buys=persisted.trades.filter(row=>row.side==='buy').map(row=>({id:row.id,time:Math.floor(row.timestamp/seconds)*seconds,executionTime:row.timestamp,price:Number(formatUnits(priceRawFrom(row.quoteAmountRaw,row.tokenAmountRaw),18)),wallet:row.wallet,tokenAmount:q(row.tokenAmountRaw,launch.tokenDecimals),quoteAmount:q(row.quoteAmountRaw,launch.pairDecimals),transactionHash:row.transactionHash,status:'finalized',currentStatus:viewByWallet.get(row.wallet.toLowerCase())?.status,returnPercent:viewByWallet.get(row.wallet.toLowerCase())?.returnPercent}));
    return json(request,response,200,{...market,candles:aggregateCandles(trades,seconds),buys});
  }
  if(url.pathname==='/v1/stream'){const headers={'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'};if(origin)headers['access-control-allow-origin']=origin;response.writeHead(200,headers);clients.add(response);response.write(`data: ${JSON.stringify({id:`block-${persisted.lastBlock}`,type:'market',data:market})}\n\n`);request.on('close',()=>clients.delete(response));return;}
  if(url.pathname==='/internal/snapshot'){
    if(!config.internalToken||request.headers.authorization!==`Bearer ${config.internalToken}`)return json(request,response,401,{error:'unauthorized'});
    try{const requested=url.searchParams.get('epoch');return json(request,response,200,requested==null?latestSnapshot:await finalizedSnapshotForEpoch(requested));}
    catch(error){return json(request,response,409,{error:'snapshot_unavailable',message:error.message});}
  }
  const match=url.pathname.match(/^\/v1\/wallet\/(0x[0-9a-fA-F]{40})$/);if(match){const row=walletViews.find(item=>item.wallet.toLowerCase()===match[1].toLowerCase());return row?json(request,response,200,row):json(request,response,404,{error:'not_found'});}return json(request,response,404,{error:'not_found'});
});

await discover();await load();await poll();setInterval(poll,config.pollMs);
setInterval(()=>{if(market.lastUpdated&&Date.now()-new Date(market.lastUpdated).getTime()>config.staleSeconds*1000){market={...market,status:'delayed',stale:true};broadcast();}},5000);
server.listen(config.port,()=>console.log(`Topblast index listening on ${config.port}; token ${launch.token}; curve ${launch.curve}`));
