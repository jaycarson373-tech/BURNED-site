(() => {
  const SCALE=10n**18n, address=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, signature=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
  const raw=v=>/^\d{1,78}$/.test(String(v??''))?BigInt(v):null;
  function decimal(v,d=0,max=6){const n=raw(v);if(n===null||!Number.isInteger(d)||d<0||d>18)return '—';const scale=10n**BigInt(d),fraction=(n%scale).toString().padStart(d,'0').slice(0,max).replace(/0+$/,'');return (n/scale).toLocaleString('en-US')+(fraction?'.'+fraction:'');}
  function price(v,base=6,quote=9){const n=raw(v);if(n===null||!Number.isInteger(base)||!Number.isInteger(quote))return null;const p=Number(n)/1e18*10**(base-quote);return Number.isFinite(p)&&p>0?p:null;}
  function priceText(v,base=6,quote=9){const p=price(v,base,quote);return p===null?'—':p.toLocaleString('en-US',{maximumSignificantDigits:8});}
  function execution(b){const amount=raw(b.amount_toplast_raw??b.base_raw),spent=raw(b.amount_ember_raw??b.quote_raw);return amount&&spent?spent*SCALE/amount:null;}
  function buy(row){const amount=raw(row.amount_toplast_raw??row.base_raw),quote=raw(row.amount_ember_raw??row.quote_raw),time=Date.parse(row.occurred_at)/1000;
    if(!address.test(row.wallet||'')||!signature.test(row.signature||'')||!amount||!quote||!Number.isFinite(time)||!new RegExp('^'+row.signature+':[0-9]+$').test(row.event_id||''))return null;
    if(row.side&&row.side!=='buy'||row.finality&&row.finality!=='finalized')return null;
    return {...row,amount_toplast_raw:amount.toString(),amount_ember_raw:quote.toString(),time,execution_raw:execution(row).toString(),finality:'finalized'};
  }
  function mergeEvents(previous,incoming){const map=new Map(previous.map(x=>[x.event_id,x]));for(const item of incoming){const b=buy(item);if(b&&!map.has(b.event_id))map.set(b.event_id,b);}return [...map.values()].sort((a,b)=>a.time-b.time||Number(a.slot)-Number(b.slot)||String(a.event_id).localeCompare(String(b.event_id)));}
  function position(account,status){const p=raw(status?.current_price_raw),entry=raw(account?.entry_price_raw);if(!p||!entry||!window.TopBlastIndex.sameSnapshot(account,status))return null;return {underwater:p<entry,bps:Number((p-entry)*10000n/entry),entry,price:p,excluded:account.position_status==='excluded'};}
  function fresh(status,now=Date.now()){const age=now-Date.parse(status?.current_price_time||'');return window.TopBlastIndex.fresh(status,now)&&Number.isFinite(age)&&age>=-30000&&age<=180000&&raw(status?.current_price_raw)>0n;}
  function crossing(previous,current,previousStatus,status,now=Date.now()){
    if(!fresh(previousStatus,now)||!fresh(status,now)||Date.parse(status.updated_at)<=Date.parse(previousStatus.updated_at)||Date.parse(status.updated_at)-Date.parse(previousStatus.updated_at)>60000)return null;
    const a=position(previous,previousStatus),b=position(current,status);if(!a||!b||a.underwater===b.underwater)return null;return b.underwater?'entered':'left';
  }
  function normalizeCandles(rows,base,quote,interval){const out=new Map();for(const r of rows){const time=Number(r.time),o=price(r.open_raw,base,quote),h=price(r.high_raw,base,quote),l=price(r.low_raw,base,quote),c=price(r.close_raw,base,quote),v=raw(r.volume_quote_raw);
    if(!Number.isSafeInteger(time)||time%interval||!o||!h||!l||!c||h<Math.max(o,c)||l>Math.min(o,c)||h<l||v===null||r.finality!=='finalized')continue;
    out.set(time,{time,open:o,high:h,low:l,close:c,volume:Number(v)/10**quote,closed:r.closed===true});}
    return [...out.values()].sort((a,b)=>a.time-b.time);
  }
  // The same transaction stays at its actual execution price; interval changes only its candle anchor.
  function clusters(events,interval,coordinate,priceCoordinate,selected=null){const groups=[];for(const event of events){const anchor=interval?Math.floor(event.time/interval)*interval:event.time,x=coordinate(anchor,event.time),y=priceCoordinate(event.execution_raw);if(x===null||y===null||!Number.isFinite(x)||!Number.isFinite(y))continue;
    let g=event.wallet!==selected&&groups.find(g=>!g.selected&&Math.abs(g.x-x)<20&&Math.abs(g.y-y)<22);if(!g){g={x,y,time:anchor,events:[],selected:event.wallet===selected};groups.push(g);}g.events.push(event);}
    return groups;
  }
  window.BlastData=Object.freeze({SCALE,raw,decimal,price,priceText,execution,buy,mergeEvents,position,fresh,crossing,normalizeCandles,clusters,address,signature});
})();
