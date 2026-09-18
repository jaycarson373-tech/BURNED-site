import {Contract,JsonRpcProvider,getAddress,isAddress} from 'ethers';
import {PONS_V2_FACTORY,QQQ_TOKEN,factoryAbi} from '../server/pons-discovery.mjs';

const checks=[];
const record=(name,pass,detail)=>checks.push({name,pass:Boolean(pass),detail});
const value=name=>process.env[name]?.trim()||'';
const address=name=>isAddress(value(name))?getAddress(value(name)):'';
const provider=new JsonRpcProvider(value('RH_RPC_URL')||'https://rpc.mainnet.chain.robinhood.com',4663,{staticNetwork:true});

try{
  const network=await provider.getNetwork();record('Robinhood Chain RPC',network.chainId===4663n,`chain ${network.chainId}`);
  const factory=new Contract(PONS_V2_FACTORY,factoryAbi,provider),launcher=address('LAUNCHER_ADDRESS')||address('REWARD_OWNER_ADDRESS');
  const [pairApproved,qqqCode]=await Promise.all([factory.approvedPairTokens(QQQ_TOKEN),provider.getCode(QQQ_TOKEN)]);
  record('QQQ pair approved',pairApproved,QQQ_TOKEN);record('QQQ contract deployed',qqqCode!=='0x',QQQ_TOKEN);
  record('launcher address configured',Boolean(launcher),launcher||'missing');if(launcher)record('launcher allowed now',await factory.canLaunch(launcher),launcher);
}catch(error){record('Pons V2 access',false,error.shortMessage||error.message);}

const owner=address('REWARD_OWNER_ADDRESS'),keeper=address('REWARD_KEEPER_ADDRESS'),treasury=address('REWARD_TREASURY_ADDRESS');
record('reward owner configured',Boolean(owner),owner||'missing');record('reward keeper configured',Boolean(keeper),keeper||'missing');record('reward treasury configured',Boolean(treasury),treasury||'missing');
record('reward roles are distinct',Boolean(owner&&keeper&&treasury&&new Set([owner,keeper,treasury]).size===3),'owner / keeper / treasury');
const bps=Number(value('REWARD_DISTRIBUTION_BPS'));record('distribution percentage approved',Number.isInteger(bps)&&bps>=1&&bps<=10_000,value('REWARD_DISTRIBUTION_BPS')||'missing');
const epoch=Number(value('EPOCH_SECONDS')||1800);record('epoch length valid',Number.isSafeInteger(epoch)&&epoch>=300,`${epoch} seconds`);
record('internal API token strong',value('INTERNAL_API_TOKEN').length>=32,value('INTERNAL_API_TOKEN')?'configured but too short':'missing');
record('keeper key configured server-side',/^0x[0-9a-fA-F]{64}$/.test(value('KEEPER_PRIVATE_KEY')),value('KEEPER_PRIVATE_KEY')?'configured':'missing');
record('live execution disabled for QA',value('EXECUTE_REWARDS')!=='true',value('EXECUTE_REWARDS')||'false');

const distributor=address('TOPBLAST_DISTRIBUTOR_ADDRESS'),adapter=address('TOPBLAST_FUNDING_ADAPTER_ADDRESS');
record('distributor address configured',Boolean(distributor),distributor||'missing');record('funding adapter configured',Boolean(adapter),adapter||'missing');
if(distributor&&adapter){
  try{
    const d=new Contract(distributor,['function rewardToken() view returns(address)','function keeper() view returns(address)'],provider),a=new Contract(adapter,['function rewardToken() view returns(address)','function distributor() view returns(address)','function keeper() view returns(address)','function treasury() view returns(address)','function latestFundedEpoch() view returns(uint256)'],provider);
    const [dCode,aCode,dReward,aReward,aDistributor,dKeeper,aKeeper,aTreasury]=await Promise.all([provider.getCode(distributor),provider.getCode(adapter),d.rewardToken(),a.rewardToken(),a.distributor(),d.keeper(),a.keeper(),a.treasury()]);
    record('reward contracts deployed',dCode!=='0x'&&aCode!=='0x',`${distributor} / ${adapter}`);record('reward contracts use QQQ',getAddress(dReward)===QQQ_TOKEN&&getAddress(aReward)===QQQ_TOKEN,`${dReward} / ${aReward}`);record('adapter bound to distributor',getAddress(aDistributor)===distributor,getAddress(aDistributor));record('keeper bound onchain',Boolean(keeper)&&getAddress(dKeeper)===keeper&&getAddress(aKeeper)===keeper,`${dKeeper} / ${aKeeper}`);record('treasury bound onchain',Boolean(treasury)&&getAddress(aTreasury)===treasury,getAddress(aTreasury));
  }catch(error){record('reward contract verification',false,error.shortMessage||error.message);}
}

for(const check of checks)console.log(`${check.pass?'PASS':'FAIL'}  ${check.name}: ${check.detail}`);
const failed=checks.filter(check=>!check.pass);console.log(`\n${checks.length-failed.length}/${checks.length} checks passed`);if(failed.length)process.exitCode=1;
