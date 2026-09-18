import {useCallback,useEffect,useRef,useState} from 'react';
import {runtime} from './config.mjs';

const emptyMarket = Object.freeze({
  status: runtime.status,
  rewardStatus: 'paused',
  lastUpdated: null,
  price: null,
  change24h: null,
  marketCap: null,
  candles: [],
  buys: [],
  events: [],
  leaderboard: [],
  totals: {trackedPositions: null, walletsInZone: null, rewardsDistributed: null, epochs: null},
  epoch: {id: null, nextAt: null, status: 'unconfigured'},
  config: null,
});

function mergeMarket(value) {
  return {...emptyMarket,...value,totals:{...emptyMarket.totals,...value?.totals},epoch:{...emptyMarket.epoch,...value?.epoch}};
}

export function useMarketData(interval='1m') {
  const [market,setMarket]=useState(emptyMarket);
  const [error,setError]=useState('');
  const newestEvent=useRef('');
  const refresh=useCallback(async()=>{
    if(!runtime.indexUrl) return;
    try{
      const response=await fetch(`${runtime.indexUrl}/v1/market?interval=${encodeURIComponent(interval)}`,{headers:{accept:'application/json'}});
      if(!response.ok) throw new Error(`Index returned ${response.status}`);
      const next=mergeMarket(await response.json());
      setMarket(next);setError('');
    }catch(reason){
      setError(reason.message || 'Index unavailable');
      setMarket(current=>({...current,status:current.status==='awaiting_configuration'?'awaiting_configuration':current.lastUpdated?'delayed':'connecting'}));
    }
  },[interval]);
  useEffect(()=>{refresh();const timer=setInterval(refresh,10000);return()=>clearInterval(timer)},[refresh]);
  useEffect(()=>{
    if(!runtime.indexUrl || typeof EventSource==='undefined') return;
    const stream=new EventSource(`${runtime.indexUrl}/v1/stream`);
    stream.onmessage=(message)=>{
      try{
        const payload=JSON.parse(message.data);
        if(payload.id && payload.id===newestEvent.current)return;
        newestEvent.current=payload.id || '';
        if(payload.type==='market')setMarket(mergeMarket(payload.data));
        else refresh();
      }catch{/* Preserve the last verified state if a stream event is malformed. */}
    };
    stream.onerror=()=>setMarket(current=>({...current,status:current.status==='awaiting_configuration'?'awaiting_configuration':current.lastUpdated?'reconnecting':'connecting'}));
    return()=>stream.close();
  },[refresh]);
  return {market,error,refresh};
}

export async function lookupWallet(wallet) {
  if(!runtime.indexUrl) throw new Error('The production index is not configured yet.');
  const response=await fetch(`${runtime.indexUrl}/v1/wallet/${encodeURIComponent(wallet)}`,{headers:{accept:'application/json'}});
  if(!response.ok) throw new Error(response.status===404?'No verified Topblast entry found.':`Wallet lookup returned ${response.status}`);
  return response.json();
}
