// Preserve PostgREST numeric(78,0) atomic values before JSON number conversion.
// String tokens are passed through unchanged; large integer tokens become strings.
window.TopBlastIndex = Object.freeze({
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
