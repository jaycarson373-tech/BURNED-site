import http from 'node:http';

if(process.env.TOPBLAST_TOKEN_ADDRESS?.trim()){
  await import('./indexer.mjs');
}else{
  const port=Number(process.env.PORT||8787);
  const payload={status:'awaiting_configuration',marketStatus:'awaiting_configuration',rewardStatus:'paused',phase:'unconfigured',lastUpdated:null,config:null,candles:[],buys:[],events:[],leaderboard:[],totals:{trackedPositions:null,walletsInZone:null,rewardsDistributed:null,epochs:null},epoch:{id:null,nextAt:null,status:'unconfigured'}};
  const server=http.createServer((request,response)=>{
    const path=new URL(request.url,'http://localhost').pathname;
    if(path==='/health')response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    else if(path==='/v1/config'||path==='/v1/market')response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    else{response.writeHead(404,{'content-type':'application/json'});return response.end(JSON.stringify({error:'not_found'}));}
    response.end(JSON.stringify(path==='/health'?{ok:false,marketStatus:'awaiting_configuration',rewardStatus:'paused',phase:'unconfigured',lastUpdated:null}:payload));
  });
  server.listen(port,()=>console.log(JSON.stringify({event:'index_waiting_for_token',port})));
}
