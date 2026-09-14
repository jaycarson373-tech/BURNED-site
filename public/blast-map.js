(() => {
  function layout(rows,status,selected=null){
    if(!window.BlastData.fresh(status)||!Array.isArray(rows)||rows.some(r=>!window.TopBlastIndex.sameSnapshot(r,status)))return null;
    const seen=new Set(),valid=rows.filter(r=>{const time=Date.parse(r.entry_time||'');if(!window.BlastData.address.test(r.wallet||'')||seen.has(r.wallet)||!Number.isFinite(time)||time>Date.parse(status.updated_at)||!window.BlastData.position(r,status))return false;seen.add(r.wallet);return true;}).map(r=>({...r,entryTime:Date.parse(r.entry_time),positionBps:window.BlastData.position(r,status).bps})).sort((a,b)=>a.entryTime-b.entryTime||a.wallet.localeCompare(b.wallet));
    const visible=valid.slice(0,500),chosen=valid.find(r=>r.wallet===selected);if(chosen&&!visible.includes(chosen)){visible.pop();visible.push(chosen);}
    const start=valid[0]?.entryTime??Date.parse(status.updated_at),end=valid.at(-1)?.entryTime??start,min=Math.min(-1000,...visible.map(r=>r.positionBps)),max=Math.max(1000,...visible.map(r=>r.positionBps));
    const y=n=>30+(max-n)/(max-min)*240,x=t=>end===start?350:65+(t-start)/(end-start)*580;
    return {rows:visible.map(r=>({...r,x:x(r.entryTime),y:y(r.positionBps)})),total:valid.length,visible:visible.length,currentY:y(0),start,end,min,max};
  }
  const el=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  class View{
    constructor({svg,onSelect}){this.svg=svg;this.onSelect=onSelect;this.model=null;this.selected=null;svg.addEventListener('click',e=>{const dot=e.target.closest('[data-wallet]');if(dot)this.onSelect(dot.dataset.wallet);});svg.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.dataset.wallet){e.preventDefault();this.onSelect(e.target.dataset.wallet);}});}
    render(rows,status,selected){const model=layout(rows,status,selected);if(!model)return false;this.model=model;this.svg.replaceChildren();this.svg.setAttribute('viewBox','0 0 720 330');this.svg.append(el('rect',{x:65,y:model.currentY,width:580,height:Math.max(0,270-model.currentY),fill:'#ff854b12'}));
      for(const [value,label]of [[model.max,`${(model.max/100).toFixed(0)}%`],[0,'0%'],[model.min,`${(model.min/100).toFixed(0)}%`]]){const y=30+(model.max-value)/(model.max-model.min)*240;this.svg.append(el('line',{x1:65,x2:645,y1:y,y2:y,stroke:value===0?'#7492ad':'#26364b','stroke-dasharray':value===0?'5 5':'0'}));const t=el('text',{x:54,y:y+4,'text-anchor':'end',fill:'#afc2d6'});t.textContent=label;this.svg.append(t);}
      const zone=el('text',{x:76,y:Math.min(260,model.currentY+20),fill:'#ff854b'});zone.textContent='BLAST ZONE · NEGATIVE RETURN';this.svg.append(zone);
      for(const r of model.rows){const g=el('g',{'data-wallet':r.wallet,tabindex:0,role:'button','aria-label':`${r.wallet}, ${(r.positionBps/100).toFixed(2)}%, first verified buy ${new Date(r.entryTime).toLocaleString()}`});g.append(el('circle',{cx:r.x,cy:r.y,r:18,fill:'transparent'}),el('circle',{cx:r.x,cy:r.y,r:r.wallet===selected?9:6,fill:r.wallet===selected?'#42d7f5':r.positionBps<0?'#ff854b':'#a8cb75',stroke:r.position_status==='excluded'?'#f0f6ff':'none','stroke-width':2}));const title=el('title');title.textContent=`${r.wallet}\n${(r.positionBps/100).toFixed(2)}% now\nFirst verified buy ${new Date(r.entryTime).toLocaleString()}`;g.append(title);this.svg.append(g);}
      for(const [x,time,anchor]of [[65,model.start,'start'],[645,model.end,'end']]){const t=el('text',{x,y:300,'text-anchor':anchor,fill:'#afc2d6'});t.textContent=new Date(time).toLocaleString();this.svg.append(t);}return true;
    }
  }
  window.BlastWalletMap=Object.freeze({layout,View});
})();
