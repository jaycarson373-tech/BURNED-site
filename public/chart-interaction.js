(() => {
  const D=()=>window.BlastData;
  function samples(rows){const m=new Map();for(const r of rows)if(Number.isFinite(r.time)&&D().raw(r.value)>0n)m.set(r.time,{time:r.time,value:BigInt(r.value)});return [...m.values()].sort((a,b)=>a.time-b.time);}
  function extent(rows,range=0,end=null){if(!rows.length)return null;const last=end??rows.at(-1).time,first=range?last-range*1000:rows[0].time;return {start:first,end:last,rows:rows.filter(r=>r.time>=first&&r.time<=last)};}
  class View {
    constructor({container,overlay,readout,onBuy,onOlder,onViewport}){
      Object.assign(this,{container,overlay,readout,onBuy,onOlder,onViewport});this.interval=60;this.mode='line';this.candles=[];this.observations=[];this.buys=[];this.selected=null;this.status=null;this.renderQueued=false;this.initialized=false;this.writing=false;this.pulseIds=new Set();this.crossingWallets=new Map();
      const L=window.LightweightCharts;
      this.chart=L.createChart(container,{autoSize:true,layout:{background:{type:'solid',color:'#101b2a'},textColor:'#afc2d6',fontSize:11,fontFamily:'IBM Plex Mono, monospace',attributionLogo:true},grid:{vertLines:{color:'#1a2a3d'},horzLines:{color:'#1a2a3d'}},crosshair:{mode:L.CrosshairMode.Normal,vertLine:{color:'#71a6bd',labelBackgroundColor:'#244a60'},horzLine:{color:'#71a6bd',labelBackgroundColor:'#244a60'}},rightPriceScale:{borderColor:'#26364b',scaleMargins:{top:.12,bottom:.24}},timeScale:{borderColor:'#26364b',timeVisible:true,secondsVisible:false,rightOffset:5,shiftVisibleRangeOnNewBar:true},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true},localization:{priceFormatter:p=>p.toLocaleString('en-US',{maximumSignificantDigits:7})}});
      this.line=this.chart.addSeries(L.LineSeries,{priceFormat:{type:'custom',formatter:p=>this.num(p),minMove:1e-12},color:'#42d7f5',lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:true});
      this.candle=this.chart.addSeries(L.CandlestickSeries,{priceFormat:{type:'custom',formatter:p=>this.num(p),minMove:1e-12},upColor:'#a8cb75',downColor:'#ff854b',wickUpColor:'#a8cb75',wickDownColor:'#ff854b',borderVisible:false,priceLineVisible:false,lastValueVisible:false,visible:false});
      const includeLevels=original=>{const info=original();if(!info?.priceRange)return info;const s=this.status,p=s?D().price(s.current_price_raw,Number(s.burned_decimals),Number(s.ember_decimals)):null,levels=[this.entry,p].filter(n=>Number.isFinite(n)&&n>0);return {...info,priceRange:{minValue:Math.min(info.priceRange.minValue,...levels),maxValue:Math.max(info.priceRange.maxValue,...levels)}};};this.line.applyOptions({autoscaleInfoProvider:includeLevels});this.candle.applyOptions({autoscaleInfoProvider:includeLevels});
      this.volume=this.chart.addSeries(L.HistogramSeries,{priceScaleId:'volume',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false});this.volume.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});
      this.chart.subscribeCrosshairMove(p=>{const s=this.mode==='candles'?this.candle:this.line,r=p.seriesData.get(s);if(r&&p.time){this.readout.textContent=new Date(Number(p.time)*1000).toLocaleString()+' · '+('open'in r?`O ${this.num(r.open)}  H ${this.num(r.high)}  L ${this.num(r.low)}  C ${this.num(r.close)}`:`${this.num(r.value)} STONK / BLAST`);}this.queue();});
      this.chart.timeScale().subscribeVisibleTimeRangeChange(r=>{this.queue();if(!this.writing&&r){this.onViewport?.(!this.isLive());if(this.firstTime&&Number(r.from)<=this.firstTime+this.interval*5)this.onOlder?.(this.firstTime);}});
      for(const event of ['pointermove','wheel','pointerup'])container.addEventListener(event,()=>this.queue(),{passive:true});
      this.resize=new ResizeObserver(()=>this.queue());this.resize.observe(container);
    }
    num(n){return Number.isFinite(n)?n.toLocaleString('en-US',{maximumSignificantDigits:7}):'—';}
    isLive(){const r=this.chart.timeScale().getVisibleRange();return !r||!this.lastTime||Number(r.to)>=this.lastTime-this.interval;}
    setMode(mode){this.mode=mode==='candles'&&this.candles.length?'candles':'line';this.line.applyOptions({visible:this.mode==='line'});this.candle.applyOptions({visible:this.mode==='candles'});this.volume.applyOptions({visible:this.mode==='candles'});this.refresh();return this.mode;}
    setData({candles=this.candles,observations=this.observations,buys=this.buys,status=this.status,interval=this.interval,pulseIds=[]}){Object.assign(this,{candles,observations,buys,status,interval});this.pulseIds=new Set(pulseIds);if(this.mode==='candles'&&!candles.length)this.mode='line';this.refresh();if(pulseIds.length)setTimeout(()=>{this.pulseIds.clear();this.queue();},1000);}
    refresh(){
      const s=this.status,base=Number(s?.burned_decimals),quote=Number(s?.ember_decimals);if(!s||!Number.isInteger(base)||!Number.isInteger(quote))return;
      const old=this.chart.timeScale().getVisibleRange(),live=this.isLive(),previousInterval=this.previousInterval;this.writing=true;
      const lines=new Map();for(const r of this.observations){const time=Math.floor(Date.parse(r.observed_at??r.created_at)/1000),value=D().price(r.price_raw??r.reference_price_raw,base,quote);if(time>0&&value)lines.set(time,{time,value});}
      // Whitespace anchors give buys an exact time without fabricating a price observation.
      for(const b of this.buys)if(!lines.has(b.time))lines.set(b.time,{time:b.time});
      const lineData=[...lines.values()].sort((a,b)=>a.time-b.time);
      const sync=(series,data,key)=>{const prev=this[key]??[];const unchangedPrefix=prev.length&&data.length>=prev.length&&prev.slice(0,-1).every((r,i)=>JSON.stringify(r)===JSON.stringify(data[i]));
        if(unchangedPrefix){for(let i=prev.length-1;i<data.length;i++)if(JSON.stringify(prev[i])!==JSON.stringify(data[i]))series.update(data[i]);}else series.setData(data);this[key]=data;};
      sync(this.line,this.mode==='line'?lineData:[],'oldLine');sync(this.candle,this.mode==='candles'?this.candles.map(({volume,closed,...r})=>r):[],'oldCandles');sync(this.volume,this.mode==='candles'?this.candles.map(r=>({time:r.time,value:r.volume,color:r.close>=r.open?'#6f934e55':'#ff854b55'})):[],'oldVolume');
      this.line.applyOptions({visible:this.mode==='line'});this.candle.applyOptions({visible:this.mode==='candles'});this.volume.applyOptions({visible:this.mode==='candles'});
      const active=this.mode==='candles'?this.candles:lineData;this.firstTime=active[0]?.time;this.lastTime=active.at(-1)?.time;this.previousInterval=this.interval;
      if(!this.initialized&&active.length){this.chart.timeScale().fitContent();this.initialized=true;}else if(old&&active.length){if((!live||previousInterval!==this.interval)&&Number(old.from)<Number(old.to))this.chart.timeScale().setVisibleRange(old);else if(Number(old.from)===Number(old.to))this.chart.timeScale().fitContent();else this.chart.timeScale().scrollToRealTime();}
      this.writing=false;this.setWallet(this.account,this.selected);this.queue();
    }
    setWallet(account,selected){this.account=account;this.selected=selected;const s=this.status;if(!s)return;const entry=account&&window.TopBlastIndex.sameSnapshot(account,s)?D().price(account.entry_price_raw,Number(s.burned_decimals),Number(s.ember_decimals)):null,price=D().price(s.current_price_raw,Number(s.burned_decimals),Number(s.ember_decimals));
      for(const series of [this.line,this.candle]){for(const l of this[series===this.line?'lineLevels':'candleLevels']??[])series.removePriceLine(l);const levels=[];if(price)levels.push(series.createPriceLine({price,color:D().fresh(s)?'#42d7f5':'#8396a8',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'CANONICAL'}));if(entry)levels.push(series.createPriceLine({price:entry,color:'#d9ecfa',lineWidth:1,lineStyle:1,axisLabelVisible:true,title:'YOUR ENTRY'}));this[series===this.line?'lineLevels':'candleLevels']=levels;}
      this.entry=entry;this.queue();
    }
    queue(){if(this.renderQueued)return;this.renderQueued=true;requestAnimationFrame(()=>{this.renderQueued=false;this.drawOverlay();});}
    drawOverlay(){const s=this.status;if(!s)return;const series=this.mode==='candles'?this.candle:this.line,w=this.chart.timeScale().width(),h=this.container.clientHeight-28;this.overlay.replaceChildren();
      const y=this.entry?series.priceToCoordinate(this.entry):null;if(y!==null){const shade=document.createElement('div');shade.className='blast-shade';shade.style.cssText=`top:${Math.max(0,y)}px;height:${Math.max(0,h-Math.max(0,y))}px;width:${w}px`;this.overlay.append(shade);}
      const base=Number(s.burned_decimals),quote=Number(s.ember_decimals);
      const groups=D().clusters(this.buys,this.mode==='candles'?this.interval:0,(t,exact)=>{const ts=this.chart.timeScale(),x=ts.timeToCoordinate(t);if(x===null||this.mode!=='candles')return x;const next=ts.timeToCoordinate(t+this.interval),previous=ts.timeToCoordinate(t-this.interval),width=next!==null?next-x:previous!==null?x-previous:0;return x+(exact-t)/this.interval*width;},p=>series.priceToCoordinate(D().price(p,base,quote)),this.selected);
      for(const g of groups){if(g.x<0||g.x>w||g.y<0||g.y>h)continue;const b=document.createElement('button');b.type='button';b.className='buy-dot'+(g.selected?' selected':'')+(g.events.some(e=>this.pulseIds.has(e.event_id))?' new-event':'');const crossing=g.events.map(e=>this.crossingWallets.get(e.wallet)).find(Boolean);if(crossing)b.classList.add(crossing==='entered'?'blast-crossing':'recovery-crossing');b.style.left=g.x+'px';b.style.top=g.y+'px';b.textContent=g.events.length>1?String(g.events.length):'';b.setAttribute('aria-label',g.events.length>1?`${g.events.length} verified buys. Inspect cluster`:`Buy by ${g.events[0].wallet}. Inspect exact transaction`);b.title=g.events.map(e=>`${e.wallet}\n${new Date(e.time*1000).toLocaleString()}\n${D().decimal(e.amount_toplast_raw,base,base)} BLAST · ${D().decimal(e.amount_ember_raw,quote,quote)} STONK\nExecution ${D().priceText(e.execution_raw,base,quote)} STONK/BLAST\nFinalized`).join('\n\n');b.onclick=()=>this.onBuy(g.events);this.overlay.append(b);}
    }
    flashWallet(wallet,kind){this.crossingWallets.set(wallet,kind);this.queue();setTimeout(()=>{this.crossingWallets.delete(wallet);this.queue();},900);}
    focusBuy(buy){const t=this.mode==='candles'?Math.floor(buy.time/this.interval)*this.interval:buy.time;this.chart.timeScale().setVisibleRange({from:t-this.interval*20,to:t+this.interval*20});this.selected=buy.wallet;this.queue();}
    range(seconds){if(!this.lastTime)return;seconds?this.chart.timeScale().setVisibleRange({from:this.lastTime-seconds,to:this.lastTime}):this.chart.timeScale().fitContent();this.queue();}
    reset(){this.chart.priceScale('right').applyOptions({autoScale:true});this.chart.timeScale().fitContent();this.queue();}
    live(){this.chart.timeScale().scrollToRealTime();this.queue();}
    autoscale(){this.chart.priceScale('right').applyOptions({autoScale:true});this.queue();}
  }
  window.BlastChart=Object.freeze({samples,extent,View});
})();
