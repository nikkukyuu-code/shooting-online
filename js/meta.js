/** Persist PT / owned unlocks / deck (exactly 5 unique). localStorage key: shootingOnline_meta */
import { CATALOG, CATALOG_BY_ID, STARTER_DECK } from './catalog.js?v=1.5.57';

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

  const ownedSet = new Set(STARTER_DECK);
  if (Array.isArray(raw.owned)) {
    for (const id of raw.owned) {
      if (CATALOG_BY_ID[id]) ownedSet.add(id);
    }
  }
  const owned = [...ownedSet];

  const rawDeck = Array.isArray(raw.deck) ? raw.deck : [];
  const deck = fillUniqueDeck(rawDeck, ownedSet);

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
 * COM win PT: remaining player HP (0–100 scale) added as integer PT.
 * Formula: PT += Math.floor(remainingPlayerHP)
 */
export function grantComVictoryPt(meta, remainingHp) {
  const gain = Math.max(0, Math.floor(Number(remainingHp) || 0));
  const next = { ...meta, pt: meta.pt + gain };
  return { meta: saveMeta(next), gain, total: next.pt };
}

export { CATALOG, CATALOG_BY_ID, STARTER_DECK };
