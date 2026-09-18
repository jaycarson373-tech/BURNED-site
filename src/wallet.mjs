import {BrowserProvider} from 'ethers';
import {chain, rpcUrl, walletNetwork} from './chain.mjs';
export async function ensureNetwork(provider) {
  const current = await provider.request({method:'eth_chainId'});
  if (Number(BigInt(current)) !== chain.id) {
    try { await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:walletNetwork.chainId}]}); }
    catch(error) {
      if (error.code !== 4902 && error.data?.originalError?.code !== 4902) throw error;
      await provider.request({method:'wallet_addEthereumChain',params:[walletNetwork]});
      await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:walletNetwork.chainId}]});
    }
  }
  if (Number(BigInt(await provider.request({method:'eth_chainId'}))) !== chain.id) throw new Error('Wallet did not switch to the configured Robinhood chain.');
}
export async function connectInjected(provider = globalThis.window?.ethereum) {
  if (!provider) throw new Error('Install an EVM wallet or search an address.');
  await provider.request({method:'eth_requestAccounts'});
  await ensureNetwork(provider);
  return {provider, ethersProvider:new BrowserProvider(provider), accounts:await provider.request({method:'eth_accounts'})};
}
export async function connectWalletConnect({projectId}) {
  if (!projectId?.trim()) throw new Error('Set VITE_WALLETCONNECT_PROJECT_ID for this project.');
  throw new Error('WalletConnect is not enabled in this launch build.');
}
