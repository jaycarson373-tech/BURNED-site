(() => {
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  function samples(rows) {
    const map = new Map();
    for (const row of rows) {
      if (!finite(row.time) || row.time < 0 || !/^\d{1,78}$/.test(String(row.value)) || BigInt(row.value) <= 0n) continue;
      map.set(row.time, { time: row.time, value: BigInt(row.value) });
    }
    return [...map.values()].sort((a, b) => a.time - b.time);
  }
  function extent(rows, range = 0, end = null) {
    if (!rows.length) return null;
    const last = end ?? rows.at(-1).time, first = range ? last - range * 1000 : rows[0].time;
    return { start: first, end: last, rows: rows.filter(r => r.time >= first && r.time <= last) };
  }
  class Interaction {
    constructor(svg, readout, changed, format) {
      Object.assign(this, { svg, readout, changed, format });
      this.range = 0; this.end = null; this.rows = []; this.pointers = new Map(); this.cursor = 0;
      this.crosshair = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      for (const [k, v] of Object.entries({ y1: 20, y2: 390, class: 'chart-crosshair', visibility: 'hidden', 'pointer-events': 'none' })) this.crosshair.setAttribute(k, v);
      svg.append(this.crosshair); svg.setAttribute('tabindex', '0');
      svg.addEventListener('wheel', e => {
        e.preventDefault(); this.range = this.boundSpan((this.range || this.span()) * (e.deltaY > 0 ? 1.25 : .8)); this.changed();
      }, { passive: false });
      svg.addEventListener('pointerdown', e => { this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.lastX = e.clientX; this.pinch = null; svg.setPointerCapture(e.pointerId); });
      svg.addEventListener('pointermove', e => {
        const rect = svg.getBoundingClientRect();
        if (this.pointers.has(e.pointerId)) {
          this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const p = [...this.pointers.values()];
          if (p.length === 2) {
            const distance = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
            if (this.pinch && distance) { this.range = this.boundSpan((this.range || this.span()) * this.pinch / distance); this.changed(); }
            this.pinch = distance;
          } else if (p.length === 1 && this.rows.length > 1) {
            this.range = this.range || this.span();
            this.end = Math.min(this.rows.at(-1).time, Math.max(this.rows[0].time, (this.end ?? this.rows.at(-1).time) - (e.clientX - this.lastX) / rect.width * this.range * 1000));
            this.lastX = e.clientX; this.changed();
          }
        }
        if (!this.visible?.rows.length) return;
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const time = this.visible.start + x * (this.visible.end - this.visible.start);
        this.cursor = this.visible.rows.reduce((best, row, i, rows) => Math.abs(row.time - time) < Math.abs(rows[best].time - time) ? i : best, 0);
        this.inspect();
      });
      svg.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || !this.visible?.rows.length) return;
        e.preventDefault(); this.cursor = e.key === 'Home' ? 0 : e.key === 'End' ? this.visible.rows.length - 1 : Math.max(0, Math.min(this.visible.rows.length - 1, this.cursor + (e.key === 'ArrowRight' ? 1 : -1))); this.inspect();
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) svg.addEventListener(name, e => { this.pointers.delete(e.pointerId); this.pinch = null; });
      const hide = () => { if (!this.pointers.size) { this.readout.hidden = true; this.crosshair.setAttribute('visibility', 'hidden'); } };
      svg.addEventListener('pointerleave', hide); svg.addEventListener('blur', hide);
    }
    inspect() {
      const row = this.visible?.rows[this.cursor]; if (!row) return;
      this.readout.hidden = false; this.readout.textContent = `${new Date(row.time).toLocaleString()} · ${this.format(row.value)} STONK`;
      const span = this.visible.end - this.visible.start;
      const x = span ? Math.max(12, Math.min(708, (row.time - this.visible.start) / span * 720)) : 360;
      this.crosshair.setAttribute('x1', x); this.crosshair.setAttribute('x2', x); this.crosshair.setAttribute('visibility', 'visible');
    }
    boundSpan(span) { return Math.max(60, Math.min(Math.max(86400, this.span()), span)); }
    span() { return Math.max(60, (this.rows.at(-1)?.time - this.rows[0]?.time) / 1000 || 60); }
    setRange(range) { this.range = range; this.end = null; this.changed(); }
    setRows(rows) { this.rows = samples(rows); this.visible = extent(this.rows, this.range, this.end); this.crosshair.setAttribute('visibility', 'hidden'); return this.visible; }
  }
  window.BlastChart = Object.freeze({ samples, extent, Interaction });
})();
