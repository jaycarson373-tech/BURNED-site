import React, {useEffect,useState} from 'react';
import {connectInjected} from './wallet.mjs';
import {chain} from './chain.mjs';
export function WalletPanel(){
  const [connection,setConnection]=useState(null),[accounts,setAccounts]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{const p=connection?.provider;if(!p?.on)return;const a=value=>setAccounts(value);const c=value=>{if(Number(BigInt(value))!==chain.id){setError('Wallet network changed. Reconnect to '+chain.name);setAccounts([])}};p.on('accountsChanged',a);p.on('chainChanged',c);return()=>{p.removeListener?.('accountsChanged',a);p.removeListener?.('chainChanged',c)}},[connection]);
  async function connect(){setBusy(true);setError('');try{await connection?.provider?.disconnect?.();const next=await connectInjected();setConnection(next);setAccounts(next.accounts)}catch(e){setError(e.message)}finally{setBusy(false)}}
  async function disconnect(){try{await connection?.provider?.disconnect?.()}catch(e){setError(e.message)}finally{setAccounts([]);setConnection(null)}}
  return <section><h2>Wallet</h2>{accounts.length?<><p>{accounts[0]}</p><button onClick={disconnect}>Disconnect</button></>:<div className="buttons"><button disabled={busy} onClick={connect}>{busy?'Connecting…':'Connect browser wallet'}</button></div>}{error&&<p role="alert">{error}</p>}</section>
}
