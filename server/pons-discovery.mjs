import {Contract,Interface,getAddress,id,isAddress,zeroPadValue} from 'ethers';

export const PONS_V2_FACTORY=getAddress('0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e');
export const PONS_V2_FEE_ESCROW=getAddress('0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e');
export const PONS_V2_HOOK=getAddress('0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044');
export const QQQ_TOKEN=getAddress('0xD5f3879160bc7c32ebb4dC785F8a4F505888de68');

const launchInterface=new Interface([
  'event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)',
]);
const launchTopic=id('TokenLaunched(address,address,address,address,uint256,uint256)');
const curveAbi=[
  'function pairToken() view returns (address)',
  'function graduated() view returns (bool)',
  'function getReserves() view returns (uint256 quoteReserve,uint256 tokenReserve)',
];
const tokenAbi=['function name() view returns (string)','function symbol() view returns (string)','function decimals() view returns (uint8)'];
export const factoryAbi=[
  'function getLaunchedToken(address token) view returns (tuple(address token,address curve,address deployer,address creatorFeeRecipient,address pairToken,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,uint16 creatorTaxBps,bool buybackEnabled,uint8 phase,uint256 sweptQuote,uint256 sweptTokens,uint256 sweptAt,bool exists) launch)',
  'function approvedPairTokens(address token) view returns (bool)',
  'function canLaunch(address account) view returns (bool)',
];

export async function readPonsLaunchRecord({provider,tokenAddress,factoryAddress=PONS_V2_FACTORY,blockTag}){
  const factory=new Contract(factoryAddress,factoryAbi,provider),record=await factory.getLaunchedToken(getAddress(tokenAddress),blockTag==null?{}:{blockTag});
  if(!record.exists)throw new Error('Factory launch record is missing');
  return {curve:getAddress(record.curve),creatorFeeRecipient:getAddress(record.creatorFeeRecipient),pairToken:getAddress(record.pairToken),phase:Number(record.phase),poolFee:Number(record.poolFee),tickSpacing:Number(record.tickSpacing),creatorTaxBps:Number(record.creatorTaxBps),buybackEnabled:Boolean(record.buybackEnabled),sweptQuote:record.sweptQuote.toString(),sweptTokens:record.sweptTokens.toString(),sweptAt:record.sweptAt.toString()};
}

function positiveInteger(value,label){
  if(!Number.isSafeInteger(value)||value<1)throw new Error(`${label} must be a positive integer`);
  return value;
}

export async function findTokenLaunch({provider,tokenAddress,factoryAddress=PONS_V2_FACTORY,confirmations=4,chunkSize=100_000}){
  const token=getAddress(tokenAddress);
  positiveInteger(confirmations,'Confirmations');positiveInteger(chunkSize,'Chunk size');
  const latest=await provider.getBlockNumber();
  const finalized=latest-confirmations;
  if(finalized<0)throw new Error('No finalized Robinhood Chain block is available');
  const tokenTopic=zeroPadValue(token,32);
  for(let toBlock=finalized;toBlock>=0;toBlock-=chunkSize){
    const fromBlock=Math.max(0,toBlock-chunkSize+1);
    const logs=await provider.getLogs({address:getAddress(factoryAddress),topics:[launchTopic,tokenTopic],fromBlock,toBlock});
    if(logs.length>1)throw new Error('Multiple Pons V2 launch events found for the token');
    if(logs.length===1){
      const decoded=launchInterface.parseLog(logs[0]);
      return {
        token,
        curve:getAddress(decoded.args.curve),
        deployer:getAddress(decoded.args.deployer),
        pairToken:getAddress(decoded.args.pairToken),
        launchConfigId:decoded.args.launchConfigId.toString(),
        graduationThresholdRaw:decoded.args.graduationThreshold.toString(),
        launchBlock:Number(logs[0].blockNumber),
        launchTransaction:logs[0].transactionHash,
        finalizedBlock:finalized,
      };
    }
    if(fromBlock===0)break;
  }
  throw new Error('Token was not launched by the configured Pons V2 factory');
}

export async function resolvePonsLaunch({provider,tokenAddress,expectedPair=QQQ_TOKEN,confirmations=4,chunkSize=100_000}){
  if(!isAddress(tokenAddress||''))throw new Error('TOPBLAST_TOKEN_ADDRESS must be a valid address');
  const launch=await findTokenLaunch({provider,tokenAddress,factoryAddress:PONS_V2_FACTORY,confirmations,chunkSize});
  const expected=getAddress(expectedPair);
  if(launch.pairToken!==expected)throw new Error(`Verified Pons pair is ${launch.pairToken}, expected ${expected}`);
  const [tokenCode,curveCode,pairCode]=await Promise.all([
    provider.getCode(launch.token),provider.getCode(launch.curve),provider.getCode(launch.pairToken),
  ]);
  if(tokenCode==='0x'||curveCode==='0x'||pairCode==='0x')throw new Error('Verified launch references an address without deployed code');
  const token=new Contract(launch.token,tokenAbi,provider);
  const pair=new Contract(launch.pairToken,tokenAbi,provider);
  const curve=new Contract(launch.curve,curveAbi,provider);
  const [name,symbol,tokenDecimals,pairSymbol,pairDecimals,curvePair,graduated,record]=await Promise.all([
    token.name(),token.symbol(),token.decimals(),pair.symbol(),pair.decimals(),curve.pairToken(),curve.graduated(),readPonsLaunchRecord({provider,tokenAddress:launch.token}),
  ]);
  if(getAddress(curvePair)!==launch.pairToken)throw new Error('Curve pair token does not match the factory launch event');
  if(record.curve!==launch.curve||record.pairToken!==launch.pairToken)throw new Error('Factory launch record does not match the launch event');
  return {...launch,name,symbol,tokenDecimals:Number(tokenDecimals),pairSymbol,pairDecimals:Number(pairDecimals),graduated:Boolean(graduated),...record};
}
