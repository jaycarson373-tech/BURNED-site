import React,{useEffect,useMemo,useRef,useState} from 'react';
import {CandlestickSeries,ColorType,HistogramSeries,LineSeries,createChart,createSeriesMarkers} from 'lightweight-charts';
import {explorerLink} from './config.mjs';

const priceFormat={type:'price',precision:8,minMove:0.00000001};

export function TopblastChart({candles=[],buys=[],selectedPosition=null,onSelectWallet,interval,onInterval,focusSignal=0}){
  const host=useRef(null),chartRef=useRef(null),seriesRef=useRef(null),lineRef=useRef(null),candleRef=useRef(null),volumeRef=useRef(null),lineMarkers=useRef(null),candleMarkers=useRef(null),lineEntry=useRef(null),candleEntry=useRef(null),zoneRef=useRef(null),buysRef=useRef(buys),selectRef=useRef(onSelectWallet),hasFit=useRef(false),atLiveRef=useRef(true);
  const [view,setView]=useState('line'),[hover,setHover]=useState(null),[atLive,setAtLive]=useState(true);
  const clean=useMemo(()=>candles.filter(row=>row&&Number.isFinite(Number(row.close))&&Number(row.close)>0).map(row=>({...row,time:Number(row.time),open:Number(row.open),high:Number(row.high),low:Number(row.low),close:Number(row.close),volume:Number(row.volume||0)})),[candles]);
  useEffect(()=>{buysRef.current=buys;selectRef.current=onSelectWallet},[buys,onSelectWallet]);
  useEffect(()=>{atLiveRef.current=atLive},[atLive]);
  useEffect(()=>{
    if(!host.current)return;
    const chart=createChart(host.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#050807'},textColor:'#a9b8b3',fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace'},grid:{vertLines:{color:'rgba(202,255,0,.055)'},horzLines:{color:'rgba(202,255,0,.055)'}},rightPriceScale:{borderColor:'rgba(202,255,0,.18)',scaleMargins:{top:.1,bottom:.2}},timeScale:{borderColor:'rgba(202,255,0,.18)',timeVisible:true,secondsVisible:false,rightOffset:6,barSpacing:11,minBarSpacing:3},crosshair:{vertLine:{color:'#49d9ff',labelBackgroundColor:'#064653'},horzLine:{color:'#49d9ff',labelBackgroundColor:'#064653'}},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false}});
    const line=chart.addSeries(LineSeries,{color:'#dfff00',lineWidth:3,crosshairMarkerRadius:6,crosshairMarkerBorderColor:'#07100c',crosshairMarkerBackgroundColor:'#dfff00',priceLineVisible:true,lastValueVisible:true,priceLineColor:'#dfff00',priceLineWidth:2,priceFormat});
    const candlesApi=chart.addSeries(CandlestickSeries,{upColor:'#dfff00',downColor:'#ff6d58',borderVisible:false,wickUpColor:'#dfff00',wickDownColor:'#ff6d58',priceFormat,visible:false});
    const volume=chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume',color:'rgba(223,255,0,.2)'});volume.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0}});
    chartRef.current=chart;seriesRef.current=line;lineRef.current=line;candleRef.current=candlesApi;volumeRef.current=volume;lineMarkers.current=createSeriesMarkers(line,[]);candleMarkers.current=createSeriesMarkers(candlesApi,[]);
    const updateLive=()=>{const range=chart.timeScale().getVisibleLogicalRange();if(!range||!clean.length)return;const live=range.to>=clean.length-3;atLiveRef.current=live;setAtLive(live)};
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateLive);
    chart.subscribeCrosshairMove(param=>{if(!param.time||!seriesRef.current){setHover(null);return}const buy=param.hoveredObjectId?buysRef.current.find(item=>item.id===param.hoveredObjectId):null,row=param.seriesData.get(seriesRef.current);if(!row){setHover(null);return}setHover({time:param.time,open:row.open??row.value,high:row.high??row.value,low:row.low??row.value,close:row.close??row.value,buy})});
    chart.subscribeClick(param=>{if(!param.hoveredObjectId)return;const buy=buysRef.current.find(item=>item.id===param.hoveredObjectId);if(buy)selectRef.current?.(buy.wallet)});
    return()=>{chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateLive);chart.remove();chartRef.current=null;seriesRef.current=null;lineRef.current=null;candleRef.current=null;volumeRef.current=null;lineMarkers.current=null;candleMarkers.current=null;lineEntry.current=null;candleEntry.current=null};
  },[]);
  useEffect(()=>{
    if(!lineRef.current||!candleRef.current)return;lineRef.current.applyOptions({visible:view==='line'});candleRef.current.applyOptions({visible:view==='candles'});seriesRef.current=view==='candles'?candleRef.current:lineRef.current;
  },[view]);
  useEffect(()=>{
    const chart=chartRef.current,line=lineRef.current,candlesApi=candleRef.current,volume=volumeRef.current;if(!chart||!line||!candlesApi||!volume)return;
    line.setData(clean.map(row=>({time:row.time,value:row.close})));candlesApi.setData(clean);
    volume.setData(clean.map(row=>({time:row.time,value:row.volume,color:row.close>=row.open?'rgba(223,255,0,.28)':'rgba(255,109,88,.3)'})));
    if(clean.length&&!hasFit.current){chart.timeScale().fitContent();hasFit.current=true}else if(clean.length&&atLiveRef.current)chart.timeScale().scrollToRealTime();
  },[clean]);
  useEffect(()=>{
    if(!lineMarkers.current||!candleMarkers.current)return;
    const selected=selectedPosition?.wallet?.toLowerCase();
    const markers=buys.filter(b=>Number.isFinite(Number(b.time))&&Number.isFinite(Number(b.price))).sort((a,b)=>Number(a.time)-Number(b.time)||Number(a.executionTime||a.time)-Number(b.executionTime||b.time)).map(b=>{const isSelected=b.wallet?.toLowerCase()===selected,blasted=b.currentStatus==='blasted';return {time:Number(b.time),position:'belowBar',color:blasted?'#ff6d58':isSelected?'#49d9ff':'#dfff00',shape:'arrowUp',text:isSelected?'YOUR BUY':blasted?'BLASTED':'BUY',id:b.id}});
    lineMarkers.current.setMarkers(markers);candleMarkers.current.setMarkers(markers);
  },[buys,selectedPosition]);
  useEffect(()=>{
    const line=lineRef.current,candlesApi=candleRef.current,series=seriesRef.current;if(!line||!candlesApi||!series)return;
    if(lineEntry.current){line.removePriceLine(lineEntry.current);lineEntry.current=null}if(candleEntry.current){candlesApi.removePriceLine(candleEntry.current);candleEntry.current=null}
    if(selectedPosition?.averageEntry){const blasted=selectedPosition.status==='blasted',options={price:Number(selectedPosition.averageEntry),color:blasted?'#ff6d58':'#49d9ff',lineWidth:2,lineStyle:2,axisLabelVisible:true,title:'YOUR ENTRY'};lineEntry.current=line.createPriceLine(options);candleEntry.current=candlesApi.createPriceLine(options);const coordinate=series.priceToCoordinate(Number(selectedPosition.averageEntry));if(zoneRef.current&&coordinate!=null){zoneRef.current.hidden=false;zoneRef.current.style.top=`${Math.max(0,coordinate)}px`}}else if(zoneRef.current)zoneRef.current.hidden=true;
  },[selectedPosition,view,clean]);
  useEffect(()=>{if(!focusSignal)return;chartRef.current?.timeScale().scrollToRealTime();setAtLive(true)},[focusSignal]);
  const intervals=['1m','5m','15m','1h','4h','1d'];
  return <div className="chart-shell"><div className="chart-toolbar"><div className="segmented" aria-label="Candle interval">{intervals.map(item=><button className={interval===item?'active':''} key={item} onClick={()=>onInterval(item)}>{item.toUpperCase()}</button>)}</div><div className="chart-actions"><button onClick={()=>setView(view==='line'?'candles':'line')}>{view==='line'?'CANDLES':'LINE'}</button><button onClick={()=>chartRef.current?.timeScale().fitContent()}>RESET</button><button onClick={()=>host.current?.parentElement?.requestFullscreen?.()}>EXPAND</button></div></div><div className="chart-stage">{!clean.length&&<div className="chart-empty"><div className="waiting-pulse"/><span>PRELAUNCH MARKET</span><strong>WAITING FOR THE FIRST VERIFIED TRADE</strong><small>Real trades only. No simulated price history.</small></div>}{hover&&<div className="ohlc"><span>O {Number(hover.open).toPrecision(6)}</span><span>H {Number(hover.high).toPrecision(6)}</span><span>L {Number(hover.low).toPrecision(6)}</span><span>C {Number(hover.close).toPrecision(6)}</span></div>}{hover?.buy&&<a className={`marker-proof ${hover.buy.currentStatus==='blasted'?'blasted':'clear'}`} href={explorerLink('tx',hover.buy.transactionHash)} target="_blank" rel="noreferrer"><b>{hover.buy.wallet.slice(0,6)}…{hover.buy.wallet.slice(-4)}</b><span>{Number(hover.buy.tokenAmount).toLocaleString(undefined,{maximumFractionDigits:2})} TOPBLAST · {Number(hover.buy.quoteAmount).toLocaleString(undefined,{maximumFractionDigits:4})} QQQ</span><small>ENTRY {Number(hover.buy.price).toPrecision(6)} · {hover.buy.returnPercent==null?'FINALIZED':`${hover.buy.returnPercent>0?'+':''}${Number(hover.buy.returnPercent).toFixed(2)}%`} · VIEW TX</small></a>}<div ref={zoneRef} className={`blast-zone ${selectedPosition?.status==='blasted'?'active':''}`} hidden><span>{selectedPosition?.status==='blasted'?"YOU'RE BLASTED":'YOUR BLAST ZONE'} · {selectedPosition?.wallet?.slice(0,6)}…</span></div><div ref={host} className="chart-canvas" aria-label="Interactive TOPBLAST price chart"/>{clean.length>0&&<div className="live-price-pulse" aria-hidden="true"/>}{!atLive&&clean.length>0&&<button className="jump-live" onClick={()=>{chartRef.current?.timeScale().scrollToRealTime();setAtLive(true)}}>JUMP TO LIVE</button>}</div><div className="chart-caption"><span>QQQ PER TOPBLAST</span><span>Drag to pan · wheel or pinch to zoom</span><span>TradingView Lightweight Charts™</span></div></div>;
}
