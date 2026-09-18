import http from 'node:http';

const required=['RH_RPC_URL','INDEX_URL','INTERNAL_API_TOKEN','KEEPER_PRIVATE_KEY','TOPBLAST_TOKEN_ADDRESS','TOPBLAST_DISTRIBUTOR_ADDRESS','TOPBLAST_FUNDING_ADAPTER_ADDRESS','REWARD_DISTRIBUTION_BPS'];
const missing=required.filter(name=>!process.env[name]?.trim());
if(process.env.REWARD_SERVICE_ENABLED==='true'&&!missing.length){
  await import('./reward-worker.mjs');
}else{
  const port=Number(process.env.PORT||8788),state=process.env.REWARD_SERVICE_ENABLED==='true'?'missing_configuration':'disabled';
  const server=http.createServer((request,response)=>{
    if(new URL(request.url,'http://localhost').pathname!=='/health'){response.writeHead(404,{'content-type':'application/json'});return response.end(JSON.stringify({error:'not_found'}));}
    response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify({ok:false,rewardStatus:state,missing}));
  });
  server.listen(port,()=>console.log(JSON.stringify({event:'reward_worker_staged',status:state,missing})));
}
