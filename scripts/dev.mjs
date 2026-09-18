import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
const root=resolve('public');
const {getMarket}=await import('../api/market.js');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
try {
const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
if(pathname==='/api/market'){try{const asset=new URL(req.url,'http://localhost').searchParams.get('asset')||'stonk';const data=await getMarket(asset);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({available:false}));}return;}
const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
if(path!==root && !path.startsWith(root+'/')) {res.writeHead(403);res.end();return;}
const body=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
} catch {res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT||5181),'127.0.0.1',()=>console.log('Local Topblast preview'));
