// Display only. Epochs, allocation and transaction settlement come from the worker.
window.BurnedRewardCycle = Object.freeze({
  describe({active, currentEpoch, scheduledEpoch = null, epoch, batches = [], loaded = false, observedAt = 0, now = Date.now()}) {
    const wallEpoch = Math.floor(now / 900000);
    const scheduled = Number.isSafeInteger(scheduledEpoch) ? scheduledEpoch : currentEpoch;
    const scheduleActive = active && (!Number.isSafeInteger(scheduledEpoch) || wallEpoch <= scheduledEpoch);
    const remaining = Math.max(0, (Number(scheduled) + 1) * 900000 - now);
    const seconds = Math.ceil(remaining / 1000);
    const countdown = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const result = (phase, label, signature = null) => ({phase, label, countdown:scheduleActive?countdown:'—', signature, epoch:epoch?.epoch_id ?? null});
    if (!Number.isSafeInteger(currentEpoch)) return {...result('paused', 'REWARDS PAUSED'), countdown:'—'};
    if (scheduleActive && wallEpoch > currentEpoch) return {...result('snapshot', 'AWAITING SNAPSHOT'), countdown:'00:00'};
    if (scheduleActive && wallEpoch < currentEpoch) return {...result('clock', 'CHECK DEVICE CLOCK'), countdown:'—'};
    if (!scheduleActive && (!loaded || !epoch || now - observedAt > 45000)) return result('paused', 'REWARDS PAUSED');
    if (!loaded || now - observedAt > 45000) return result('pending', 'CHECKING EPOCH');
    if (!epoch) return result('ready', 'NEXT SNAPSHOT');
    if (![currentEpoch, currentEpoch - 1].includes(Number(epoch.epoch_id))) return result('snapshot', 'AWAITING SNAPSHOT');
    if (epoch.reason) return result('deferred', 'SETTLEMENT DEFERRED');
    if (!/^\d+$/.test(String(epoch.total_reward_raw))) return result('pending', 'CHECKING EPOCH');
    const expected = BigInt(epoch.total_reward_raw);
    if (expected === 0n) return result('empty', Number(epoch.eligible_count) === 0 ? 'NO ELIGIBLE PAYOUT' : 'NO REWARD ALLOCATED');
    // Never call a partial, truncated or duplicated batch set a complete epoch.
    if (!batches.length || batches.length >= 1000 || new Set(batches.map(b => b.batch_id)).size !== batches.length) return result('pending', 'CHECKING EPOCH');
    if (batches.some(b => b.kind !== 'payout' || Number(b.epoch_id) !== Number(epoch.epoch_id) || !/^\d+$/.test(String(b.total_reward_raw)))) return result('pending', 'CHECKING EPOCH');
    if (batches.some(b => b.status === 'failed')) return result('failed', 'PAYOUT NEEDS REVIEW');
    if (batches.some(b => b.status === 'uncertain')) return result('confirming', 'CONFIRMING');
    const total = batches.reduce((sum,b) => sum + BigInt(b.total_reward_raw), 0n);
    if (total !== expected) return result('pending', 'CHECKING EPOCH');
    const proof = b => /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(b.signature || '');
    if (batches.every(b => b.status === 'settled' && proof(b))) return result('sent', 'SENT', batches[0].signature);
    if (batches.some(b => ['signed','submitted','settled'].includes(b.status))) return result('distributing', 'DISTRIBUTING…');
    return result('queued', 'PAYOUT QUEUED');
  }
});
