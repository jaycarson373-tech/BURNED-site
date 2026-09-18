import {Contract,JsonRpcProvider,getAddress,isAddress} from 'ethers';
import {PONS_V2_FACTORY,QQQ_TOKEN,factoryAbi} from '../server/pons-discovery.mjs';

const checks=[];const record=(name,pass,detail)=>checks.push({name,pass,detail});
const token=process.env.TOPBLAST_TOKEN_ADDRESS||process.env.VITE_TOPBLAST_TOKEN_ADDRESS||'',indexUrl=(process.env.INDEX_URL||process.env.VITE_INDEX_URL||'').replace(/\/+$/,''),xUrl=process.env.VITE_X_URL||'';
record('token address supplied',isAddress(token),token||'missing');record('index URL supplied',/^https:\/\//.test(indexUrl),indexUrl||'missing');
try{const parsed=new URL(xUrl);record('X URL supplied',parsed.protocol==='https:'&&['x.com','www.x.com'].includes(parsed.hostname)&&parsed.pathname!=='/',xUrl);}catch{record('X URL supplied',false,xUrl||'missing');}
const provider=new JsonRpcProvider(process.env.RH_RPC_URL||'https://rpc.mainnet.chain.robinhood.com',4663,{staticNetwork:true});
try{record('Robinhood Chain ID',(await provider.getNetwork()).chainId===4663n,'4663');}catch(error){record('Robinhood Chain ID',false,error.message);}
try{
  const factory=new Contract(PONS_V2_FACTORY,factoryAbi,provider),pairApproved=await factory.approvedPairTokens(QQQ_TOKEN);
  record('QQQ approved by Pons V2',pairApproved,QQQ_TOKEN);
  const launcher=process.env.LAUNCHER_ADDRESS||process.env.REWARD_OWNER_ADDRESS||'';
  if(isAddress(launcher))record('launcher allowed by Pons V2',await factory.canLaunch(getAddress(launcher)),getAddress(launcher));
  else record('launcher address supplied',false,'set LAUNCHER_ADDRESS or REWARD_OWNER_ADDRESS');
}catch(error){record('Pons V2 launch access',false,error.message);}
if(indexUrl){
  try{const [healthResponse,configResponse]=await Promise.all([fetch(`${indexUrl}/health`,{signal:AbortSignal.timeout(15_000)}),fetch(`${indexUrl}/v1/config`,{signal:AbortSignal.timeout(15_000)})]);const health=await healthResponse.json(),market=await configResponse.json();
    record('index live',healthResponse.ok&&health.marketStatus==='live',health.marketStatus||healthResponse.status);record('market token',isAddress(token)&&getAddress(market.token)===getAddress(token),market.token||'missing');record('market symbol',market.symbol==='TOPBLAST',market.symbol||'missing');record('QQQ pair',getAddress(market.pairToken)===QQQ_TOKEN,market.pairToken||'missing');record('curve phase',health.phase==='curve'&&Number(market.phase)===0,`${health.phase} / ${market.phase}`);record('buyback disabled',market.buybackEnabled===false,String(market.buybackEnabled));
    const distributorAddress=process.env.TOPBLAST_DISTRIBUTOR_ADDRESS||'',adapterAddress=process.env.TOPBLAST_FUNDING_ADAPTER_ADDRESS||'',keeperAddress=process.env.REWARD_KEEPER_ADDRESS||'';
    if(isAddress(distributorAddress)&&isAddress(adapterAddress)&&isAddress(keeperAddress)){
      const distributor=new Contract(distributorAddress,['function rewardToken() view returns(address)','function keeper() view returns(address)'],provider),adapter=new Contract(adapterAddress,['function rewardToken() view returns(address)','function distributor() view returns(address)','function keeper() view returns(address)'],provider);
      const [dCode,aCode,dReward,aReward,aDistributor,dKeeper,aKeeper]=await Promise.all([provider.getCode(distributorAddress),provider.getCode(adapterAddress),distributor.rewardToken(),adapter.rewardToken(),adapter.distributor(),distributor.keeper(),adapter.keeper()]);
      record('reward contracts deployed',dCode!=='0x'&&aCode!=='0x',`${distributorAddress} / ${adapterAddress}`);record('reward asset QQQ',getAddress(dReward)===QQQ_TOKEN&&getAddress(aReward)===QQQ_TOKEN,`${dReward} / ${aReward}`);record('reward contract binding',getAddress(aDistributor)===getAddress(distributorAddress),'adapter → distributor');record('keeper binding',getAddress(dKeeper)===getAddress(keeperAddress)&&getAddress(aKeeper)===getAddress(keeperAddress),keeperAddress);record('fee recipient binding',getAddress(market.creatorFeeRecipient)===getAddress(adapterAddress),market.creatorFeeRecipient);
    }else record('reward configuration',false,'distributor, adapter, or keeper address missing');
  }catch(error){record('index verification',false,error.message);}
}
for(const check of checks)console.log(`${check.pass?'PASS':'FAIL'}  ${check.name}: ${check.detail}`);const failed=checks.filter(check=>!check.pass);console.log(`\n${checks.length-failed.length}/${checks.length} checks passed`);if(failed.length)process.exitCode=1;
