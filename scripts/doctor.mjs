import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync(new URL('../mean-machine.json',import.meta.url)));
const expected=config.network==='mainnet'?4663:config.network==='testnet'?46630:null;
if(!expected)throw new Error('Unknown network');
const url=process.env.RH_RPC_URL||`https://rpc.${config.network}.chain.robinhood.com`;
async function rpc(method){const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:[]}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('RPC returned HTTP '+response.status);const data=await response.json();if(data.error)throw new Error('RPC error: '+data.error.message);if(!/^0x[0-9a-fA-F]+$/.test(data.result))throw new Error('Invalid RPC result');return BigInt(data.result)}
try{const chain=await rpc('eth_chainId');if(chain!==BigInt(expected))throw new Error('Wrong chain: expected '+expected+', received '+chain);const block=await rpc('eth_blockNumber');console.log(JSON.stringify({status:'pass',network:config.network,chainId:expected,latestBlock:block.toString(),checkedAt:new Date().toISOString(),scope:'RPC connectivity only; no transaction submitted'},null,2))}catch(error){console.error(error.message);process.exitCode=1}
