import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../public/pons-launchpad.js',import.meta.url),'utf8');

test('PONS layer uses the verified v2 factory and Robinhood mainnet',()=>{
  assert.match(source,/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e/);
  assert.match(source,/chainId:\s*4663/);
  assert.match(source,/previewLaunchEconomics/);
  assert.match(source,/canLaunch/);
  assert.match(source,/approvedPairTokens/);
});

test('launch UI fails closed and never requests a private key',()=>{
  assert.match(html,/id="pons-submit" type="submit" disabled/);
  assert.match(html,/Connect a wallet to read the live launch gate/);
  assert.doesNotMatch(source,/private[ _-]?key|mnemonic|seed phrase/i);
  assert.doesNotMatch(html,/private[ _-]?key|mnemonic|seed phrase/i);
});

test('launch form pins economics and sends only the current onchain fee',()=>{
  assert.match(source,/expectedEconomics/);
  assert.match(source,/launchFee\(\)/);
  assert.match(source,/launchToken\(params,configId,quote,\{value:fee\}\)/);
  assert.match(source,/getLaunchConfig\(configId\)/);
});
