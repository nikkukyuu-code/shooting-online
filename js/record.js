/**
 * 自己ベスト（COM「強い」1試合の最高PT）— 記録更新演出用.
 * The record = the PT of one COM「強い」 win, i.e. exactly the value submitted to the ranking
 * (ライフのPT×倍率 + コインPT). Losses / 普通 / PvP / tutorial never count.
 *
 * localStorage (NEW key, never rename; _bak copy; value never decreases):
 *   shootingOnline_bestStrongMatch / _bak   {v:1, pt, at, src:'server'|'local'}
 *
 * Seeding: once per session (app start / start of a 強い match) the player's own best on the ranking
 * server (年間「1試合最高」, this year + last year) is read (GET only) and merged (higher wins), so the
 * first match after this update — or on a new device — does not celebrate falsely. If the server could not be read, a win is
 * stored silently (no celebration); if the server answered “no record yet”, the first win is
 * celebrated as 「初記録！」.
 */
import { fetchRanking, rankIdentity, periodKeys } from './ranking.js?v=20261019030349';

export const BEST_STRONG_KEY = 'shootingOnline_bestStrongMatch';
const BAK = BEST_STRONG_KEY + '_bak';

function readKey(k) {
  try {
    const j = JSON.parse(localStorage.getItem(k) || 'null');
    const pt = j && Math.floor(Number(j.pt));
    return pt > 0 ? { pt, at: j.at || 0, src: j.src || '' } : null;
  } catch (_) { return null; }
}
/** Stored best (max of main + backup) or null. */
export function loadStrongBest() {
  const a = readKey(BEST_STRONG_KEY), b = readKey(BAK);
  if (a && b) return a.pt >= b.pt ? a : b;
  return a || b;
}
function saveStrongBest(pt, src) {
  pt = Math.floor(Number(pt) || 0);
  if (!(pt > 0)) return false;
  const cur = loadStrongBest();
  if (cur && cur.pt >= pt) return false; // never decreases
  const v = JSON.stringify({ v: 1, pt, at: Date.now(), src });
  try { localStorage.setItem(BEST_STRONG_KEY, v); localStorage.setItem(BAK, v); } catch (_) { return false; }
  return true;
}

let _seed = null; // Promise<{known:boolean}>
let _seedState = null; // resolved value
/** Read the pre-match best from the server once (only when nothing is stored locally). Never throws. */
export function seedStrongBest() {
  if (_seed) return _seed;
  if (_seedState && _seedState.known && _seedState.server) return Promise.resolve(_seedState); // once per session
  const me = rankIdentity();
  if (!me.id) { _seedState = { known: true, none: true }; return Promise.resolve(_seedState); } // never registered → no ranked win yet
  _seedState = null;
  const y = Number(periodKeys().year);
  _seed = Promise.all([String(y), String(y - 1)].map((k) => fetchRanking('year', 'best', k).catch(() => null)))
    .then((rs) => {
      const ok = rs.filter((r) => r && r.ok);
      if (!ok.length) { _seed = null; _seedState = { known: !!loadStrongBest() }; return _seedState; }
      const best = Math.max(0, ...ok.map((r) => (r.me && Number(r.me.score)) || 0));
      if (best > 0) saveStrongBest(best, 'server'); // merge: keeps the higher of local / server
      _seed = null; _seedState = { known: true, server: true };
      return _seedState;
    })
    .catch(() => { _seed = null; _seedState = { known: !!loadStrongBest() }; return _seedState; });
  return _seed;
}

/**
 * Call once per finished COM「強い」 WIN with the submitted PT (before/without waiting for the submit).
 * Resolves {improved, first, prev, pt} — improved=true → show 「記録更新！」.
 * Only the seed started BEFORE the match is used (a seed started now could already include this match).
 */
export async function recordStrongBest(pt) {
  pt = Math.floor(Number(pt) || 0);
  if (!(pt > 0)) return null;
  let s = _seedState;
  if (!s && _seed) s = await Promise.race([_seed, new Promise((r) => setTimeout(() => r({ known: false }), 3000))]);
  if (!s && loadStrongBest()) s = { known: true };
  const prev = loadStrongBest();
  if (prev) {
    if (pt > prev.pt) { saveStrongBest(pt, 'local'); return { improved: true, first: false, prev: prev.pt, pt }; }
    return { improved: false, first: false, prev: prev.pt, pt };
  }
  saveStrongBest(pt, 'local');
  return s && s.known ? { improved: true, first: true, prev: 0, pt } : { improved: false, first: false, prev: 0, pt, unknown: true };
}
