import {getAddress, isAddress} from 'ethers';

export const ROBINHOOD_CHAIN_ID = 4663;
export const PONS_V2_FACTORY = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e';
export const PONS_V2_FEE_ESCROW = '0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e';
export const QQQ_TOKEN = '0xD5f3879160bc7c32ebb4dC785F8a4F505888de68';

const env = import.meta.env ?? {};
const address = (value) => isAddress(value || '') ? getAddress(value) : '';
const withoutSlash = (value) => String(value || '').replace(/\/+$/, '');

export const runtime = Object.freeze({
  chainId: ROBINHOOD_CHAIN_ID,
  tokenAddress: address(env.VITE_TOPBLAST_TOKEN_ADDRESS),
  quoteAddress: QQQ_TOKEN,
  indexUrl: withoutSlash(env.VITE_INDEX_URL),
  buyUrl: env.VITE_BUY_URL || (address(env.VITE_TOPBLAST_TOKEN_ADDRESS)?`https://www.ponsfamily.com/launchpad/${address(env.VITE_TOPBLAST_TOKEN_ADDRESS)}`:''),
  xUrl: env.VITE_X_URL || '',
  explorerUrl: 'https://robinhoodchain.blockscout.com',
  status: address(env.VITE_TOPBLAST_TOKEN_ADDRESS) && withoutSlash(env.VITE_INDEX_URL)
    ? 'connecting'
    : 'awaiting_configuration',
});

export function explorerLink(kind, value) {
  if (!value) return '';
  return `${runtime.explorerUrl}/${kind}/${value}`;
}
