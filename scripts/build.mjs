import{mkdir,rm,readFile,readdir,stat,copyFile,writeFile,cp}from'node:fs/promises';
import{join}from'node:path';import{blastPublicConfig}from'./blast-config.mjs';
const config=blastPublicConfig(process.env);let html=await readFile('public/index.html','utf8');
for(const marker of ['Topblast','BLAST RADAR','BLAST / STONK','id="market-chart"','id="inspector"','id="transaction-feed"','TradingView'])if(!html.includes(marker))throw new Error('Missing product element: '+marker);
if(/<iframe/i.test(html))throw new Error('Embedded charts are not part of this product');
if(/BURNED|BURN ZONE|TOPLAST|\$TOPBLAST|\$EMBER|\$RAY|burned\.live|embercurve\.fun/.test(html))throw new Error('Prior public branding remains');
for(const m of html.matchAll(/href="#([^"]+)"/g))if(!html.includes(`id="${m[1]}"`))throw new Error('Broken anchor '+m[1]);
for(const m of html.matchAll(/(?:src|href)="(\/[^"?]+)"/g))if(!(await stat(join('public',m[1].slice(1)))).size)throw new Error('Missing asset '+m[1]);
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const name of await readdir('public')){if(/burned|^burn-map|^app\.js$|^style\.css$|^topblast\.css$|qa\.html$/.test(name))continue;await cp(join('public',name),join('dist',name),{recursive:true});}
if(config.siteUrl||process.env.VERCEL_URL){const url=new URL(config.siteUrl||'https://'+process.env.VERCEL_URL).origin;html=html.replace('</head>',`<link rel="canonical" href="${url}/"><meta property="og:url" content="${url}/"><meta property="og:image" content="${url}/topblast-logo.png"></head>`);}
await writeFile('dist/index.html',html);await writeFile('dist/runtime-config.js','window.__BLAST_PUBLIC_CONFIG__ = Object.freeze('+JSON.stringify(config)+');\n');
console.log('Topblast build complete: isolated BLAST / STONK configuration, assets and links validated.');
