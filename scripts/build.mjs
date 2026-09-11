import { cp, link, mkdir, rm, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const html = await readFile('public/index.html','utf8');
for(const required of ['<title>BURNED','COMING SOON','EMBER','Burn Zone','average entry','3%','15 minutes','id="how-it-works"']) if(!html.includes(required)) throw new Error('Missing site content: '+required);
for(const match of html.matchAll(/href="#([^"]+)"/g)) if(!html.includes('id="'+match[1]+'"')) throw new Error('Broken anchor: '+match[1]);
for(const name of ['style.css','burned-logo.png','burned-banner.png']) if(!(await stat(join('public',name))).size) throw new Error('Empty asset: '+name);
const css=await readFile('public/style.css','utf8');
if(!css.includes('@media(max-width:760px)') || !css.includes('prefers-reduced-motion') || !css.includes(':focus-visible')) throw new Error('Missing responsive or accessibility styles');
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
  await writeFile(indexPath,builtHtml.replaceAll('https://ashback.sufficientlev.chatgpt.site',`https://${vercelHost}`));
}
console.log('BURNED production build complete. Metadata, page links, local assets and responsive styles validated.');
