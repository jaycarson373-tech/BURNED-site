import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublicSupabaseKey} from '../scripts/public-key.mjs';
const jwt=role=>[Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),Buffer.from(JSON.stringify({role})).toString('base64url'),'testsignature'].join('.');
test('public builds accept only publishable and anon credentials',()=>{
  assert.doesNotThrow(()=>validatePublicSupabaseKey('sb_publishable_'+'a'.repeat(32)));
  assert.doesNotThrow(()=>validatePublicSupabaseKey(jwt('anon')));
  for(const key of [jwt('service_role'),jwt('authenticated'),'sb_secret_'+'a'.repeat(32),'eyJmalformed'])assert.throws(()=>validatePublicSupabaseKey(key),/Only a Supabase/);
});
