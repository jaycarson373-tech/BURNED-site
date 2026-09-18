const ZERO = 0n;

function walletKey(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error('Invalid wallet');
  return value.toLowerCase();
}

function positive(value, label) {
  const result = BigInt(value);
  if (result <= ZERO) throw new Error(`${label} must be positive`);
  return result;
}

function emptyPosition(wallet) {
  return {wallet, trackedUnitsRaw: ZERO, costQuoteRaw: ZERO, rewardsRaw: ZERO, lastBuyAt: null, lastEventAt: null};
}

function reduceBasis(position, amountRaw) {
  const amount = amountRaw > position.trackedUnitsRaw ? position.trackedUnitsRaw : amountRaw;
  if (amount === ZERO) return;
  if (amount === position.trackedUnitsRaw) {
    position.trackedUnitsRaw = ZERO;
    position.costQuoteRaw = ZERO;
    return;
  }
  const removedCost = position.costQuoteRaw * amount / position.trackedUnitsRaw;
  position.trackedUnitsRaw -= amount;
  position.costQuoteRaw -= removedCost;
}

export function replayLedger(events) {
  const positions = new Map();
  const epochExclusions = new Map();
  const processed = new Set();
  const ordered = [...events].sort((a, b) =>
    Number(a.blockNumber - b.blockNumber)
    || Number((a.transactionIndex ?? 0) - (b.transactionIndex ?? 0))
    || Number((a.logIndex ?? 0) - (b.logIndex ?? 0)));

  const get = (wallet) => {
    const key = walletKey(wallet);
    if (!positions.has(key)) positions.set(key, emptyPosition(key));
    return positions.get(key);
  };
  const exclude = (epochId, wallet, reason) => {
    const epoch = String(epochId);
    if (!epochExclusions.has(epoch)) epochExclusions.set(epoch, new Map());
    epochExclusions.get(epoch).set(walletKey(wallet), reason);
  };

  for (const event of ordered) {
    const id = event.id || `${event.transactionHash}:${event.logIndex}`;
    if (!id || processed.has(id)) continue;
    processed.add(id);
    const epochId = event.epochId ?? '0';
    if (event.type === 'buy') {
      const position = get(event.wallet);
      position.trackedUnitsRaw += positive(event.tokenAmountRaw, 'Token amount');
      position.costQuoteRaw += positive(event.quoteAmountRaw, 'Quote amount');
      position.lastBuyAt = event.timestamp;
      position.lastEventAt = event.timestamp;
    } else if (event.type === 'sell') {
      const position = get(event.wallet);
      reduceBasis(position, positive(event.tokenAmountRaw, 'Token amount'));
      position.lastEventAt = event.timestamp;
      exclude(epochId, event.wallet, 'sold_this_epoch');
    } else if (event.type === 'transfer') {
      const from = walletKey(event.from);
      const to = walletKey(event.to);
      if (from === to) continue;
      const amount = positive(event.tokenAmountRaw, 'Token amount');
      const position = get(from);
      reduceBasis(position, amount);
      position.lastEventAt = event.timestamp;
      exclude(epochId, from, 'sent_this_epoch');
      get(to).lastEventAt = event.timestamp;
    } else if (event.type === 'reward') {
      get(event.wallet).rewardsRaw += positive(event.rewardAmountRaw, 'Reward amount');
    } else {
      throw new Error(`Unsupported event type: ${event.type}`);
    }
  }
  return {positions, epochExclusions, processed};
}

export function positionState(position, currentPriceRaw, epochExclusions, epochId, decimals={token:18,quote:18}) {
  if (!position || position.trackedUnitsRaw === ZERO) return {
    status: 'untracked', eligible: false, exclusionReason: 'no_verified_entry', burnDepthBps: ZERO,
    averageEntryRaw: ZERO, lossQuoteRaw: ZERO,
  };
  const price = positive(currentPriceRaw, 'Current price');
  const tokenScale=10n**BigInt(decimals.token??18),quoteScale=10n**BigInt(decimals.quote??18);
  const averageEntryRaw = position.costQuoteRaw * tokenScale * 10n ** 18n / (position.trackedUnitsRaw * quoteScale);
  const underwater = price < averageEntryRaw;
  const burnDepthBps = underwater ? (averageEntryRaw - price) * 10_000n / averageEntryRaw : ZERO;
  const exclusionReason = epochExclusions?.get(String(epochId))?.get(position.wallet) || '';
  const lossQuoteRaw = underwater
    ? (averageEntryRaw-price)*position.trackedUnitsRaw*quoteScale/(10n**18n*tokenScale)
    : ZERO;
  return {
    status: underwater ? 'blasted' : 'clear',
    eligible: underwater && !exclusionReason,
    exclusionReason: exclusionReason || (underwater ? '' : 'above_entry'),
    burnDepthBps,
    averageEntryRaw,
    lossQuoteRaw,
  };
}

export function buildRewardSnapshot({chainId,tokenAddress,curveAddress,snapshotBlock,priceRaw,epochId,ledger,decimals={token:18,quote:18}}){
  if(!Number.isSafeInteger(snapshotBlock)||snapshotBlock<1)throw new Error('Invalid snapshot block');
  const rows=[];
  for(const position of ledger.positions.values()){
    const state=positionState(position,priceRaw,ledger.epochExclusions,epochId,decimals);
    if(!state.eligible||state.lossQuoteRaw<=ZERO)continue;
    rows.push({wallet:position.wallet,trackedUnitsRaw:position.trackedUnitsRaw.toString(),averageEntryRaw:state.averageEntryRaw.toString(),lossQuoteRaw:state.lossQuoteRaw.toString()});
  }
  rows.sort((a,b)=>walletKey(a.wallet).localeCompare(walletKey(b.wallet)));
  const canonical=JSON.stringify({chainId:String(chainId),tokenAddress:walletKey(tokenAddress),curveAddress:walletKey(curveAddress),snapshotBlock,priceRaw:String(priceRaw),epochId:String(epochId),eligible:rows});
  return {canonical,rows};
}

export function allocateLossWeighted(totalRewardRaw, eligibleRows) {
  const total = positive(totalRewardRaw, 'Reward pool');
  const rows = eligibleRows
    .filter((row) => row.eligible && BigInt(row.lossQuoteRaw) > ZERO)
    .map((row) => ({...row, lossQuoteRaw: BigInt(row.lossQuoteRaw)}))
    .sort((a, b) => walletKey(a.wallet).localeCompare(walletKey(b.wallet)));
  if (!rows.length) throw new Error('No eligible loss weight');
  const weight = rows.reduce((sum, row) => sum + row.lossQuoteRaw, ZERO);
  const allocations = rows.map((row) => ({wallet: walletKey(row.wallet), amountRaw: total * row.lossQuoteRaw / weight}));
  const allocated = allocations.reduce((sum, row) => sum + row.amountRaw, ZERO);
  return {allocations, dustRaw: total - allocated, totalWeightRaw: weight};
}

export function aggregateCandles(trades, intervalSeconds) {
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 1) throw new Error('Invalid interval');
  const buckets = new Map();
  for (const trade of trades) {
    const time = Math.floor(Number(trade.timestamp) / intervalSeconds) * intervalSeconds;
    const price = Number(trade.price);
    const volume = Number(trade.volumeQuote || 0);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(volume) || volume < 0) continue;
    const candle = buckets.get(time);
    if (!candle) buckets.set(time, {time, open: price, high: price, low: price, close: price, volume});
    else {
      candle.high = Math.max(candle.high, price);
      candle.low = Math.min(candle.low, price);
      candle.close = price;
      candle.volume += volume;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}
