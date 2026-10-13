// スペーストリックバトル ranking + medals — Cloudflare Worker (module syntax) + D1 binding DB.
// Only COM「強い」 results are submitted by the client. Periods are JST (UTC+9, no DST).
const ORIGINS = ['https://nikkukyuu-code.github.io'];
const LOCAL_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const MIN_MATCH_SEC = 20;          // server-measured token age before a submit is accepted
const MAX_TOKEN_AGE_SEC = 20 * 60; // token expires
const SEAL_SECRET = 'SET_AT_DEPLOY'; // real value only in the deployed Worker (also embedded obfuscated in the client)
const TOKENS_PER_HOUR_PLAYER = 30;
const TOKENS_PER_HOUR_IP = 60;
const REGISTER_PER_HOUR_IP = 10;
const TYPES = ['day', 'week', 'month', 'year'];
const BOARDS = ['top3', 'best'];
const JST = 9 * 3600 * 1000;

// Score sealing: AES-GCM + HMAC-SHA256, keys derived from SEAL_SECRET and the single-use match token.
const b64d = (s) => Uint8Array.from(atob(String(s)), (c) => c.charCodeAt(0));
async function sealKeys(token) {
  const enc = new TextEncoder();
  const a = await crypto.subtle.digest('SHA-256', enc.encode('enc|' + SEAL_SECRET + '|' + token));
  const m = await crypto.subtle.digest('SHA-256', enc.encode('mac|' + SEAL_SECRET + '|' + token));
  return {
    aes: await crypto.subtle.importKey('raw', a, 'AES-GCM', false, ['decrypt']),
    mac: await crypto.subtle.importKey('raw', m, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']),
  };
}
async function openSeal(token, b) {
  if (typeof b.iv !== 'string' || typeof b.ct !== 'string' || typeof b.mac !== 'string' || b.ct.length > 4000) return null;
  try {
    const k = await sealKeys(token);
    const ok = await crypto.subtle.verify('HMAC', k.mac, b64d(b.mac), new TextEncoder().encode(b.iv + '.' + b.ct));
    if (!ok) return null;
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(b.iv) }, k.aes, b64d(b.ct));
    const o = JSON.parse(new TextDecoder().decode(pt));
    return o && o.t === token && typeof o.n === 'string' && o.n.length >= 8 ? o : null;
  } catch (_) { return null; }
}

function cors(req) {
  const o = req.headers.get('Origin') || '';
  const ok = ORIGINS.includes(o) || LOCAL_RE.test(o);
  return {
    'Access-Control-Allow-Origin': ok ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
function json(req, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(req) } });
}
const err = (req, code, msg, status = 400) => json(req, { ok: false, error: code, message: msg }, status);

const p2 = (n) => String(n).padStart(2, '0');
export function periodKeys(ms) {
  const d = new Date(ms + JST); // shifted: read with getUTC*
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const s = new Date(Date.UTC(y, m, day - d.getUTCDay())); // Sunday of this week
  return {
    day: `${y}-${p2(m + 1)}-${p2(day)}`,
    week: `${s.getUTCFullYear()}-${p2(s.getUTCMonth() + 1)}-${p2(s.getUTCDate())}`,
    month: `${y}-${p2(m + 1)}`,
    year: `${y}`,
  };
}

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((x) => x.toString(16).padStart(2, '0')).join(''); }

function cleanNick(s) {
  let n = String(s == null ? '' : s).normalize('NFKC').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim();
  n = [...n].slice(0, 12).join('');
  return n || '名無し';
}

async function auth(env, id, secret) {
  if (typeof id !== 'string' || typeof secret !== 'string' || id.length > 64 || secret.length > 128) return null;
  const row = await env.DB.prepare('SELECT id, nickname, secret_hash FROM players WHERE id = ?').bind(id).first();
  if (!row || row.secret_hash !== await sha256(secret)) return null;
  return row;
}

// Insert/rename with unique nickname; appends 2,3,... when taken.
async function claimNick(env, base, writer) {
  for (let i = 1; i <= 500; i++) {
    let nick = base;
    if (i > 1) { const suf = String(i); nick = [...base].slice(0, 12 - suf.length).join('') + suf; }
    try { await writer(nick); return { nickname: nick, adjusted: i > 1 }; }
    catch (e) { if (!/UNIQUE/i.test(String(e && e.message))) throw e; }
  }
  throw new Error('nickname exhausted');
}

const BOARD_SQL = {
  top3: (col) => `WITH r AS (SELECT player_id, pt, created_at, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY pt DESC, id ASC) rn FROM scores WHERE ${col} = ?1)
    SELECT r.player_id, SUM(r.pt) AS score, COUNT(*) AS n, MAX(r.created_at) AS at, p.nickname FROM r JOIN players p ON p.id = r.player_id WHERE rn <= 3
    GROUP BY r.player_id ORDER BY score DESC, at ASC, r.player_id ASC`,
  best: (col) => `SELECT s.player_id, MAX(s.pt) AS score, COUNT(*) AS n, MIN(s.created_at) AS at, p.nickname FROM scores s JOIN players p ON p.id = s.player_id
    WHERE ${col} = ?1 GROUP BY s.player_id ORDER BY score DESC, at ASC, s.player_id ASC`,
};
// "at" tie-break for best uses first submit time (deterministic enough for casual play).

async function closePeriods(env, now = Date.now()) {
  const cur = periodKeys(now);
  let closed = 0;
  for (const t of TYPES) {
    const { results } = await env.DB.prepare(`SELECT DISTINCT ${t} AS k FROM scores WHERE ${t} < ?1 AND ${t} NOT IN (SELECT period_key FROM closed WHERE period_type = ?2) LIMIT 20`).bind(cur[t], t).all();
    for (const { k } of results) {
      const stmts = [];
      for (const b of BOARDS) {
        const top = await env.DB.prepare(BOARD_SQL[b](t) + ' LIMIT 3').bind(k).all();
        top.results.forEach((r, i) => stmts.push(env.DB.prepare('INSERT OR IGNORE INTO medals (period_type, period_key, board, rank, player_id, pt, awarded_at) VALUES (?,?,?,?,?,?,?)').bind(t, k, b, i + 1, r.player_id, r.score, now)));
      }
      stmts.push(env.DB.prepare('INSERT OR IGNORE INTO closed (period_type, period_key, closed_at) VALUES (?,?,?)').bind(t, k, now));
      await env.DB.batch(stmts);
      closed++;
    }
  }
  return closed;
}

async function medalsFor(env, ids) {
  const out = {};
  for (const id of ids) out[id] = { list: [], counts: {} };
  if (!ids.length) return out;
  const q = `SELECT player_id, period_type, period_key, board, rank, pt FROM medals WHERE player_id IN (${ids.map(() => '?').join(',')}) ORDER BY awarded_at DESC LIMIT 600`;
  const { results } = await env.DB.prepare(q).bind(...ids).all();
  for (const r of results) {
    const o = out[r.player_id]; if (!o) continue;
    o.list.push({ type: r.period_type, key: r.period_key, board: r.board, rank: r.rank, pt: r.pt });
    const ck = `${r.period_type}_${r.rank}`; o.counts[ck] = (o.counts[ck] || 0) + 1;
  }
  return out;
}

async function body(req) { try { return await req.json(); } catch (_) { return {}; } }

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const ip = req.headers.get('CF-Connecting-IP') || '0';
    const now = Date.now();
    try {
      if (path === '/' || path === '/health') return json(req, { ok: true, service: 'stb-ranking', now, keys: periodKeys(now) });

      if (path === '/register' && req.method === 'POST') {
        const b = await body(req);
        const recent = await env.DB.prepare('SELECT COUNT(*) c FROM players WHERE ip = ? AND created_at > ?').bind(ip, now - 3600e3).first();
        if (recent.c >= REGISTER_PER_HOUR_IP) return err(req, 'rate', '登録が多すぎます。しばらく待ってください', 429);
        const id = 'p' + randHex(12), secret = randHex(24), hash = await sha256(secret);
        const r = await claimNick(env, cleanNick(b.nickname), (nick) => env.DB.prepare('INSERT INTO players (id, secret_hash, nickname, ip, created_at) VALUES (?,?,?,?,?)').bind(id, hash, nick, ip, now).run());
        return json(req, { ok: true, id, secret, ...r });
      }

      if (path === '/nickname' && req.method === 'POST') {
        const b = await body(req);
        const p = await auth(env, b.id, b.secret);
        if (!p) return err(req, 'auth', '認証に失敗しました', 401);
        const want = cleanNick(b.nickname);
        if (want === p.nickname) return json(req, { ok: true, nickname: want, adjusted: false });
        const r = await claimNick(env, want, (nick) => env.DB.prepare('UPDATE players SET nickname = ? WHERE id = ?').bind(nick, p.id).run());
        return json(req, { ok: true, ...r });
      }

      if (path === '/match/start' && req.method === 'POST') {
        const b = await body(req);
        const p = await auth(env, b.id, b.secret);
        if (!p) return err(req, 'auth', '認証に失敗しました', 401);
        const hr = now - 3600e3;
        const [a, c] = await env.DB.batch([
          env.DB.prepare('SELECT COUNT(*) c FROM tokens WHERE player_id = ? AND issued_at > ?').bind(p.id, hr),
          env.DB.prepare('SELECT COUNT(*) c FROM tokens WHERE ip = ? AND issued_at > ?').bind(ip, hr),
        ]);
        if (a.results[0].c >= TOKENS_PER_HOUR_PLAYER || c.results[0].c >= TOKENS_PER_HOUR_IP) return err(req, 'rate', '対戦回数が多すぎます（1時間あたりの上限）', 429);
        const token = randHex(16);
        await env.DB.prepare('INSERT INTO tokens (token, player_id, ip, issued_at) VALUES (?,?,?,?)').bind(token, p.id, ip, now).run();
        if (Math.random() < 0.05) ctx.waitUntil(env.DB.prepare('DELETE FROM tokens WHERE issued_at < ?').bind(now - 86400e3 * 2).run());
        return json(req, { ok: true, token, minSec: MIN_MATCH_SEC });
      }

      if (path === '/match/submit' && req.method === 'POST') {
        const b = await body(req);
        const p = await auth(env, b.id, b.secret);
        if (!p) return err(req, 'auth', '認証に失敗しました', 401);
        if (typeof b.token !== 'string' || b.token.length > 64) return err(req, 'token', 'トークンがありません');
        const o = await openSeal(b.token, b);
        if (!o) return err(req, 'seal', '記録の署名が不正です（改ざん）', 422);
        const pt = Number(o.s);
        if (!Number.isSafeInteger(pt) || pt < 0) return err(req, 'pt', 'PTが不正です');
        // Atomically consume the token (single use).
        const used = await env.DB.prepare('UPDATE tokens SET used_at = ?1 WHERE token = ?2 AND player_id = ?3 AND used_at IS NULL RETURNING issued_at').bind(now, b.token, p.id).first();
        if (!used) return err(req, 'token', 'トークンが無効か使用済みです', 409);
        const age = (now - used.issued_at) / 1000;
        if (age < MIN_MATCH_SEC) return err(req, 'fast', '試合時間が短すぎます', 422);
        if (age > MAX_TOKEN_AGE_SEC) return err(req, 'expired', 'トークンの期限切れです', 422);
        if (Number.isFinite(Number(o.d)) && Number(o.d) / 1000 > age + 5) return err(req, 'time', '試合時間が一致しません', 422);
        await closePeriods(env, now);
        if (pt === 0) return json(req, { ok: true, recorded: false });
        const k = periodKeys(now);
        await env.DB.prepare('INSERT INTO scores (player_id, pt, created_at, day, week, month, year) VALUES (?,?,?,?,?,?,?)').bind(p.id, pt, now, k.day, k.week, k.month, k.year).run();
        return json(req, { ok: true, recorded: true, pt, keys: k });
      }

      if (path === '/ranking' && req.method === 'GET') {
        const type = TYPES.includes(url.searchParams.get('period')) ? url.searchParams.get('period') : 'week';
        const board = BOARDS.includes(url.searchParams.get('board')) ? url.searchParams.get('board') : 'top3';
        const cur = periodKeys(now)[type];
        const key = /^[0-9-]{4,10}$/.test(url.searchParams.get('key') || '') ? url.searchParams.get('key') : cur;
        const me = url.searchParams.get('id') || '';
        ctx.waitUntil(closePeriods(env, now).catch(() => {}));
        const { results } = await env.DB.prepare(BOARD_SQL[board](type) + ' LIMIT 1000').bind(key).all();
        let mine = null;
        const top = results.slice(0, 50).map((r, i) => ({ rank: i + 1, id: r.player_id, nickname: r.nickname, score: r.score, n: r.n }));
        if (me) { const i = results.findIndex((r) => r.player_id === me); if (i >= 0) mine = { rank: i + 1, score: results[i].score, n: results[i].n }; }
        const ids = top.map((t) => t.id);
        return json(req, { ok: true, period: type, board, key, current: key === cur, total: results.length, top, me: mine });
      }

      if (path === '/medals' && req.method === 'GET') {
        const ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter((s) => /^p[0-9a-f]{24}$/.test(s)).slice(0, 4);
        ctx.waitUntil(closePeriods(env, now).catch(() => {}));
        const m = await medalsFor(env, ids);
        if (ids.length) {
          const { results } = await env.DB.prepare(`SELECT id, nickname FROM players WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
          for (const r of results) m[r.id].nickname = r.nickname;
        }
        return json(req, { ok: true, medals: m });
      }

      if (path === '/me' && req.method === 'POST') {
        const b = await body(req);
        const p = await auth(env, b.id, b.secret);
        if (!p) return err(req, 'auth', '認証に失敗しました', 401);
        return json(req, { ok: true, id: p.id, nickname: p.nickname });
      }

      return err(req, 'notfound', 'not found', 404);
    } catch (e) {
      return err(req, 'server', 'サーバーエラー: ' + String(e && e.message || e).slice(0, 120), 500);
    }
  },
  async scheduled(ev, env, ctx) { ctx.waitUntil(closePeriods(env)); },
};
