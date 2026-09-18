import config from '../mean-machine.json' with {type:'json'};
export const networks = Object.freeze({
  mainnet: {id:4663, name:'Robinhood Chain', nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['https://rpc.mainnet.chain.robinhood.com']}},blockExplorers:{default:{name:'Blockscout',url:'https://robinhoodchain.blockscout.com'}}},
  testnet: {id:46630,name:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['https://rpc.testnet.chain.robinhood.com']}},blockExplorers:{default:{name:'Blockscout',url:'https://explorer.testnet.chain.robinhood.com'}},testnet:true},
});
if (!networks[config.network]) throw new Error('Unsupported network in mean-machine.json');
export const chain = networks[config.network];
export const rpcUrl = import.meta.env?.VITE_RPC_URL || chain.rpcUrls.default.http[0];
export const walletNetwork = {chainId:'0x'+chain.id.toString(16),chainName:chain.name,nativeCurrency:chain.nativeCurrency,rpcUrls:[rpcUrl],blockExplorerUrls:[chain.blockExplorers.default.url]};
