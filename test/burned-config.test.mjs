import test from 'node:test';
import assert from 'node:assert/strict';
import { burnedPublicConfig } from '../scripts/burned-config.mjs';
test('prior TOPBLAST production settings cannot relabel RAY payouts as EMBER', () => {
  const config = burnedPublicConfig({ PUBLIC_TOPBLAST_MINT: '4LYhX3kXcKr9rTHCN4c65Hfye2aTukri3JtBbwZhUQv9', TOPBLAST_PROJECT_ID: 'topblast', PUBLIC_SUPABASE_URL: 'https://old.supabase.co', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'old-key', PUBLIC_X_URL: 'https://x.com/topblastdotxyz' });
  assert.equal(config.indexVerified, false); assert.equal(config.rewardsActive, false);
  assert.equal(config.topblastMint, ''); assert.equal(config.supabaseUrl, ''); assert.equal(config.xUrl, ''); assert.equal(config.rewardMint, '');
  assert.equal(config.projectId, 'burned-ember');
});
test('incomplete live BURNED configuration fails closed', () => {
  assert.throws(() => burnedPublicConfig({BURNED_INDEX_VERIFIED:'true'}), /Verify/);
});
test('old mint, reward mint and project cannot be reused accidentally', () => {
  assert.throws(() => burnedPublicConfig({PUBLIC_BURNED_MINT:'4LYhX3kXcKr9rTHCN4c65Hfye2aTukri3JtBbwZhUQv9'}), /verified/);
  assert.throws(() => burnedPublicConfig({PUBLIC_BURNED_EMBER_MINT:'4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'}), /verified/);
  assert.throws(() => burnedPublicConfig({BURNED_PROJECT_ID:'topblast'}), /separate/);
});
test('an active rewards flag cannot enable rewards without a verified market', () => {
  assert.equal(burnedPublicConfig({BURNED_REWARDS_ACTIVE:'true'}).rewardsActive, false);
});
