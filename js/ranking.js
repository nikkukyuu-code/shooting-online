/**
 * 世界ランキング + メダル (Cloudflare Worker + D1). Only COM「強い」 wins are submitted.
 * Everything here is best-effort: if the server is unreachable the game keeps working.
 *
 * localStorage (NEW keys, never rename; each has a _bak copy, registered in /transfer/):
 *   shootingOnline_rankId / _bak       server player id
 *   shootingOnline_rankSecret / _bak   secret key proving ownership of the id
 *   shootingOnline_nickname / _bak     nickname (server-confirmed, unique)
 *   shootingOnline_rankPending / _bak  JSON list of sealed results whose submit failed (network/timeout/5xx/429);
 *                                      retried automatically when the ランキング screen is opened (server accepts
 *                                      `late` resubmits of an unused token for 48 h). Token is single-use → no double count.
 */
import { sealScore } from './seal.js?v=20261031015236';
export const RANK_API = 'https://stb-ranking.nikkukyuu.workers.dev';
const K_ID = 'shootingOnline_rankId';
const K_SECRET = 'shootingOnline_rankSecret';
const K_NICK = 'shootingOnline_nickname';
const K_PENDING = 'shootingOnline_rankPending';
export const FAIL_MSG = '登録に失敗しました。今は混み合っているのですみませんが24時間後ランキングを押して登録し直してください。';
export const DEFAULT_NICK = '名無し';
export const DUP_MSG = '重複していますので数字を付加しました';

function lsGet(k) {
  try { return localStorage.getItem(k) || localStorage.getItem(k + '_bak') || ''; } catch (_) { return ''; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); localStorage.setItem(k + '_bak', v); } catch (_) { /* ignore */ }
}

export function rankIdentity() {
  return { id: lsGet(K_ID), secret: lsGet(K_SECRET), nickname: lsGet(K_NICK) || DEFAULT_NICK };
}

async function api(path, { method = 'GET', body, timeout = 6000 } = {}) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ctl && ctl.abort(), timeout);
  try {
    const r = await fetch(RANK_API + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl ? ctl.signal : undefined,
      cache: 'no-store',
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return { ok: false, status: r.status, error: j.error || 'http', message: j.message || ('通信エラー ' + r.status) };
    return j;
  } catch (e) {
    return { ok: false, offline: true, error: 'offline', message: 'ランキングサーバーに接続できません' };
  } finally {
    clearTimeout(t);
  }
}

let _registering = null;
/** Make sure this device has a server player (registers with the local nickname on first use). */
export async function ensurePlayer() {
  const me = rankIdentity();
  if (me.id && me.secret) return { ok: true, ...me, adjusted: false };
  if (_registering) return _registering;
  _registering = (async () => {
    const r = await api('/register', { method: 'POST', body: { nickname: me.nickname } });
    if (r.ok) {
      lsSet(K_ID, r.id); lsSet(K_SECRET, r.secret); lsSet(K_NICK, r.nickname);
      return { ok: true, id: r.id, secret: r.secret, nickname: r.nickname, adjusted: !!r.adjusted };
    }
    return r;
  })();
  try { return await _registering; } finally { _registering = null; }
}

/** Change nickname (unique on server). Returns {ok, nickname, adjusted, message}. */
export async function setNickname(name) {
  const want = String(name || '').trim() || DEFAULT_NICK;
  const me = rankIdentity();
  if (!me.id || !me.secret) {
    lsSet(K_NICK, want);
    return ensurePlayer();
  }
  const r = await api('/nickname', { method: 'POST', body: { id: me.id, secret: me.secret, nickname: want } });
  if (r.ok) lsSet(K_NICK, r.nickname);
  return r;
}

/* ---------- COM「強い」 match token ---------- */
let _match = null;
export function beginStrongMatch() {
  _match = { t0: performance.now(), token: null, p: null };
  const m = _match;
  m.p = ensurePlayer().then((me) => {
    if (!me.ok) return null;
    return api('/match/start', { method: 'POST', body: { id: me.id, secret: me.secret } }).then(async (r) => {
      if (!r.ok && r.status === 401) {
        // Server no longer knows this id (e.g. account removed): register again with the same nickname.
        const re = await api('/register', { method: 'POST', body: { nickname: rankIdentity().nickname } });
        if (re.ok) {
          lsSet(K_ID, re.id); lsSet(K_SECRET, re.secret); lsSet(K_NICK, re.nickname);
          r = await api('/match/start', { method: 'POST', body: { id: re.id, secret: re.secret } });
        }
      }
      if (r.ok) m.token = r.token;
      return r.ok ? r.token : null;
    });
  }).catch(() => null);
}
export function cancelStrongMatch() { _match = null; }

/* ---------- pending (unsent) results ---------- */
const PENDING_MAX = 30;
export function pendingList() {
  try { const a = JSON.parse(lsGet(K_PENDING) || '[]'); return Array.isArray(a) ? a.filter((x) => x && typeof x.token === 'string') : []; } catch (_) { return []; }
}
function pendingSave(list) { lsSet(K_PENDING, JSON.stringify(list.slice(-PENDING_MAX))); }
function pendingAdd(item) { const l = pendingList().filter((x) => x.token !== item.token); l.push(item); pendingSave(l); }
function pendingRemove(token) { pendingSave(pendingList().filter((x) => x.token !== token)); }
/** Temporary failure (keep for retry) vs. a definite server answer (drop). */
function isTransient(r) { return !!(r.offline || !r.status || r.status === 408 || r.status === 429 || r.status >= 500); }

/** Submit a finished COM「強い」 win. Resolves {ok, message, pending}. Never throws. */
export async function submitStrongResult(pt) {
  const m = _match; _match = null;
  if (!m) return { ok: false, message: '' };
  try {
    const token = m.token || await m.p;
    if (!token) return { ok: false, message: 'ランキング未登録（サーバーに接続できませんでした）' };
    const me = rankIdentity();
    // Score is encrypted + signed (key derived from the single-use token); server rejects tampering.
    const sealed = await sealScore(token, { s: Math.max(0, Math.floor(pt) || 0), d: Math.round(performance.now() - m.t0) });
    const item = { id: me.id, token, sealed, pt: Math.max(0, Math.floor(pt) || 0), at: Date.now() };
    if (item.pt > 0) pendingAdd(item); // saved BEFORE sending: a crash / closed tab cannot lose it
    const r = await api('/match/submit', { method: 'POST', body: { id: me.id, secret: me.secret, token, ...sealed }, timeout: 10000 });
    if (r.ok) {
      pendingRemove(token);
      if (!r.recorded) return { ok: true, message: '' };
      let msg = `ランキングに記録しました（${r.pt.toLocaleString('ja-JP')}PT）`;
      const w = await fetchRanking('week', 'top3').catch(() => null);
      if (w && w.ok) msg += '\n' + rankText(w, '今週');
      return { ok: true, message: msg };
    }
    if (item.pt > 0 && isTransient(r)) return { ok: false, pending: true, message: FAIL_MSG };
    pendingRemove(token);
    return { ok: false, message: 'ランキング未登録：' + (r.message || '') };
  } catch (_) {
    return pendingList().length ? { ok: false, pending: true, message: FAIL_MSG } : { ok: false, message: 'ランキング未登録（通信エラー）' };
  }
}

let _retrying = null;
/** Resend saved results (called when the ランキング screen opens). Resolves {sent, pt, left, failed}. */
export function retryPending() {
  if (_retrying) return _retrying;
  _retrying = (async () => {
    const out = { sent: 0, pt: 0, left: 0, failed: false };
    const me = rankIdentity();
    for (const it of pendingList()) {
      if (!me.id || it.id !== me.id) { pendingRemove(it.token); continue; } // other account: cannot authenticate
      const r = await api('/match/submit', { method: 'POST', body: { id: me.id, secret: me.secret, token: it.token, ...it.sealed, late: true }, timeout: 10000 });
      if (r.ok) { pendingRemove(it.token); if (r.recorded) { out.sent++; out.pt += r.pt || 0; } continue; }
      if (isTransient(r)) { out.failed = true; break; } // still busy: keep everything, try next time
      pendingRemove(it.token); // 409 = token already used (an earlier send reached the server) / expired / invalid
    }
    out.left = pendingList().length;
    return out;
  })();
  return _retrying.finally(() => { _retrying = null; });
}

/** 「今週 3人中1位」 / 「今週 未参加（3人参加中）」 */
export function rankText(r, prefix = '') {
  const p = prefix ? prefix + ' ' : '';
  return r && r.me ? `${p}${r.total}人中${r.me.rank}位` : `${p}未参加（${(r && r.total) || 0}人参加中）`;
}
export function fetchRanking(period, board, key) {
  const me = rankIdentity();
  const q = new URLSearchParams({ period, board });
  if (key) q.set('key', key);
  if (me.id) q.set('id', me.id);
  return api('/ranking?' + q.toString());
}
export function fetchMedals(ids) {
  const list = (ids || []).filter((s) => /^p[0-9a-f]{24}$/.test(s || ''));
  if (!list.length) return Promise.resolve({ ok: true, medals: {} });
  return api('/medals?ids=' + list.join(','));
}

/* ---------- JST period helpers (match the Worker) ---------- */
const JST = 9 * 3600e3;
const p2 = (n) => String(n).padStart(2, '0');
export function periodKeys(ms = Date.now()) {
  const d = new Date(ms + JST);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const s = new Date(Date.UTC(y, m, day - d.getUTCDay()));
  return { day: `${y}-${p2(m + 1)}-${p2(day)}`, week: `${s.getUTCFullYear()}-${p2(s.getUTCMonth() + 1)}-${p2(s.getUTCDate())}`, month: `${y}-${p2(m + 1)}`, year: `${y}` };
}
/** Shift a period key by n periods (n<0 = past). */
export function shiftKey(type, key, n) {
  if (type === 'year') return String(Number(key) + n);
  if (type === 'month') { const [y, m] = key.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}`; }
  const [y, m, dd] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd + n * (type === 'week' ? 7 : 1)));
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}
const WD = '日月火水木金土';
// Weekday letter: Japanese by default; other UI languages (NKI18N) use the browser's localized short weekday.
function wdName(date) {
  const lang = (typeof window !== 'undefined' && window.NKI18N && window.NKI18N.lang) || 'ja';
  if (lang !== 'ja') {
    try { return new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(date); } catch (e) { /* fall through */ }
  }
  return WD[date.getUTCDay()];
}
export function periodLabel(type, key) {
  if (type === 'year') return `${key}年`;
  if (type === 'month') { const [y, m] = key.split('-'); return `${y}年${Number(m)}月`; }
  const [y, m, d] = key.split('-').map(Number);
  const a = new Date(Date.UTC(y, m - 1, d));
  if (type === 'day') return `${y}年${m}月${d}日(${wdName(a)})`;
  const b = new Date(Date.UTC(y, m - 1, d + 6));
  return `${m}/${d}(${wdName(a)})〜${b.getUTCMonth() + 1}/${b.getUTCDate()}(${wdName(b)})`;
}
export const PERIOD_JA = { day: '日間', week: '週間', month: '月間', year: '年間' };
export const BOARD_JA = { top3: 'ベスト3合計', best: '1試合最高' };

/* ---------- Medal art (canvas + light CSS animation) ----------
 * User 10-16 「めだるのちがいがわかりずらいので豪華に」: every medal shows its RANK as a big numeral on a clearly
 * different metal (gold = warm yellow, silver = cool blue-white, bronze = deep copper) and its PERIOD as a coloured
 * label (日 blue / 週 red / 月 purple / 年 crimson + gold) on the medal; the art escalates with the period:
 *   日 plain disc · 週 ribbon + double notched rim · 月 8-point star body + laurel + gems + shine sweep ·
 *   年 crown + full laurel wreath + rotating rays + sparkles + strong glow.
 * Board marker (small badge on the label): Σ = ベスト3合計, ★ = 1試合最高.
 * Same element on the title screen, the VS panel and the ranking screen. */
const METAL = {
  1: { hi: '#fffbe0', mid: '#ffcf24', lo: '#c07a00', edge: '#6a4300', ink: '#5a3400', glow: 'rgba(255,205,40,0.85)', name: '金' },
  2: { hi: '#ffffff', mid: '#c9d9ee', lo: '#6f86a6', edge: '#33465f', ink: '#22344d', glow: 'rgba(170,215,255,0.8)', name: '銀' },
  3: { hi: '#ffd2a8', mid: '#cf7032', lo: '#7e3510', edge: '#4a1c04', ink: '#3e1502', glow: 'rgba(240,130,60,0.8)', name: '銅' },
};
const KIND = {
  day:   { size: 30, hf: 1.0,  rf: 0.42, label: '日', lab: ['#2f7bff', '#9fd0ff'] },
  week:  { size: 36, hf: 1.32, rf: 0.40, label: '週', lab: ['#e0283a', '#ffb0b8'], ribbon: ['#e0283a', '#ffffff', '#1f4fd0'] },
  month: { size: 42, hf: 1.3,  rf: 0.33, label: '月', lab: ['#7a2bd6', '#e2c2ff'], ribbon: ['#7a2bd6', '#ffd23a', '#7a2bd6'] },
  year:  { size: 50, hf: 1.38, rf: 0.34, label: '年', lab: ['#b00020', '#ffd23a'] },
};
export const MEDAL_SIZE = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [k, v.size]));
const BOARD_MARK = { top3: 'Σ', best: '★' };

function star(g, x, y, r, n = 5, inner = 0.45, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + i * Math.PI / n, rr = i % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}
function metalGrad(g, M, x0, y0, x1, y1) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, M.hi); gr.addColorStop(0.45, M.mid); gr.addColorStop(1, M.lo);
  return gr;
}
function laurel(g, cx, cy, R, leaves, spread, M) {
  for (const side of [-1, 1]) {
    for (let i = 0; i < leaves; i++) {
      const a = Math.PI / 2 + side * (0.45 + i * (spread / leaves));
      const lx = cx + Math.cos(a) * R, ly = cy + Math.sin(a) * R;
      g.save(); g.translate(lx, ly); g.rotate(a + side * 1.15);
      const lg = g.createLinearGradient(-R * 0.18, 0, R * 0.18, 0);
      if (M) { lg.addColorStop(0, M.lo); lg.addColorStop(0.5, M.hi); lg.addColorStop(1, M.edge); } // metal laurel (year)
      else { lg.addColorStop(0, '#16632a'); lg.addColorStop(0.5, '#7fe07a'); lg.addColorStop(1, '#0f4a1c'); }
      g.fillStyle = lg; g.beginPath(); g.ellipse(0, 0, R * 0.17, R * 0.075, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
}
function gem(g, x, y, r, col) {
  g.save();
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.8, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.8, y); g.closePath();
  const gg = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  gg.addColorStop(0, '#ffffff'); gg.addColorStop(0.35, col); gg.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = gg; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = Math.max(0.5, r * 0.18); g.stroke();
  g.restore();
}

/** Paint the static medal art. Returns geometry (disc centre / radius) for the animation layers. */
function paintMedal(cv, type, rank, S, board) {
  const K = KIND[type] || KIND.day, M = METAL[rank] || METAL[3];
  const dpr = Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
  const W = S, H = Math.round(S * K.hf);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const R = S * K.rf, labH = Math.max(7, S * 0.22);
  const cx = W / 2, cy = H - labH * 0.55 - R * (type === 'day' ? 0.98 : 1.02) - (type === 'month' ? R * 0.22 : 0);
  const lw = (k) => Math.max(0.6, S * k);

  // --- soft glow (baked in; CSS filters gave a dark box on some GPUs) ---
  if (type === 'month' || type === 'year') {
    const gr = Math.min(W / 2, R * (type === 'year' ? 1.75 : 1.6));
    const gg = g.createRadialGradient(cx, cy, R * 0.5, cx, cy, gr);
    gg.addColorStop(0, M.glow); gg.addColorStop(1, 'rgba(255,220,120,0)');
    g.save(); g.globalAlpha = type === 'year' ? 0.95 : 0.6; g.fillStyle = gg; g.beginPath(); g.arc(cx, cy, gr, 0, Math.PI * 2); g.fill(); g.restore();
  }
  // --- behind the disc ---
  if (K.ribbon) { // ribbon tails in a V (week / month)
    const rw = W * (type === 'month' ? 0.2 : 0.26), bot = cy - R * 0.4;
    for (const side of [-1, 1]) {
      const x0 = cx + side * W * 0.27, x1 = cx + side * W * 0.05;
      g.save(); g.beginPath();
      g.moveTo(x0 - rw / 2, 0); g.lineTo(x0 + rw / 2, 0); g.lineTo(x1 + rw / 2, bot); g.lineTo(x1 - rw / 2, bot); g.closePath(); g.clip();
      const st = K.ribbon, band = rw / st.length;
      for (let i = 0; i < st.length; i++) {
        g.fillStyle = st[i]; g.beginPath(); const off = -rw / 2 + i * band;
        g.moveTo(x0 + off, 0); g.lineTo(x0 + off + band, 0); g.lineTo(x1 + off + band, bot); g.lineTo(x1 + off, bot); g.closePath(); g.fill();
      }
      const sh = g.createLinearGradient(x0 - rw, 0, x0 + rw, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.35)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.2)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = sh; g.fillRect(0, 0, W, bot); g.restore();
    }
  }
  if (type === 'month') { // 8-point star body + green laurel
    laurel(g, cx, cy, R * 1.42, 6, 2.0, null);
    g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = S * 0.06;
    star(g, cx, cy, R * 1.5, 8, 0.66, -Math.PI / 2); g.fillStyle = metalGrad(g, M, cx - R, cy - R * 1.5, cx + R, cy + R * 1.5); g.fill();
    g.restore(); g.strokeStyle = M.edge; g.lineWidth = lw(0.022); g.stroke();
    star(g, cx, cy, R * 1.2, 8, 0.8, -Math.PI / 2 + Math.PI / 8); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill();
  }
  if (type === 'year') { // gold laurel wreath (always gold: the top prize) + metal laurel inner ring
    laurel(g, cx, cy, R * 1.36, 8, 2.35, METAL[1]);
    laurel(g, cx, cy, R * 1.12, 6, 2.2, null);
  }

  // --- disc ---
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = S * 0.07; g.shadowOffsetY = S * 0.025;
  g.fillStyle = metalGrad(g, M, cx - R, cy - R, cx + R, cy + R);
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.restore();
  g.strokeStyle = M.edge; g.lineWidth = lw(0.025); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  if (type !== 'day') { // notched coin edge + second rim
    g.save(); g.translate(cx, cy); g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = lw(0.014);
    const n = type === 'week' ? 28 : 36;
    for (let i = 0; i < n; i++) { g.rotate(Math.PI * 2 / n); g.beginPath(); g.moveTo(0, -R * 0.97); g.lineTo(0, -R * 0.84); g.stroke(); }
    g.restore();
  }
  const fr = type === 'day' ? 0.84 : 0.78;
  const face = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R * fr);
  face.addColorStop(0, M.hi); face.addColorStop(0.55, M.mid); face.addColorStop(1, M.lo);
  g.fillStyle = face; g.beginPath(); g.arc(cx, cy, R * fr, 0, Math.PI * 2); g.fill();
  g.strokeStyle = M.edge; g.lineWidth = lw(type === 'day' ? 0.018 : 0.026); g.stroke();
  if (type === 'week' || type === 'year') { g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = lw(0.012); g.beginPath(); g.arc(cx, cy, R * (fr - 0.06), 0, Math.PI * 2); g.stroke(); }

  // --- big rank numeral (the main difference at a glance) ---
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const fs = R * (type === 'day' ? 1.25 : 1.12);
  g.font = `900 ${fs}px "Arial Black","Hiragino Sans","Noto Sans JP",sans-serif`;
  g.lineJoin = 'round'; g.lineWidth = Math.max(1, fs * 0.14); g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.strokeText(String(rank), cx, cy + fs * 0.05);
  g.fillStyle = M.ink; g.fillText(String(rank), cx, cy + fs * 0.05);

  // --- month gems on the star tips / year crown ---
  if (type === 'month') {
    const gems = rank === 1 ? ['#ff2a4a', '#2a8cff', '#2ad66a'] : rank === 2 ? ['#2a8cff', '#c06bff', '#2a8cff'] : ['#ff7a2a', '#ffd23a', '#ff7a2a'];
    gem(g, cx, cy - R * 1.28, R * 0.2, gems[0]);
    gem(g, cx - R * 1.28 * Math.cos(Math.PI / 4), cy - R * 1.28 * Math.sin(Math.PI / 4), R * 0.15, gems[1]);
    gem(g, cx + R * 1.28 * Math.cos(Math.PI / 4), cy - R * 1.28 * Math.sin(Math.PI / 4), R * 0.15, gems[2]);
  }
  if (type === 'year') {
    const cw = R * 1.5, ch = R * 0.85, by = cy - R * 0.84;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = S * 0.04;
    const crg = g.createLinearGradient(0, by - ch, 0, by);
    crg.addColorStop(0, '#fff7b8'); crg.addColorStop(0.5, '#ffcc22'); crg.addColorStop(1, '#a86c00');
    g.fillStyle = crg; g.strokeStyle = '#5a3600'; g.lineWidth = lw(0.02);
    g.beginPath();
    g.moveTo(cx - cw / 2, by); g.lineTo(cx - cw / 2 - cw * 0.04, by - ch * 0.78); g.lineTo(cx - cw * 0.24, by - ch * 0.38);
    g.lineTo(cx, by - ch); g.lineTo(cx + cw * 0.24, by - ch * 0.38); g.lineTo(cx + cw / 2 + cw * 0.04, by - ch * 0.78); g.lineTo(cx + cw / 2, by); g.closePath();
    g.fill(); g.restore(); g.stroke();
    for (const [dx, dy] of [[-cw / 2 - cw * 0.04, -ch * 0.78], [0, -ch], [cw / 2 + cw * 0.04, -ch * 0.78]]) { g.fillStyle = '#fff3a0'; g.beginPath(); g.arc(cx + dx, by + dy, R * 0.07, 0, Math.PI * 2); g.fill(); }
    gem(g, cx, by - ch * 0.38, R * 0.14, '#ff2040');
    gem(g, cx - cw * 0.27, by - ch * 0.2, R * 0.1, '#2a7fff');
    gem(g, cx + cw * 0.27, by - ch * 0.2, R * 0.1, '#2ad66a');
  }

  // --- gloss + sparkle ---
  g.save(); g.beginPath(); g.arc(cx, cy, R * fr, 0, Math.PI * 2); g.clip();
  const gl = g.createLinearGradient(cx - R, cy - R, cx + R * 0.2, cy + R * 0.2);
  gl.addColorStop(0, 'rgba(255,255,255,0.5)'); gl.addColorStop(0.45, 'rgba(255,255,255,0.06)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.95)'; star(g, cx + R * 0.5, cy - R * 0.5, R * 0.17, 4, 0.3); g.fill();

  // --- period label (日/週/月/年) on the bottom of the medal + board badge ---
  const lb = Math.max(9, S * (type === 'day' ? 0.4 : 0.36)), ly = H - labH / 2 - 0.5;
  g.save();
  const lgr = g.createLinearGradient(0, ly - labH / 2, 0, ly + labH / 2);
  lgr.addColorStop(0, K.lab[1]); lgr.addColorStop(0.45, K.lab[0]); lgr.addColorStop(1, K.lab[0]);
  g.fillStyle = lgr; g.strokeStyle = type === 'year' ? '#ffd23a' : 'rgba(255,255,255,0.85)'; g.lineWidth = lw(type === 'year' ? 0.03 : 0.02);
  g.beginPath();
  if (g.roundRect) g.roundRect(cx - lb / 2, ly - labH / 2, lb, labH, labH / 2); else g.rect(cx - lb / 2, ly - labH / 2, lb, labH);
  g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.font = `900 ${labH * 0.82}px "Hiragino Sans","Noto Sans JP",sans-serif`;
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 1.5;
  g.fillText(K.label, cx, ly + labH * 0.04);
  g.restore();
  const mk = BOARD_MARK[board];
  if (mk) {
    const br = labH * 0.46, bx = cx + lb / 2 + br * 0.55, byy = ly - labH * 0.05;
    g.fillStyle = board === 'best' ? '#0d1a40' : '#1a2a10'; g.strokeStyle = board === 'best' ? '#7fd0ff' : '#b6ff7a'; g.lineWidth = lw(0.016);
    g.beginPath(); g.arc(bx, byy, br, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = board === 'best' ? '#9fe0ff' : '#c8ff9a'; g.font = `900 ${br * 1.45}px sans-serif`; g.fillText(mk, bx, byy + br * 0.08);
  }
  return { W, H, cx, cy, R };
}

/** Rotating light rays behind a year medal (separate canvas, rotated by CSS). */
function raysCanvas(D, M, S) {
  const dpr = Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
  const d = Math.round(D.R * 3.6), cv = document.createElement('canvas');
  cv.width = Math.round(d * dpr); cv.height = Math.round(d * dpr);
  cv.style.width = d + 'px'; cv.style.height = d + 'px';
  cv.className = 'medal-rays';
  cv.style.left = Math.round(D.cx - d / 2) + 'px'; cv.style.top = Math.round(D.cy - d / 2) + 'px';
  const g = cv.getContext('2d'); g.scale(dpr, dpr); g.translate(d / 2, d / 2);
  const gr = g.createRadialGradient(0, 0, D.R * 0.6, 0, 0, d / 2);
  gr.addColorStop(0, M.glow); gr.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = gr;
  for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(-D.R * 0.16, 0); g.lineTo(0, -d / 2); g.lineTo(D.R * 0.16, 0); g.closePath(); g.fill(); }
  return cv;
}

/**
 * Medal element (span.medal wrapper). type: day|week|month|year, rank 1..3, cssSize optional,
 * opts.board: 'top3' | 'best' (small badge), opts.anim (default true): month shine / year rays + sparkles.
 */
export function medalCanvas(type, rank, cssSize, opts = {}) {
  const K = KIND[type] || KIND.day, M = METAL[rank] || METAL[3];
  const S = cssSize || K.size;
  const wrap = document.createElement('span');
  wrap.className = `medal medal-${type} medal-r${rank}`;
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', `${PERIOD_JA[type] || ''}${rank}位 ${M.name}メダル${opts.board ? '（' + BOARD_JA[opts.board] + '）' : ''}`);
  const cv = document.createElement('canvas'); cv.className = 'medal-art';
  const D = paintMedal(cv, type, rank, S, opts.board);
  wrap.style.width = D.W + 'px'; wrap.style.height = D.H + 'px';
  wrap.style.setProperty('--mg', M.glow);
  const anim = opts.anim !== false;
  if (type === 'year' && anim) wrap.appendChild(raysCanvas(D, M, S));
  wrap.appendChild(cv);
  if ((type === 'month' || type === 'year') && anim) {
    try {
      const sh = document.createElement('span'); sh.className = 'medal-shine';
      const url = `url(${cv.toDataURL()})`;
      sh.style.webkitMaskImage = url; sh.style.maskImage = url;
      sh.style.animationDelay = (-Math.random() * 3).toFixed(2) + 's';
      wrap.appendChild(sh);
    } catch (_) { /* tainted / unsupported: no sweep */ }
  }
  if (type === 'year' && anim) {
    for (const [x, y, d] of [[0.12, 0.2, 0], [0.86, 0.32, 0.6], [0.78, 0.04, 1.2]]) {
      const sp = document.createElement('i'); sp.className = 'medal-spark'; sp.textContent = '✦';
      sp.style.left = (x * D.W) + 'px'; sp.style.top = (y * D.H) + 'px'; sp.style.fontSize = Math.max(7, S * 0.2) + 'px';
      sp.style.animationDelay = d + 's';
      wrap.appendChild(sp);
    }
  }
  return wrap;
}

const ORDER = ['year', 'month', 'week', 'day'];
/** Build a medal shelf element from server medals ({list:[{type,board,rank}], counts:{'week_1':n,...}}). */
export function medalShelf(entry, { compact = false, max = 12, scale, anim = true, none = 'メダルなし' } = {}) {
  const box = document.createElement('div');
  box.className = 'medal-shelf' + (compact ? ' compact' : '');
  // count per period × rank × board from the list (falls back to the server counts without board)
  const groups = new Map();
  const list = entry && Array.isArray(entry.list) ? entry.list : null;
  if (list && list.length) {
    for (const m of list) {
      if (!KIND[m.type] || !METAL[m.rank]) continue;
      const k = `${m.type}_${m.rank}_${m.board || ''}`;
      groups.set(k, (groups.get(k) || 0) + 1);
    }
  } else {
    const counts = (entry && entry.counts) || {};
    for (const [k, n] of Object.entries(counts)) if (n) groups.set(k + '_', n);
  }
  let shown = 0;
  for (const t of ORDER) {
    for (const r of [1, 2, 3]) {
      for (const b of ['top3', 'best', '']) {
        const n = groups.get(`${t}_${r}_${b}`) || 0;
        if (!n || shown >= max) continue;
        shown++;
        const it = document.createElement('span');
        it.className = 'medal-item';
        it.title = `${PERIOD_JA[t]}${r}位${b ? '（' + BOARD_JA[b] + '）' : ''} ×${n}`;
        const size = Math.round(MEDAL_SIZE[t] * (scale || (compact ? 0.74 : 1)));
        it.appendChild(medalCanvas(t, r, size, { board: b || undefined, anim }));
        if (n > 1) { const c = document.createElement('b'); c.className = 'medal-n'; c.textContent = '×' + n; it.appendChild(c); }
        box.appendChild(it);
      }
    }
  }
  if (!shown && none) { const e = document.createElement('span'); e.className = 'medal-none'; e.textContent = none; box.appendChild(e); }
  return box;
}

/** After a one-line shelf is in the DOM: drop medals that would be cut off and show "+n" instead (no half medals). */
export function fitShelf(shelf) {
  const box = shelf && shelf.querySelector('.medal-shelf');
  if (!box || box.classList.contains('wrap')) return;
  const items = [...box.querySelectorAll('.medal-item')];
  if (!items.length) return;
  const right = () => box.getBoundingClientRect().right + 0.5;
  let hidden = 0;
  const more = document.createElement('span'); more.className = 'medal-more';
  while (items.length && items[items.length - 1].getBoundingClientRect().right > right()) { items.pop().remove(); hidden++; }
  if (!hidden) return;
  more.textContent = '+' + hidden; box.appendChild(more);
  while (items.length > 1 && more.getBoundingClientRect().right > right()) { items.pop().remove(); hidden++; more.textContent = '+' + hidden; }
}
