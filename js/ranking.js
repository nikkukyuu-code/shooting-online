/**
 * 世界ランキング + メダル (Cloudflare Worker + D1). Only COM「強い」 wins are submitted.
 * Everything here is best-effort: if the server is unreachable the game keeps working.
 *
 * localStorage (NEW keys, never rename; each has a _bak copy, registered in /transfer/):
 *   shootingOnline_rankId / _bak       server player id
 *   shootingOnline_rankSecret / _bak   secret key proving ownership of the id
 *   shootingOnline_nickname / _bak     nickname (server-confirmed, unique)
 */
import { sealScore } from './seal.js?v=20261015012814';
export const RANK_API = 'https://stb-ranking.nikkukyuu.workers.dev';
const K_ID = 'shootingOnline_rankId';
const K_SECRET = 'shootingOnline_rankSecret';
const K_NICK = 'shootingOnline_nickname';
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

/** Submit a finished COM「強い」 win. Resolves {ok, message}. Never throws. */
export async function submitStrongResult(pt) {
  const m = _match; _match = null;
  if (!m) return { ok: false, message: '' };
  try {
    const token = m.token || await m.p;
    if (!token) return { ok: false, message: 'ランキング未登録（サーバーに接続できませんでした）' };
    const me = rankIdentity();
    // Score is encrypted + signed (key derived from the single-use token); server rejects tampering.
    const sealed = await sealScore(token, { s: Math.max(0, Math.floor(pt) || 0), d: Math.round(performance.now() - m.t0) });
    const r = await api('/match/submit', { method: 'POST', body: { id: me.id, secret: me.secret, token, ...sealed } });
    if (r.ok) {
      if (!r.recorded) return { ok: true, message: '' };
      let msg = `ランキングに記録しました（${r.pt.toLocaleString('ja-JP')}PT）`;
      const w = await fetchRanking('week', 'top3').catch(() => null);
      if (w && w.ok) msg += '\n' + rankText(w, '今週');
      return { ok: true, message: msg };
    }
    return { ok: false, message: 'ランキング未登録：' + (r.message || '') };
  } catch (_) {
    return { ok: false, message: 'ランキング未登録（通信エラー）' };
  }
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
export function periodLabel(type, key) {
  if (type === 'year') return `${key}年`;
  if (type === 'month') { const [y, m] = key.split('-'); return `${y}年${Number(m)}月`; }
  const [y, m, d] = key.split('-').map(Number);
  const a = new Date(Date.UTC(y, m - 1, d));
  if (type === 'day') return `${y}年${m}月${d}日(${WD[a.getUTCDay()]})`;
  const b = new Date(Date.UTC(y, m - 1, d + 6));
  return `${m}/${d}(日)〜${b.getUTCMonth() + 1}/${b.getUTCDate()}(土)`;
}
export const PERIOD_JA = { day: '日間', week: '週間', month: '月間', year: '年間' };
export const BOARD_JA = { top3: 'ベスト3合計', best: '1試合最高' };

/* ---------- Medal art (canvas) ---------- */
const METAL = {
  1: { hi: '#fffbe0', mid: '#ffd23a', lo: '#b07a06', edge: '#7a4f00', ink: '#6a4200', name: '金' },
  2: { hi: '#ffffff', mid: '#cfd8e3', lo: '#7d8a99', edge: '#4c5663', ink: '#39424e', name: '銀' },
  3: { hi: '#ffe2c4', mid: '#d88a4a', lo: '#8a4a1c', edge: '#5a2c0c', ink: '#4a2208', name: '銅' },
};
const KIND = {
  day:   { size: 30, ribbon: ['#3d8bff', '#9cd0ff'], glyph: '日', rays: 0, stars: 0, wreath: false, crown: false },
  week:  { size: 38, ribbon: ['#e0283a', '#ffffff', '#1f4fd0'], glyph: '週', rays: 12, stars: 0, wreath: false, crown: false },
  month: { size: 46, ribbon: ['#7a2bd6', '#ffd23a', '#7a2bd6'], glyph: '月', rays: 16, stars: 5, wreath: true, crown: false },
  year:  { size: 56, ribbon: ['#b00020', '#ffd23a', '#101a60', '#ffd23a', '#b00020'], glyph: '年', rays: 24, stars: 8, wreath: true, crown: true },
};
export const MEDAL_SIZE = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [k, v.size]));

function star(g, x, y, r, n = 5) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

/** Draw a medal into a new canvas. type: day|week|month|year, rank: 1..3, cssSize optional. */
export function medalCanvas(type, rank, cssSize) {
  const K = KIND[type] || KIND.day, M = METAL[rank] || METAL[3];
  const S = cssSize || K.size;
  const dpr = Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
  const cv = document.createElement('canvas');
  const W = S, H = Math.round(S * 1.32);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  cv.className = `medal medal-${type} medal-r${rank}`;
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', `${PERIOD_JA[type] || ''}${M.name}メダル`);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const cx = W / 2, R = W * 0.4, cy = H - R - W * 0.06;

  // Ribbon (two tails in a V, striped)
  const rw = W * 0.24, top = 0, bot = cy - R * 0.25;
  for (const side of [-1, 1]) {
    g.save();
    g.beginPath();
    const x0 = cx + side * W * 0.30, x1 = cx + side * W * 0.04;
    g.moveTo(x0 - rw / 2, top); g.lineTo(x0 + rw / 2, top); g.lineTo(x1 + rw / 2, bot); g.lineTo(x1 - rw / 2, bot); g.closePath();
    g.clip();
    const st = K.ribbon, band = rw / st.length;
    g.translate(0, 0);
    for (let i = 0; i < st.length; i++) {
      g.fillStyle = st[i];
      g.beginPath();
      const off = -rw / 2 + i * band;
      g.moveTo(x0 + off, top); g.lineTo(x0 + off + band, top); g.lineTo(x1 + off + band, bot); g.lineTo(x1 + off, bot); g.closePath();
      g.fill();
    }
    const sh = g.createLinearGradient(x0 - rw, 0, x0 + rw, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0.35)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.18)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = sh; g.fillRect(0, 0, W, bot);
    g.restore();
  }
  // Ribbon clasp
  const clW = W * 0.34, clH = Math.max(3, W * 0.08);
  const cg = g.createLinearGradient(0, bot - clH, 0, bot + clH);
  cg.addColorStop(0, M.hi); cg.addColorStop(0.5, M.mid); cg.addColorStop(1, M.lo);
  g.fillStyle = cg; g.strokeStyle = M.edge; g.lineWidth = 0.8;
  g.beginPath(); g.roundRect ? g.roundRect(cx - clW / 2, bot - clH, clW, clH * 1.6, clH * 0.5) : g.rect(cx - clW / 2, bot - clH, clW, clH * 1.6); g.fill(); g.stroke();

  // Sun rays behind disc (week+)
  if (K.rays) {
    g.save(); g.translate(cx, cy);
    for (let i = 0; i < K.rays; i++) {
      g.rotate(Math.PI * 2 / K.rays);
      g.beginPath(); g.moveTo(-R * 0.12, 0); g.lineTo(0, -R * 1.18); g.lineTo(R * 0.12, 0); g.closePath();
      g.fillStyle = i % 2 ? M.lo : M.mid; g.fill();
    }
    g.restore();
  }
  // Laurel wreath (month+)
  if (K.wreath) {
    g.save(); g.translate(cx, cy);
    const leaves = type === 'year' ? 9 : 7;
    for (const side of [-1, 1]) {
      for (let i = 0; i < leaves; i++) {
        const a = Math.PI / 2 + side * (0.35 + i * (2.3 / leaves));
        const lx = Math.cos(a) * R * 1.08, ly = Math.sin(a) * R * 1.08;
        g.save(); g.translate(lx, ly); g.rotate(a + side * 0.9);
        const lg = g.createLinearGradient(-R * 0.2, 0, R * 0.2, 0);
        lg.addColorStop(0, '#1d6b2a'); lg.addColorStop(0.5, '#6fd06a'); lg.addColorStop(1, '#14501f');
        g.fillStyle = lg; g.beginPath(); g.ellipse(0, 0, R * 0.2, R * 0.09, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
    g.restore();
  }
  // Disc: outer rim, inner face
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = W * 0.08; g.shadowOffsetY = W * 0.03;
  const rim = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  rim.addColorStop(0, M.hi); rim.addColorStop(0.45, M.mid); rim.addColorStop(1, M.edge);
  g.fillStyle = rim; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.restore();
  // Rim notches (coin edge)
  g.save(); g.translate(cx, cy); g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = Math.max(0.6, W * 0.012);
  const notches = type === 'day' ? 20 : 36;
  for (let i = 0; i < notches; i++) { g.rotate(Math.PI * 2 / notches); g.beginPath(); g.moveTo(0, -R * 0.98); g.lineTo(0, -R * 0.86); g.stroke(); }
  g.restore();
  const face = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R * 0.85);
  face.addColorStop(0, M.hi); face.addColorStop(0.55, M.mid); face.addColorStop(1, M.lo);
  g.fillStyle = face; g.beginPath(); g.arc(cx, cy, R * 0.8, 0, Math.PI * 2); g.fill();
  g.strokeStyle = M.edge; g.lineWidth = Math.max(0.8, W * 0.02); g.stroke();
  // Inner ring of stars (month+)
  if (K.stars) {
    g.fillStyle = M.hi;
    for (let i = 0; i < K.stars; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / K.stars;
      star(g, cx + Math.cos(a) * R * 0.66, cy + Math.sin(a) * R * 0.66, R * 0.08); g.fill();
    }
  }
  // Glyph / rank
  g.fillStyle = M.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(255,255,255,0.6)'; g.shadowOffsetY = 0.7; g.shadowBlur = 0;
  const fs = R * (K.stars ? 0.62 : 0.78);
  g.font = `900 ${fs}px "Hiragino Sans","Noto Sans JP",sans-serif`;
  g.fillText(K.glyph, cx, cy - (type === 'day' ? 0 : R * 0.08));
  if (type !== 'day') { g.font = `900 ${R * 0.3}px sans-serif`; g.fillText(String(rank) + '位', cx, cy + R * 0.42); }
  g.shadowColor = 'transparent';
  // Crown (year)
  if (K.crown) {
    const cw = R * 0.9, ch = R * 0.5, by = cy - R * 0.98;
    const crg = g.createLinearGradient(0, by - ch, 0, by);
    crg.addColorStop(0, '#fff6b0'); crg.addColorStop(0.5, '#ffcc22'); crg.addColorStop(1, '#a86c00');
    g.fillStyle = crg; g.strokeStyle = '#6a4200'; g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(cx - cw / 2, by); g.lineTo(cx - cw / 2, by - ch * 0.55); g.lineTo(cx - cw / 4, by - ch * 0.25);
    g.lineTo(cx, by - ch); g.lineTo(cx + cw / 4, by - ch * 0.25); g.lineTo(cx + cw / 2, by - ch * 0.55); g.lineTo(cx + cw / 2, by); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = '#e8213a'; g.beginPath(); g.arc(cx, by - ch * 0.35, R * 0.07, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a7fff'; g.beginPath(); g.arc(cx - cw * 0.3, by - ch * 0.2, R * 0.05, 0, Math.PI * 2); g.arc(cx + cw * 0.3, by - ch * 0.2, R * 0.05, 0, Math.PI * 2); g.fill();
  }
  // Shine: glossy highlight + sparkle
  g.save(); g.beginPath(); g.arc(cx, cy, R * 0.8, 0, Math.PI * 2); g.clip();
  const gl = g.createLinearGradient(cx - R, cy - R, cx + R * 0.2, cy + R * 0.2);
  gl.addColorStop(0, 'rgba(255,255,255,0.55)'); gl.addColorStop(0.45, 'rgba(255,255,255,0.08)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  star(g, cx + R * 0.48, cy - R * 0.5, R * 0.16, 4); g.fill();
  return cv;
}

const ORDER = ['year', 'month', 'week', 'day'];
/** Build a medal shelf element from server medals {counts:{'week_1':n,...}}. */
export function medalShelf(entry, { compact = false, max = 12 } = {}) {
  const box = document.createElement('div');
  box.className = 'medal-shelf' + (compact ? ' compact' : '');
  const counts = (entry && entry.counts) || {};
  let shown = 0;
  for (const t of ORDER) {
    for (const r of [1, 2, 3]) {
      const n = counts[`${t}_${r}`] || 0;
      if (!n || shown >= max) continue;
      shown++;
      const it = document.createElement('span');
      it.className = 'medal-item';
      it.title = `${PERIOD_JA[t]}${r}位 ×${n}`;
      const size = compact ? Math.round(MEDAL_SIZE[t] * 0.72) : MEDAL_SIZE[t];
      it.appendChild(medalCanvas(t, r, size));
      if (n > 1) { const c = document.createElement('b'); c.className = 'medal-n'; c.textContent = '×' + n; it.appendChild(c); }
      box.appendChild(it);
    }
  }
  if (!shown) { const e = document.createElement('span'); e.className = 'medal-none'; e.textContent = 'メダルなし'; box.appendChild(e); }
  return box;
}
