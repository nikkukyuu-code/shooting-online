/**
 * Scripted wave director — recreation of スタートリックオンライン (2011) battle flow, compressed
 * into the 5-minute match, with livelier motion than the original. Wave-only kinds (never shop /
 * deck / PT / transfer). Both fields run the SAME script on their own clock (player: S.time,
 * COM: B.time) — same rules. Borrowed user art (e.spr) is visual only.
 *
 * Motion vocabulary (all telegraphed / readable on 360×640):
 *   plan steps  bezier arcs (edge / behind entries), hold (+ warn blink), dive at the player's row
 *               then peel away, stop-and-shoot then dash, straight/sine exits
 *   form        group formations whose centre follows a path while the shape morphs
 *               (row → V → rotating circle, column → split → re-merge, box ↔ circle round a core)
 *   snake       sharp weave with speed surges (segments follow the head's exact path)
 *   zig / drift zig-zag lines, bobbing mines
 *   boss        tri boss (fan / 3-burst / twin laser), eye boss (core laser when open + 3-way),
 *               jet boss (laser sweep → dash → spiral)
 *
 *  0:02 W1  mechs arc in from the edges, stop-and-shoot walkers, zig-zag darts, split cluster
 *  0:14 W2  morphing wedge formation, swoopers, behind-entry arc, split grid, core grids (box ↔ ring)
 *  0:40     triangular core boss + escort pack (core groups linger: cages / rings ~12 s, bosses ~30 s)
 *  0:37 W3  spiders on arcs / sines, stop-and-shoot gunships
 *  0:53 W4  rotating rings (pods tighten + spin up)
 *  1:04     midboss: giant red eye (figure-8, claws speed up at low core HP)
 *  1:26     boss: segmented snake (sharp weave, speed surges; head = core → body chain)
 *  1:48     mixed reprise
 *  2:11     trap zone: bobbing mines + caterpillars + snake returns
 *  3:40 R2  loopers, jet boss (sweep / dash / spiral), saucer circles
 */
import { spawnEnemy, spawnCoreEscorts, spawnBullet, GUARD_HP } from './entities.js?v=20261005170929';

/** Global fire-rate tune for scripted units (cooldowns × this; < 1 = denser). */
const FIRE_CD_MUL = 0.6;
const SCROLL = 55; // px/s — trap mines drift at background scroll speed
const rnd = (a, b) => a + Math.random() * (b - a);

// User 10-04: regular scripted enemies had become too soft (2–9 HP vs. 4–18 for the tier enemies).
// Non-core, non-attached units get ×1.8 (≈ the v1.5.72 toughness the tier table still has).
export const WAVE_HP_MUL = 1.0; // 10-04c: user asked normal enemies softer again (back to the pre-10-04 values)
function mk(kind, fw, fh, x, y, o = {}) {
  const e = spawnEnemy(fw, fh, kind);
  e.x = x; e.y = y;
  Object.assign(e, o);
  if (o.hp != null && !o._chainOf && !e.core && o.hp < 50) e.hp = Math.round(o.hp * WAVE_HP_MUL);
  if (o.hp != null) e.maxHp = e.hp;
  e.mvT = 0;
  e.y0 = e.y; e.x0 = e.x;
  return e;
}
const vx = (fw, T) => (fw + 80) / T; // speed that crosses the pane in ~T s

// ---------- bezier ----------
function bz(p, u) {
  const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
  return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]];
}
const B = (p0, p1, p2, p3, d) => ({ k: 'bez', p: [p0, p1, p2, p3], d });

// ---------- unit templates ----------
const T = {
  mech: (o) => ({ w: 40, h: 48, hp: 4, score: 10, ...o }),
  wedge: (o) => ({ w: 38, h: 28, hp: 3, score: 10, fire: aimed(2.4, 140), ...o }),
  dart: (o) => ({ spr: 'drone', w: 34, h: 30, hp: 2, score: 8, face: true, fire: aimed(2.8, 145), ...o }),
  swooper: (o) => ({ spr: 'fighter_mk2', w: 42, h: 38, hp: 4, score: 15, face: true, ...o }),
  gunship: (o) => ({ spr: 'gunship_alpha_b', w: 58, h: 52, hp: 9, score: 25, ...o }),
  spider: (o) => ({ spr: 'gunship_alpha', w: 46, h: 44, hp: 6, score: 15, ...o }),
};
const aimed = (cd, spd = 150, noise = 0.3) => ({ type: 'aimed', spd, cd: cd * rnd(0.85, 1.25), noise });
const straight = (cd, spd = 150) => ({ type: 'straight', spd, cd: cd * rnd(0.85, 1.25) });

// ---------- W1 ----------
/** Mechs arc in from the top (or bottom) edge, curve through the pane and leave left. */
function mechArc(fw, fh, fromTop, n = 4, fire = false) {
  const out = [], s = fromTop ? 1 : -1, ey = fromTop ? -40 : fh + 40;
  for (let i = 0; i < n; i++) {
    const d = rnd(3.6, 4.4), yy = fh * (fromTop ? 0.3 + i * 0.12 : 0.7 - i * 0.12);
    out.push(mk('wave_mech', fw, fh, fw * 0.8, ey, T.mech({
      mv: 'plan', dly: i * 0.38, tele: 0.8,
      plan: [B([fw * (0.78 + i * 0.03), ey], [fw * 0.7, yy - s * 60], [fw * 0.62, yy], [fw * 0.4, yy], d * 0.6),
        B([fw * 0.4, yy], [fw * 0.2, yy], [fw * 0.05, yy + s * 30], [-70, yy + s * 50], d * 0.5)],
      fire: fire ? aimed(1.6, 155) : straight(2.0, 150), noFire: false,
    })));
  }
  return out;
}
/** Walkers slide in, stop and fire an aimed 3-burst (telegraph blink), wind back and dash out. */
function stopShoot(fw, fh, rows, spr = null, kind = 'wave_mech') {
  return rows.map((fy, i) => {
    const y = fh * fy, sx = fw * rnd(0.64, 0.76);
    const tpl = kind === 'wave_mech' ? T.mech({ hp: 6 }) : T.gunship();
    return mk(kind, fw, fh, fw + 40, y, {
      ...tpl, ...(spr ? { spr } : {}),
      mv: 'plan', dly: i * 0.5,
      plan: [B([fw + 40, y], [fw * 0.9, y - 30], [sx + 40, y], [sx, y], 1.3),
        { k: 'hold', d: 2.2, bob: 6, warn: 0.5 },
        { k: 'bez', rel: true, p: [[0, 0], [10, 0], [20, 0], [24, 0]], d: 0.3 },
        { k: 'bez', rel: true, p: [[0, 0], [-150, 0], [-380, (fy < 0.5 ? 1 : -1) * 40], [-fw, (fy < 0.5 ? 1 : -1) * 90]], d: 1.7 }],
      fire: { type: 'burst', spd: 170, cd: 0.7, n: 3, gap: 0.12, holdOnly: true },
    });
  });
}
/** Zig-zag darts with staggered phase and speed. */
function zig(fw, fh, fy, n = 6, amp = 0.16) {
  const out = [], sp = vx(fw, 4.6);
  for (let i = 0; i < n; i++) {
    out.push(mk('wave_saucer', fw, fh, fw + 30 + i * 46, fh * fy, T.dart({
      mv: 'zig', vx: sp * rnd(0.88, 1.15), amp: fh * amp, zf: rnd(0.8, 1.0), ph: i * 0.18,
    })));
  }
  return out;
}

// ---------- formations ----------
/**
 * Shared-group formation. Centre follows `path` (bezier list, then exit velocity) or a leader;
 * shape timeline morphs offsets: row / col / vee / circle (rotating) / split / box.
 */
function form(fw, fh, kind, n, tpl, G) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(mk(kind, fw, fh, fw + 100, fh * 0.5, { ...tpl(i), mv: 'form', G, fi: i, fn: n, jit: rnd(0, 6.28) }));
  }
  for (const e of out) { const p = formPos(e, 0); e.x = p[0]; e.y = p[1]; }
  return out;
}
function shapeOff(sh, i, n, t, sp) {
  const h = (n - 1) / 2, k = i - h;
  switch (sh.s) {
    case 'row': return [k * sp, 0];
    case 'col': return [0, k * sp * 0.85];
    case 'vee': return [Math.abs(k) * sp * 0.8, k * sp * 0.75];
    case 'circle': { const a = (Math.PI * 2 * i) / n + (sh.w || 1.4) * t; const R = sh.R || sp * n / 5.5; return [Math.cos(a) * R, Math.sin(a) * R]; }
    case 'split': { const m = Math.ceil(n / 2), g = i < m ? -1 : 1, j = i < m ? i : i - m; return [(j - (m - 1) / 2) * sp * 0.9, g * (sh.gap || 90)]; }
    case 'box': {
      // ring of slots on a square around the centre (grid-core cage); i walks the perimeter
      const L = sh.L || 100, per = 8 * L, s = ((i / n) * per + (sh.w || 0) * t * L) % per;
      const q = Math.floor(s / (2 * L)), r = s % (2 * L) - L;
      return q === 0 ? [r, -L] : q === 1 ? [L, r] : q === 2 ? [-r, L] : [-L, -r];
    }
    case 'slots': return sh.pts[i % sh.pts.length];
    case 'bounce': { // [x, lo, hi, s0]: slides between lo and hi at sh.v, turning back at the ends
      const q = sh.pts[i % sh.pts.length], L = Math.max(1, q[2] - q[1]);
      const u = (((q[3] + (sh.v || 40) * t) % (2 * L)) + 2 * L) % (2 * L);
      return [q[0], q[1] + (u < L ? u : 2 * L - u)];
    }
    default: return [0, 0];
  }
}
function formCentre(G, t) {
  if (G.lead) return [G.lead.x + (G.lx || 0), G.lead.y + (G.ly || 0)];
  let tt = t;
  for (const s of G.path) {
    if (tt <= s.d) return bz(s.p, tt / s.d);
    tt -= s.d;
  }
  const last = G.path[G.path.length - 1];
  const p = last.p[3];
  return [p[0] - (G.exitV || 140) * tt, p[1]];
}
function formPos(e, t) {
  const G = e.G, c = formCentre(G, t), sp = G.sp || 44;
  let a = G.shapes[0], b = null, u = 0;
  for (let j = 0; j < G.shapes.length; j++) {
    if (G.shapes[j].t <= t) { a = G.shapes[j]; b = G.shapes[j + 1] || null; }
  }
  const o1 = shapeOff(a, e.fi, e.fn, t, sp);
  let off = o1;
  if (b) {
    // morph into the next shape over the last `mt` s before it starts
    const mt = b.mt || 0.9;
    u = Math.max(0, Math.min(1, 1 - (b.t - t) / mt));
    u = u * u * (3 - 2 * u);
    const o2 = shapeOff(b, e.fi, e.fn, t, sp);
    off = [o1[0] + (o2[0] - o1[0]) * u, o1[1] + (o2[1] - o1[1]) * u];
  }
  const wob = G.wob == null ? 5 : G.wob;
  return [c[0] + off[0] + Math.sin(t * 2.3 + e.jit) * wob, c[1] + off[1] + Math.cos(t * 1.9 + e.jit) * wob];
}
/** 7 wedges: row → V → rotating circle → V, centre on an S-curve. */
function morphWedges(fw, fh, fy, sprName = null) {
  const y = fh * fy, s = fy < 0.5 ? 1 : -1;
  const G = {
    sp: 44, exitV: 190,
    path: [B([fw + 160, y], [fw * 0.85, y], [fw * 0.8, y + s * 70], [fw * 0.62, y + s * 50], 2.2),
      B([fw * 0.62, y + s * 50], [fw * 0.5, y + s * 30], [fw * 0.5, y - s * 40], [fw * 0.42, y - s * 30], 3.2)],
    shapes: [{ t: 0, s: 'row' }, { t: 1.8, s: 'vee' }, { t: 3.4, s: 'circle', R: 62, w: 1.8 }, { t: 5.6, s: 'vee' }],
  };
  return form(fw, fh, 'wave_escort', 7, () => T.wedge(sprName ? { spr: sprName } : {}), G);
}
/** Column that splits into two ranks around the centre row, then re-merges and leaves. */
function splitGroup(fw, fh, fy, n = 8, sprName = 'scout_drone', fire = false) {
  const y = fh * fy;
  const G = {
    sp: 42, exitV: 170,
    path: [B([fw + 80, y], [fw * 0.8, y], [fw * 0.7, y], [fw * 0.55, y], 2.4), B([fw * 0.55, y], [fw * 0.45, y], [fw * 0.4, y], [fw * 0.3, y], 2.4)],
    shapes: [{ t: 0, s: 'col' }, { t: 1.6, s: 'split', gap: Math.min(fh * 0.3, 100) }, { t: 3.6, s: 'split', gap: Math.min(fh * 0.3, 100) }, { t: 4.6, s: 'row' }],
  };
  return form(fw, fh, 'wave_saucer', n, (i) => T.dart({ spr: sprName, face: false, hp: 3, noFire: !(fire && i % 3 === 0), fire: fire && i % 3 === 0 ? aimed(2.2, 140) : null }), G);
}
/** 5×5-cage of wedges around a red-core ship: box cage that rotates into a ring and back. */
function gridCore(fw, fh, fy, fromTop = null) {
  // Video (0:56–1:50, top field, measured frame by frame): THREE upright columns of small white/red
  // fighters slide in from the right edge together (≈2.5 s, 0.9 → parked), then stand dead still at
  // 61.7 / 70.8 / 79.3 % across (8.7 % of the width apart) — no sway — for ~50 s, thinning only as
  // units are shot. 10 fighters per column, 8.7 % of the height apart, spanning ≈17–96 % of the pane
  // height (centre ≈56 %). The core ship sits mid-height in the middle column.
  const cy = fh * 0.565, rdy = fh * 0.087;
  const hx = fw * 0.708, cdx = fw * 0.087;
  const lead = mk('wave_grid_core', fw, fh, fw + 150, cy, {
    mv: 'plan', noFire: false,
    fire: { type: 'fan3', spd: 155, cd: 1.5 },
    plan: [B([fw + 150, cy], [fw * 0.95, cy], [fw * 0.78, cy], [hx, cy], 2.5),
      { k: 'hold', d: 45, bob: 0, bw: 0.5, sway: 0 },
      B([hx, cy], [fw * 0.55, cy], [fw * 0.35, cy], [-160, cy], 6)],
  });
  // Motion (video 1:00–1:12 kymograph of each column): the fighters are NOT still — every column
  // is two interleaved streams sliding up and down through each other at ≈0.2 pane-heights/s and
  // turning back at the column ends (an X-lattice in the time plot). Front / middle columns keep to
  // the bands above and below the core row (the lane to the core stays open); the back column
  // runs the full height.
  const pts = [], v = fh * 0.19;
  // 10-04: no guard behind the core — the old back column is now a second front column; every column
  // keeps to the bands above / below the core row (lane to the core stays open), same unit count.
  for (let k = 0; k < 10; k++) for (const c of [-1, 0, 1]) {
    const dy = (k - 4.5) * rdy;
    if (c <= 0 && Math.abs(dy) < rdy) continue; // core ship takes the middle column's centre slots; the front column leaves the core row open (units are tough now)
    const lo = dy < 0 ? -4.5 * rdy : 1.5 * rdy, hi = dy < 0 ? -1.5 * rdy : 4.5 * rdy;
    const L = hi - lo, u = Math.max(0, Math.min(L, dy - lo));
    pts.push([c === 1 ? -2 * cdx : c * cdx, lo, hi, k % 2 ? u : 2 * L - u]); // alternate units start moving the other way
  }
  const G = { lead, sp: 40, wob: 0, shapes: [{ t: 0, s: 'bounce', pts, v }] };
  let _gi = 0;
  const cage = form(fw, fh, 'wave_escort', pts.length, () => {
    const i = _gi++;
    return T.wedge({ _chainOf: lead, noDrop: true, hp: GUARD_HP.cage, w: 22, h: 15,
      fire: i % 4 === 1 ? aimed(4, 140) : null, noFire: i % 4 !== 1 });
  }, G);
  lead.w = 44; lead.h = 36; if (lead.core) lead.core.ox = -lead.w * 0.3;
  return [lead, ...cage];
}

// ---------- swoopers / behind entries ----------
/** Swoopers drop in from an edge, hover, blink (0.6 s) and dive at the player's row, then peel away. */
function swoopers(fw, fh, fromTop, n = 3, sprName = 'fighter_mk2') {
  const out = [], s = fromTop ? 1 : -1, ey = fromTop ? -40 : fh + 40;
  for (let i = 0; i < n; i++) {
    const hx = fw * (0.62 + i * 0.1), hy = fh * (fromTop ? 0.22 + i * 0.08 : 0.78 - i * 0.08);
    out.push(mk('wave_looper', fw, fh, hx + 40, ey, T.swooper({
      spr: sprName, mv: 'plan', dly: i * 0.45, tele: 0.8,
      plan: [B([hx + 60, ey], [hx + 80, hy - s * 40], [hx + 30, hy], [hx, hy], 1.2),
        { k: 'hold', d: 0.9 + i * 0.35, bob: 5, warn: 0.6 },
        { k: 'dive' }],
      fire: sprName === 'plasma_bomber' ? { type: 'dashfan', n: 3, sp: 0.17, spd: 215, cd: 2.2 } : aimed(2.6, 140), noFire: false,
    })));
  }
  return out;
}
/** Wedges come from behind (bottom/top edge ahead of the ship), arc right across the pane and return. */
function behindArc(fw, fh, fromBottom, n = 5) {
  const out = [], ey = fromBottom ? fh + 40 : -40, s = fromBottom ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const d = rnd(4.6, 5.2);
    out.push(mk('wave_escort', fw, fh, fw * 0.32, ey, T.wedge({
      spr: 'stealth_corvette', face: true, mv: 'plan', dly: i * 0.3, tele: 0.9,
      plan: [B([fw * 0.34, ey], [fw * 0.36, fh * 0.5 + s * 40], [fw * 0.8, fh * 0.5 + s * (60 - i * 8)], [fw * 0.85, fh * 0.5 - s * 20], d * 0.55),
        B([fw * 0.85, fh * 0.5 - s * 20], [fw * 0.9, fh * 0.5 - s * 90], [fw * 0.4, fh * 0.5 - s * 110], [-80, fh * 0.5 - s * (40 + i * 18)], d * 0.6)],
    })));
  }
  return out;
}

// ---------- W3 ----------
function spiders(fw, fh, fy, n = 5, amp = 0.16) {
  const out = [], fromTop = fy < 0.5, ey = fromTop ? -50 : fh + 50;
  for (let i = 0; i < n; i++) {
    const y = fh * fy, sp = vx(fw, 6) * rnd(0.85, 1.2);
    out.push(mk('wave_spider', fw, fh, fw * 0.9, ey, T.spider({
      mv: 'plan', dly: i * 0.55, tele: 0.7,
      plan: [B([fw * (0.95 - i * 0.02), ey], [fw * 0.95, y], [fw * 0.85, y], [fw * 0.78, y], 1.3),
        { k: 'line', vx: sp, amp: fh * amp, wf: rnd(1.9, 2.6), ph: -i * 0.8, surge: 0.35 }],
      fire: aimed(2.0, 150, 0.35),
    })));
  }
  return out;
}

// ---------- W4 ----------
function ring(fw, fh, fy) {
  // Video (1:36–2:17, bottom field, measured frame by frame, pane fractions):
  //  96–99 s  ~15 red crabs slide in from the right edge as a COMPACT ring (≈14 % wide × 43 % high)
  //           centred ≈(0.80, 0.78); it parks there ~7.5 s
  //  107.5–109 the ring stretches into a tall OVAL (≈24 % × 72 %), centre rising to ≈0.65
  //  109–124  the oval hangs, barely moving (centre x 0.79–0.81)
  //  124–126  it pulls in vertically to ≈52 % high and stays that way (the dash-wall phase)
  //  then it leaves / breaks up to the left
  const RX = fw * 0.12, RY = fh * 0.35, RX0 = fw * 0.07, RY0 = fh * 0.2;
  const low = fy >= 0.5, yc = (f) => (low ? f : 1 - f) * fh;
  const y1 = Math.max(RY0 + 8, Math.min(fh - RY0 - 8, yc(0.78)));
  const y2 = Math.max(RY + 6, Math.min(fh - RY - 6, yc(0.65)));
  const e = mk('wave_ring_core', fw, fh, fw + RX0 + 30, y1, {
    mv: 'plan', tele: 0, noFire: false,
    fire: { type: 'ringcore', spd: 125, cd: 1.35 },
    plan: [B([fw + RX0 + 30, y1], [fw * 0.95, y1], [fw * 0.86, y1], [fw * 0.8, y1], 3.0),
      { k: 'hold', d: 7.5, bob: 2, bw: 0.5, sway: 2 },
      B([fw * 0.8, y1], [fw * 0.8, y1 + (y2 - y1) * 0.4], [fw * 0.8, y2], [fw * 0.8, y2], 1.5),
      { k: 'hold', d: 26, bob: 3, bw: 0.4, sway: 3 },
      B([fw * 0.8, y2], [fw * 0.62, y2], [fw * 0.3, y2], [-140, y2], 7)],
  });
  e.w = RX * 2 + 20; e.h = RY * 2 + 16;
  // shape timeline (seconds since spawn) → pod ellipse radii
  e._rs = { t: 0, RX, RY, RX0, RY0, key: [[0, RX0, RY0], [10.5, RX0, RY0], [12, RX, RY], [27, RX, RY], [29, RX, RY * 0.72]] };
  const n = 15;
  e.drones = [];
  // tough pods (uniform attached HP) → the loop keeps a small mouth on the core row facing the ship
  // (±40°), so the core stays shootable; the loop doesn't turn (video: it hardly moves)
  const gap = 40 * Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const ang = Math.PI + gap + (Math.PI * 2 - 2 * gap) * (i / (n - 1));
    e.drones.push({ ang, dist: RX0, d0: RX, ky: RY0 / RX0, r: 7.5, hp: GUARD_HP.pod, maxHp: GUARD_HP.pod, pod: true });
  }
  return [e];
}

// ---------- tethered striker ("snake") ----------
/*
 * Rebuilt from the reference video (2:28–2:46, both fields). Not a travelling snake:
 *  - PIVOT: a big grey rock sphere in a dark red glow; slides in from the right, then stays put.
 *  - TAIL CHAIN: 7 grey links tapering to a RED BALL tip (= the core). At rest the chain trails
 *    straight out behind the sphere (to the right), so the core hides behind it.
 *  - STRIKE (ship within reach): the chain curls in, then the red tip shoots straight at where the
 *    ship was, the links stretching from the pivot; it holds, then swings back round the pivot to
 *    the rest position. The core is exposed (in front of the sphere) during the strike and swing.
 *  - SAW (ship out of reach): the sphere spits a red spiked ring (yellow centre) at the ship with a
 *    row of 5 white diamonds on each side; the ring flies out ~1.3 s and comes back to the sphere.
 *  Cycle ≈ 4.6 s, stays ~20 s. Core break → the chain blows up link by link back to the sphere.
 */
export function snake(fw, fh, fy, segs = 11, tone = 'silver') {
  // video ~4:45: ~11 thick overlapping metallic segments + big silver pivot in dark-red portal
  const y0 = Math.max(52, Math.min(fh - 52, fh * fy));
  const head = mk('wave_snake_head', fw, fh, fw + 200, y0, {
    mv: 'arm', dly: 0, stay: 20, segs, fire: { type: 'armhead' },
    w: 48, h: 48, hp: GUARD_HP.seg, // tip size ≈ ship height (video)
  });
  head._tx = fw * 0.7; head._ty = y0;
  const out = [];
  // pivot first (under), then links pivot→tip, head last
  out.push(mk('wave_snake_seg', fw, fh, fw + 60, y0, {
    w: 78, h: 78, hp: GUARD_HP.seg, score: 60, mv: 'armseg', _chainOf: head, chainIdx: segs + 1,
    noFire: true, noDrop: true, passShots: true, tone: 'anchor',
  }));
  for (let i = segs; i >= 1; i--) {
    // video: tip → red ball → dense silver accordion → big pivot; diameters keep overlap along chain
    const segTone = (i === 1) ? 'red' : tone;
    const sw = (i === 1) ? 44 : (50 + (i / segs) * 10);
    out.push(mk('wave_snake_seg', fw, fh, fw + 60, y0, {
      w: sw, h: sw, hp: GUARD_HP.seg, score: 20, mv: 'armseg', _chainOf: head, chainIdx: i,
      noFire: true, noDrop: true, passShots: true, tone: segTone,
    }));
  }
  out.push(head);
  return out;
}
function caterpillar(fw, fh, fy) {
  const out = [];
  const P = { v: vx(fw, 7.5), amp: fh * 0.2, wf: 2.8, k2: 0.25, sk: 0.4, sw: 1.3 };
  for (let i = 0; i < 5; i++) {
    out.push(mk('wave_cater', fw, fh, fw + 40, fh * fy, {
      w: 30, h: 30, hp: 4, score: 10, mv: 'snake', ...P, x0: fw + 40,
      dly: i * 0.22, noFire: i % 2 !== 0, fire: i % 2 === 0 ? aimed(2.2, 140) : null, tone: 'green',
    }));
  }
  for (const e of out) e.y0 = fh * fy;
  return out;
}
function mines(fw, fh, rowsF) {
  return rowsF.map((fy, i) => mk('wave_mine', fw, fh, fw + 30 + i * rnd(70, 110), fh * fy, {
    w: 34, h: 34, hp: 8, score: 10, mv: 'drift', vx: SCROLL * rnd(0.9, 1.15), bob: rnd(8, 16), bf: rnd(0.9, 1.6), ph: rnd(0, 6), noFire: true,
  }));
}

// 10-04: translucent bubble wall — 5×5 grid, no vertical movement, slow leftward crawl (mid-match)
// 10-05 rebuilt from the clearer reference video (a6faf877, ROUND 2 ゴールドラッシュゾーン, 2:59-4:07):
// User 10-05: clearly tough — 10 normal shots (dmg 2) per unit.
export const BUBBLE_HP = 18;
// about 0.043 field widths per second (10-11 px/s on the 246 px video field), straight to the left
export const bubbleVx = (fw) => fw * 0.043;
// 10-05: user finished the movement check → 透明戦隊 back to its mid-match slot (127 s), once per match.
export const BUBBLE_T_ORIGINAL = 127;
export const BUBBLE_T = BUBBLE_T_ORIGINAL;
export const BUBBLE_ROWS = 5, BUBBLE_COLS = 24;
function bubbleWall(fw, fh) {
  // Video: 5 rows edge to edge (top row touches the top edge, bottom row the bottom edge), ring 19 px on a
  // 21 px row pitch (D ≈ 0.9 × pitch), column pitch 28 px of a 246 px field (0.114 × fw), one long block
  // that keeps streaming in from the right for about 68 s (24 columns), no vertical motion, no shots.
  // Edge rows block the ship's off-edge overhang.
  const R = BUBBLE_ROWS, C = BUBBLE_COLS, D = Math.max(24, Math.round(fh * 0.9 / (R - 1 + 0.9))), out = [];
  const dy = (fh - D) / (R - 1), px = Math.max(D + 2, Math.round(fw * 28 / 246)), v = bubbleVx(fw);
  for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) {
    out.push(mk('wave_bubble', fw, fh, fw + D / 2 + 4 + c * px, D / 2 + r * dy, {
      w: D, h: D, hp: BUBBLE_HP, score: 12, mv: 'drift', vx: v, bob: 0, bf: 0, ph: (c * R + r) * 0.7, noFire: true, _edge: r === 0 ? -1 : r === R - 1 ? 1 : 0,
    }));
  }
  return out;
}

// ---------- round 2 ----------
function loopers(fw, fh, fy, n = 4) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(mk('wave_looper', fw, fh, fw + 30 + i * 56, fh * fy, {
      spr: 'light_destroyer', w: 44, h: 40, hp: 4, score: 15, mv: 'loop', vx: vx(fw, 4.2) * rnd(0.9, 1.12),
      loopX: fw * rnd(0.45, 0.62), R: Math.min(fh * 0.22, 70) * rnd(0.8, 1.1), loopDur: rnd(1.4, 1.8),
      loopDir: i % 2 ? -1 : 1,
      fire: straight(2.2, 160), noFire: false,
    }));
  }
  return out;
}
function saucerCircle(fw, fh, fy, n = 8) {
  const y = fh * fy;
  const G = {
    sp: 36, exitV: 200,
    path: [B([fw + 120, y], [fw * 0.8, y - 60], [fw * 0.7, y + 60], [fw * 0.55, y], 3), B([fw * 0.55, y], [fw * 0.45, y - 50], [fw * 0.4, y + 50], [fw * 0.3, y], 2.6)],
    shapes: [{ t: 0, s: 'circle', R: 58, w: 2.4 }, { t: 3.0, s: 'row' }, { t: 4.4, s: 'circle', R: 70, w: -2.4 }],
  };
  return form(fw, fh, 'wave_saucer', n, (i) => ({ spr: 'swarm', w: 34, h: 30, hp: 3, score: 8, noFire: i % 4 !== 0, fire: i % 4 === 0 ? aimed(2.6, 140) : null }), G);
}
function saucers(fw, fh, fy, n = 8, wavy = false) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(mk('wave_saucer', fw, fh, fw + 30 + i * 40, fh * fy, {
      spr: 'swarm', w: 34, h: 30, hp: 3, score: 8, mv: 'plan', noFire: i % 3 !== 0,
      plan: [{ k: 'line', vx: vx(fw, 4.4) * rnd(0.9, 1.1), amp: wavy ? fh * 0.14 : fh * 0.03, wf: 3, ph: -i * 0.55, surge: 0.25 }],
      fire: i % 3 === 0 ? straight(2.4, 150) : null,
    }));
  }
  return out;
}

// ---------- bosses ----------
/** Escorts fire together in volleys (every other fighter, synced), like the original pack. */
function volley(esc, cd = 2.8, spd = 140) {
  esc.forEach((s, i) => { if (i % 2 === 0) Object.assign(s, { noFire: false, fire: { type: 'aimed', spd, cd, noise: 0.12, sync: true }, _fcd: 1.6 }); });
  return esc;
}

function coreBossPack(fw, fh, fy) {
  const e = spawnEnemy(fw, fh, 'wave_core_boss');
  // Video (1:26–2:40, top field): a mid-size grey arrowhead with a red rear, not a screen-filling
  // boss; it hangs around the middle of the pane (≈45–58 % across), roaming slowly between rows
  e.w = 66; e.h = 44; // video: ≈64×33 px arrowhead on a 360-wide pane
  if (e.core) { e.core.ox = -e.w * 0.3; e.core.orbit = 5; }
  e.y = Math.max(e.h * 0.5 + 6, Math.min(fh - e.h * 0.5 - 6, fh * fy));
  // User 09-29: a core never flies alone — the arrowhead carries a docked pack that moves rigidly
  // with it (a 3×3 block of small fighters behind the red rear + 2 pairs riding its upper / lower
  // rear edges) and all of it goes up in the chain when the core breaks. The core row in front of
  // the nose stays clear.
  e.x = fw + e.w * 0.5 + 30; e._entryX = null;
  const pts = [];
  // 10-04: guards SURROUND the arrowhead (none behind its rear): two ranks above, two below, plus a
  // front pair framing the open lane to the core at the nose. Same 13 units.
  for (const sg of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) pts.push([-30 + c * 30, sg * (e.h * 0.5 + 17 + r * 24)]);
  for (const sg of [-1, 1]) pts.push([-e.w * 0.5 - 34, sg * 30]);
  pts.length = 13;
  e._bandH = e.h * 0.5 + 41 + 9; // keep the docked riders on screen at the ends of the sweep
  const G = { lead: e, sp: 40, wob: 2.5, shapes: [{ t: 0, s: 'slots', pts }] };
  let gi = 0;
  const esc = form(fw, fh, 'wave_escort', pts.length, () => {
    const i = gi++;
    return T.wedge({ _chainOf: e, noDrop: true, hp: GUARD_HP.cage, w: 22, h: 15,
      fire: i % 4 === 1 ? aimed(4.5, 140) : null, noFire: i % 4 !== 1 });
  }, G);
  Object.assign(e, { mv: 'boss', boss: 'tri', hx: fw * 0.515, y0: e.y, stay: 40, mvT: 0,
    fire: { type: 'boss' } });
  return [e, ...esc];
}
function eyeBoss(fw, fh) {
  const e = spawnEnemy(fw, fh, 'wave_eye_boss');
  e.y = fh * 0.5;
  const esc = volley(spawnCoreEscorts(e, fw, fh), 3.2);
  e._entryX = null;
  Object.assign(e, { mv: 'boss', boss: 'eye', hx: fw * 0.66, y0: fh * 0.5, stay: 36, mvT: 0, fire: { type: 'boss' } });
  return [e, ...esc];
}
function jetBoss(fw, fh) {
  const e = mk('wave_core_boss', fw, fh, fw + 110, fh * 0.5, {
    mv: 'boss', boss: 'jet', hx: fw * 0.7, stay: 32, fire: { type: 'boss' },
  });
  e.hx = Math.min(fw * 0.72, fw - e.w * 0.5 - 6);
  Object.assign(e, {
  });
  const esc = volley(spawnCoreEscorts(e, fw, fh), 3.4);
  e._entryX = null;
  return [e, ...esc];
}

/** [time s, builder(fw, fh) → enemies, optional tag] — waves overlap a little on purpose. */
export const WAVE_SCRIPT = [
  // W1
  [2, (w, h) => mechArc(w, h, true, 4, false)],
  [4.2, (w, h) => mechArc(w, h, false, 4, true)],
  [6.8, (w, h) => stopShoot(w, h, [0.3, 0.7])],
  [7.8, (w, h) => zig(w, h, 0.22, 5)], // fodder (kills → drops → sends)
  [9.2, (w, h) => zig(w, h, 0.5, 6)],
  [11.5, (w, h) => splitGroup(w, h, 0.5, 8, 'scout_drone', true)],
  // W2
  [14.5, (w, h) => morphWedges(w, h, 0.4)],
  [17.5, (w, h) => swoopers(w, h, true, 3)],
  [19.5, (w, h) => behindArc(w, h, true, 5)],
  [21.8, (w, h) => splitGroup(w, h, 0.5, 8, 'drone')],
  [24.5, (w, h) => gridCore(w, h, 0.45, true)],
  [27, (w, h) => zig(w, h, 0.25, 5)],
  [29, (w, h) => swoopers(w, h, false, 2)],
  [32, (w, h) => mechArc(w, h, true, 3, true)],
  [34, (w, h) => zig(w, h, 0.8, 4, 0.1)],
  [37, (w, h) => splitGroup(w, h, 0.5, 6, 'scout_drone')], // fodder (kills → drops → sends)
  [40, (w, h) => coreBossPack(w, h, 0.5)],
  // W3 (light while the tri boss is up)
  [45, (w, h) => zig(w, h, 0.2, 4)],
  [47, (w, h) => spiders(w, h, 0.25, 4)],
  [50, (w, h) => zig(w, h, 0.5, 5)], // fodder (kills → drops → sends)
  [52, (w, h) => zig(w, h, 0.85, 4)],
  [55, (w, h) => stopShoot(w, h, [0.22, 0.78], null, 'wave_spider')],
  [60, (w, h) => swoopers(w, h, true, 2)],
  [62, (w, h) => zig(w, h, 0.75, 4, 0.1)],
  // W4 rings
  [66, (w, h) => zig(w, h, 0.3, 5)], // fodder (kills → drops → sends)
  [70, (w, h) => ring(w, h, 0.4)],
  [73, (w, h) => zig(w, h, 0.75, 5)],
  [75, (w, h) => swoopers(w, h, true, 2)],
  [80, (w, h) => stopShoot(w, h, [0.35, 0.65])],
  [83, (w, h) => zig(w, h, 0.8, 5)], // fodder (kills → drops → sends)
  [86, (w, h) => ring(w, h, 0.6)],
  [90, (w, h) => zig(w, h, 0.25, 5)],
  [92, (w, h) => swoopers(w, h, false, 2)],
  // midboss eye (~36 s)
  [97, (w, h) => splitGroup(w, h, 0.35, 6, 'drone')], // fodder (kills → drops → sends)
  [104, (w, h) => eyeBoss(w, h)],
  [109, (w, h) => zig(w, h, 0.75, 4)], // fodder (kills → drops → sends)
  [112, (w, h) => zig(w, h, 0.2, 4)],
  [118, (w, h) => swoopers(w, h, true, 2)],
  [124, (w, h) => zig(w, h, 0.8, 4)],
  [BUBBLE_T, bubbleWall], // 透明戦隊 (mid-match, once per match)
  [130, (w, h) => swoopers(w, h, false, 2)],
  // boss snake (slow crossing)
  [137, (w, h) => zig(w, h, 0.4, 5)], // fodder (kills → drops → sends)
  [141, (w, h) => splitGroup(w, h, 0.6, 6, 'scout_drone')], // fodder (kills → drops → sends)
  [146, (w, h) => snake(w, h, 0.31, 12)],
  [150, (w, h) => zig(w, h, 0.2, 4)],
  [154, (w, h) => behindArc(w, h, false, 4)],
  [160, (w, h) => zig(w, h, 0.3, 5)],
  // trap zone
  [163, (w, h) => zig(w, h, 0.7, 5)], // fodder (kills → drops → sends)
  [166, (w, h) => mines(w, h, [0.2, 0.55, 0.85])],
  [170, (w, h) => caterpillar(w, h, 0.35)],
  [174, (w, h) => gridCore(w, h, 0.5, false)],
  [178, (w, h) => zig(w, h, 0.75, 4)],
  [180, (w, h) => mines(w, h, [0.3, 0.8])],
  [184, (w, h) => zig(w, h, 0.45, 5)], // fodder (kills → drops → sends)
  [186, (w, h) => swoopers(w, h, true, 2)],
  [192, (w, h) => mines(w, h, [0.15, 0.5, 0.85])],
  [196, (w, h) => ring(w, h, 0.55)],
  [200, (w, h) => caterpillar(w, h, 0.7)],
  [203, (w, h) => zig(w, h, 0.25, 5)], // fodder (kills → drops → sends)
  [206, (w, h) => mines(w, h, [0.35, 0.7])],
  [212, (w, h) => stopShoot(w, h, [0.3, 0.7])],
  // round 2
  [216, (w, h) => zig(w, h, 0.6, 5)], // fodder (kills → drops → sends)
  [220, () => [], 'round2'],
  [222, (w, h) => loopers(w, h, 0.35)],
  [226, (w, h) => loopers(w, h, 0.65)],
  [230, (w, h) => swoopers(w, h, true, 3, 'plasma_bomber')],
  [234, (w, h) => zig(w, h, 0.5, 5)],
  [238, (w, h) => jetBoss(w, h)],
  [244, (w, h) => zig(w, h, 0.8, 4)], // fodder (kills → drops → sends)
  [248, (w, h) => zig(w, h, 0.25, 4)],
  [252, (w, h) => loopers(w, h, 0.5, 3)],
  [258, (w, h) => stopShoot(w, h, [0.3, 0.7])],
  [264, (w, h) => saucerCircle(w, h, 0.35)],
  [269, (w, h) => splitGroup(w, h, 0.5, 6, 'drone')], // fodder (kills → drops → sends)
  [274, (w, h) => gridCore(w, h, 0.45, true)],
  [278, (w, h) => zig(w, h, 0.2, 5)], // fodder (kills → drops → sends)
  [282, (w, h) => saucerCircle(w, h, 0.7)],
  [289, (w, h) => zig(w, h, 0.3, 5)],
  [294, (w, h) => zig(w, h, 0.65, 5)], // fodder
];

/**
 * Spawn every script entry whose time has come on this field. `st` holds the per-field cursor.
 * Returns the tags of fired entries (e.g. 'round2') for UI.
 */
/**
 * User 10-04: attached units on the core's BACK side (farther from the player than the core) guard it:
 * they patrol around the back, slide toward the core's row while the player is lined up with it
 * (covering it from behind — the front lane stays open), and fire telegraphed aimed shots.
 * Shared by both fields (call before the formation / escort step). Returns nothing.
 */
export const REAR_FIRE_CD = [3.0, 4.5]; // s per unit
export const REAR_PACK_GAP = 0.7;       // s between shots of one pack (no floods)
export const REAR_TELE = 0.4;           // s red-ring warning before each shot
/** Ring / swarm cores: their guards are drawn pods (drones). Rear-side pods patrol along the loop,
 *  lean toward the core row when the player lines up, and fire the same telegraphed aimed shots. */
function tickPodGuards(e, dt, px, py, bullets, fw) {
  const ring = e.kind === 'wave_ring_core';
  e._rgT = (e._rgT || 0) + dt;
  const cy = e.y + (e.core.oy || 0);
  const cover = Math.abs(py - cy) < 46;
  const live = e.hp > 0 && e.core.hp > 0 && e.x < fw - 10 && e.x > 0;
  let k = 0;
  for (const d of e.drones) {
    k++;
    if (d.hp <= 0) { d.w = 0; continue; }
    if (ring && d.a0 != null && Math.cos(d.a0) > 0.2) {
      d._cv = (d._cv || 0) + ((cover ? -Math.sin(d.a0) * 0.22 : 0) - (d._cv || 0)) * Math.min(1, dt * 3);
      d.ang += Math.sin(e._rgT * 1.1) * 0.17 + Math.sin(e._rgT * 2.3 + k * 2.3) * 0.03 + d._cv; // patrol along the back of the loop in step (pods keep their spacing)
    }
    const ox = Math.cos(d.ang) * d.dist, oy = Math.sin(d.ang) * d.dist * (d.ky || 1);
    if (!live) { d.w = 0; if (d._tele > 0) d._tele = 0; continue; } // every surrounding pod may fire (same caps)
    if (d._cd == null) d._cd = REAR_FIRE_CD[0] + Math.random() * (REAR_FIRE_CD[1] - REAR_FIRE_CD[0]);
    if (d._tele > 0) {
      d._tele -= dt; d.w = 1;
      if (d._tele <= 0) {
        d.w = 0;
        const sx = e.x + ox, sy = e.y + oy, a = Math.atan2(py - sy, px - sx), spd = 150;
        const rb = spawnBullet(sx - d.r, sy, Math.cos(a) * spd, Math.sin(a) * spd, 'enemy', false, 2, { life: 5 }); rb.rg = 1; bullets.push(rb);
        d._cd = REAR_FIRE_CD[0] + Math.random() * (REAR_FIRE_CD[1] - REAR_FIRE_CD[0]);
      }
      continue;
    }
    d._cd -= dt;
    if (d._cd <= 0 && (e._rgNext == null || performance.now() / 1000 >= e._rgNext)) {
      e._rgNext = performance.now() / 1000 + REAR_PACK_GAP;
      d._tele = REAR_TELE;
    }
  }
}
export function tickRearGuard(e, dt, px, py, bullets, fw, fh) {
  if (e.drones && e.core && (e.kind === 'wave_ring_core' || e.kind === 'wave_swarm_core' || e.kind === 'wave_eye_boss')) { tickPodGuards(e, dt, px, py, bullets, fw); return; }
  const L = e._chainOf || e._lead;
  if (!L) return; // free enemies (e.g. bubble wall) are never touched
  if (e.hp <= 0 || e._chainT != null || e.mv === 'armseg' || e.passShots) { e._gOx = 0; e._gOy = 0; return; }
  if (L.hp <= 0) return;
  // 10-04: guards surround / shield the core (no 'rear' slot any more). Every guard patrols a little,
  // never past the core's back edge, never into the lane in front of the core; all fire telegraphed shots.
  const cx = L.x + (L.core ? L.core.ox : 0), cy = L.y + (L.core ? L.core.oy : 0);
  e._rgT = (e._rgT || 0) + dt;
  const ph = (e._uid || 1) * 1.7;
  let tx = Math.sin(e._rgT * 1.3 + ph) * 7, ty = Math.sin(e._rgT * 0.9 + ph * 0.6) * 6;
  const bx = e.x - (e._gOx || 0), by = e.y - (e._gOy || 0);
  const hw = (L.w || 40) / 2, hh = (L.h || 30) / 2, ew = (e.w || 20) / 2, eh = (e.h || 16) / 2;
  const back = L.x + hw - ew; // guard's centre may not pass the core's back edge
  if (bx + tx > back) tx = Math.min(tx, back - bx);
  if (Math.abs(bx - L.x) < hw + ew) { // beside the hull: never slide over it
    const clr = hh + eh + 3, ny = by + ty - L.y;
    if (Math.abs(ny) < clr) ty = Math.sign(by - L.y || 1) * clr - (by - L.y);
  }
  if (bx + tx < cx && Math.abs(by + ty - cy) < eh + 12) ty = Math.sign(by - cy || 1) * (eh + 12) - (by - cy); // lane to the core stays open
  const k = Math.min(1, dt * 3);
  e._gOx = (e._gOx || 0) + (tx - (e._gOx || 0)) * k;
  e._gOy = (e._gOy || 0) + (ty - (e._gOy || 0)) * k;
  if (e.x > fw - 10 || e.x < 0 || (e.fire && !e.noFire)) { if (!(e.fire && !e.noFire)) e._warn = 0; return; } // own gun: keep its pattern only
  if (e._rgCd == null) e._rgCd = REAR_FIRE_CD[0] + Math.random() * (REAR_FIRE_CD[1] - REAR_FIRE_CD[0]);
  if (e._rgTele > 0) {
    e._rgTele -= dt; e._warn = 1;
    if (e._rgTele <= 0) {
      e._warn = 0;
      const a = Math.atan2(py - e.y, px - e.x), spd = 150;
      const rb = spawnBullet(e.x - (e.w || 20) * 0.4, e.y, Math.cos(a) * spd, Math.sin(a) * spd, 'enemy', false, 2, { life: 5 }); rb.rg = 1; bullets.push(rb);
      e._rgCd = REAR_FIRE_CD[0] + Math.random() * (REAR_FIRE_CD[1] - REAR_FIRE_CD[0]);
    }
    return;
  }
  e._rgCd -= dt;
  if (e._rgCd <= 0 && (L._rgNext == null || performance.now() / 1000 >= L._rgNext)) { // pack gate
    L._rgNext = performance.now() / 1000 + REAR_PACK_GAP;
    e._rgTele = REAR_TELE;
  }
}

const bubblesAlive = (list) => list.some((e) => e.kind === 'wave_bubble' && e.hp > 0 && e.x > -40);
const LOOP_FROM = Math.max(0, WAVE_SCRIPT.findIndex((w) => w[0] >= 14.5));
export function runWaveScript(st, time, list, fw, fh) {
  const tags = [];
  st._waveI = st._waveI || 0;
  const off = st._waveOff || 0;
  while (st._waveI < WAVE_SCRIPT.length && WAVE_SCRIPT[st._waveI][0] + off <= time) {
    const [, build, tag] = WAVE_SCRIPT[st._waveI++];
    if (build === bubbleWall) { if (!st._bubDone) { st._bubDone = true; st._bubPend = time; } continue; } // once per match (not on replay), spawned below, away from cores
    const es = build(fw, fh);
    if (es.some((e) => e.core) && bubblesAlive(list)) (st._coreHeld = st._coreHeld || []).push(...es); // no core joins a bubble wall
    else for (const e of es) list.push(e);
    if (tag && !off) tags.push(tag);
  }
  // 10-04: the bubble wall is a plain group of normal enemies — never next to a core (looks like its escort).
  // It waits until no core is on the field (max 30 s); cores due meanwhile wait until the wall is gone.
  if (st._bubPend != null && (!list.some((e) => e.core && e.hp > 0) || time - st._bubPend > 30)) {
    st._bubPend = null;
    for (const e of bubbleWall(fw, fh)) list.push(e);
  }
  if (st._coreHeld && st._coreHeld.length && !bubblesAlive(list)) { for (const e of st._coreHeld) list.push(e); st._coreHeld = null; }
  // User 10-04d: enemies ran out late in the match / in 延長戦 (script ended at 294 s).
  // Once used up, replay it from W2 (cores + guards included), same on both fields.
  if (st._waveI >= WAVE_SCRIPT.length) {
    const last = WAVE_SCRIPT[WAVE_SCRIPT.length - 1][0] + off;
    if (time >= last + 3) { st._waveI = LOOP_FROM; st._waveOff = time - WAVE_SCRIPT[LOOP_FROM][0]; }
  }
  return tags;
}

// ---------- movers ----------
function stepPlan(e, dt, fw, fh, py) {
  const st = e.plan[e._pi || 0];
  if (!st) { // plan finished: keep last velocity
    e.x += (e._vx || -150) * dt; e.y += (e._vy || 0) * dt;
    return;
  }
  if (!st._on) {
    st._on = true; st._t = 0; st._sx = e.x; st._sy = e.y;
    if (st.k === 'dive') {
      // Commit to the player's row as seen now (visible info), dive in front of the ship, peel away
      const ty = Math.max(20, Math.min(fh - 20, py)), tx = fw * 0.34, sg = ty < fh * 0.5 ? 1 : -1;
      const dive = B([e.x, e.y], [e.x - 60, e.y], [tx + 140, ty], [tx, ty], 1.0);
      const peel = B([tx, ty], [tx - 50, ty + sg * 30], [tx - 70, ty + sg * 170], [tx - 170, ty + sg * 330], 1.2);
      e.plan.splice(e._pi, 1, dive, peel);
      e._diving = true;
      return stepPlan(e, dt, fw, fh, py);
    }
  }
  st._t += dt;
  const u = Math.min(1, st._t / (st.d || 1));
  let nx = e.x, ny = e.y;
  if (st.k === 'bez') {
    const p = st.rel ? st.p.map((q) => [st._sx + q[0], st._sy + q[1]]) : st.p;
    [nx, ny] = bz(p, u);
  } else if (st.k === 'hold') {
    const tt = st._t;
    nx = st._sx + (st.sway ? Math.sin(tt * 0.9) * st.sway : 0);
    ny = st._sy + (st.bob ? Math.sin(tt * (st.bw || 3)) * st.bob : 0);
    e._holding = true;
    e._warn = st.warn && st.d - tt < st.warn ? 1 : 0;
  } else if (st.k === 'line') {
    const tt = st._t;
    const v = (st.vx || 140) * (1 + (st.surge || 0) * Math.sin(tt * 1.7 + (st.ph || 0)));
    nx = e.x - v * dt;
    ny = st._sy + (st.amp || 0) * Math.sin((st.wf || 2) * tt + (st.ph || 0)) - (st.amp || 0) * Math.sin(st.ph || 0);
    e._vx = -v; e._vy = 0;
  }
  if (dt > 0 && st.k !== 'line') { e._vx = (nx - e.x) / dt; e._vy = (ny - e.y) / dt; }
  e.x = nx; e.y = ny;
  if (st.k !== 'line' && u >= 1) {
    e._pi = (e._pi || 0) + 1;
    if (st.k === 'hold') { e._holding = false; e._warn = 0; }
  }
}

function bossMove(e, dt, fw, fh, py) {
  const t = e.mvT, half = Math.min(fh * 0.5 - 4, Math.max(e.h * 0.5 + 6, e._bandH || 0));
  const clampY = (y) => Math.max(half, Math.min(fh - half, y));
  if (e._bt == null) { // entry
    e.x -= 150 * dt;
    e.y += (clampY(e.y0 ?? fh * 0.5) - e.y) * Math.min(1, dt * 2);
    if (e.x <= e.hx) { e._bt = 0; e._ph = 'a'; e._pt = 0; e._ax = e.x; e._ay = e.y; }
    return;
  }
  e._bt += dt; e._pt += dt;
  if (e._bt > (e.stay || 18)) { // leave
    e._ph = 'leave'; e.x -= 70 * dt; e._escV = 190; return;
  }
  if (e.boss === 'eye') {
    // Figure-8 drift round its station
    const ax = fw * 0.1, ay = Math.max(0, fh * 0.5 - half), w = 0.55;
    const tt = e._bt;
    const ease = Math.min(1, tt / 1.5);
    e.x = e.hx + Math.sin(tt * w) * ax * ease;
    e.y = clampY(fh * 0.5 + Math.sin(tt * w * 2) * ay * ease);
    return;
  }
  if (e.boss === 'tri') {
    // Video (1:14–1:52, top field, tracked at 10 fps): x stays locked at 51.5 % across; it ping-pongs
    // vertically between 9 % and 90 % of the pane height — 2.1 s per traverse (≈0.4 pane/s, eased at
    // the ends), then ~1.2 s parked at the edge. Period ≈ 6.6 s.
    e._ph = 'b';
    const ease = Math.min(1, e._bt / 1.2);
    const top = Math.max(e._bandH || e.h * 0.3, fh * 0.09), bot = Math.min(fh - (e._bandH || e.h * 0.3), fh * 0.9); // video: it pokes half out at the edges
    const s6 = (e._bt + 1.05) % 6.6; // start mid-way down
    let u;
    if (s6 < 2.1) u = s6 / 2.1; else if (s6 < 3.3) u = 1; else if (s6 < 5.4) u = 1 - (s6 - 3.3) / 2.1; else u = 0;
    const ue = u * 0.5 + u * u * (3 - 2 * u) * 0.5;
    const yT = top + (bot - top) * ue;
    e.y = e._ay + (yT - e._ay) * ease;
    e.x = e.hx;
    return;
  }
  if (e.boss === 'jet') {
    // Round 2 jet: slow vertical sweep (straight shots + short bolts) ↔ spiral at centre. No lunges.
    const PH = ['sweep', 'spiral'];
    const D = { sweep: 6.5, spiral: 4.5 };
    if (!e._jph) { e._jph = 'sweep'; e._pt = 0; }
    if (e._pt > D[e._jph]) { e._jph = PH[(PH.indexOf(e._jph) + 1) % PH.length]; e._pt = 0; }
    const p = e._jph;
    e._ph = p; e._warn = 0; e._dashWarn = 0;
    if (p === 'sweep') {
      const ay = Math.max(0, fh * 0.5 - half) * 0.85;
      e._swT = (e._swT || 0) + dt;
      e.y += (clampY(fh * 0.5 + Math.sin(e._swT * 0.9) * ay) - e.y) * Math.min(1, dt * 3);
      e.x += (e.hx - e.x) * Math.min(1, dt * 2);
    } else {
      e.x += (e.hx + 10 - e.x) * Math.min(1, dt * 1.5);
      e.y += (clampY(fh * 0.5) - e.y) * Math.min(1, dt * 1.5);
    }
  }
}

/** Tethered striker tip (core): entry → rest → strike (curl / lunge / hold / swing back) or saw → leave. */
export function armReach(fw) { return Math.min(fw * 0.52, 360); } // keep segments overlapping when extended (video density)
const ARM = { rest: 1.1, coil: 0.75, strike: 260, retract: 170, hold: 0.6, swingW: 1.5, sawWind: 0.5, sawCycle: 4.3, enter: 1.15, chaseW: 1.1, chaseMax: 1.6 };
function armMove(e, dt, fw, fh, px, py) {
  if (e._detached || e.mv === 'snakechase') return; // head already flying free
  const n = e.segs || 11;
  // rest: tightly bunched accordion; extended: still nearly touching (video)
  const Lrest = Math.max(100, n * 16); // tight accordion at rest (video)
  const pivX = fw * 0.70; // video 2:30–2:43: sphere parked at ≈70 % across
  // User 09-29: the lunge must reach the ship's normal area (x ≈ 14 % of the pane at the ship's row),
  // so the player has to back off (or step aside) to dodge. Links keep their size; only the gaps
  // between them widen on the thrust and close up again on the retract.
  const reach = armReach(fw); e._reach = reach;
  e._bt = (e._bt || 0) + dt; e._fw = fw;
  if (e._ph == null) { e._ph = 'enter'; e._pt = 0; e._A = 0; e._L = Lrest; e._wob = Math.random() * 6; }
  e._pt += dt;
  e.tone = undefined; e._pivWind = 0;
  const angTo = (x, y) => Math.atan2(y - e._ty, x - e._tx);
  const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  switch (e._ph) {
    case 'enter': {
      // video ~4:45 / 2:30: 異次元 portal (dark red void) then chain pays out from the sphere
      const u = Math.min(1, e._pt / ARM.enter), k = 1 - (1 - u) * (1 - u);
      e._tx = pivX; e._L = 16 + (Lrest - 16) * k; e._pivWind = 1 - u;
      e._portal = Math.max(0, 1 - u * 0.85); // large 異次元 portal (video); fades as chain pays out
      if (u >= 1) { e._ph = 'rest'; e._pt = 0; e._portal = 0; }
      break;
    }
    case 'rest':
      e._A = Math.sin(e._bt * 1.1 + e._wob) * 0.05; e._L = Lrest;
      if (e._bt > (e.stay || 20)) { e._ph = 'leave'; e._pt = 0; }
      else if (e._pt > ARM.rest) {
        // Prefer the lunge whenever the ship is on this row-band; otherwise saw.
        // (video ~4:45: after portal entry it lunges, and on a miss the head detaches)
        const inReach = Math.hypot(px - e._tx, py - e._ty) < reach + 40
          || Math.abs(py - e._ty) < fh * 0.45;
        e._ph = inReach ? 'coil' : 'sawWind'; e._pt = 0;
        e._aimA = angTo(px, py);
      }
      break;
    case 'coil': { // telegraph: chain curls in and turns toward the ship, tip glows
      const u = Math.min(1, e._pt / ARM.coil);
      e._aimA = angTo(px, py); // tracks the (visible) ship during the curl
      const side = Math.sin(e._aimA) >= 0 ? 1 : -1;
      const tgt = e._aimA;
      // rotate via the ship's side (down-round if the ship is below the pivot, up-round if above)
      let d = tgt - e._A; if (side > 0) { while (d < 0) d += Math.PI * 2; } else { while (d > 0) d -= Math.PI * 2; }
      e._A += d * Math.min(1, dt * 7); e._L = Lrest + (30 - Lrest) * u;
      e.tone = 'wind';
      if (u >= 1) {
        e._A = tgt;
        e._aimX = px; e._aimY = Math.max(12, Math.min(fh - 12, py)); // ship position at strike start
        e._aimA = angTo(e._aimX, e._aimY); e._A = e._aimA;
        e._Lgoal = Math.min(reach, Math.hypot(e._aimX - e._tx, e._aimY - e._ty));
        e._ph = 'strike'; e._pt = 0;
      }
      break;
    }
    case 'strike': {
      // User 10-04c: the head chases the ship during the lunge (limited turn rate → still dodgeable)
      const cy = Math.max(12, Math.min(fh - 12, py));
      const dA = wrap(angTo(px, cy) - e._A), turn = ARM.chaseW * dt;
      e._A += Math.max(-turn, Math.min(turn, dA)); e._aimA = e._A;
      e._Lgoal = Math.min(reach, Math.max(e._L, Math.hypot(px - e._tx, cy - e._ty)));
      e._L = Math.min(e._Lgoal, e._L + ARM.strike * dt);
      if (e._L >= e._Lgoal - 0.5 || e._pt > ARM.chaseMax) { e._ph = 'hold'; e._pt = 0; }
      break;
    }
    case 'hold': { // keeps nosing after the ship a little at full stretch
      const dA = wrap(angTo(px, Math.max(12, Math.min(fh - 12, py))) - e._A), turn = ARM.chaseW * 0.5 * dt;
      e._A += Math.max(-turn, Math.min(turn, dA));
      if (e._pt >= ARM.hold) {
        // video: if the lunge didn't reach the ship, the head detaches and chases
        const dist = Math.hypot(px - e.x, py - e.y);
        if (dist > 48 && !e._detached) { e._ph = 'detach'; e._pt = 0; }
        else { e._ph = 'retract'; e._pt = 0; }
      }
      break;
    }
    case 'detach': {
      // tip (this core) flies free; body retracts via segments noticing _detached
      e._detached = true;
      e._ph = 'chase'; e._pt = 0;
      e._chaseLife = 9;
      e.mv = 'snakechase'; // handled below / in moveScripted
      e._vx = Math.cos(e._A) * 220; e._vy = Math.sin(e._A) * 220;
      break;
    }
    case 'chase': {
      // fallback if still on arm mv briefly
      e.mv = 'snakechase';
      break;
    }
    case 'retract': // chain reels back in along the same line (gaps close up), then swings home
      e._L = Math.max(Lrest, e._L - ARM.retract * dt);
      if (e._L <= Lrest + 0.5) { e._ph = 'swing'; e._pt = 0; e._swDir = Math.sin(e._A) >= 0 ? -1 : 1; }
      break;
    case 'swing': { // swings back round the pivot (through the ship's side) to trail behind again
      const rem = Math.abs(wrap(0 - e._A));
      const step = ARM.swingW * dt;
      if (rem <= step) { e._A = 0; e._ph = 'rest'; e._pt = 0; }
      else e._A = wrap(e._A + e._swDir * step);
      e._L += (Lrest - e._L) * Math.min(1, dt * 1.6);
      break;
    }
    case 'sawWind': // sphere mouth glows, then spits the saw ring + diamond rows (fire step)
      e._pivWind = 1;
      if (e._pt >= ARM.sawWind) { e._sawAim = angTo(px, py); e._armFire = 'saw'; e._ph = 'sawOut'; e._pt = 0; }
      break;
    case 'sawOut':
      e._A = Math.sin(e._bt * 1.1 + e._wob) * 0.05;
      if (e._pt >= ARM.sawCycle) { e._ph = 'rest'; e._pt = 0; }
      break;
    case 'leave':
      e._tx += 70 * dt; e._A = 0; e._L = Lrest;
      if (e._tx > fw + Lrest + 60) e.x = -999;
      break;
  }
  if (e._detached) { e.mv = 'snakechase'; return; }
  if (e._ph !== 'leave' || e._tx <= fw + Lrest + 60) {
    const ox = e.x, oy = e.y;
    e.x = e._tx + Math.cos(e._A) * e._L; e.y = Math.max(8, Math.min(fh - 8, e._ty + Math.sin(e._A) * e._L));
    e._vx = (e.x - ox) / Math.max(dt, 1e-3); e._vy = (e.y - oy) / Math.max(dt, 1e-3);
  }
  e.rot = e._A || 0; // tip faces along lunge
}

/** Scripted movement. Returns true when handled (skip the default drift). `py` = target ship row. */
export function moveScripted(e, dt, fw, fh, py = fh * 0.5, px = 40) {
  if (!e.mv) return false;
  e.mvT = (e.mvT || 0) + dt;
  e._fh = fh;
  const t = e.mvT;
  if (e.mv === 'plan') {
    const tt = t - (e.dly || 0);
    if (tt < 0) {
      const p0 = e.plan[0].p ? e.plan[0].p[0] : [e.x, e.y];
      e.x = p0[0]; e.y = p0[1];
      e._edgeWarn = e.tele && -tt < e.tele && (e.y < 0 || e.y > fh) ? 1 : 0;
      return true;
    }
    e._edgeWarn = 0;
    stepPlan(e, dt, fw, fh, py);
  } else if (e.mv === 'form') {
    const p = formPos(e, t);
    p[0] += e._gOx || 0; p[1] += e._gOy || 0; // rear-guard patrol / cover offset (tickRearGuard)
    if (e.face || e.G.face) { e._vx = (p[0] - e.x) / Math.max(dt, 1e-3); e._vy = (p[1] - e.y) / Math.max(dt, 1e-3); }
    e.x = p[0]; e.y = p[1];
    if (e.G.lead && (e.G.lead.hp <= 0 || e.G.lead.x < -100)) { // leader gone: scatter left
      e.mv = 'plan'; e.plan = [{ k: 'line', vx: 170, amp: 0 }]; e._pi = 0;
    }
  } else if (e.mv === 'zig') {
    e.x -= (e.vx || 150) * dt;
    const ph = ((t * (e.zf || 1) + (e.ph || 0)) % 1 + 1) % 1;
    const tri = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4; // −1…1 triangle
    const ny = e.y0 + (e.amp || 50) * tri;
    e._vx = -(e.vx || 150); e._vy = (ny - e.y) / Math.max(dt, 1e-3);
    e.y = ny;
  } else if (e.mv === 'drift') {
    e.x -= (e.vx || SCROLL) * dt;
    e.y = e.y0 + (e.bob ?? 10) * Math.sin((e.bf || 1.2) * t + (e.ph || 0)); // bob 0 = no vertical motion (bubble wall)
    e.rot = Math.sin(t * 0.7 + (e.ph || 0)) * 0.25;
  } else if (e.mv === 'arm') {
    armMove(e, dt, fw, fh, px, py);
  } else if (e.mv === 'armseg') {
    // Link k of n: on the line pivot → tip; rotate with chain tangent (video accordion)
    const H = e._chainOf;
    if (!H || H.x < -500) { e.x = -999; return true; }
    if (H._detached) {
      // body collapses to the pivot then drifts off (head already chasing)
      const n = (H.segs || 11) + 1;
      if (e.chainIdx === n) { e.x = H._tx; e.y = H._ty; e.tone = 'anchor'; e.rot = H._A || 0; return true; }
      const k = 1 - e.chainIdx / n;
      const L = Math.max(20, (H._L || 200) * Math.max(0, 1 - (H._pt || 0) * 0.55));
      e.x = H._tx + Math.cos(H._A || 0) * L * k;
      e.y = H._ty + Math.sin(H._A || 0) * L * k;
      e.rot = H._A || 0;
      if ((H._pt || 0) > 2.8) e.x = -999;
      return true;
    }
    const n = (H.segs || 11) + 1, k = 1 - e.chainIdx / n; // pivot = 0 … tip = 1
    if (e.chainIdx === n) { e.x = H._tx; e.y = H._ty; e.tone = H._pivWind ? 'anchorWind' : 'anchor'; e.rot = H._A || 0; return true; }
    const A = H._A || 0, L = H._L || 0, lag = (H._ph === 'swing' ? -H._swDir * 0.35 : 0) * Math.sin(Math.PI * k);
    const ox = e.x, oy = e.y;
    e.x = H._tx + Math.cos(A + lag) * L * k;
    e.y = H._ty + Math.sin(A + lag) * L * k + Math.sin(t * 2 + k * 5 + (H._wob || 0)) * 1.2 * Math.sin(Math.PI * k);
    e.rot = A + lag; // segment faces along chain
    e._vx = (e.x - ox) / Math.max(dt, 1e-3); e._vy = (e.y - oy) / Math.max(dt, 1e-3);
    return true;
  } else if (e.mv === 'snake') {
    // Sharp weave (2nd harmonic) + speed surges; every segment replays the head's path (delay dly)
    const tt = t - (e.dly || 0);
    const v = e.v || 90, sk = e.sk || 0, sw = e.sw || 1;
    const X = (s) => e.x0 - v * (s + (sk / sw) * Math.sin(sw * s));
    if (tt < 0) { e.x = e.x0 + v * -tt; e.y = e.y0; }
    else {
      const amp = e.amp || 60, wf = e.wf || 1.5;
      e.x = X(tt);
      e.y = e.y0 + amp * (Math.sin(wf * tt) + (e.k2 || 0) * Math.sin(2.7 * wf * tt));
      e.y = Math.max(20, Math.min((e._fh || 300) - 20, e.y));
    }
  } else if (e.mv === 'loop') {
    const dir = e.loopDir || 1;
    if (e._loopA == null) {
      e.x -= (e.vx || 150) * dt;
      if (e.x <= (e.loopX || fw * 0.55)) { e._loopA = 0; e._lcx = e.x; e._lcy = e.y - dir * (e.R || 60); }
    } else if (e._loopA < Math.PI * 2) {
      e._loopA = Math.min(Math.PI * 2, e._loopA + (Math.PI * 2 / (e.loopDur || 1.6)) * dt);
      const a = e._loopA, R = e.R || 60;
      e.x = e._lcx - R * Math.sin(a);
      e.y = e._lcy + dir * R * Math.cos(a);
      e.rot = -a * dir; // nose follows the loop
    } else {
      e.rot = 0;
      e.x -= (e.vx || 150) * 1.25 * dt; // exits faster
    }
  } else if (e.mv === 'boss') {
    bossMove(e, dt, fw, fh, py);
  } else if (e.mv === 'snakechase') {
    // Detached snake head: homes on the ship with limited turn (dodgeable), then leaves
    e._chaseLife = (e._chaseLife ?? 6.5) - dt;
    const dist = Math.hypot(px - e.x, py - e.y);
    const spd = dist < 70 ? 140 : 240; // slow near the ship so it can be dodged / shot
    const want = Math.atan2(py - e.y, px - e.x);
    let ang = Math.atan2(e._vy || 0, e._vx || -1);
    let d = ((want - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const turn = 2.1 * dt; // rad/s — human-dodgeable
    ang += Math.max(-turn, Math.min(turn, d));
    e._vx = Math.cos(ang) * spd; e._vy = Math.sin(ang) * spd;
    e.x += e._vx * dt; e.y += e._vy * dt;
    e.x = Math.max(24, Math.min(fw - 24, e.x)); // stay on-field while chasing (core must remain targetable)
    e.y = Math.max(10, Math.min(fh - 10, e.y));
    e.rot = ang;
    e.tone = 'chase';
    if (e._chaseLife <= 0) { e.x = -999; }
    return true;
  } else return false;
  // Facing (sprites point left): nose along travel
  if (e.face && e.mv !== 'loop' && (Math.abs(e._vx || 0) + Math.abs(e._vy || 0)) > 5) {
    const want = Math.atan2(e._vy || 0, e._vx || -1) - Math.PI;
    let d = ((want - (e.rot || 0) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    e.rot = (e.rot || 0) + d * Math.min(1, dt * 10);
  }
  // Left the stage (any edge) after having been on it → cull
  const inside = e.x > -30 && e.x < fw + 30 && e.y > -30 && e.y < fh + 30;
  if (inside) e._seen = true;
  else if (e._seen && (e.x < -60 || e.y < -70 || e.y > fh + 70 || e.x > fw + 200)) e.x = -999;
  return true;
}

/** Scripted fire (round red shots). Returns true when this unit uses scripted fire. */
export function fireScripted(e, bullets, tx, ty, dt, canFire) {
  const f = e.fire;
  if (!f) return false;
  const fh = e._fh || 1e9;
  if (e.y < 8 || e.y > fh - 8 || e._diving || e._chainT != null) canFire = false;
  const ox = e.x - (e.w || 30) * 0.4, oy = e.y;
  const shot = (a, spd, dmg = 2) => {
    const b = spawnBullet(ox, oy, Math.cos(a) * spd, Math.sin(a) * spd, 'enemy', false, dmg, { life: 5 });
    b.r = 5; b.orb = true;
    bullets.push(b);
  };
  const dash = (x, y, a, spd = 230) => {
    const b = spawnBullet(x, y, Math.cos(a) * spd, Math.sin(a) * spd, 'enemy', false, 2, { life: 3.2 });
    b.k = 'dash'; b.r = 2.5; b.hb = 1;
    bullets.push(b);
  };
  // Short laser bolt (never a row-covering beam): a ~44 px bright segment flying left at a dodgeable speed
  const laser = (dy = 0, spd = 260) => {
    const b = spawnBullet(ox, oy + dy, -Math.min(300, Math.abs(spd)), 0, 'enemy', false, 2, { life: 3.6 });
    b.k = 'bolt'; b.r = 3; b.hb = 1.5;
    bullets.push(b);
  };
  const aim = Math.atan2(ty - oy, tx - ox);
  // In-progress laser telegraph (field-only warning line, then the beam)
  if (e._laserTele > 0) {
    e._laserTele -= dt;
    e.laserTeleT = Math.max(0, e._laserTele);
    if (e._laserTele <= 0) {
      e.laserTeleT = 0; e.laserAimX = undefined; e.laserAimY = undefined; e.laserTeleOffs = undefined;
      if (e._dashWall) {
        // Dash wall: every telegraphed row fires 3 short white dashes in quick succession
        e._dwRows = e._laserOffs.slice(); e._dwN = 3; e._dwT = 0; e._dashWall = false;
      } else for (const dy of (e._laserOffs || [0])) laser(dy, e._laserSpd || 260);
    }
    return true;
  }
  if (e._dwN > 0) {
    e._dwT -= dt;
    if (e._dwT <= 0) {
      e._dwN--; e._dwT = 0.13;
      for (const dy of e._dwRows) dash(e.x - 20, e.y + dy, Math.PI, 235);
    }
    return true;
  }
  if (f.type === 'boss') { bossFire(e, dt, canFire, shot, laser, aim, ox, oy); return true; }
  if (f.type === 'armhead') {
    // Saw: red spiked ring from the sphere's mouth (flies out, comes back) + 5 diamonds each side
    if (e._armFire === 'saw') {
      e._armFire = false;
      if (e._tx < (e._fw || 1e9) - 10) {
        const a = e._sawAim, cx = e._tx - 18 * Math.cos(0), cy = e._ty, nx = -Math.sin(a), ny = Math.cos(a);
        // video 2:35–2:40 (tracked): out at ≈105 px/s for ≈2.2 s, straight back at ≈120 px/s, docks ~1.1 s
        const sw = spawnBullet(cx, cy, Math.cos(a) * 105, Math.sin(a) * 105, 'enemy', false, 3, { life: 5 });
        sw.k = 'saw'; sw.r = 9; sw.hb = 6; sw.st = 0; sw.hx = cx; sw.hy = cy; sw.out = 2.2; sw.back = 120;
        bullets.push(sw);
        for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
          // video: 2 rows of 5 diamonds ±18 px either side, trailing 12–64 px BEHIND the saw at the same
          // speed; they don't come back (fly on off the pane)
          const x = cx + nx * 18 * side - Math.cos(a) * (12 + i * 13), y = cy + ny * 18 * side - Math.sin(a) * (12 + i * 13);
          const b = spawnBullet(x, y, Math.cos(a) * 105, Math.sin(a) * 105, 'enemy', false, 2, { life: 6 });
          b.k = 'dia'; b.r = 3; b.hb = 1.5;
          bullets.push(b);
        }
      }
    }
    return true;
  }
  if (e._burstN > 0 && canFire) {
    e._burstT -= dt;
    if (e._burstT <= 0) { e._burstN--; e._burstT = f.gap || 0.14; shot(e._burstA + (Math.random() - 0.5) * 0.12, f.spd || 160, 2); }
    return true;
  }
  e._fcd = (e._fcd ?? (0.4 + Math.random() * (f.cd || 2) * FIRE_CD_MUL)) - dt;
  if (!canFire || e.noFireLeave || e._fcd > 0) return true;
  if (f.holdOnly && !e._holding) return true;
  if (f.holdOnly && e._warn) return true;
  // Armour shut: cores with a shutter hold fire while plates are closed
  if (e._sh && e._sh.st === 2 && (f.type === 'fan3' || f.type === 'ringcore' || f.type === 'laser')) return true;
  e._fcd = f.sync ? f.cd : (f.cd || 2) * FIRE_CD_MUL * (0.8 + Math.random() * 0.4);
  if (f.type === 'straight') shot(Math.PI, f.spd || 150, 2);
  else if (f.type === 'aimed') shot(aim + (Math.random() - 0.5) * 2 * (f.noise || 0.3), f.spd || 150, 2);
  else if (f.type === 'burst') { e._burstN = f.n || 3; e._burstT = 0; e._burstA = aim; }
  else if (f.type === 'fan') { const n = f.n || 5; for (let i = 0; i < n; i++) shot(aim + (i - (n - 1) / 2) * (f.sp || 0.2), f.spd || 140, 2); }
  else if (f.type === 'snakehead') {
    // Head spits a twin pair of white dashes straight ahead, then an aimed 3-shot burst
    e._sk = (e._sk || 0) + 1;
    if (e._sk % 2) { dash(ox, oy - 7, aim, 240); dash(ox, oy + 7, aim, 240); }
    else { e._burstN = 3; e._burstT = 0; e._burstA = aim; }
  } else if (f.type === 'dashfan') {
    // Round-2 style: a slanted fan of white dashes toward the player
    const n = f.n || 3;
    for (let i = 0; i < n; i++) dash(ox, oy, aim + (i - (n - 1) / 2) * (f.sp || 0.16), f.spd || 220);
  }
  else if (f.type === 'fan3') { for (let i = -1; i <= 1; i++) shot(aim + i * 0.22, f.spd || 155, 2); }
  else if (f.type === 'ring') {
    const n = f.n || 8; e._ringA = (e._ringA || 0) + (f.spin || 0.35);
    for (let i = 0; i < n; i++) shot(e._ringA + (Math.PI * 2 * i) / n, f.spd || 120, 2);
  } else if (f.type === 'ringcore') {
    // Cycle (as in the original ring): pods fire aimed orbs → core aimed 3-way → DASH WALL
    // (0.6 s warning lines on every pod row, then 3 waves of short white dashes; gaps between rows)
    e._rk = (e._rk || 0) + 1;
    if (e._rk % 3 === 2) {
      const pods = (e.drones || []).filter((d) => d.hp > 0);
      const rows = [];
      for (const d of pods) {
        const dy = Math.round(Math.sin(d.ang) * d.dist * (d.ky || 1));
        if (!rows.some((r) => Math.abs(r - dy) < 16)) rows.push(dy);
      }
      if (!rows.length) rows.push(-30, 30);
      // keep lanes open: rows at least 46 px apart (a ship needs ~34 px to slip between)
      rows.sort((p, q) => p - q);
      const kept = [];
      for (const r of rows) if (!kept.length || r - kept[kept.length - 1] >= 46) kept.push(r);
      rows.length = 0; rows.push(...kept);
      e._dashWall = true;
      beginLaser(e, rows, 0.5, 0);
      e._fcd += 0.8;
    } else if (e._rk % 3 === 0) {
      // Aimed volley from the glowing core
      for (let i = -1; i <= 1; i++) shot(aim + i * 0.2, (f.spd || 125) + 30, 2);
    } else {
      const n = 8; e._ringA = (e._ringA || 0) + 0.4;
      const pods = (e.drones || []).filter((d) => d.hp > 0);
      if (pods.length) {
        for (const d of pods) {
          const px = e.x + Math.cos(d.ang) * d.dist, py = e.y + Math.sin(d.ang) * d.dist * (d.ky || 1);
          const a = Math.atan2(ty - py, tx - px);
          const b = spawnBullet(px, py, Math.cos(a) * 140, Math.sin(a) * 140, 'enemy', false, 2, { life: 4 });
          b.r = 4.5; b.orb = true; bullets.push(b);
        }
      } else {
        for (let i = 0; i < n; i++) shot(e._ringA + (Math.PI * 2 * i) / n, f.spd || 120, 2);
      }
    }
  } else if (f.type === 'laser') {
    beginLaser(e, f.offs || [0], f.tele || 0.55, f.spd || 500);
  }
  return true;
}

function beginLaser(e, offs, tele, spd) {
  e._laserTele = tele; e._laserOffs = offs; e._laserSpd = spd;
  e.laserTeleT = tele; e.laserTeleMax = tele;
  e.laserAimX = e.x; e.laserAimY = e.y; // aimX == x → muzzle glow only (no warning beam across the row)
  e.laserTeleOffs = offs.length === 1 && offs[0] === 0 ? undefined : offs;
}

function bossFire(e, dt, canFire, shot, laser, aim, ox, oy) {
  if (!canFire || e._bt == null || e._ph === 'leave') return;
  // Finish any laser telegraph first
  if (e._laserTele > 0) {
    e._laserTele -= dt;
    e.laserTeleT = Math.max(0, e._laserTele);
    if (e._laserTele <= 0) {
      e.laserTeleT = 0; e.laserAimX = undefined; e.laserAimY = undefined; e.laserTeleOffs = undefined;
      for (const dy of (e._laserOffs || [0])) laser(dy, e._laserSpd || 260);
    }
    return;
  }
  e._fcd = (e._fcd ?? 0.8) - dt;
  if (e._fcd > 0) return;
  const open = !(e._sh && e._sh.st === 2);
  if (e.boss === 'tri') {
    // Cycle: 5-way fan → aimed 3-burst → telegraphed twin laser (while parked)
    e._atkI = (e._atkI || 0) + 1;
    if (e._ph === 'b' && e._pt > 0.5) {
      const step = e._atkI % 3;
      if (step === 1) { e._fcd = 1.6; for (let i = -2; i <= 2; i++) shot(aim + i * 0.2, 145, 2); }
      else if (step === 2) { e._fcd = 1.4; for (let i = 0; i < 3; i++) shot(aim + (Math.random() - 0.5) * 0.15, 165, 2); }
      else { e._fcd = 2.2; beginLaser(e, [-10, 10], 0.45, 250); }
    } else { e._fcd = 0.8; }
  } else if (e.boss === 'eye') {
    // When armour open: telegraphed core laser; otherwise aimed 3-way. Faster as core HP drops.
    const hurt = 1 - (e.core ? e.core.hp / e.core.maxHp : 1);
    e._atkI = (e._atkI || 0) + 1;
    if (open && e._atkI % 2 === 0) {
      e._fcd = 2.4 - 0.5 * hurt;
      beginLaser(e, [-8, 8], 0.45, 240);
    } else {
      e._fcd = 1.8 - 0.4 * hurt;
      for (let i = -1; i <= 1; i++) shot(aim + i * 0.22, 140, 2);
    }
  } else if (e.boss === 'jet') {
    if (e._ph === 'sweep') {
      // Sweep phase: telegraphed laser every ~2 s, plus a straight orb between
      e._atkI = (e._atkI || 0) + 1;
      if (e._atkI % 3 === 0) { e._fcd = 1.8; beginLaser(e, [0], 0.4, 270); }
      else { e._fcd = 0.55; shot(Math.PI, 175, 2); }
    } else if (e._ph === 'spiral') {
      e._fcd = 0.24;
      e._spA = (e._spA || 0) + 0.38;
      for (let k = 0; k < 3; k++) shot(e._spA + (Math.PI * 2 * k) / 3, 118, 2);
    } else if (e._ph === 'back') {
      e._fcd = 0.55;
      for (let i = -1; i <= 1; i++) shot(aim + i * 0.25, 155, 2);
    } else { e._fcd = 0.6; }
  }
}

