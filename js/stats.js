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
/*
 * Display correction (approved): a retry-queue bug double-counted 16 normal battles on abacus.
 * Server values stay untouched; display = server - offset (total and normal only).
 * localStorage max keys are kept in CORRECTED terms; legacy (raw) values migrated once via FIX_FLAG_KEY.
 */
const BC_OFFSET = 16;
const OFFSETS = { [BATTLE_LAST_KEY]: BC_OFFSET, [`${BATTLE_LAST_KEY}_normal`]: BC_OFFSET };
export const FIX_FLAG_KEY = 'shootingOnline_bcFix16';
const corrected = (lastKey, raw) => (raw == null ? null : Math.max(0, raw - (OFFSETS[lastKey] || 0)));
export function migrateBcFix16() {
  try {
    if (localStorage.getItem(FIX_FLAG_KEY) === '1') return;
    Object.keys(OFFSETS).forEach((k) => {
      const v = localStorage.getItem(k);
      if (v == null) return;
      const n = Number(v);
      if (Number.isFinite(n)) localStorage.setItem(k, String(Math.max(0, Math.floor(n) - OFFSETS[k])));
    });
    localStorage.setItem(FIX_FLAG_KEY, '1');
  } catch (_) { /* ignore */ }
}
migrateBcFix16();
function readN(k) {
  try { const n = Number(localStorage.getItem(k)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; } catch (_) { return 0; }
}
function writeN(k, n) {
  try { if (Number.isFinite(n) && n > readN(k)) localStorage.setItem(k, String(Math.floor(n))); } catch (_) { /* ignore */ }
}
/*
 * Single fire-and-forget hit per battle. NEVER retried (a retry queue added in v2026-10-28 23:16:45
 * double-counted when abacus answered slowly: the server counted, the client timed out and resent).
 * Slight under-count on a lost request is acceptable; over-count is not.
 * The old queue key is purged unprocessed so no stale entries are ever sent.
 */
const LEGACY_PENDING_KEY = 'shootingOnline_battlePendingHits';
export function purgeLegacyPendingHits() {
  try { localStorage.removeItem(LEGACY_PENDING_KEY); } catch (_) { /* ignore */ }
}
purgeLegacyPendingHits();
function hitOnce(key, lastKey) {
  try {
    fetch(`${BASE}/hit/${key}?_=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const n = parseValue(d); if (n != null && lastKey) writeN(lastKey, corrected(lastKey, n)); })
      .catch(() => { /* silent, never retried */ });
  } catch (_) { /* ignore */ }
}

/**
 * +1 for an ESTABLISHED battle (call only once gameplay has really started).
 * mode: 'pvp' | 'normal' | 'strong'. Hits the total key and the mode key once each. Never throws / blocks.
 */
export function hitBattleCounter(mode) {
  purgeLegacyPendingHits();
  try {
    hitOnce(NS_KEY, BATTLE_LAST_KEY);
    if (BATTLE_MODES.some((m) => m.id === mode)) hitOnce(modeKey(mode), modeLastKey(mode));
    // YouTube visitors (?src=yt, this tab): separate key, no display, not for bots
    if (sessionStorage.getItem('nkSrcYt') === '1' && !navigator.webdriver) hitOnce(NS_KEY.replace('-battles', '-yt-battles'), '');
  } catch (_) { /* ignore */ }
  try { if (window.__nkVisitBattle) window.__nkVisitBattle(); } catch (_) { /* ignore */ }
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
  purgeLegacyPendingHits();
  migrateBcFix16();
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
  if (n != null) { total = Math.max(corrected(BATTLE_LAST_KEY, n), readLast()); writeLast(total); }
  BATTLE_MODES.forEach((m, i) => {
    if (ms[i] == null) return;
    const best = Math.max(corrected(modeLastKey(m.id), ms[i]), readN(modeLastKey(m.id)));
    writeN(modeLastKey(m.id), best);
    vals[m.id] = best;
  });
  paint();
}
