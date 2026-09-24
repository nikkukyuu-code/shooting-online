/** Persist PT / owned unlocks / deck (exactly 5). localStorage key: shootingOnline_meta */
import { CATALOG, CATALOG_BY_ID, STARTER_DECK } from './catalog.js?v=1.5.50';

export const META_KEY = 'shootingOnline_meta';
export const DECK_SIZE = 5;

/** Fixed COM AI deck (mid-tier) — fair, not using player unlocks. */
export const COM_DECK = ['mech', 'golem', 'missile_cruiser', 'emp_disruptor', 'gorgon_mech'];

function defaultMeta() {
  return {
    pt: 0,
    owned: [...STARTER_DECK],
    deck: [...STARTER_DECK],
  };
}

function sanitize(raw) {
  const base = defaultMeta();
  if (!raw || typeof raw !== 'object') return base;
  let pt = Number(raw.pt);
  if (!Number.isFinite(pt) || pt < 0) pt = 0;
  pt = Math.floor(pt);

  const ownedSet = new Set(STARTER_DECK);
  if (Array.isArray(raw.owned)) {
    for (const id of raw.owned) {
      if (CATALOG_BY_ID[id]) ownedSet.add(id);
    }
  }
  const owned = [...ownedSet];

  let deck = Array.isArray(raw.deck) ? raw.deck.filter((id) => ownedSet.has(id) && CATALOG_BY_ID[id]) : [];
  // Fill / trim to exactly 5
  for (const id of STARTER_DECK) {
    if (deck.length >= DECK_SIZE) break;
    if (!deck.includes(id)) deck.push(id);
  }
  for (const id of owned) {
    if (deck.length >= DECK_SIZE) break;
    if (!deck.includes(id)) deck.push(id);
  }
  deck = deck.slice(0, DECK_SIZE);
  while (deck.length < DECK_SIZE) deck.push(STARTER_DECK[deck.length % STARTER_DECK.length]);

  return { pt, owned, deck };
}

export function loadMeta() {
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY) || 'null');
    return sanitize(raw);
  } catch (_) {
    return defaultMeta();
  }
}

export function saveMeta(meta) {
  const clean = sanitize(meta);
  try {
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
  return { ok: true, meta: saveMeta(next), reason: 'bought' };
}

/** Replace deck slot (0..4) with an owned unit id. Always length === 5. */
export function setDeckSlot(meta, slot, unitId) {
  if (slot < 0 || slot >= DECK_SIZE) return { ok: false, meta, reason: 'slot' };
  if (!meta.owned.includes(unitId) || !CATALOG_BY_ID[unitId]) {
    return { ok: false, meta, reason: 'unowned' };
  }
  const deck = meta.deck.slice(0, DECK_SIZE);
  while (deck.length < DECK_SIZE) deck.push(STARTER_DECK[deck.length]);
  deck[slot] = unitId;
  const next = { ...meta, deck };
  return { ok: true, meta: saveMeta(next), reason: 'set' };
}

/**
 * COM win PT: remaining player HP (0–100 scale) added as integer PT.
 * Formula: PT += Math.floor(remainingPlayerHP)
 */
export function grantComVictoryPt(meta, remainingHp) {
  const gain = Math.max(0, Math.floor(Number(remainingHp) || 0));
  const next = { ...meta, pt: meta.pt + gain };
  return { meta: saveMeta(next), gain, total: next.pt };
}

export { CATALOG, CATALOG_BY_ID, STARTER_DECK };
