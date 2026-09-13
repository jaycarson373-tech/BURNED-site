import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('unconfigured launch boots without fake price, wallet dots or a payout timer',async()=>{
  const nodes=new Map(),selectors=new Map();
  const node=()=>({textContent:'',hidden:false,dataset:{},style:{setProperty(){}},attrs:{},children:[],listeners:{},classList:{add(){},remove(){},toggle(){}},addEventListener(k,f){this.listeners[k]=f;},setAttribute(k,v){this.attrs[k]=String(v)},removeAttribute(k){delete this.attrs[k]},toggleAttribute(k,on){if(on)this.attrs[k]='';else delete this.attrs[k]},append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v},querySelector(s){return pick(selectors,s)},querySelectorAll(){return []},contains(){return false},focus(){},getBoundingClientRect(){return {left:0,width:720}},setPointerCapture(){}});
  const pick=(map,key)=>{if(!map.has(key))map.set(key,node());return map.get(key)};
  const html=readFileSync('public/index.html','utf8');for(const m of html.matchAll(/id="([^"]+)"/g))nodes.set(m[1],node());
  const document={hidden:false,getElementById:id=>nodes.get(id)??null,querySelector:s=>pick(selectors,s),querySelectorAll:()=>[],createElement:node,createElementNS:node};
  const timers=[],window={matchMedia:()=>({matches:true}),setInterval:(fn,ms)=>timers.push(ms),setTimeout,clearTimeout};
  const context={window,document,URL,URLSearchParams,AbortController,AbortSignal,Date,Intl,console,setTimeout,clearTimeout,matchMedia:window.matchMedia,requestAnimationFrame:f=>f(),fetch:async()=>({ok:false})};
  for(const file of ['runtime-config.js','index-data.js','reward-cycle.js','blast-map.js','chart-interaction.js','app.js'])runInNewContext(readFileSync('public/'+file,'utf8'),context,{filename:file});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(nodes.get('chart-mode').textContent,'BLAST MARKET NOT CONNECTED');
  assert.equal(nodes.get('price-line').attrs.d,'');
  assert.equal(nodes.get('wallet-entry-map').children.length,0);
  assert.equal(nodes.get('preview-controls').hidden,true);
  assert.equal(window.__BLAST_PUBLIC_CONFIG__.rewardsActive,false);
  assert.ok(timers.includes(15000));
  assert.ok(timers.includes(60000));
});
