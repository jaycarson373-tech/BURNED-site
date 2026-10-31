import{mkdir,rm,readFile,readdir,stat,copyFile,writeFile,cp}from'node:fs/promises';
import{join}from'node:path';import{blastPublicConfig}from'./blast-config.mjs';
const config=blastPublicConfig(process.env);let html=await readFile('public/index.html','utf8');
for(const marker of ['Topblast','BLAST RADAR','TOPBLAST','PUMP.FUN','id="market-chart"','id="inspector"','id="transaction-feed"','TradingView'])if(!html.includes(marker))throw new Error('Missing product element: '+marker);
if(/<iframe/i.test(html))throw new Error('Embedded charts are not part of this product');
const publicCopy=html.replaceAll('https://x.com/Topblast_xyz_','');
if(/BURNED|BURN ZONE|TOPLAST|\$EMBER|\$RAY|PONS|STONK|ROBINHOOD|burned\.live|embercurve\.fun|stonkfun\.xyz/i.test(publicCopy))throw new Error('Prior public branding remains');
for(const m of html.matchAll(/href="#([^"]+)"/g))if(!html.includes(`id="${m[1]}"`))throw new Error('Broken anchor '+m[1]);
for(const m of html.matchAll(/(?:src|href)="(\/[^"?]+)"/g))if(!(await stat(join('public',m[1].slice(1)))).size)throw new Error('Missing asset '+m[1]);
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const name of await readdir('public')){if(/burned|pons|ethers|topblast-stonk-banner|^burn-map|^app\.js$|^style\.css$|^topblast\.css$|qa\.html$/i.test(name))continue;await cp(join('public',name),join('dist',name),{recursive:true});}
{const url=new URL(config.siteUrl||'https://topblast.xyz').origin;html=html.replace('</head>',`<link rel="canonical" href="${url}/"><meta property="og:url" content="${url}/"><meta property="og:image" content="${url}/topblast-social-v2.jpg"><meta property="og:type" content="website"><meta property="og:site_name" content="TopBlast"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1280"><meta property="og:image:height" content="426"><meta property="og:image:alt" content="TopBlast green comet banner"><meta name="twitter:image" content="${url}/topblast-social-v2.jpg"><meta name="twitter:image:alt" content="TopBlast green comet banner"></head>`);}
await writeFile('dist/index.html',html);await writeFile('dist/runtime-config.js','window.__BLAST_PUBLIC_CONFIG__ = Object.freeze('+JSON.stringify(config)+');\n');
console.log('Topblast build complete: isolated TOPBLAST / PUMP configuration, assets and links validated.');
