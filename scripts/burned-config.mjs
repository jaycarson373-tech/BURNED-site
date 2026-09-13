import { validatePublicSupabaseKey } from './public-key.mjs';
const address = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const priorMints = new Set(['4LYhX3kXcKr9rTHCN4c65Hfye2aTukri3JtBbwZhUQv9', '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R']);
export function burnedPublicConfig(env = {}) {
  // Deliberately do not inherit TOPBLAST production env or its RAY history.
  const read = key => (env[key] || '').trim();
  const indexVerified = read('BURNED_INDEX_VERIFIED') === 'true';
  const marketVerified = indexVerified || read('BURNED_MARKET_VERIFIED') === 'true';
  const projectId = read('BURNED_PROJECT_ID') || 'burned-ember';
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(projectId) || projectId.startsWith('topblast')) throw new Error('Use a separate BURNED index project');
  const mint = read('PUBLIC_BURNED_MINT'), rewardMint = read('PUBLIC_BURNED_EMBER_MINT');
  for (const value of [mint, rewardMint]) if (value && (!address.test(value) || priorMints.has(value))) throw new Error('BURNED requires newly verified token and EMBER mints, not the prior TOPBLAST/RAY pair');
  if (marketVerified && (!mint || !rewardMint)) throw new Error('Verify both BURNED / EMBER mints before publishing the market');
  const supabaseUrl = read('PUBLIC_BURNED_SUPABASE_URL'), supabaseKey = read('PUBLIC_BURNED_SUPABASE_KEY');
  if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) throw new Error('Configure both BURNED public index values');
  if (supabaseUrl) {
    const url = new URL(supabaseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid BURNED public index URL');
    validatePublicSupabaseKey(supabaseKey);
  }
  if (indexVerified && (!mint || !rewardMint || !supabaseUrl || !supabaseKey)) throw new Error('Verify the BURNED / EMBER market and isolated index before enabling live data');
  const xUrl = read('PUBLIC_BURNED_X_URL');
  if (xUrl && !/^https:\/\/(?:www\.)?x\.com\/[A-Za-z0-9_]{1,15}\/?$/.test(xUrl)) throw new Error('Invalid BURNED X URL');
  const dexscreenerUrl = marketVerified && mint ? `https://dexscreener.com/solana/${mint}` : '';
  const reviewedEpoch = read('BURNED_REVIEWED_EPOCH');
  if (reviewedEpoch && !/^[1-9]\d{0,9}$/.test(reviewedEpoch)) throw new Error('Invalid reviewed epoch');
  return { reviewedEpoch: reviewedEpoch ? Number(reviewedEpoch) : null, supabaseUrl: indexVerified ? supabaseUrl : '', supabaseKey: indexVerified ? supabaseKey : '', projectId, xUrl, topblastMint: marketVerified ? mint : '', rewardMint: marketVerified ? rewardMint : '', dexscreenerUrl, indexVerified, rewardsActive: indexVerified && read('BURNED_REWARDS_ACTIVE') === 'true' };
}
