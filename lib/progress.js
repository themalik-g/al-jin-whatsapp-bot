// ─────────────────────────────────────────────
//  Al-Jin · lib/progress.js
//  Live progress for long jobs: stage %, overall bar and an estimated time left.
//  Stages with real progress call set(0..1); the others advance by elapsed/expected time.
//  Messages are pushed through `send(text)` (the bot edits one WhatsApp message) every few seconds.
// ─────────────────────────────────────────────
export function fmtEta(sec) {
  const s = Math.max(1, Math.round(sec));
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} sec`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const barOf = (p) => { const k = Math.round(Math.max(0, Math.min(1, p)) * 10); return '▰'.repeat(k) + '▱'.repeat(10 - k); };

export class Progress {
  /** @param {(text:string)=>any} send  @param {{intervalMs?:number, title?:string}} opt */
  constructor(send, { intervalMs = 6000, title = '' } = {}) {
    this.send = send; this.interval = Math.max(2000, intervalMs); this.title = title;
    this.stages = []; this.cur = -1; this.frac = 0; this.real = false;
    this.t0 = 0; this.tStage = 0; this.last = 0; this.lastText = ''; this.timer = null;
  }
  plan(stages) { this.stages = stages.map((s) => ({ expectSec: 10, ...s })); }
  insertBefore(key, stage) {
    const i = this.stages.findIndex((s) => s.key === key);
    this.stages.splice(i < 0 ? this.stages.length : i, 0, { expectSec: 10, ...stage });
    if (i >= 0 && i <= this.cur) this.cur++;
  }
  begin(key, expectSec) {
    const i = this.stages.findIndex((s) => s.key === key);
    if (i < 0) return;
    if (!this.t0) { this.t0 = Date.now(); this.timer = setInterval(() => this.flush(false), 1000); this.timer.unref?.(); }
    if (expectSec) this.stages[i].expectSec = expectSec;
    this.cur = i; this.frac = 0; this.real = false; this.tStage = Date.now();
    this.flush(true);
  }
  set(frac) { if (Number.isFinite(frac)) { this.frac = Math.max(0, Math.min(1, frac)); this.real = true; } }
  stageFrac() {
    if (this.real) return this.frac;
    const st = this.stages[this.cur];
    return st ? Math.min(0.92, (Date.now() - this.tStage) / 1000 / Math.max(1, st.expectSec)) : 0;
  }
  overall() {
    const total = this.stages.reduce((n, s) => n + s.weight, 0) || 1;
    const done = this.stages.slice(0, Math.max(0, this.cur)).reduce((n, s) => n + s.weight, 0);
    const now = this.stages[this.cur] ? this.stages[this.cur].weight * this.stageFrac() : 0;
    return Math.min(0.99, (done + now) / total);
  }
  render() {
    const st = this.stages[this.cur];
    if (!st) return '';
    const p = this.overall();
    const elapsed = (Date.now() - this.t0) / 1000;
    const eta = p >= 0.03 && elapsed >= 3 ? fmtEta(elapsed * (1 - p) / p) : 'estimating…';
    return [
      this.title,
      `${st.label}… ${Math.round(this.stageFrac() * 100)}% done`,
      `${barOf(p)} ${Math.round(p * 100)}% overall`,
      `⏳ Remaining: ${eta}`,
    ].filter(Boolean).join('\n');
  }
  flush(force) {
    const now = Date.now();
    if (now - this.last < (force ? 2000 : this.interval)) return;
    const text = this.render();
    if (!text || text === this.lastText) return;
    this.last = now; this.lastText = text;
    try { Promise.resolve(this.send(text)).catch(() => {}); } catch {}
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
