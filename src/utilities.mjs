import {Contract, getAddress, keccak256, toUtf8Bytes} from 'ethers';
const positive=(value,name)=>{const n=BigInt(value);if(n<=0n)throw new Error(name+' must be positive');return n};
function uniqueRows(rows){if(!Array.isArray(rows)||!rows.length)throw new Error('At least one participant is required');const keys=rows.map(row=>getAddress(row.wallet).toLowerCase());if(keys.some(key=>/^0x0{40}$/.test(key)))throw new Error('Zero wallet is not a participant');if(new Set(keys).size!==keys.length)throw new Error('Duplicate wallet');return keys;}
export function seedCommitment(seed){if(!/^0x[0-9a-fA-F]{64}$/.test(seed))throw new Error('Seed must be 32 bytes');return keccak256(seed)}
export function drawWinner(entries, seed){
  uniqueRows(entries);seedCommitment(seed);
  const ordered=entries.map(row=>({...row,wallet:getAddress(row.wallet),weight:positive(row.weight,'Weight')})).sort((a,b)=>a.wallet.toLowerCase().localeCompare(b.wallet.toLowerCase()));
  const total=ordered.reduce((s,row)=>s+row.weight,0n),space=1n<<256n;
  if(total>=space)throw new Error('Total weight exceeds the seed space');
  const limit=space-space%total;let random=BigInt(seed),counter=0;
  while(random>=limit){random=BigInt(keccak256(toUtf8Bytes(seed+':'+(++counter))));}
  let ticket=random%total;
  for(const row of ordered){if(ticket<row.weight)return row;ticket-=row.weight;}
  throw new Error('No winner');
}
export function rankBattle(portfolios){
  uniqueRows(portfolios);
  const rows=portfolios.map(row=>({...row,wallet:getAddress(row.wallet),start:positive(row.start,'Starting balance'),end:BigInt(row.end)}));
  if(rows.some(row=>row.end<0n))throw new Error('Ending balance cannot be negative');
  rows.sort((a,b)=>{const delta=a.end*b.start-b.end*a.start;return delta===0n?a.wallet.toLowerCase().localeCompare(b.wallet.toLowerCase()):delta>0n?-1:1});
  return rows.map(row=>({...row,returnBps:(row.end-row.start)*10000n/row.start,rank:1+rows.filter(other=>other.end*row.start>row.end*other.start).length}));
}
export function splitPrize(prizeRaw,winners){uniqueRows(winners);const prize=positive(prizeRaw,'Prize'),each=prize/BigInt(winners.length);return {allocations:winners.map(row=>({wallet:getAddress(row.wallet),amount:each})),dust:prize-each*BigInt(winners.length)}}
export function quoteV2(amountIn,reserveIn,reserveOut,feeBps=30n){const input=positive(amountIn,'Input'),x=positive(reserveIn,'Input reserve'),y=positive(reserveOut,'Output reserve'),fee=BigInt(feeBps);if(fee<0n||fee>=10000n)throw new Error('Invalid fee');const adjusted=input*(10000n-fee);return adjusted*y/(x*10000n+adjusted)}
export async function readV2Pool(provider,address){
  const pairAddress=getAddress(address);if(await provider.getCode(pairAddress)==='0x')throw new Error('Pair address has no contract');
  const pair=new Contract(pairAddress,['function token0() view returns (address)','function token1() view returns (address)','function getReserves() view returns (uint112,uint112,uint32)'],provider);
  const blockNumber=await provider.getBlockNumber();const options={blockTag:blockNumber};
  const [token0,token1,reserves]=await Promise.all([pair.token0(options),pair.token1(options),pair.getReserves(options)]);
  return {pair:pairAddress,blockNumber,token0,token1,reserve0:reserves[0],reserve1:reserves[1],updatedAt:reserves[2]};
}
export function binaryPrices(yesReserve,noReserve){const yes=positive(yesReserve,'YES reserve'),no=positive(noReserve,'NO reserve');const yesBps=no*10000n/(yes+no);return {yesBps,noBps:10000n-yesBps}}
export function settleWinningShares(collateralRaw,winners){
  uniqueRows(winners);const collateral=positive(collateralRaw,'Collateral'),rows=winners.map(row=>({...row,wallet:getAddress(row.wallet),shares:positive(row.shares,'Shares')})),total=rows.reduce((s,row)=>s+row.shares,0n);
  const allocations=rows.map(row=>({wallet:row.wallet,amount:collateral*row.shares/total}));
  return {allocations,dust:collateral-allocations.reduce((s,row)=>s+row.amount,0n)};
}
