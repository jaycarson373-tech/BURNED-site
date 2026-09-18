import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';

export function emptyRewardState({token,distributor}){
  return {version:1,token:token.toLowerCase(),distributor:distributor.toLowerCase(),pendingEpoch:null,lastHandledEpoch:null,updatedAt:null};
}

export async function loadRewardState(path,identity){
  const fallback=emptyRewardState(identity);
  try{
    const parsed=JSON.parse(await readFile(path,'utf8'));
    if(parsed.version!==1||parsed.token!==fallback.token||parsed.distributor!==fallback.distributor)return fallback;
    return {...fallback,...parsed};
  }catch(error){
    if(error.code==='ENOENT')return fallback;
    throw error;
  }
}

export async function saveRewardState(path,state){
  await mkdir(dirname(path),{recursive:true});
  const next={...state,updatedAt:new Date().toISOString()},temporary=`${path}.tmp`;
  await writeFile(temporary,JSON.stringify(next,null,2),{mode:0o600});
  await rename(temporary,path);
  return next;
}
