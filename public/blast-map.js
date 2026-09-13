(() => {
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const labels={blasted:'BLASTED',safe:'CLEAR',excluded:'EXCLUDED',price_unavailable:'PRICE UNAVAILABLE'};
  const positive=v=>/^\d{1,78}$/.test(String(v??''))&&BigInt(v)>0n;
  const hash=wallet=>{let h=2166136261;for(const c of wallet)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
  function layout(rows,status,selected=null){
    if(!positive(status?.current_price_raw))return null;
    const stamp=Date.parse(status.updated_at||'');if(!Number.isFinite(stamp))return null;
    if(!Array.isArray(rows)||rows.some(r=>Date.parse(r.updated_at)!==stamp))return null;
    const seen=new Set();
    const valid=rows.filter(r=>{if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(r.wallet||'')||seen.has(r.wallet)||Date.parse(r.updated_at)!==stamp||!positive(r.entry_price_raw)||!positive(r.tracked_burned_raw)||!labels[r.position_status])return false;seen.add(r.wallet);return true;}).sort((a,b)=>a.wallet.localeCompare(b.wallet));
    const visible=valid.slice(0,500),chosen=valid.find(r=>r.wallet===selected);
    if(chosen&&!visible.includes(chosen)){visible.pop();visible.push(chosen);}
    const current=BigInt(status.current_price_raw);
    const positionBps=r=>Number((current-BigInt(r.entry_price_raw))*10000n/BigInt(r.entry_price_raw));
    const compress=n=>Math.sign(n)*Math.log1p(Math.abs(n)/100);
    const values=[-2500,2500,...visible.map(positionBps)];
    const lo=compress(Math.min(...values)),hi=compress(Math.max(...values));
    const y=n=>55+(hi-compress(n))/(hi-lo)*295;
    return {currentY:y(0),total:valid.length,visible:visible.length,rows:visible.map(r=>({...r,x:86+hash(r.wallet)%540,y:y(positionBps(r)),positionBps:positionBps(r)})),ticks:[-10000,-5000,-2500,0,2500,10000,100000].filter(n=>compress(n)>=lo&&compress(n)<=hi).map(n=>({y:y(n),label:`${n>0?'+':''}${n/100}%`})),stamp};
  }
  const el=(tag,attrs={})=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  class View {
    constructor({svg,detail,summary,onSelect,formatPrice,formatAmount}){
      Object.assign(this,{svg,detail,summary,onSelect,formatPrice,formatAmount});this.nodes=new Map();this.selected=null;this.model=null;this.zoom=1;this.focusIndex=0;this.lastStates=new Map();this.lastStamp=null;
      svg.addEventListener('click',e=>{if(!this.model)return;const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const pt=p.matrixTransform(svg.getScreenCTM().inverse());let nearest=null,distance=Infinity;for(const r of this.model.rows){const d=Math.hypot(pt.x-r.x,pt.y-r.y);if(d<distance){nearest=r;distance=d;}}if(nearest&&distance<48/this.zoom)this.inspect(nearest,true);});
      svg.addEventListener('keydown',e=>{if(!this.model?.rows.length)return;if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Enter',' '].includes(e.key)){e.preventDefault();if(e.key.startsWith('Arrow'))this.focusIndex=(this.focusIndex+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+this.model.rows.length)%this.model.rows.length;this.inspect(this.model.rows[this.focusIndex],true);}});
      svg.addEventListener('pointermove',e=>{const node=e.target.closest('[data-wallet]');if(node&&e.pointerType==='mouse'){const row=this.model?.rows.find(r=>r.wallet===node.dataset.wallet);if(row)this.inspect(row,false);}});
    }
    setZoom(value){this.zoom=Math.min(3,Math.max(1,value));const h=420/this.zoom,w=720/this.zoom,center=this.selected?this.model?.rows.find(r=>r.wallet===this.selected):null;const x=Math.max(0,Math.min(720-w,(center?.x??360)-w/2)),y=Math.max(0,Math.min(420-h,(center?.y??this.model?.currentY??210)-h/2));this.svg.setAttribute('viewBox',`${x} ${y} ${w} ${h}`);}
    inspect(row,commit){
      this.detail.hidden=false;this.detail.querySelector('[data-wallet-address]').textContent=`${row.wallet.slice(0,6)}…${row.wallet.slice(-4)}`;
      this.detail.querySelector('[data-wallet-status]').textContent=labels[row.position_status];
      this.detail.querySelector('[data-wallet-entry]').textContent=this.formatPrice(row.entry_price_raw)+' STONK';
      this.detail.querySelector('[data-wallet-depth]').textContent=row.position_status==='excluded'?'Excluded this epoch':Number.isFinite(Number(row.burn_depth_bps))?(Number(row.burn_depth_bps)/100).toFixed(2)+'% below entry':'Depth unavailable';
      const link=this.detail.querySelector('button');link.onclick=()=>this.onSelect(row.wallet);
      if(commit){this.selected=row.wallet;this.selectedLine.setAttribute('visibility','visible');this.selectedLine.setAttribute('y1',row.y);this.selectedLine.setAttribute('y2',row.y);for(const [w,n]of this.nodes)n.classList.toggle('is-selected',w===row.wallet);this.svg.setAttribute('aria-label',`${row.wallet}, ${labels[row.position_status]}, entry ${this.formatPrice(row.entry_price_raw)} STONK. Use arrow keys to inspect wallets.`);}
    }
    render(rows,status,selected){
      const model=layout(rows,status,selected);if(!model)return false;
      this.model=model;if(selected)this.selected=selected;
      if(!this.base){
        this.svg.replaceChildren();const defs=el('defs');const gradient=el('linearGradient',{id:'wallet-heat',x1:0,y1:1,x2:0,y2:0});gradient.append(el('stop',{offset:0,'stop-color':'#879f43','stop-opacity':'.04'}),el('stop',{offset:1,'stop-color':'#d5ff5f','stop-opacity':'.24'}));defs.append(gradient);this.svg.append(defs);
        this.heat=el('rect',{x:62,y:20,width:596,fill:'url(#wallet-heat)'});this.svg.append(this.heat);this.zoneLabel=el('text',{x:80,y:38,'class':'wallet-zone-label'});this.zoneLabel.textContent='BLAST ZONE · BELOW YOUR ENTRY';this.svg.append(this.zoneLabel);
        this.grid=el('g',{'class':'wallet-map-grid','aria-hidden':'true'});this.svg.append(this.grid);
        this.priceLine=el('line',{x1:62,x2:658,'class':'wallet-current-line'});this.svg.append(this.priceLine);
        this.selectedLine=el('line',{x1:62,x2:658,'class':'wallet-selected-line'});this.svg.append(this.selectedLine);this.dotLayer=el('g');this.svg.append(this.dotLayer);
        this.lineLabel=el('text',{x:646,'text-anchor':'end','class':'wallet-line-label'});this.svg.append(this.lineLabel);this.base=true;
      }
      this.heat.setAttribute('y',model.currentY);this.heat.setAttribute('height',Math.max(0,370-model.currentY));this.zoneLabel.setAttribute('y',Math.min(365,model.currentY+22));this.grid.replaceChildren();
      for(const t of model.ticks){this.grid.append(el('line',{x1:62,x2:658,y1:t.y,y2:t.y}));const label=el('text',{x:54,y:t.y+4,'text-anchor':'end'});label.textContent=t.label;this.grid.append(label);}
      for(const [w,node]of this.nodes)if(!model.rows.some(r=>r.wallet===w)){node.remove();this.nodes.delete(w);this.lastStates.delete(w);}
      const motion=!matchMedia('(prefers-reduced-motion: reduce)').matches,newSnapshot=this.lastStamp!==null&&model.stamp>this.lastStamp&&model.stamp-this.lastStamp<=60000&&Date.now()-model.stamp<180000;
      const labeled=new Set(model.rows.filter(x=>x.position_status==='blasted').sort((a,b)=>Number(b.burn_depth_bps)-Number(a.burn_depth_bps)).slice(0,8).map(x=>x.wallet));
      for(const r of model.rows){let node=this.nodes.get(r.wallet);if(!node){node=el('g',{'class':'wallet-entry-dot','data-wallet':r.wallet});node.append(el('circle',{r:14,'class':'wallet-dot-hit'}),el('circle',{r:6,'class':'wallet-dot-core'}),el('title'),el('text',{x:12,y:4,'class':'wallet-dot-label'}));this.dotLayer.append(node);this.nodes.set(r.wallet,node);}
        node.dataset.state=r.position_status;node.classList.toggle('is-selected',r.wallet===this.selected);node.setAttribute('transform',`translate(${r.x} ${r.y.toFixed(2)})`);node.querySelector('title').textContent=`${r.wallet}\nEntry ${this.formatPrice(r.entry_price_raw)} STONK\n${labels[r.position_status]}`;
        const label=node.querySelector('text');label.setAttribute('text-anchor',r.x>420?'end':'start');label.setAttribute('x',r.x>420?-12:12);label.textContent=`${r.wallet.slice(0,4)}…${r.wallet.slice(-3)} · ${(r.positionBps/100).toFixed(1)}%`;label.setAttribute('visibility',r.wallet===this.selected||labeled.has(r.wallet)?'visible':'hidden');const before=this.lastStates.get(r.wallet);if(newSnapshot&&motion&&before==='safe'&&r.position_status==='blasted'){node.classList.remove('just-burned');requestAnimationFrame(()=>node.classList.add('just-burned'));}this.lastStates.set(r.wallet,r.position_status);
      }
      this.priceLine.setAttribute('y1',model.currentY);this.priceLine.setAttribute('y2',model.currentY);this.lineLabel.setAttribute('y',Math.max(32,model.currentY-10));this.lineLabel.textContent=(Date.now()-Date.parse(status.indexed_through_time||'')<180000?'CURRENT ':'LAST ')+this.formatPrice(status.current_price_raw)+' STONK · 0%';
      this.summary.textContent=`${status.wallets_in_zone??'—'} IN BLAST ZONE · ${model.visible}${model.total>model.visible?' OF '+model.total:''} WALLET ENTRIES`;
      const fresh=Date.now()-Date.parse(status.indexed_through_time||'')<180000;this.svg.dataset.fresh=String(fresh);this.svg.setAttribute('aria-label',`Wallet entry map. ${model.visible} tracked entries. Dots below zero show a loss against their verified entry. Use arrow keys to inspect wallets.`);
      this.lastStamp=model.stamp;this.setZoom(this.zoom);const active=model.rows.find(r=>r.wallet===this.selected);this.selectedLine.setAttribute('visibility',active?'visible':'hidden');if(active){this.selectedLine.setAttribute('y1',active.y);this.selectedLine.setAttribute('y2',active.y);this.inspect(active,false);}else this.detail.hidden=true;return true;
    }
  }
  window.BlastWalletMap=Object.freeze({layout,View});
})();
