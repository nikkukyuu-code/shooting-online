/**
 * User 10-12 19:39: core close-range counterattack (every core type, player + COM fields, same rules).
 * Hitting a core from within COUNTER_RANGE × field width schedules ONE counter 1.0–2.0 s later; the last
 * COUNTER_TELE s the core glows in the pattern's colour (telegraph), then fires normal enemy bullets (dmg 1).
 * Cooldown: no new counter until the previous one has fully fired + COUNTER_CD s.
 * Each field is simulated by its owner and streamed (online), so Math.random is consistent with the
 * rest of the enemy randomness (which also uses Math.random on the owning client).
 */
import { spawnBullet, coreWorld, coreOwnerOf } from './entities.js?v=20261016024940';

export const COUNTER_RANGE = 1 / 3, COUNTER_DMIN = 1.0, COUNTER_DMAX = 2.0, COUNTER_TELE = 0.5, COUNTER_CD = 1.0;
/** id, colour, volleys [[delay s, fn]] */
export const COUNTER_PATTERNS = [
  { id: 'ring', col: '#ff4a4a' },     // radial ring, 14 shots, one gap aimed at the ship side
  { id: 'spread', col: '#ffa020' },   // aimed 3-way spread ×2
  { id: 'spiral', col: '#c060ff' },   // 3-arm rotating spiral, 5 volleys
  { id: 'pair', col: '#30e0ff' },     // aimed fast shot pair
  { id: 'shock', col: '#ffffff' },    // slow dense shockwave ring with a 3-shot gap toward the ship
];

function ownerOf(e) { return e && e._coreBall ? coreOwnerOf(e) : e; }

/** Call on a 'corehit' result. sx/sy = ship centre (field px). */
export function noteCoreHit(e, sx, sy, fw, now) {
  const H = ownerOf(e);
  if (!H || !H.core || H.core.hp <= 0 || H._ctr) return;
  if (now < (H._ctrReady || 0)) return;
  const c = coreWorld(H); if (!c) return;
  if (Math.hypot(c.x - sx, c.y - sy) > fw * COUNTER_RANGE) return;
  const p = Math.floor(Math.random() * COUNTER_PATTERNS.length);
  H._ctr = { p, t: COUNTER_DMIN + Math.random() * (COUNTER_DMAX - COUNTER_DMIN), v: 0, vt: 0, cx: c.x, cy: c.y };
}

const shot = (list, x, y, a, sp) => list.push(spawnBullet(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 'enemy', false, 1, { life: 4 }));

function volley(C, bullets, sx, sy) {
  const { cx, cy } = C, aim = Math.atan2(sy - cy, sx - cx);
  switch (COUNTER_PATTERNS[C.p].id) {
    case 'ring': { const n = 14; const off = Math.random() * 0.4;
      for (let i = 0; i < n; i++) { const a = aim + off + (i + 0.5) * Math.PI * 2 / n; shot(bullets, cx, cy, a, 150); } return 0; }
    case 'spread': for (const d of [-0.3, 0, 0.3]) shot(bullets, cx, cy, aim + d, 210); return C.v < 1 ? 0.35 : 0;
    case 'spiral': { const r0 = C.v * 0.38; for (let k = 0; k < 3; k++) shot(bullets, cx, cy, aim + r0 + k * Math.PI * 2 / 3, 165); return C.v < 4 ? 0.14 : 0; }
    case 'pair': shot(bullets, cx, cy, aim + (C.v ? 0.06 : -0.06), 300); return C.v < 1 ? 0.2 : 0;
    case 'shock': { const n = 28, g = Math.round(Math.random() * 2 - 1);
      for (let i = 0; i < n; i++) { const a = aim + i * Math.PI * 2 / n; if (Math.abs(((i + n / 2) % n) - n / 2 - g) <= 1) continue; shot(bullets, cx, cy, a, 105); } return 0; }
  }
  return 0;
}

/** Advance every pending counter of one field. */
export function tickCounters(enemies, bullets, sx, sy, dt, now, fw) {
  for (const H of enemies) {
    if (H._gdT > 0) H._gdT -= dt;
    if (H._ctrF && (H._ctrF.t -= dt) <= 0) H._ctrF = null;
    // User 10-15: approaching a core is enough — it keeps launching random strong attacks while the ship stays close
    if (!H._ctr && fw && H.kind !== 'wave_snake_head' && H.core && H.core.hp > 0 && H.hp > 0 && !H._portalOnly && now >= (H._ctrReady || 0)) {
      const c = coreWorld(H);
      if (c && Math.hypot(c.x - sx, c.y - sy) <= fw * COUNTER_RANGE) {
        H._ctr = { p: Math.floor(Math.random() * COUNTER_PATTERNS.length), t: COUNTER_DMIN + Math.random() * (COUNTER_DMAX - COUNTER_DMIN), v: 0, vt: 0, cx: c.x, cy: c.y };
      }
    }
    const C = H._ctr; if (!C) continue;
    if (H.hp <= 0 || !H.core || H.core.hp <= 0) { H._ctr = null; continue; }
    const c = coreWorld(H); if (c) { C.cx = c.x; C.cy = c.y; }
    C.t -= dt;
    if (C.t > 0) continue;
    C.vt -= dt;
    if (C.vt > 0) continue;
    const next = volley(C, bullets, sx, sy); C.v++;
    H._ctrF = { p: C.p, t: 0.3, x: C.cx, y: C.cy }; // muzzle burst at the core (render)
    if (next > 0) C.vt = next;
    else { H._ctr = null; H._ctrReady = now + COUNTER_CD + Math.random() * 1.0; }
  }
}
/** Telegraph state for render / snapshot: {p, q 0..1 charge, x, y} or null. */
export function counterTele(e) {
  const C = e && e._ctr; if (!C) return null;
  const q = C.t <= 0 ? 1 : Math.max(0, 1 - C.t / COUNTER_TELE);
  if (q <= 0) return null;
  return { p: C.p, q, x: C.cx, y: C.cy };
}
