/** Persist PT / owned unlocks / deck (exactly 5 unique).
 * localStorage key: shootingOnline_meta (NEVER rename — would wipe player PT).
 * Backup key: shootingOnline_meta_bak. On every update, preserve pt; never clear storage.
 */
import { CATALOG, CATALOG_BY_ID, STARTER_DECK, LEGACY_ID_MAP, SEND_GROUPS, unitStats, unitAttackLoadout } from './catalog.js?v=20260928160151';

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

/* ---------------------------------------------------------------------------
 * COM deck builder (v2: coverage + counter-picking)
 *
 * 1) Coverage: always ≥1 unit of each send class (same groups as the send picker, catalog.js
 *    SEND_GROUPS): 戦艦級 mech / 要塞級 golem+boss / ガンシップ級 tank / 小型機 drone+swarm.
 *    The 5th slot is free (counter slot).
 * 2) Counter-picking from the player's class mix:
 *      small share = player units in basic/swarm/drone/elite tiers.
 *      ≥60% small  → 'large'    「対策：大型重視」: favor high 防御力 (HP) + wide/area attackers,
 *                                 free slot prefers large tiers.
 *      ≤40% small  → 'fire'     「対策：火力重視」: favor high 攻撃力 + fast fire + aimed/focused
 *                                 attackers, free slot also likes small fast units.
 *      otherwise   → 'balanced' 「対策：バランス」: favor 攻撃力+防御力 evenly.
 *    Scores are normalized 0..1 inside each class so every class slot can express the counter.
 * 3) Strength: sum of unitPower within the difficulty band of the player's deck power
 *      強い 60–85%, 普通 48–72%  (coverage wins: cheap player decks overshoot with the cheapest
 *      units of each required class).
 * 4) Variety: 120 randomized attempts; prefers units not in the previous COM deck; picks at random
 *    among the best candidates.
 * ------------------------------------------------------------------------- */
const SMALL_TIERS = new Set(['basic', 'swarm', 'drone', 'elite']);
const AREA_PATTERNS = new Set(['spread3', 'fan5', 'ring', 'spiral', 'split', 'mine', 'sweep', 'trilaser', 'salvo', 'wave', 'bigorb', 'boomerang']);
const FOCUS_PATTERNS = new Set(['aimed', 'burst', 'stream', 'twinlaser', 'longlaser', 'laser', 'pulse', 'missile', 'twin', 'single']);
export const COM_COVER_CLASSES = ['send_mech', 'send_golem', 'send_tank', 'send_drone'];
export const COUNTER_LABEL = { large: '対策:大型', fire: '対策:火力', balanced: '対策:均衡' };

function unitTraits(id) {
  const u = CATALOG_BY_ID[id];
  const st = unitStats(id) || { atk: 0, def: 0 };
  const lo = unitAttackLoadout(id, u && u.tier) || { seq: [] };
  const seq = lo.seq || [];
  const n = seq.length || 1;
  const area = seq.filter(([p]) => AREA_PATTERNS.has(p)).length / n;
  const focus = seq.filter(([p]) => FOCUS_PATTERNS.has(p)).length / n;
  const rate = (lo.per || 1) / (lo.iv || 1.5);
  return { atk: st.atk, def: st.def, area, focus, rate, small: SMALL_TIERS.has(u && u.tier) };
}

/** Player class mix → counter mode. */
export function comCounterMode(playerDeck) {
  const d = (playerDeck || []).filter((id) => CATALOG_BY_ID[id]);
  if (!d.length) return 'balanced';
  const small = d.filter((id) => SMALL_TIERS.has(CATALOG_BY_ID[id].tier)).length / d.length;
  if (small >= 0.6) return 'large';
  if (small <= 0.4) return 'fire';
  return 'balanced';
}

function classOf(id) {
  const t = CATALOG_BY_ID[id] && CATALOG_BY_ID[id].tier;
  for (const c of COM_COVER_CLASSES) if (SEND_GROUPS[c].includes(t)) return c;
  return null;
}

/** Per-unit counter score 0..1 (normalized within its group). */
function counterScores(units, mode) {
  const tr = units.map((u) => unitTraits(u.id));
  const norm = (arr) => {
    const mn = Math.min(...arr), mx = Math.max(...arr);
    return arr.map((v) => (mx > mn ? (v - mn) / (mx - mn) : 0.5));
  };
  const A = norm(tr.map((t) => t.atk));
  const D = norm(tr.map((t) => t.def));
  const R = norm(tr.map((t) => t.rate));
  return tr.map((t, i) => {
    if (mode === 'large') return 0.55 * D[i] + 0.45 * t.area;
    if (mode === 'fire') return 0.5 * A[i] + 0.3 * R[i] + 0.2 * t.focus;
    return 0.5 * A[i] + 0.5 * D[i];
  });
}

const CLASS_POOLS = (() => {
  const out = {};
  for (const c of COM_COVER_CLASSES) out[c] = COM_POOL.filter((u) => classOf(u.id) === c);
  return out;
})();

/**
 * Build the COM deck. Strength target: difficulty band of the player's deck power
 * (強い 60–85%, 普通 48–72%), with send-class coverage and counter-picking (see above).
 * @returns {{ deck: string[], score: number, playerScore: number, level: number, counter: string, over: number }}
 */
export function buildComDeck(playerDeck, rng = Math.random, opts = {}) {
  const fallback = () => {
    const d = COM_DECK.slice();
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return { deck: d, score: deckPower(d), playerScore: deckPower(playerDeck), level: deckLevel(deckPower(d)), counter: 'balanced', over: 0 };
  };
  try {
    if (COM_POOL.length < DECK_SIZE || COM_COVER_CLASSES.some((c) => !CLASS_POOLS[c].length)) return fallback();
    const P = Math.max(POOL_MIN, deckPower(playerDeck));
    const diff = (opts && opts.difficulty) || 'strong';
    const hiMul = diff === 'normal' ? 0.72 : 0.85;
    const loMul = diff === 'normal' ? 0.48 : 0.60;
    let hi = Math.min(P * hiMul, POOL_MAX);
    let lo = Math.min(P * loMul, POOL_MAX * 0.85);
    if (lo > hi) lo = hi * 0.9;
    const mode = comCounterMode(playerDeck);
    const avoid = new Set((opts && opts.avoid) || []);
    const playerKey = [...new Set(playerDeck || [])].sort().join(',');

    // Counter score per unit: inside each class, and over the whole pool for the free slot
    const score = new Map();
    for (const c of COM_COVER_CLASSES) {
      const sc = counterScores(CLASS_POOLS[c], mode);
      CLASS_POOLS[c].forEach((u, i) => score.set(u.id, sc[i]));
    }
    const freeScore = new Map();
    const fsc = counterScores(COM_POOL, mode);
    COM_POOL.forEach((u, i) => {
      const t = unitTraits(u.id);
      let v = fsc[i];
      if (mode === 'large' && !t.small) v += 0.35; // free slot: prefer large vs small-heavy decks
      if (mode === 'fire' && t.small) v += 0.15;   // …and small fast units vs large-heavy decks
      freeScore.set(u.id, v);
    });

    const slots = [...COM_COVER_CLASSES, 'free'];
    const poolFor = (slot) => (slot === 'free' ? COM_POOL : CLASS_POOLS[slot]);
    const scoreFor = (slot, id) => (slot === 'free' ? freeScore.get(id) : score.get(id)) || 0;
    const sumP = (d) => d.reduce((s, u) => s + u.p, 0);
    const bandDist = (s) => (s < lo ? lo - s : s > hi ? s - hi : 0);
    const candidates = [];

    for (let attempt = 0; attempt < 120; attempt++) {
      const target = lo + (hi - lo) * rng();
      const deck = new Array(slots.length);
      const used = new Set();
      // Fill class slots in random order, free slot last
      const order = COM_COVER_CLASSES.slice().sort(() => rng() - 0.5).concat(['free']);
      let filled = 0;
      for (const slot of order) {
        const si = slots.indexOf(slot);
        const remain = slots.length - filled;
        const cur = deck.reduce((s, u) => s + (u ? u.p : 0), 0);
        const avg = (target - cur) / remain;
        let cands = poolFor(slot).filter((u) => !used.has(u.id));
        const fresh = cands.filter((u) => !avoid.has(u.id));
        if (fresh.length >= 2) cands = fresh;
        // weight: closeness to the per-slot budget × counter preference
        const ws = cands.map((u) => {
          const close = Math.exp(-Math.abs(u.p - avg) / Math.max(25, avg * 0.5));
          return close * Math.exp(2.2 * scoreFor(slot, u.id));
        });
        const tot = ws.reduce((a, b) => a + b, 0);
        let r = rng() * tot, pick = cands[cands.length - 1];
        for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) { pick = cands[i]; break; } }
        deck[si] = pick;
        used.add(pick.id);
        filled++;
      }
      // Pull into the band by swapping within each slot's pool (coverage preserved)
      for (let it = 0; it < 16 && bandDist(sumP(deck)) > 0; it++) {
        const cur = sumP(deck);
        let best = null, bestD = bandDist(cur), bestS = -1e9;
        for (let i = 0; i < slots.length; i++) {
          for (const u of poolFor(slots[i])) {
            if (used.has(u.id)) continue;
            const ns = cur - deck[i].p + u.p;
            const d = bandDist(ns);
            const sc = scoreFor(slots[i], u.id);
            if (d < bestD - 1e-9 || (Math.abs(d - bestD) < 1e-9 && d < bandDist(cur) && sc > bestS)) {
              best = [i, u]; bestD = d; bestS = sc;
            }
          }
        }
        if (!best) break;
        const [i, u] = best;
        used.delete(deck[i].id);
        deck[i] = u;
        used.add(u.id);
      }
      const ids = deck.map((u) => u.id);
      const s = sumP(deck);
      const same = [...ids].sort().join(',') === playerKey;
      const ov = ids.reduce((n, id) => n + (avoid.has(id) ? 1 : 0), 0);
      const cs = slots.reduce((a, slot, i) => a + scoreFor(slot, ids[i]), 0);
      const cost = bandDist(s) * 20 + (same ? 8 : 0) + ov * 3 - cs * 12;
      candidates.push({ ids, cost, s });
    }
    if (!candidates.length) return fallback();
    candidates.sort((a, b) => a.cost - b.cost);
    const top = candidates.slice(0, Math.max(8, Math.ceil(candidates.length * 0.25)));
    const diverse = top.filter((c) => c.ids.reduce((n, id) => n + (avoid.has(id) ? 1 : 0), 0) <= 2);
    const pickFrom = diverse.length ? diverse : top;
    const chosen = pickFrom[Math.floor(rng() * pickFrom.length) % pickFrom.length];
    const ids = chosen.ids.slice();
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    if (!isValidComDeck(ids)) return fallback();
    const sc = deckPower(ids);
    return { deck: ids, score: sc, playerScore: P, level: deckLevel(sc), counter: mode, over: Math.max(0, sc - hi) };
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
  const saved = saveMeta(next, { allowPtDecrease: true });
  markUnitNew(id);
  return { ok: true, meta: saved, reason: 'bought' };
}

/* ---------------------------------------------------------------------------
 * 「NEW」 marks for freshly purchased units.
 * Separate key (shootingOnline_newUnits) — never touches shootingOnline_meta / _bak.
 * Rule: set on purchase; cleared when the unit's card is tapped in the deck screen
 * (tap = equip into the selected slot), i.e. once the player has seen & used it.
 * ------------------------------------------------------------------------- */
export const NEW_UNITS_KEY = 'shootingOnline_newUnits';

/** Set of unit ids currently marked NEW (only catalog ids). Never throws. */
export function loadNewUnits() {
  try {
    const raw = JSON.parse(localStorage.getItem(NEW_UNITS_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === 'string' && CATALOG_BY_ID[id]) : []);
  } catch (_) {
    return new Set();
  }
}

function saveNewUnits(set) {
  try { localStorage.setItem(NEW_UNITS_KEY, JSON.stringify([...set])); } catch (_) { /* ignore */ }
}

export function markUnitNew(id) {
  if (!CATALOG_BY_ID[id]) return;
  const s = loadNewUnits();
  if (s.has(id)) return;
  s.add(id);
  saveNewUnits(s);
}

/** Clear NEW for a unit. Returns true if it was marked. */
export function clearUnitNew(id) {
  const s = loadNewUnits();
  if (!s.delete(id)) return false;
  saveNewUnits(s);
  return true;
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
/** COM win PT. remainingHp is already 0–100. mult=1 for 普通, mult=3 for 強い. */
export function grantComVictoryPt(meta, remainingHp, opts = {}) {
  const mult = Math.max(1, Number(opts.mult) || 1);
  const base = Math.max(0, Math.floor(Number(remainingHp) || 0));
  const gain = Math.max(0, Math.floor(base * mult));
  const next = { ...meta, pt: meta.pt + gain };
  return { meta: saveMeta(next), gain, total: next.pt, base, mult };
}

export const COM_DIFFICULTY = {
  normal: {
    id: 'normal',
    label: '普通',
    ptMult: 1,
    note: 'やや弱いCOM・勝利PTはこれまで通り',
  },
  strong: {
    id: 'strong',
    label: '強い',
    ptMult: 3,
    note: 'これまでの強さ・勝利PTは3倍',
  },
};

export { CATALOG, CATALOG_BY_ID, STARTER_DECK };
