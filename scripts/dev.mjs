import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
const root=resolve('public');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
try {
const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
if(path!==root && !path.startsWith(root+'/')) {res.writeHead(403);res.end();return;}
const body=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
} catch {res.writeHead(404);res.end('Not found');}
});
server.listen(5173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5173/'));
