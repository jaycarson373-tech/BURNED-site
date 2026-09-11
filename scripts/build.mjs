import { cp, link, mkdir, rm, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const html = await readFile('public/index.html','utf8');
for(const required of ['<title>TOPLAST','BOUGHT THE TOP?','GET BLASTED.','Blast Zone','average entry','3%','15-minute','FsiDU4zcDKvuZRk3Ft4RHnRczKh4TdSi5GpdynkCuCTS','id="burn-zone"','id="watch"','id="account"','id="how-it-works"','id="rules"']) if(!html.includes(required)) throw new Error('Missing site content: '+required);
for(const match of html.matchAll(/href="#([^"]+)"/g)) if(!html.includes('id="'+match[1]+'"')) throw new Error('Broken anchor: '+match[1]);
for(const name of ['style.css','app.js','runtime-config.js','burned-logo.png','favicon.png']) if(!(await stat(join('public',name))).size) throw new Error('Empty asset: '+name);
if(/[←-⇿➔-➿]/u.test(html)) throw new Error('Arrow glyphs are not allowed');
if(html.includes('burned-banner')) throw new Error('Removed banner is still referenced');
if(html.includes('embercurve.fun')) throw new Error('Outbound Ember links are not allowed');
if(/\$BURNED\b/.test(html)) throw new Error('Stale BURNED ticker in public copy');
const logo=await readFile(join('public','burned-logo.png'));
if(logo.length<26||logo[25]!==6) throw new Error('BURNED logo must be an RGBA PNG with transparency');
const css=await readFile('public/style.css','utf8');
if(!/@media\s*\(max-width:\s*760px\)/.test(css) || !css.includes('prefers-reduced-motion') || !css.includes(':focus-visible')) throw new Error('Missing responsive or accessibility styles');
for (const match of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) if(!(await stat(join('public',match[1].slice(1)))).size) throw new Error('Missing local asset: '+match[1]);
if(/\bMET\b|ASHBACK/.test(html)) throw new Error('Stale token branding or pairing');
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for (const name of await readdir('public')) {
  const source = join('public',name);
  const destination = join('dist',name);
  if ((await stat(source)).isFile() && name.endsWith('.png')) await link(source,destination);
  else await cp(source,destination,{recursive:true});
}
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
if (vercelHost) {
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(vercelHost) || vercelHost.includes('..')) {
    throw new Error('Invalid Vercel production hostname');
  }
  const indexPath = join('dist','index.html');
  const builtHtml = await readFile(indexPath,'utf8');
  await writeFile(indexPath,builtHtml.replaceAll('https://burned-coral.vercel.app',`https://${vercelHost}`));
}
if(process.env.SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY must never be configured in the public site build');
const supabaseUrl=(process.env.PUBLIC_SUPABASE_URL??'').trim();
const supabaseKey=(process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY??'').trim();
if(Boolean(supabaseUrl)!==Boolean(supabaseKey)) throw new Error('PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY must be configured together');
if(supabaseUrl){
  const endpoint=new URL(supabaseUrl);
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash) throw new Error('PUBLIC_SUPABASE_URL must be an HTTPS project URL');
  if(!/^(?:sb_publishable_|eyJ)[^\s]{18,}$/.test(supabaseKey)) throw new Error('PUBLIC_SUPABASE_PUBLISHABLE_KEY is invalid');
}
const projectId=(process.env.TOPLAST_PROJECT_ID??process.env.BURNED_PROJECT_ID??'toplast').trim();
if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(projectId)) throw new Error('TOPLAST_PROJECT_ID must be a short lowercase slug');
await writeFile(join('dist','runtime-config.js'),`window.__TOPLAST_PUBLIC_CONFIG__ = Object.freeze(${JSON.stringify({supabaseUrl,supabaseKey,projectId})});\n`);
console.log('TOPLAST production build complete. Metadata, page links, local assets and responsive styles validated.');
