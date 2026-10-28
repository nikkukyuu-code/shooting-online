/**
 * Worldwide battle counter (bc) — abacus.jasoncameron.dev, key nikkukyuu/shooting-online-battles.
 *  - hitBattleCounter(mode): +1 once per ESTABLISHED battle (CPU: gameplay start; online: host only,
 *    after both peers handshake). Also +1 on the per-mode key <key>-pvp / -normal / -strong.
 *  - loadBattleCount(el): title-screen display "bc N" with never-decrease rule
 *    (localStorage shootingOnline_battleLast; shows max(server, last)).
 * All network failures are silent.
 */
const BASE = 'https://abacus.jasoncameron.dev';
const NS_KEY = 'nikkukyuu/shooting-online-battles';
export const BATTLE_LAST_KEY = 'shootingOnline_battleLast';

function readLast() {
  try {
    const n = Number(localStorage.getItem(BATTLE_LAST_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch (_) {
    return 0;
  }
}

function writeLast(n) {
  try {
    if (Number.isFinite(n) && n > readLast()) localStorage.setItem(BATTLE_LAST_KEY, String(Math.floor(n)));
  } catch (_) { /* ignore */ }
}

function parseValue(d) {
  const n = d && (typeof d.value === 'number' ? d.value : Number(d.value));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** Per-mode breakdown counters (separate abacus keys; total key above unchanged). */
export const BATTLE_MODES = [
  { id: 'pvp', label: '対人' },
  { id: 'normal', label: '普通' },
  { id: 'strong', label: '強い' },
];
const modeKey = (id) => `${NS_KEY}-${id}`;
const modeLastKey = (id) => `${BATTLE_LAST_KEY}_${id}`;
function readN(k) {
  try { const n = Number(localStorage.getItem(k)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; } catch (_) { return 0; }
}
function writeN(k, n) {
  try { if (Number.isFinite(n) && n > readN(k)) localStorage.setItem(k, String(Math.floor(n))); } catch (_) { /* ignore */ }
}
/*
 * Pending-hit queue (NEW localStorage key; existing keys untouched). abacus is sometimes very slow
 * or errors; a lost fire-and-forget hit used to be lost forever. Each hit is queued, sent in the
 * background (never awaited by gameplay) with a timeout, and retried with backoff on later
 * flushes / page loads until the server answers OK.
 */
const PENDING_KEY = 'shootingOnline_battlePendingHits';
const HIT_TIMEOUT_MS = 30000;
const MAX_PENDING = 50;
let flushing = false;
let flushTimer = 0;
function readPending() {
  try { const a = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => x && typeof x.k === 'string') : []; } catch (_) { return []; }
}
function writePending(a) {
  try { if (a.length) localStorage.setItem(PENDING_KEY, JSON.stringify(a.slice(-MAX_PENDING))); else localStorage.removeItem(PENDING_KEY); } catch (_) { /* ignore */ }
}
function enqueueHit(key, lastKey) {
  const a = readPending();
  a.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), k: key, l: lastKey || '', n: 0, t: 0 });
  writePending(a);
}
function removePending(id) { writePending(readPending().filter((x) => x.id !== id)); }
function markFailed(id) {
  const a = readPending();
  const it = a.find((x) => x.id === id);
  if (it) { it.n = (it.n || 0) + 1; it.t = Date.now() + Math.min(10 * 60000, 5000 * 2 ** Math.min(it.n, 7)); }
  writePending(a);
}
function scheduleFlush(ms) {
  try { clearTimeout(flushTimer); flushTimer = setTimeout(flushPendingHits, ms); } catch (_) { /* ignore */ }
}
async function sendHit(it) {
  let ctl = null; let to = 0;
  try {
    ctl = typeof AbortController === 'function' ? new AbortController() : null;
    if (ctl) to = setTimeout(() => ctl.abort(), HIT_TIMEOUT_MS);
    const r = await fetch(`${BASE}/hit/${it.k}?_=${Date.now()}`, { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    if (!r.ok) return false;
    const d = await r.json().catch(() => null);
    const n = parseValue(d);
    if (n == null) return false;
    if (it.l) writeN(it.l, n);
    return true;
  } catch (_) {
    return false;
  } finally { if (to) clearTimeout(to); }
}
/** Send queued hits (background, sequential, one pass). Safe to call any time. */
export async function flushPendingHits() {
  if (flushing) return;
  flushing = true;
  try {
    const now = Date.now();
    for (const it of readPending()) {
      if (it.t && it.t > now) continue;
      if (await sendHit(it)) removePending(it.id); else markFailed(it.id);
    }
  } finally { flushing = false; }
  const rest = readPending();
  if (rest.length) {
    const next = Math.min(...rest.map((x) => x.t || 0));
    scheduleFlush(Math.max(5000, next - Date.now()));
  }
}

/**
 * +1 for an ESTABLISHED battle (call only once gameplay has really started).
 * mode: 'pvp' | 'normal' | 'strong'. Hits the total key and the mode key. Never throws / blocks.
 */
export function hitBattleCounter(mode) {
  try {
    enqueueHit(NS_KEY, BATTLE_LAST_KEY);
    if (BATTLE_MODES.some((m) => m.id === mode)) enqueueHit(modeKey(mode), modeLastKey(mode));
    // YouTube visitors (?src=yt, this tab): separate key, no display, not for bots
    if (sessionStorage.getItem('nkSrcYt') === '1' && !navigator.webdriver) enqueueHit(NS_KEY.replace('-battles', '-yt-battles'), '');
  } catch (_) { /* ignore */ }
  try { if (window.__nkVisitBattle) window.__nkVisitBattle(); } catch (_) { /* ignore */ }
  flushPendingHits();
}

async function getCount(key) {
  try {
    const r = await fetch(`${BASE}/get/${key}?_=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) return parseValue(await r.json());
    if (r.status === 404) return 0; // key not created yet
  } catch (_) { /* silent */ }
  return null;
}

/** Show "bc N（対人 a / 普通 b / 強い c）" in `el` (hidden until a value is known). Never decreases. */
export async function loadBattleCount(el) {
  setTimeout(() => { flushPendingHits(); }, 1500); // retry hits lost on earlier visits
  if (!el) return;
  const sep = el.previousElementSibling && el.previousElementSibling.classList.contains('meta-sep')
    ? el.previousElementSibling : null;
  const vals = {};
  BATTLE_MODES.forEach((m) => { const l = readN(modeLastKey(m.id)); vals[m.id] = l > 0 ? l : null; });
  let total = readLast() || null;
  const paint = () => {
    if (total == null) return;
    const parts = BATTLE_MODES.filter((m) => vals[m.id] != null)
      .map((m) => `${m.label} ${vals[m.id].toLocaleString('ja-JP')}`);
    el.textContent = 'bc ' + total.toLocaleString('ja-JP');
    if (parts.length) {
      const b = document.createElement('span');
      b.className = 'bc-breakdown';
      b.textContent = `（${parts.join(' / ')}）`;
      el.appendChild(b);
    }
    el.hidden = false;
    if (sep) sep.hidden = false;
  };
  paint();
  const [n, ...ms] = await Promise.all([getCount(NS_KEY), ...BATTLE_MODES.map((m) => getCount(modeKey(m.id)))]);
  if (n != null) { total = Math.max(n, readLast()); writeLast(total); }
  BATTLE_MODES.forEach((m, i) => {
    if (ms[i] == null) return;
    const best = Math.max(ms[i], readN(modeLastKey(m.id)));
    writeN(modeLastKey(m.id), best);
    vals[m.id] = best;
  });
  paint();
}
