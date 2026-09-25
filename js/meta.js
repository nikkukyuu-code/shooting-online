/** Persist PT / owned unlocks / deck (exactly 5 unique).
 * localStorage key: shootingOnline_meta (NEVER rename — would wipe player PT).
 * Backup key: shootingOnline_meta_bak. On every update, preserve pt; never clear storage.
 */
import { CATALOG, CATALOG_BY_ID, STARTER_DECK, LEGACY_ID_MAP } from './catalog.js?v=20260926001553';

export const META_KEY = 'shootingOnline_meta';
export const DECK_SIZE = 5;

/** Fixed COM AI deck (mid-tier) — fair, not using player unlocks. */
export const COM_DECK = ['mech', 'golem', 'missile_destroyer', 'siege_mech', 'gorgon_mech'];

/* ---------------------------------------------------------------------------
 * COM deck matched to the player's deck strength (v1.5.65)
 * ------------------------------------------------------------------------- */

/** Free starters have price 0 → give them a pseudo price so they still count. */
const STARTER_POWER = { swarm: 20, basic: 25, drone: 25, elite: 30, tank: 30, mech: 35, golem: 40, boss: 45 };
/** Small bonus by tier (heavier tiers have more HP / stronger attacks). */
const TIER_BONUS = { swarm: 0, basic: 0, drone: 0, elite: 5, tank: 10, mech: 10, golem: 15, boss: 20 };

/** Strength of one unit: price (or starter pseudo price) + tier bonus. */
export function unitPower(id) {
  const u = CATALOG_BY_ID[id];
  if (!u) return 0;
  const tier = u.tier || 'basic';
  const base = u.price > 0 ? u.price : (STARTER_POWER[tier] || 25);
  return base + (TIER_BONUS[tier] || 0);
}

/** Deck strength score = sum of unit powers. */
export function deckPower(deck) {
  let s = 0;
  for (const id of deck || []) s += unitPower(id);
  return s;
}

/** Units the COM may use: catalog units with sprites, never wave_* kinds. */
function comPool() {
  return CATALOG
    .filter((u) => u && typeof u.id === 'string' && !u.id.startsWith('wave_'))
    .map((u) => ({ id: u.id, p: unitPower(u.id) }))
    .filter((u) => u.p > 0)
    .sort((a, b) => a.p - b.p);
}

const COM_POOL = comPool();
const POOL_MIN = COM_POOL.slice(0, DECK_SIZE).reduce((s, u) => s + u.p, 0);
const POOL_MAX = COM_POOL.slice(-DECK_SIZE).reduce((s, u) => s + u.p, 0);

/** 1 (starter level) … 10 (top-tier) from a deck strength score. */
export function deckLevel(score) {
  if (!(POOL_MAX > POOL_MIN)) return 1;
  const t = (score - POOL_MIN) / (POOL_MAX - POOL_MIN);
  return Math.max(1, Math.min(10, 1 + Math.round(9 * t)));
}

function isValidComDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== DECK_SIZE) return false;
  if (new Set(deck).size !== DECK_SIZE) return false;
  return deck.every((id) => CATALOG_BY_ID[id] && !String(id).startsWith('wave_'));
}

/**
 * Build a COM deck of 5 unique units whose strength is ~100–115% of the
 * player's deck (clamped to what the catalog can reach). Randomized per call.
 * Falls back to COM_DECK if anything goes wrong.
 * @returns {{ deck: string[], score: number, playerScore: number, level: number }}
 */
export function buildComDeck(playerDeck, rng = Math.random) {
  const fallback = () => {
    const d = COM_DECK.slice();
    return { deck: d, score: deckPower(d), playerScore: deckPower(playerDeck), level: deckLevel(deckPower(d)) };
  };
  try {
    const pool = COM_POOL;
    if (pool.length < DECK_SIZE) return fallback();
    const P = Math.max(POOL_MIN, deckPower(playerDeck));
    let hi = Math.min(P * 1.15, POOL_MAX);
    let lo = Math.min(P * 1.0, POOL_MAX * 0.97);
    if (lo > hi) lo = hi * 0.95;
    const playerKey = [...new Set(playerDeck || [])].sort().join(',');
    const sum = (d) => d.reduce((s, x) => s + x.p, 0);
    const inBand = (s) => s >= lo && s <= hi;
    let best = null;
    let bestCost = Infinity;

    for (let attempt = 0; attempt < 60; attempt++) {
      const target = lo + (hi - lo) * (0.15 + 0.85 * rng());
      const deck = [];
      const used = new Set();
      // Randomized greedy: each slot picks a unit near the remaining average.
      for (let i = 0; i < DECK_SIZE; i++) {
        const k = DECK_SIZE - i;
        const avg = (target - sum(deck)) / k;
        const win = Math.max(15, avg * 0.4);
        let cands = pool.filter((u) => !used.has(u.id) && Math.abs(u.p - avg) <= win);
        if (!cands.length) {
          const rest = pool.filter((u) => !used.has(u.id));
          rest.sort((a, b) => Math.abs(a.p - avg) - Math.abs(b.p - avg));
          cands = rest.slice(0, 3);
        }
        const pick = cands[Math.floor(rng() * cands.length) % cands.length];
        deck.push(pick);
        used.add(pick.id);
      }
      // Repair: swap units toward the target until inside the band.
      for (let it = 0; it < 12 && !inBand(sum(deck)); it++) {
        const cur = sum(deck);
        let bestSwap = null;
        let bestDist = Math.abs(cur - target);
        for (let i = 0; i < deck.length; i++) {
          for (const u of pool) {
            if (used.has(u.id)) continue;
            const d = Math.abs(cur - deck[i].p + u.p - target);
            if (d < bestDist) { bestDist = d; bestSwap = [i, u]; }
          }
        }
        if (!bestSwap) break;
        const [i, u] = bestSwap;
        used.delete(deck[i].id);
        deck[i] = u;
        used.add(u.id);
      }
      const s = sum(deck);
      const same = deck.map((x) => x.id).sort().join(',') === playerKey;
      const bandDist = s < lo ? lo - s : s > hi ? s - hi : 0;
      const cost = bandDist * 10 + (same ? 5 : 0);
      if (cost < bestCost) { bestCost = cost; best = deck.slice(); }
      if (cost === 0) break;
    }
    if (!best) return fallback();
    // Shuffle order so the send rotation varies too.
    const ids = best.map((x) => x.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    if (!isValidComDeck(ids)) return fallback();
    const score = deckPower(ids);
    return { deck: ids, score, playerScore: P, level: deckLevel(score) };
  } catch (_) {
    return fallback();
  }
}

function defaultMeta() {
  return {
    pt: 0,
    owned: [...STARTER_DECK],
    deck: [...STARTER_DECK],
  };
}

/** Fill deck to DECK_SIZE with unique owned ids (starters first). */
function fillUniqueDeck(deck, ownedSet) {
  const out = [];
  const seen = new Set();
  for (const id of deck) {
    if (out.length >= DECK_SIZE) break;
    if (!id || seen.has(id)) continue;
    if (!ownedSet.has(id) || !CATALOG_BY_ID[id]) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of STARTER_DECK) {
    if (out.length >= DECK_SIZE) break;
    if (seen.has(id)) continue;
    if (!ownedSet.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of ownedSet) {
    if (out.length >= DECK_SIZE) break;
    if (seen.has(id) || !CATALOG_BY_ID[id]) continue;
    seen.add(id);
    out.push(id);
  }
  // Last resort: cycle unique starters (always 5 distinct)
  let i = 0;
  while (out.length < DECK_SIZE && i < STARTER_DECK.length * 2) {
    const id = STARTER_DECK[i % STARTER_DECK.length];
    i++;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.slice(0, DECK_SIZE);
}

function sanitize(raw) {
  const base = defaultMeta();
  if (!raw || typeof raw !== 'object') return base;
  let pt = Number(raw.pt);
  if (!Number.isFinite(pt) || pt < 0) pt = 0;
  pt = Math.floor(pt);

  const migrate = (id) => (CATALOG_BY_ID[id] ? id : (LEGACY_ID_MAP[id] || id));
  const ownedSet = new Set(STARTER_DECK);
  if (Array.isArray(raw.owned)) {
    for (const rid of raw.owned) {
      const id = migrate(rid);
      if (CATALOG_BY_ID[id]) ownedSet.add(id);
    }
  }
  const owned = [...ownedSet];

  const rawDeck = Array.isArray(raw.deck) ? raw.deck.map(migrate) : [];
  const deck = fillUniqueDeck(rawDeck, ownedSet);

  return { pt, owned, deck };
}

const META_BAK_KEY = META_KEY + '_bak';

/** Read raw JSON from a storage key; null if missing/corrupt. Never throws. */
function readRawMeta(key) {
  try {
    const s = localStorage.getItem(key);
    if (!s) return null;
    const raw = JSON.parse(s);
    return raw && typeof raw === 'object' ? raw : null;
  } catch (_) {
    return null;
  }
}

/**
 * Load PT / owned / deck. Prefer primary key, then backup.
 * Never writes on load — corrupt reads must not wipe saved PT.
 */
export function loadMeta() {
  const raw = readRawMeta(META_KEY) || readRawMeta(META_BAK_KEY);
  if (!raw) return defaultMeta();
  return sanitize(raw);
}

/**
 * Persist meta. PT safety:
 * - Never change META_KEY (players would lose PT).
 * - Keep a backup of the previous good blob.
 * - Refuse accidental PT decreases unless opts.allowPtDecrease (shop buy only).
 * Updates / migrations must only ADD fields or migrate IDs — never reset pt.
 */
export function saveMeta(meta, opts = {}) {
  const clean = sanitize(meta);
  try {
    const prevRaw = localStorage.getItem(META_KEY);
    if (prevRaw) {
      try {
        const prev = JSON.parse(prevRaw);
        const prevPt = Math.floor(Number(prev && prev.pt));
        if (Number.isFinite(prevPt) && prevPt >= 0 && prevPt > clean.pt && !opts.allowPtDecrease) {
          // Guard: code bug / bad sanitize must not erase earned PT
          clean.pt = prevPt;
        }
      } catch (_) { /* ignore corrupt prev; still backup string below */ }
      try { localStorage.setItem(META_BAK_KEY, prevRaw); } catch (_) { /* ignore */ }
    }
    localStorage.setItem(META_KEY, JSON.stringify(clean));
  } catch (_) { /* quota / private mode */ }
  return clean;
}

export function getUnit(id) {
  return CATALOG_BY_ID[id] || null;
}

export function isOwned(meta, id) {
  return meta.owned.includes(id);
}

/** Buy unit if PT enough and not owned. Returns { ok, meta, reason } */
export function buyUnit(meta, id) {
  const u = CATALOG_BY_ID[id];
  if (!u) return { ok: false, meta, reason: 'unknown' };
  if (meta.owned.includes(id)) return { ok: false, meta, reason: 'owned' };
  if (meta.pt < u.price) return { ok: false, meta, reason: 'pt' };
  const next = {
    ...meta,
    pt: meta.pt - u.price,
    owned: [...meta.owned, id],
    deck: [...meta.deck],
  };
  return { ok: true, meta: saveMeta(next, { allowPtDecrease: true }), reason: 'bought' };
}

/**
 * Replace deck slot (0..4) with an owned unit id.
 * Unique rule: same unit cannot occupy two slots.
 * If unitId is already in another slot → auto-swap with that slot.
 * Always length === 5 after save.
 * Returns { ok, meta, reason: 'set'|'swap'|'same'|'slot'|'unowned', swappedFrom? }
 */
export function setDeckSlot(meta, slot, unitId) {
  if (slot < 0 || slot >= DECK_SIZE) return { ok: false, meta, reason: 'slot' };
  if (!meta.owned.includes(unitId) || !CATALOG_BY_ID[unitId]) {
    return { ok: false, meta, reason: 'unowned' };
  }
  const deck = fillUniqueDeck(meta.deck.slice(0, DECK_SIZE), new Set(meta.owned));
  const existing = deck.indexOf(unitId);
  if (existing === slot) {
    return { ok: true, meta, reason: 'same' };
  }
  if (existing >= 0) {
    const prev = deck[slot];
    deck[slot] = unitId;
    deck[existing] = prev;
    const next = { ...meta, deck };
    return { ok: true, meta: saveMeta(next), reason: 'swap', swappedFrom: existing };
  }
  deck[slot] = unitId;
  const next = { ...meta, deck };
  return { ok: true, meta: saveMeta(next), reason: 'set' };
}

/**
 * COM win PT: remaining player HP already scaled to 0–100 by caller, added as integer PT.
 * Formula: PT += Math.floor(scaledRemainingHP)
 */
export function grantComVictoryPt(meta, remainingHp) {
  const gain = Math.max(0, Math.floor(Number(remainingHp) || 0));
  const next = { ...meta, pt: meta.pt + gain };
  return { meta: saveMeta(next), gain, total: next.pt };
}

export { CATALOG, CATALOG_BY_ID, STARTER_DECK };
