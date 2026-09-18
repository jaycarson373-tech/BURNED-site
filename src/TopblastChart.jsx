import React,{useEffect,useMemo,useRef,useState} from 'react';
import {CandlestickSeries,ColorType,HistogramSeries,LineSeries,createChart,createSeriesMarkers} from 'lightweight-charts';
import {explorerLink} from './config.mjs';

const priceFormat={type:'price',precision:8,minMove:0.00000001};

export function TopblastChart({candles=[],buys=[],selectedPosition=null,onSelectWallet,interval,onInterval}){
  const host=useRef(null),chartRef=useRef(null),seriesRef=useRef(null),zoneRef=useRef(null),buysRef=useRef(buys),selectRef=useRef(onSelectWallet);
  const [view,setView]=useState('line'),[hover,setHover]=useState(null),[atLive,setAtLive]=useState(true);
  const clean=useMemo(()=>candles.filter(row=>row&&Number.isFinite(Number(row.close))&&Number(row.close)>0).map(row=>({...row,time:Number(row.time),open:Number(row.open),high:Number(row.high),low:Number(row.low),close:Number(row.close),volume:Number(row.volume||0)})),[candles]);
  useEffect(()=>{buysRef.current=buys;selectRef.current=onSelectWallet},[buys,onSelectWallet]);
  useEffect(()=>{
    if(!host.current)return;
    const chart=createChart(host.current,{
      autoSize:true,
      layout:{background:{type:ColorType.Solid,color:'#060806'},textColor:'#9aa38f',fontFamily:'Inter, system-ui, sans-serif'},
      grid:{vertLines:{color:'rgba(227,255,0,.05)'},horzLines:{color:'rgba(227,255,0,.05)'}},
      rightPriceScale:{borderColor:'rgba(227,255,0,.14)',scaleMargins:{top:.1,bottom:.2}},
      timeScale:{borderColor:'rgba(227,255,0,.14)',timeVisible:true,secondsVisible:false,rightOffset:6,barSpacing:11,minBarSpacing:3},
      crosshair:{vertLine:{color:'#eaff00',labelBackgroundColor:'#303a00'},horzLine:{color:'#eaff00',labelBackgroundColor:'#303a00'}},
      handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
    });
    chartRef.current=chart;
    const updateLive=()=>{const range=chart.timeScale().getVisibleLogicalRange();if(!range||!clean.length)return;setAtLive(range.to>=clean.length-3)};
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateLive);
    chart.subscribeCrosshairMove(param=>{
      if(!param.time||!seriesRef.current){setHover(null);return}
      const buy=param.hoveredObjectId?buysRef.current.find(item=>item.id===param.hoveredObjectId):null,row=param.seriesData.get(seriesRef.current);
      if(!row){setHover(null);return}
      setHover({time:param.time,open:row.open??row.value,high:row.high??row.value,low:row.low??row.value,close:row.close??row.value,buy});
    });
    chart.subscribeClick(param=>{if(!param.hoveredObjectId)return;const buy=buysRef.current.find(item=>item.id===param.hoveredObjectId);if(buy)selectRef.current?.(buy.wallet)});
    return()=>{chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateLive);chart.remove();chartRef.current=null;seriesRef.current=null};
  },[]);
  useEffect(()=>{
    const chart=chartRef.current;if(!chart)return;
    for(const existing of [...(chart.__topblastSeries||[])])chart.removeSeries(existing);
    chart.__topblastSeries=[];
    const series=view==='candles'
      ?chart.addSeries(CandlestickSeries,{upColor:'#eaff00',downColor:'#ff7849',borderVisible:false,wickUpColor:'#eaff00',wickDownColor:'#ff7849',priceFormat})
      :chart.addSeries(LineSeries,{color:'#eaff00',lineWidth:3,crosshairMarkerRadius:5,priceLineVisible:true,lastValueVisible:true,priceFormat});
    seriesRef.current=series;chart.__topblastSeries.push(series);
    series.setData(view==='candles'?clean:clean.map(row=>({time:row.time,value:row.close})));
    if(clean.length){
      const volume=chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume',color:'rgba(86,236,177,.22)'});
      chart.__topblastSeries.push(volume);
      volume.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0}});
      volume.setData(clean.map(row=>({time:row.time,value:row.volume,color:row.close>=row.open?'rgba(234,255,0,.25)':'rgba(255,120,73,.24)'})));
    }
    const markers=buys.filter(b=>Number.isFinite(Number(b.time))&&Number.isFinite(Number(b.price))).sort((a,b)=>Number(a.time)-Number(b.time)||Number(a.executionTime||a.time)-Number(b.executionTime||b.time)).map(b=>({
      time:Number(b.time),position:'belowBar',color:b.wallet?.toLowerCase()===selectedPosition?.wallet?.toLowerCase()?'#fff':'#ff7a40',shape:'circle',text:b.wallet?.slice(0,5)||'BUY',id:b.id,
    }));
    if(markers.length)createSeriesMarkers(series,markers);
    if(clean.length)chart.timeScale().fitContent();
    if(selectedPosition?.averageEntry){
      series.createPriceLine({price:Number(selectedPosition.averageEntry),color:'#ff7a40',lineWidth:2,lineStyle:2,axisLabelVisible:true,title:'YOUR ENTRY'});
      const coordinate=series.priceToCoordinate(Number(selectedPosition.averageEntry));
      if(zoneRef.current&&coordinate!=null){zoneRef.current.hidden=false;zoneRef.current.style.top=`${Math.max(0,coordinate)}px`}
    }else if(zoneRef.current)zoneRef.current.hidden=true;
  },[clean,buys,selectedPosition,view]);
  const intervals=['1m','5m','15m','1h','4h','1d'];
  return <div className="chart-shell">
    <div className="chart-toolbar"><div className="segmented" aria-label="Candle interval">{intervals.map(item=><button className={interval===item?'active':''} key={item} onClick={()=>onInterval(item)}>{item.toUpperCase()}</button>)}</div><div className="chart-actions"><button onClick={()=>setView(view==='line'?'candles':'line')}>{view==='line'?'CANDLES':'LINE'}</button><button onClick={()=>chartRef.current?.timeScale().fitContent()}>RESET</button><button onClick={()=>host.current?.parentElement?.requestFullscreen?.()}>EXPAND</button></div></div>
    <div className="chart-stage">{!clean.length&&<div className="chart-empty"><span>PONS MARKET STANDBY</span><strong>Live TOPBLAST candles activate when the verified Pons contract is connected.</strong><small>Real trades only. No simulated price data.</small></div>}{hover&&<div className="ohlc"><span>O {Number(hover.open).toPrecision(6)}</span><span>H {Number(hover.high).toPrecision(6)}</span><span>L {Number(hover.low).toPrecision(6)}</span><span>C {Number(hover.close).toPrecision(6)}</span></div>}{hover?.buy&&<a className="marker-proof" href={explorerLink('tx',hover.buy.transactionHash)} target="_blank" rel="noreferrer"><b>{hover.buy.wallet.slice(0,6)}…{hover.buy.wallet.slice(-4)}</b><span>{Number(hover.buy.quoteAmount).toLocaleString(undefined,{maximumFractionDigits:4})} QQQ → {Number(hover.buy.tokenAmount).toLocaleString(undefined,{maximumFractionDigits:2})} TOPBLAST</span><small>{new Date(Number(hover.buy.executionTime)*1000).toLocaleString()} · FINALIZED · VIEW TX</small></a>}<div ref={zoneRef} className={`blast-zone ${selectedPosition?.status==='blasted'?'active':''}`} hidden><span>{selectedPosition?.status==='blasted'?'BLASTED':'BLAST ZONE'} · {selectedPosition?.wallet?.slice(0,6)}…</span></div><div ref={host} className="chart-canvas" aria-label="TOPBLAST price chart" />{!atLive&&clean.length>0&&<button className="jump-live" onClick={()=>{chartRef.current?.timeScale().scrollToRealTime();setAtLive(true)}}>JUMP TO LIVE</button>}</div>
    <div className="chart-caption"><span>QQQ PER TOPBLAST</span><span>Drag to pan · wheel or pinch to zoom</span><span>TradingView Lightweight Charts™</span></div>
  </div>;
}
