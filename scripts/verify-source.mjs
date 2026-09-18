import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),lock=JSON.parse(readFileSync(new URL('mean-machine.lock.json',root)));
let failed=false;
for(const [path,expected] of Object.entries(lock.files)){try{const actual=createHash('sha256').update(readFileSync(new URL(path,root))).digest('hex');if(actual!==expected){failed=true;console.error('CHANGED '+path)}}catch{failed=true;console.error('MISSING '+path)}}
if(failed){console.error('Source differs from the exported kit. Review intentional changes and record their evidence in PROJECT.md.');process.exitCode=1}else console.log('Source integrity passed: '+Object.keys(lock.files).length+' fingerprinted files.');
