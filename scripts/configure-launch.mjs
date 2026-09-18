import {writeFile} from 'node:fs/promises';
import {JsonRpcProvider,getAddress,isAddress} from 'ethers';
import {QQQ_TOKEN,resolvePonsLaunch} from '../server/pons-discovery.mjs';

const [tokenInput,xInput]=process.argv.slice(2),rpcUrl=process.env.RH_RPC_URL||'https://rpc.mainnet.chain.robinhood.com';
if(!isAddress(tokenInput||''))throw new Error('Usage: npm run configure:launch -- <verified TOPBLAST token address> <https://x.com/account>');
const xUrl=new URL(xInput||'');if(xUrl.protocol!=='https:'||!['x.com','www.x.com'].includes(xUrl.hostname)||xUrl.pathname==='/'||xUrl.search||xUrl.hash)throw new Error('X account must be a clean https://x.com/account URL');
const provider=new JsonRpcProvider(rpcUrl,4663,{staticNetwork:true}),launch=await resolvePonsLaunch({provider,tokenAddress:getAddress(tokenInput),expectedPair:QQQ_TOKEN,confirmations:Number(process.env.INDEX_CONFIRMATIONS||4)});
if(launch.symbol.toUpperCase()!=='TOPBLAST')throw new Error(`Verified token symbol is ${launch.symbol}, expected TOPBLAST`);
if(launch.phase!==0)throw new Error(`Verified token is already in unsupported Pons phase ${launch.phase}`);
if(launch.buybackEnabled)throw new Error('Pons buyback is enabled; direct creator-fee sweeping is not safe for this worker');
const expectedRecipient=process.env.TOPBLAST_FUNDING_ADAPTER_ADDRESS?.trim();if(expectedRecipient&&getAddress(expectedRecipient)!==launch.creatorFeeRecipient)throw new Error(`Creator fee recipient is ${launch.creatorFeeRecipient}, expected funding adapter ${getAddress(expectedRecipient)}`);
const output=['# Generated only after the Pons V2 launch was verified on Robinhood Chain.',`TOPBLAST_TOKEN_ADDRESS=${launch.token}`,`VITE_TOPBLAST_TOKEN_ADDRESS=${launch.token}`,`VITE_X_URL=${xUrl.toString().replace(/\/$/,'')}`,`# Auto-discovered curve: ${launch.curve}`,`# Auto-discovered launch block: ${launch.launchBlock}`,`# Verified quote asset: ${launch.pairToken}`,`# Creator fee recipient: ${launch.creatorFeeRecipient}`,`# Buyback enabled: ${launch.buybackEnabled}`,`# Launch transaction: ${launch.launchTransaction}`,''].join('\n');
await writeFile('.launch.generated.env',output,{mode:0o600});
console.log(JSON.stringify({status:'verified',token:launch.token,symbol:launch.symbol,curve:launch.curve,pairToken:launch.pairToken,creatorFeeRecipient:launch.creatorFeeRecipient,launchBlock:launch.launchBlock,launchTransaction:launch.launchTransaction,output:'.launch.generated.env'},null,2));
