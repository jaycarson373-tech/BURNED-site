import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the actual async lookup with controlled network completion order.
const app = readFileSync('public/app.js', 'utf8');
const source = app.slice(app.indexOf('  async function refreshSelectedWallet'), app.indexOf('\n  function validSignature'));
function fixture() {
  const calls = [], rendered = [];
  const state = {
    selectedWallet: 'wallet-a', protocol: { project_id: 'burned-ember' }, config: {}, walletRequestVersion: 0,
    window: { TopBlastIndex: { matchesMarket: () => true } },
    readRows: (table, query) => new Promise((resolve, reject) => calls.push({ table, query, resolve, reject })),
    renderPosition: account => rendered.push(['position', account.wallet]),
    renderHistory: rows => rendered.push(['history', rows.map(row => row.wallet).join(',')]),
    verifiedDistribution: row => row.confirmed === true,
    clearPosition: () => rendered.push(['clear']), renderMarketChart: () => true,
    setMessage: message => rendered.push(['message', message]),
  };
  runInNewContext(source, state);
  return { state, calls, rendered };
}
test('search uses one wallet and canonical project for both position and rewards', async () => {
  const { state, calls, rendered } = fixture();
  const request = state.refreshSelectedWallet();
  assert.ok(calls.every(call => call.query.wallet === 'eq.wallet-a' && call.query.project_id === 'eq.burned-ember'));
  calls[0].resolve([{ wallet: 'wallet-a' }]);
  calls[1].resolve([{ wallet: 'wallet-a', confirmed: true }, { wallet: 'wallet-b', confirmed: true }, { wallet: 'wallet-a', confirmed: false }]);
  await request;
  assert.deepEqual(rendered, [['position', 'wallet-a'], ['history', 'wallet-a']]);
});
test('old successful lookup cannot replace a newly searched wallet', async () => {
  const { state, calls, rendered } = fixture();
  const request = state.refreshSelectedWallet(); state.selectedWallet = 'wallet-b';
  calls[0].resolve([{ wallet: 'wallet-a' }]); calls[1].resolve([]); await request;
  assert.deepEqual(rendered, []);
});
test('old failed lookup cannot clear a newly searched wallet', async () => {
  const { state, calls, rendered } = fixture();
  const request = state.refreshSelectedWallet(); state.selectedWallet = 'wallet-b';
  calls[0].reject(new Error('Timeout')); calls[1].resolve([]); await request;
  assert.deepEqual(rendered, []);
});
test('new canonical snapshot invalidates in-flight wallet responses', async () => {
  const { state, calls, rendered } = fixture();
  const request = state.refreshSelectedWallet(); state.protocol = { project_id: 'burned-ember' };
  calls[0].resolve([{ wallet: 'wallet-a' }]); calls[1].resolve([]); await request;
  assert.deepEqual(rendered, []);
});
test('response for the wrong wallet fails closed', async () => {
  const { state, calls, rendered } = fixture();
  const request = state.refreshSelectedWallet();
  calls[0].resolve([{ wallet: 'wallet-b' }]); calls[1].resolve([]); await request;
  assert.equal(rendered[0][0], 'clear');
  assert.ok(!rendered.some(row => row[0] === 'position' || row[0] === 'history'));
});
