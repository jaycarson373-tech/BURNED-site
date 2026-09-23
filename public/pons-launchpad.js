(() => {
  'use strict';
  const PONS = Object.freeze({
    chainId: 4663,
    chainHex: '0x1237',
    factory: '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',
    explorer: 'https://robinhoodchain.blockscout.com',
    rpc: 'https://rpc.mainnet.chain.robinhood.com',
    zero: '0x0000000000000000000000000000000000000000'
  });
  const factoryAbi = [
    {type:'function',name:'canLaunch',stateMutability:'view',inputs:[{name:'account',type:'address'}],outputs:[{type:'bool'}]},
    {type:'function',name:'launchConfigCount',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
    {type:'function',name:'getLaunchConfig',stateMutability:'view',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'config',type:'tuple',components:[{name:'supply',type:'uint256'},{name:'curveFeeBps',type:'uint256'},{name:'phantomQuote',type:'uint256'},{name:'graduationThreshold',type:'uint256'},{name:'poolFee',type:'uint24'},{name:'tickSpacing',type:'int24'},{name:'enabled',type:'bool'}]}]},
    {type:'function',name:'launchFee',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
    {type:'function',name:'maxCreatorTaxBps',stateMutability:'view',inputs:[],outputs:[{type:'uint16'}]},
    {type:'function',name:'approvedPairTokens',stateMutability:'view',inputs:[{name:'pairToken',type:'address'}],outputs:[{type:'bool'}]},
    {type:'function',name:'pairTokenEconomics',stateMutability:'view',inputs:[{name:'pairToken',type:'address'}],outputs:[{name:'phantomQuote',type:'uint256'},{name:'graduationThreshold',type:'uint256'},{name:'decimals',type:'uint8'}]},
    {type:'function',name:'previewLaunchEconomics',stateMutability:'view',inputs:[{name:'launchConfigId',type:'uint256'},{name:'pairToken',type:'address'}],outputs:[{type:'bytes32'}]},
    {type:'function',name:'launchToken',stateMutability:'payable',inputs:[{name:'params',type:'tuple',components:[{name:'name',type:'string'},{name:'symbol',type:'string'},{name:'logo',type:'string'},{name:'description',type:'string'},{name:'socials',type:'tuple',components:[{name:'twitter',type:'string'},{name:'telegram',type:'string'},{name:'discord',type:'string'},{name:'website',type:'string'},{name:'farcaster',type:'string'}]},{name:'creatorFeeRecipient',type:'address'},{name:'creatorTaxBps',type:'uint16'},{name:'buybackEnabled',type:'bool'},{name:'expectedEconomics',type:'bytes32'},{name:'salt',type:'bytes32'}]},{name:'launchConfigId',type:'uint256'},{name:'pairToken',type:'address'}],outputs:[{name:'token',type:'address'},{name:'curve',type:'address'}]}
  ];
  const $ = id => document.getElementById(id);
  const state = {provider:null,signer:null,account:'',contract:null,configs:[],canLaunch:false,maxTax:0n,fee:0n};
  const setStatus = (message, kind='') => { const node=$('pons-launch-status'); node.textContent=message; node.dataset.kind=kind; };
  const short = value => value ? `${value.slice(0,6)}…${value.slice(-4)}` : 'Connect wallet';
  const cleanUrl = (value, optional=true) => {
    const text=String(value||'').trim(); if(!text&&optional)return '';
    if(/^ipfs:\/\/[A-Za-z0-9._~!$&'()*+,;=:@/?%-]+$/.test(text))return text;
    const url=new URL(text); if(url.protocol!=='https:'||url.username||url.password)throw new Error('Use an HTTPS or IPFS URL.'); return url.href;
  };
  async function switchChain(){
    try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:PONS.chainHex}]});}
    catch(error){if(error?.code!==4902)throw error;await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:PONS.chainHex,chainName:'Robinhood Chain',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[PONS.rpc],blockExplorerUrls:[PONS.explorer]}]});}
  }
  async function connect(){
    if(!window.ethereum||!window.ethers)throw new Error('Install an EVM wallet to launch on PONS.');
    setStatus('Connecting to Robinhood Chain…'); await switchChain();
    state.provider=new window.ethers.BrowserProvider(window.ethereum); state.signer=await state.provider.getSigner(); state.account=await state.signer.getAddress();
    const network=await state.provider.getNetwork(); if(network.chainId!==BigInt(PONS.chainId))throw new Error('Switch to Robinhood Chain.');
    state.contract=new window.ethers.Contract(PONS.factory,factoryAbi,state.signer);
    $('pons-connect').textContent=short(state.account); $('pons-connect').title=state.account;
    await loadFactory();
  }
  async function loadFactory(){
    setStatus('Reading live PONS V2 launch terms…');
    const [allowed,count,fee,maxTax]=await Promise.all([state.contract.canLaunch(state.account),state.contract.launchConfigCount(),state.contract.launchFee(),state.contract.maxCreatorTaxBps()]);
    if(count>32n)throw new Error('Unexpected PONS launch configuration count.');
    const rows=await Promise.all(Array.from({length:Number(count)},(_,id)=>state.contract.getLaunchConfig(id)));
    state.configs=rows.map((config,id)=>({id,config})).filter(row=>row.config.enabled); state.canLaunch=allowed; state.fee=fee; state.maxTax=maxTax;
    const select=$('pons-config'); select.replaceChildren();
    for(const row of state.configs){const option=document.createElement('option');option.value=String(row.id);option.textContent=`Config ${row.id} · ${(Number(row.config.curveFeeBps)/100).toFixed(2)}% curve fee`;select.append(option);}
    $('pons-tax').max=String(Number(maxTax)/100); $('pons-launch-fee').textContent=`Launch fee ${window.ethers.formatEther(fee)} ETH`;
    $('pons-submit').disabled=!allowed||!state.configs.length;
    setStatus(!allowed?'This wallet is not currently allowed by the PONS V2 launch gate.':state.configs.length?'Wallet verified. Review the live terms and launch when ready.':'PONS has no enabled launch configurations.',allowed?'ready':'blocked');
  }
  async function pairToken(){
    const raw=$('pons-pair').value.trim(); if(!raw)return PONS.zero;
    if(!window.ethers.isAddress(raw))throw new Error('Enter a valid EVM quote-token address.'); const token=window.ethers.getAddress(raw);
    const [approved,economics]=await Promise.all([state.contract.approvedPairTokens(token),state.contract.pairTokenEconomics(token)]);
    if(!approved||economics.phantomQuote===0n||economics.graduationThreshold===0n)throw new Error('This quote asset is not approved for new PONS launches.');
    return token;
  }
  async function submit(event){
    event.preventDefault(); if(!state.contract)throw new Error('Connect your wallet first.'); if(!state.canLaunch)throw new Error('This wallet cannot launch through the current PONS gate.');
    const form=new FormData(event.currentTarget),name=String(form.get('name')||'').trim(),symbol=String(form.get('symbol')||'').trim().toUpperCase();
    if(name.length<2||name.length>50)throw new Error('Token name must be 2–50 characters.'); if(!/^[A-Z0-9]{2,12}$/.test(symbol))throw new Error('Ticker must be 2–12 letters or numbers.');
    const tax=Math.round(Number(form.get('tax'))*100); if(!Number.isInteger(tax)||tax<0||BigInt(tax)>state.maxTax)throw new Error('Creator tax exceeds the live PONS limit.');
    const recipient=String(form.get('recipient')||'').trim(); if(recipient&&!window.ethers.isAddress(recipient))throw new Error('Creator fee recipient is not a valid EVM address.');
    const configId=BigInt(String(form.get('config'))),quote=await pairToken(),latest=await state.contract.getLaunchConfig(configId); if(!latest.enabled)throw new Error('That PONS launch configuration is no longer enabled.');
    const expectedEconomics=await state.contract.previewLaunchEconomics(configId,quote),fee=await state.contract.launchFee(),salt=window.ethers.hexlify(crypto.getRandomValues(new Uint8Array(32)));
    const params={name,symbol,logo:cleanUrl(form.get('logo'),false),description:String(form.get('description')||'').trim().slice(0,600),socials:{twitter:cleanUrl(form.get('twitter')),telegram:'',discord:'',website:cleanUrl(form.get('website')),farcaster:''},creatorFeeRecipient:recipient?window.ethers.getAddress(recipient):PONS.zero,creatorTaxBps:tax,buybackEnabled:form.get('buyback')==='on',expectedEconomics,salt};
    $('pons-submit').disabled=true; setStatus('Confirm the pinned PONS launch transaction in your wallet…');
    try{const tx=await state.contract.launchToken(params,configId,quote,{value:fee});setStatus(`Submitted ${short(tx.hash)}. Waiting for confirmation…`,'pending');const receipt=await tx.wait(1);setStatus('Launch confirmed on Robinhood Chain.','confirmed');$('pons-proof').href=`${PONS.explorer}/tx/${receipt.hash}`;$('pons-proof').hidden=false;}
    finally{$('pons-submit').disabled=!state.canLaunch;}
  }
  function report(error){setStatus(error?.shortMessage||error?.reason||error?.message||'The PONS action failed.','error');}
  $('open-launchpad').onclick=()=>{$('pons-launchpad').showModal();}; $('close-launchpad').onclick=()=>$('pons-launchpad').close(); $('pons-connect').onclick=()=>connect().catch(report); $('pons-launch-form').addEventListener('submit',event=>submit(event).catch(report));
  window.ethereum?.on?.('accountsChanged',()=>{state.account='';state.contract=null;$('pons-submit').disabled=true;$('pons-connect').textContent='Connect wallet';setStatus('Wallet changed. Reconnect to refresh PONS permissions.');});
  window.ethereum?.on?.('chainChanged',()=>{state.contract=null;$('pons-submit').disabled=true;setStatus('Network changed. Reconnect to Robinhood Chain.');});
})();
