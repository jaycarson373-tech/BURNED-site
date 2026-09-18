// Preserve PostgREST numeric(78,0) atomic values before JSON number conversion.
// String tokens are passed through unchanged; large integer tokens become strings.
window.TopBlastIndex = Object.freeze({
  matchesMarket(status, config) {
    return Boolean(status && config?.indexVerified === true && config.topblastMint && config.rewardMint && status.project_id === config.projectId && status.burned_mint === config.topblastMint && status.ember_mint === config.rewardMint);
  },
  payoutClockActive(status, config, now = Date.now()) {
    return config?.rewardsActive === true && status?.mode === 'send' && this.matchesMarket(status, config) && this.fresh(status, now);
  },
  crossing(previous, current) {
    const before = previous?.position_status;
    const after = current?.position_status;
    if (before === 'safe' && after === 'blasted') return 'entered';
    if (before === 'blasted' && after === 'safe') return 'left';
    return null;
  },
  relativeTime(value, now = Date.now()) {
    const time = Date.parse(value || '');
    if (!Number.isFinite(time) || time > now + 30000) return 'time unavailable';
    const seconds = Math.max(0, Math.floor((now - time) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  },
  buysInWindow(buys, start, end) {
    return buys.filter(buy => {
      const time = Date.parse(buy.occurred_at || '');
      return Number.isFinite(time) && time >= start && time <= end;
    });
  },
  parse(text) {
    return JSON.parse(text.replace(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => {
      if (token[0] === '"' || !/^-?\d{16,}$/.test(token)) return token;
      return `"${token}"`;
    }));
  },
  fresh(status, now = Date.now()) {
    return [status?.updated_at, status?.indexed_through_time].every(value => {
      const age = now - Date.parse(value || '');
      return Number.isFinite(age) && age >= -30000 && age <= 180000;
    });
  },
  sameSnapshot(account, status) {
    const a = Date.parse(account?.updated_at || ''), b = Date.parse(status?.updated_at || '');
    return Number.isFinite(a) && a === b;
  }
});
