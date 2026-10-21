/**
 * 自己ベスト（COM「強い」1試合の最高PT）— 記録更新演出用.
 * The record = the PT of one COM「強い」 win, i.e. exactly the value submitted to the ranking
 * (ライフのPT×倍率 + コインPT). Losses / 普通 / PvP / tutorial never count.
 *
 * localStorage (NEW key, never rename; _bak copy; value never decreases):
 *   shootingOnline_bestStrongMatch / _bak   {v:1, pt, at, src:'server'|'local'}
 *
 * The effect fires ONLY when a match beats the ALL-TIME best (user 10-19「過去最高ptのみ」):
 *   all-time base = max( local key (+_bak),
 *                        the player's own 年間「1試合最高」 for EVERY year since the ranking began
 *                        (RANK_FIRST_YEAR = 2026 … this year; GET only — the Worker has no all-time board) )
 * Seeding runs once per session (app start / start of a 強い match). The base counts as KNOWN only
 * when every year was read OK (or the player never registered → no server record can exist).
 * Unknown base (offline / partial read) → wins are saved silently, no effect.
 * No previous record (base 0) → the first win is saved silently (no 「初記録！」).
 */
import { fetchRanking, rankIdentity, periodKeys } from './ranking.js?v=20261021192537';

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

const RANK_FIRST_YEAR = 2026; // ranking server started 2026-10 → no older yearly boards exist

let _seed = null; // Promise<{known:boolean}>
let _seedState = null; // resolved value
/** Read the player's all-time best from the server once per session (all yearly boards). Never throws. */
export function seedStrongBest() {
  if (_seed) return _seed;
  if (_seedState && _seedState.known) return Promise.resolve(_seedState); // once per session
  const me = rankIdentity();
  if (!me.id) { _seedState = { known: true, none: true }; return Promise.resolve(_seedState); } // never registered → no server record
  _seedState = null;
  const y = Math.max(RANK_FIRST_YEAR, Number(periodKeys().year));
  const years = []; for (let k = RANK_FIRST_YEAR; k <= y; k++) years.push(String(k));
  const fail = () => { _seed = null; _seedState = { known: false }; return _seedState; };
  _seed = Promise.all(years.map((k) => fetchRanking('year', 'best', k).catch(() => null)))
    .then((rs) => {
      if (!rs.every((r) => r && r.ok)) return fail(); // any year unreadable → the all-time base is unknown
      const best = Math.max(0, ...rs.map((r) => (r.me && Number(r.me.score)) || 0));
      if (best > 0) saveStrongBest(best, 'server'); // merge: keeps the higher of local / server
      _seed = null; _seedState = { known: true, server: true };
      return _seedState;
    })
    .catch(fail);
  return _seed;
}

/**
 * All-time base for the mid-match 「記録更新中！」 check:
 *   undefined = still loading, null = unknown (stay silent), number = best PT (0 = no record → silent).
 */
export function strongBestBase() {
  if (!_seedState) return _seed ? undefined : null;
  if (!_seedState.known) return null;
  const b = loadStrongBest();
  return b ? b.pt : 0;
}

/**
 * Call once per finished COM「強い」 WIN with the submitted PT (before/without waiting for the submit).
 * Resolves {improved, prev, pt} — improved=true → show 「記録更新！」 (only above a known all-time best).
 * Only the seed started BEFORE the match is used (a seed started now could already include this match).
 */
export async function recordStrongBest(pt) {
  pt = Math.floor(Number(pt) || 0);
  if (!(pt > 0)) return null;
  let s = _seedState;
  if (!s && _seed) s = await Promise.race([_seed, new Promise((r) => setTimeout(() => r({ known: false }), 3000))]);
  const known = !!(s && s.known);
  const prev = loadStrongBest();
  if (prev && pt <= prev.pt) return { improved: false, first: false, prev: prev.pt, pt };
  saveStrongBest(pt, 'local'); // always keep the local best up to date (never decreases)
  if (!prev) return { improved: false, first: true, prev: 0, pt, silent: true }; // no previous record → silent
  return known ? { improved: true, first: false, prev: prev.pt, pt } : { improved: false, first: false, prev: prev.pt, pt, unknown: true };
}
