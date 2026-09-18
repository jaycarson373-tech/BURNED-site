import {readFile,writeFile} from 'node:fs/promises';
import {ContractFactory,JsonRpcProvider,Wallet,getAddress} from 'ethers';
import {PONS_V2_FEE_ESCROW,QQQ_TOKEN} from '../server/pons-discovery.mjs';

const required=name=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value};
if(process.env.DEPLOY_REWARDS!=='true')throw new Error('Set DEPLOY_REWARDS=true only after reviewing owner, keeper, treasury, gas, and launch fee-recipient configuration');
const provider=new JsonRpcProvider(required('RH_RPC_URL'),4663,{staticNetwork:true}),signer=new Wallet(required('EVM_DEPLOYER_PRIVATE_KEY'),provider),owner=getAddress(required('REWARD_OWNER_ADDRESS')),keeper=getAddress(required('REWARD_KEEPER_ADDRESS')),treasury=getAddress(required('REWARD_TREASURY_ADDRESS'));
if((await provider.getNetwork()).chainId!==4663n)throw new Error('Wrong chain');
const artifact=async name=>JSON.parse(await readFile(new URL(`../out/TopblastRewards.sol/${name}.json`,import.meta.url),'utf8'));
const distributorArtifact=await artifact('TopblastDistributor'),adapterArtifact=await artifact('TopblastPonsV2FundingAdapter');
const distributor=await new ContractFactory(distributorArtifact.abi,distributorArtifact.bytecode.object,signer).deploy(QQQ_TOKEN,owner,keeper);await distributor.waitForDeployment();
const adapter=await new ContractFactory(adapterArtifact.abi,adapterArtifact.bytecode.object,signer).deploy(QQQ_TOKEN,await distributor.getAddress(),owner,keeper,treasury,PONS_V2_FEE_ESCROW);await adapter.waitForDeployment();
const result={chainId:4663,rewardToken:QQQ_TOKEN,distributor:await distributor.getAddress(),fundingAdapter:await adapter.getAddress(),owner,keeper,treasury,feeEscrow:PONS_V2_FEE_ESCROW,criticalLaunchInstruction:'Use fundingAdapter as the Pons creatorFeeRecipient at launch, or transfer the creator fee recipient to it before enabling rewards.'};
await writeFile('.reward-deployment.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result,null,2));
