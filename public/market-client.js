(() => {
 class Client{
  constructor(config){this.config=config;this.buyEvents=[];this.buyCursor=null;this.lastStatus=null;this.historyEnd=false;}
  configured(){const c=this.config;return c.indexVerified===true&&c.topblastMint&&c.rewardMint&&c.supabaseUrl&&c.supabaseKey;}
  async rows(table,query={},body){if(!this.configured())throw Error('Awaiting market configuration');const url=new URL('/rest/v1/'+table,this.config.supabaseUrl);for(const[k,v]of Object.entries(query))url.searchParams.set(k,String(v));const r=await fetch(url,{method:body?'POST':'GET',headers:{apikey:this.config.supabaseKey,accept:'application/json',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(9000)});if(!r.ok)throw Error(`Index request failed (${r.status})`);return window.TopBlastIndex.parse(await r.text());}
  async snapshot(){const c=this.config;const statuses=await this.rows('topblast_site_status',{project_id:'eq.'+c.projectId,burned_mint:'eq.'+c.topblastMint,select:'*',limit:1}),status=statuses[0];if(!window.TopBlastIndex.matchesMarket(status,c))throw Error('Market identity not verified');
    const accounts=[];for(let offset=0;offset<20000;offset+=500){const rows=await this.rows('topblast_site_accounts',{project_id:'eq.'+c.projectId,burned_mint:'eq.'+c.topblastMint,select:'*',order:'wallet.asc',limit:500,offset});accounts.push(...rows);if(rows.length<500)break;if(offset===19500)throw Error('Snapshot exceeds page limit');}
    if(accounts.some(r=>!window.TopBlastIndex.sameSnapshot(r,status)))throw Error('Finalized snapshot still publishing');
    this.lastStatus=status;return {status,accounts};
  }
  async buys(){const incoming=[],floor=this.buyCursor;let stopped=false;for(let offset=0;offset<50000;offset+=500){const q={project_id:'eq.'+this.config.projectId,burned_mint:'eq.'+this.config.topblastMint,select:'*',order:'slot.desc,event_id.desc',limit:500,offset};if(floor!==null)q.slot='gte.'+floor;const rows=await this.rows('topblast_site_buys',q);incoming.push(...rows);if(rows.length<500||floor===null){stopped=true;break;}}if(!stopped)throw Error('Buy backfill still incomplete');this.buyEvents=window.BlastData.mergeEvents(this.buyEvents,incoming);if(incoming.length)this.buyCursor=Math.max(...incoming.map(r=>Number(r.slot)),this.buyCursor??0);return this.buyEvents;}
  async olderBuys(before){const oldest=[...this.buyEvents].sort((a,b)=>Number(a.slot)-Number(b.slot)||a.event_id.localeCompare(b.event_id))[0];const q={project_id:'eq.'+this.config.projectId,burned_mint:'eq.'+this.config.topblastMint,select:'*',order:'slot.desc,event_id.desc',limit:500};if(oldest)q.or=`(slot.lt.${oldest.slot},and(slot.eq.${oldest.slot},event_id.lt.${oldest.event_id}))`;else q.occurred_at='lt.'+new Date(before*1000).toISOString();const rows=await this.rows('topblast_site_buys',q);this.buyEvents=window.BlastData.mergeEvents(this.buyEvents,rows);return this.buyEvents;}

  async history(interval,before=null){const rows=await this.rows('topblast_site_prices',{project_id:'eq.'+this.config.projectId,burned_mint:'eq.'+this.config.topblastMint,select:'price_raw,observed_at',...(before?{observed_at:'lt.'+new Date(before*1000).toISOString()}:{}),order:'observed_at.desc',limit:500});return {kind:'line',rows};}
  async rewards(wallet){return this.rows('topblast_site_distributions',{project_id:'eq.'+this.config.projectId,burned_mint:'eq.'+this.config.topblastMint,...(wallet?{wallet:'eq.'+wallet}:{}),select:'*',order:'epoch_id.desc',limit:50});}
  async epochs(){return this.rows('topblast_site_epochs',{project_id:'eq.'+this.config.projectId,burned_mint:'eq.'+this.config.topblastMint,select:'epoch_id,total_reward_raw,eligible_count,reason,created_at',order:'epoch_id.desc',limit:5});}
 }
 window.BlastClient=Client;
})();
