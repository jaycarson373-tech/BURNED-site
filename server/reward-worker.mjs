import {Contract,JsonRpcProvider,Wallet,getAddress} from 'ethers';
import {allocateLossWeighted} from '../src/market-state.mjs';
import {QQQ_TOKEN} from './pons-discovery.mjs';
import {loadRewardState,saveRewardState} from './reward-state.mjs';

const required=name=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value};
const integer=(name,{min=1,max=Number.MAX_SAFE_INTEGER}={})=>{const value=Number(required(name));if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer from ${min} to ${max}`);return value};
const enabled=process.env.EXECUTE_REWARDS==='true';
const config={
  rpcUrl:required('RH_RPC_URL'),indexUrl:required('INDEX_URL').replace(/\/+$/,''),internalToken:required('INTERNAL_API_TOKEN'),
  privateKey:required('KEEPER_PRIVATE_KEY'),token:getAddress(required('TOPBLAST_TOKEN_ADDRESS')),
  distributor:getAddress(required('TOPBLAST_DISTRIBUTOR_ADDRESS')),adapter:getAddress(required('TOPBLAST_FUNDING_ADAPTER_ADDRESS')),
  distributionBps:integer('REWARD_DISTRIBUTION_BPS',{max:10_000}),maxRewardRaw:BigInt(process.env.MAX_REWARD_RAW||0),
  epochSeconds:Number(process.env.EPOCH_SECONDS||1800),pollMs:Number(process.env.REWARD_POLL_MS||5000),confirmations:Number(process.env.REWARD_CONFIRMATIONS||4),batchSize:Number(process.env.REWARD_BATCH_SIZE||80),
  alertWebhook:process.env.ALERT_WEBHOOK_URL?.trim()||'',statePath:process.env.REWARD_STATE_PATH||'./data/topblast-reward-worker.json',
};
if(!Number.isSafeInteger(config.epochSeconds)||config.epochSeconds<300)throw new Error('EPOCH_SECONDS must be at least 300');
if(!Number.isSafeInteger(config.pollMs)||config.pollMs<1000)throw new Error('REWARD_POLL_MS must be at least 1000');
if(!Number.isSafeInteger(config.batchSize)||config.batchSize<1||config.batchSize>200)throw new Error('REWARD_BATCH_SIZE must be 1 to 200');

const provider=new JsonRpcProvider(config.rpcUrl,4663,{staticNetwork:true}),signer=new Wallet(config.privateKey,provider);
const distributor=new Contract(config.distributor,[
  'function rewardToken() view returns (address)','function keeper() view returns (address)','function activeEpochId() view returns (uint256)','function epochFinished(uint256) view returns (bool)','function epochReward(uint256) view returns (uint256)','function paid(uint256,address) view returns (bool)',
  'function startEpoch(uint256,uint256,bytes32,uint256,uint256)','function distributeBatch(uint256,uint256,address[],uint256[])','function finishEpoch(uint256)',
],signer);
const adapter=new Contract(config.adapter,[
  'function rewardToken() view returns (address)','function distributor() view returns (address)','function keeper() view returns (address)','function epochFunding(uint256) view returns (uint256)','function latestFundedEpoch() view returns (uint256)','function sweepCreatorFees(uint256,address) returns (uint256)','function fundEpoch(uint256,address,uint16,uint256) returns (uint256)',
],signer);
let busy=false,lastAttempted='',lastAttemptAt=0;
let workerState=await loadRewardState(config.statePath,{token:config.token,distributor:config.distributor});
const persist=async()=>{workerState=await saveRewardState(config.statePath,workerState);};

async function validate(){
  const network=await provider.getNetwork();if(network.chainId!==4663n)throw new Error(`Wrong chain ${network.chainId}`);
  const [tokenCode,distributorCode,adapterCode,rewardToken,adapterReward,adapterDistributor,distributorKeeper,adapterKeeper]=await Promise.all([
    provider.getCode(config.token),provider.getCode(config.distributor),provider.getCode(config.adapter),distributor.rewardToken(),adapter.rewardToken(),adapter.distributor(),distributor.keeper(),adapter.keeper(),
  ]);
  if(tokenCode==='0x'||distributorCode==='0x'||adapterCode==='0x')throw new Error('Token, distributor, or adapter has no deployed code');
  if(getAddress(rewardToken)!==QQQ_TOKEN||getAddress(adapterReward)!==QQQ_TOKEN)throw new Error('Reward contracts are not bound to canonical QQQ');
  if(getAddress(adapterDistributor)!==config.distributor)throw new Error('Funding adapter points to another distributor');
  if(getAddress(distributorKeeper)!==signer.address||getAddress(adapterKeeper)!==signer.address)throw new Error('Keeper key does not control both reward contracts');
  const response=await fetch(`${config.indexUrl}/v1/config`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15_000)});if(!response.ok)throw new Error(`Index configuration returned ${response.status}`);
  const marketConfig=await response.json();if(getAddress(marketConfig.token)!==config.token)throw new Error('Reward worker token differs from the verified index token');
  if(getAddress(marketConfig.pairToken)!==QQQ_TOKEN)throw new Error('Verified market is not paired to QQQ');
  if(getAddress(marketConfig.creatorFeeRecipient)!==config.adapter)throw new Error('Pons creator fee recipient is not the funding adapter');
  if(Number(marketConfig.phase)!==0)throw new Error(`Pons market phase ${marketConfig.phase} is not the supported curve phase`);
  if(marketConfig.buybackEnabled)throw new Error('Pons buyback must be disabled for direct creator fee sweeping');
}
async function snapshot(epochId){
  const response=await fetch(`${config.indexUrl}/internal/snapshot?epoch=${epochId}`,{headers:{authorization:`Bearer ${config.internalToken}`,accept:'application/json'},signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw new Error(`Snapshot API returned ${response.status}`);return response.json();
}
async function send(transactionPromise,label){const transaction=await transactionPromise;console.log(JSON.stringify({event:'submitted',label,hash:transaction.hash}));const receipt=await transaction.wait(config.confirmations);if(!receipt||receipt.status!==1)throw new Error(`${label} transaction failed`);console.log(JSON.stringify({event:'confirmed',label,hash:transaction.hash,blockNumber:receipt.blockNumber}));return receipt;}
async function alertFailure(message){if(!config.alertWebhook)return;try{await fetch(config.alertWebhook,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({service:'topblast-rewards',status:'failed',message,timestamp:new Date().toISOString()}),signal:AbortSignal.timeout(10_000)});}catch(error){console.error(JSON.stringify({event:'alert_delivery_error',message:error.message}));}}
async function executeEpoch(view){
  const epochId=BigInt(view.epochId);if(epochId<=0n)throw new Error('Snapshot epoch is invalid');
  if(await distributor.epochFinished(epochId)){console.log(JSON.stringify({event:'already_complete',epochId:String(epochId)}));return 'complete';}
  if(!view.rows?.length){console.log(JSON.stringify({event:'no_eligible_wallets',epochId:String(epochId),snapshotBlock:view.snapshotBlock}));return 'skipped';}
  let funding=await adapter.epochFunding(epochId);
  if(funding===0n){await send(adapter.sweepCreatorFees(epochId,view.curveAddress),'sweep creator fees');await send(adapter.fundEpoch(epochId,config.distributor,config.distributionBps,config.maxRewardRaw),'fund reward epoch');funding=await adapter.epochFunding(epochId);}
  const weighted=view.rows.map(row=>({wallet:row.wallet,eligible:true,lossQuoteRaw:BigInt(row.lossQuoteRaw)}));
  const allocation=allocateLossWeighted(funding,weighted),allocations=allocation.allocations.filter(row=>row.amountRaw>0n);
  const distributable=allocations.reduce((sum,row)=>sum+row.amountRaw,0n);if(distributable===0n)throw new Error('Reward pool is too small for eligible wallets');
  const active=await distributor.activeEpochId();
  if(active===0n)await send(distributor.startEpoch(epochId,view.snapshotBlock,view.snapshotHash,distributable,allocations.length),'start reward epoch');
  else if(active!==epochId)throw new Error(`Distributor still has active epoch ${active}`);
  for(let offset=0;offset<allocations.length;offset+=config.batchSize){
    const candidates=allocations.slice(offset,offset+config.batchSize),paid=await Promise.all(candidates.map(row=>distributor.paid(epochId,row.wallet))),rows=candidates.filter((_,index)=>!paid[index]);
    if(rows.length)await send(distributor.distributeBatch(epochId,Math.floor(offset/config.batchSize),rows.map(row=>row.wallet),rows.map(row=>row.amountRaw)),`distribute batch ${Math.floor(offset/config.batchSize)}`);
  }
  await send(distributor.finishEpoch(epochId),'finish reward epoch');
  return 'complete';
}
async function tick(){
  if(busy)return;busy=true;
  try{
    const block=await provider.getBlock('latest');if(!block)throw new Error('Latest block unavailable');
    const completed=BigInt(Math.floor(Number(block.timestamp)/config.epochSeconds))-1n;if(completed<0n)return;
    const [active,latestFunded]=await Promise.all([distributor.activeEpochId(),adapter.latestFundedEpoch()]);
    if(active>0n)workerState.pendingEpoch=String(active);
    else if(latestFunded>0n&&!(await distributor.epochFinished(latestFunded)))workerState.pendingEpoch=String(latestFunded);
    else if(workerState.pendingEpoch==null&&(workerState.lastHandledEpoch==null||completed>BigInt(workerState.lastHandledEpoch)))workerState.pendingEpoch=String(completed);
    if(workerState.pendingEpoch==null)return;
    await persist();
    const view=await snapshot(workerState.pendingEpoch),attempt=`${view.epochId}:${view.snapshotHash}`;
    if(attempt===lastAttempted&&Date.now()-lastAttemptAt<30_000)return;lastAttempted=attempt;lastAttemptAt=Date.now();
    if(!enabled){console.log(JSON.stringify({event:'dry_run_ready',epochId:view.epochId,eligibleWallets:view.rows.length,snapshotHash:view.snapshotHash}));return;}
    const result=await executeEpoch(view);if(result==='complete'||result==='skipped'){workerState.lastHandledEpoch=String(view.epochId);workerState.pendingEpoch=null;await persist();}
  }catch(error){console.error(JSON.stringify({event:'reward_worker_error',message:error.message}));await alertFailure(error.message);}
  finally{busy=false;}
}

await validate();console.log(JSON.stringify({event:'reward_worker_validated',keeper:signer.address,mode:enabled?'execute':'dry_run'}));await tick();setInterval(tick,config.pollMs);
