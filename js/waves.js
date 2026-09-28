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
 *   boss        tri boss (reposition + stop-and-fan), eye boss (figure-8), jet boss (sweep → dash → spiral)
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
import { spawnEnemy, spawnCoreEscorts, spawnBullet, GUARD_HP } from './entities.js?v=20260929032603';

const SCROLL = 55; // px/s — trap mines drift at background scroll speed
const rnd = (a, b) => a + Math.random() * (b - a);

function mk(kind, fw, fh, x, y, o = {}) {
  const e = spawnEnemy(fw, fh, kind);
  e.x = x; e.y = y;
  Object.assign(e, o);
  if (o.hp != null) e.maxHp = o.hp;
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
  mech: (o) => ({ w: 40, h: 48, hp: 4, score: 10, dropMul: 0.4, ...o }),
  wedge: (o) => ({ w: 38, h: 28, hp: 3, score: 10, dropMul: 0.3, noFire: true, ...o }),
  dart: (o) => ({ spr: 'drone', w: 34, h: 30, hp: 2, score: 8, dropMul: 0.3, noFire: true, face: true, ...o }),
  swooper: (o) => ({ spr: 'fighter_mk2', w: 42, h: 38, hp: 4, score: 15, dropMul: 0.5, face: true, ...o }),
  gunship: (o) => ({ spr: 'gunship_alpha_b', w: 58, h: 52, hp: 9, score: 25, dropMul: 0.7, ...o }),
  spider: (o) => ({ spr: 'gunship_alpha', w: 46, h: 44, hp: 6, score: 15, dropMul: 0.6, ...o }),
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
      fire: fire ? straight(1.8, 150) : null, noFire: !fire,
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
      fire: { type: 'burst', spd: 165, cd: 0.9, n: 3, gap: 0.14, holdOnly: true },
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
  const cy = Math.max(110, Math.min(fh - 110, fh * fy));
  const ey = fromTop == null ? cy : fromTop ? -120 : fh + 120;
  const lead = mk('wave_grid_core', fw, fh, fw + 150, ey, {
    mv: 'plan', noFire: true,
    plan: [B([fw + 150, ey], [fw * 0.95, fromTop == null ? cy : cy - (fromTop ? 1 : -1) * 90], [fw * 0.8, cy], [fw * 0.68, cy], 2.2),
      { k: 'hold', d: 10, bob: 30, bw: 0.9, sway: 34 },
      B([fw * 0.68, cy], [fw * 0.55, cy], [fw * 0.4, cy + 40], [-120, cy + 30], 6)],
  });
  const G = { lead, sp: 40, wob: 2, shapes: [{ t: 0, s: 'box', L: 80 }, { t: 4, s: 'circle', R: 88, w: 1.3 }, { t: 8.5, s: 'box', L: 80, w: 0.35 }, { t: 12.5, s: 'circle', R: 84, w: -1.1 }] };
  const cage = form(fw, fh, 'wave_escort', 16, () => T.wedge({ _chainOf: lead, noDrop: true, hp: GUARD_HP.cage }), G);
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
      fire: aimed(2.6, 140), noFire: false,
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
  const y = Math.max(80, Math.min(fh - 80, fh * fy)), fromTop = fy < 0.5, ey = fromTop ? -90 : fh + 90;
  return [mk('wave_ring_core', fw, fh, fw * 0.95, ey, {
    mv: 'plan', tele: 0, noFire: true,
    plan: [B([fw * 0.95, ey], [fw * 0.95, y], [fw * 0.85, y], [fw * 0.72, y], 2.2),
      { k: 'hold', d: 12, bob: 44, bw: 0.7, sway: 46 },
      B([fw * 0.72, y], [fw * 0.6, y], [fw * 0.3, y + (fromTop ? 50 : -50)], [-120, y], 7)],
  })];
}

// ---------- snake / caterpillar ----------
function snake(fw, fh, fy, segs = 6, tone = 'silver') {
  const y0 = fh * fy;
  const P = { v: vx(fw, 17), amp: Math.min(fh * 0.3, 100), wf: 1.8, k2: 0.35, sk: 0.6, sw: 0.8 };
  const head = mk('wave_snake_head', fw, fh, fw + 40, y0, {
    mv: 'snake', ...P, dly: 0, x0: fw + 40,
    fire: aimed(1.6, 165, 0.2),
  });
  const out = [head];
  for (let i = 1; i <= segs; i++) {
    out.push(mk('wave_snake_seg', fw, fh, fw + 40, y0, {
      w: 40, h: 40, hp: GUARD_HP.seg, score: 20, mv: 'snake', ...P,
      dly: i * 0.3, x0: fw + 40, _chainOf: head, chainIdx: i, noFire: true, noDrop: true, tone,
    }));
  }
  for (const e of out) e.y0 = y0;
  return out;
}
function caterpillar(fw, fh, fy) {
  const out = [];
  const P = { v: vx(fw, 7.5), amp: fh * 0.2, wf: 2.8, k2: 0.25, sk: 0.4, sw: 1.3 };
  for (let i = 0; i < 5; i++) {
    out.push(mk('wave_cater', fw, fh, fw + 40, fh * fy, {
      w: 30, h: 30, hp: 4, score: 10, mv: 'snake', ...P, x0: fw + 40,
      dly: i * 0.22, noFire: true, dropMul: 0.3, tone: 'green',
    }));
  }
  for (const e of out) e.y0 = fh * fy;
  return out;
}
function mines(fw, fh, rowsF) {
  return rowsF.map((fy, i) => mk('wave_mine', fw, fh, fw + 30 + i * rnd(70, 110), fh * fy, {
    w: 34, h: 34, hp: 8, score: 10, mv: 'drift', vx: SCROLL * rnd(0.9, 1.15), bob: rnd(8, 16), bf: rnd(0.9, 1.6), ph: rnd(0, 6), noFire: true, dropMul: 0.3,
  }));
}

// ---------- round 2 ----------
function loopers(fw, fh, fy, n = 4) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(mk('wave_looper', fw, fh, fw + 30 + i * 56, fh * fy, {
      spr: 'light_destroyer', w: 44, h: 40, hp: 4, score: 15, mv: 'loop', vx: vx(fw, 4.2) * rnd(0.9, 1.12),
      loopX: fw * rnd(0.45, 0.62), R: Math.min(fh * 0.22, 70) * rnd(0.8, 1.1), loopDur: rnd(1.4, 1.8), dropMul: 0.5,
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
  return form(fw, fh, 'wave_saucer', n, (i) => ({ spr: 'swarm', w: 34, h: 30, hp: 3, score: 8, dropMul: 0.3, noFire: i % 4 !== 0, fire: i % 4 === 0 ? aimed(2.6, 140) : null }), G);
}
function saucers(fw, fh, fy, n = 8, wavy = false) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(mk('wave_saucer', fw, fh, fw + 30 + i * 40, fh * fy, {
      spr: 'swarm', w: 34, h: 30, hp: 3, score: 8, mv: 'plan', dropMul: 0.3, noFire: i % 3 !== 0,
      plan: [{ k: 'line', vx: vx(fw, 4.4) * rnd(0.9, 1.1), amp: wavy ? fh * 0.14 : fh * 0.03, wf: 3, ph: -i * 0.55, surge: 0.25 }],
      fire: i % 3 === 0 ? straight(2.4, 150) : null,
    }));
  }
  return out;
}

// ---------- bosses ----------
function coreBossPack(fw, fh, fy) {
  const e = spawnEnemy(fw, fh, 'wave_core_boss');
  e.y = Math.max(e.h * 0.5 + 6, Math.min(fh - e.h * 0.5 - 6, fh * fy));
  const esc = spawnCoreEscorts(e, fw, fh);
  e._entryX = null;
  Object.assign(e, { mv: 'boss', boss: 'tri', hx: fw * 0.8, y0: e.y, stay: 29, mvT: 0,
    fire: { type: 'boss' } });
  return [e, ...esc];
}
function eyeBoss(fw, fh) {
  const e = spawnEnemy(fw, fh, 'wave_eye_boss');
  e.y = fh * 0.5;
  const esc = spawnCoreEscorts(e, fw, fh);
  e._entryX = null;
  Object.assign(e, { mv: 'boss', boss: 'eye', hx: fw * 0.66, y0: fh * 0.5, stay: 36, mvT: 0, fire: { type: 'boss' } });
  return [e, ...esc];
}
function jetBoss(fw, fh) {
  const e = mk('wave_core_boss', fw, fh, fw + 110, fh * 0.5, {
    mv: 'boss', boss: 'jet', hx: fw * 0.7, stay: 32, fire: { type: 'boss' },
  });
  const esc = spawnCoreEscorts(e, fw, fh).map((s) => Object.assign(s, { noFire: true }));
  e._entryX = null;
  return [e, ...esc];
}

/** [time s, builder(fw, fh) → enemies, optional tag] — waves overlap a little on purpose. */
export const WAVE_SCRIPT = [
  // W1
  [2, (w, h) => mechArc(w, h, true, 4, false)],
  [4.2, (w, h) => mechArc(w, h, false, 4, true)],
  [6.8, (w, h) => stopShoot(w, h, [0.3, 0.7])],
  [9.2, (w, h) => zig(w, h, 0.5, 6)],
  [11.5, (w, h) => splitGroup(w, h, 0.5, 8, 'scout_drone', true)],
  // W2
  [14.5, (w, h) => morphWedges(w, h, 0.4)],
  [17.5, (w, h) => swoopers(w, h, true, 3)],
  [19.5, (w, h) => behindArc(w, h, true, 5)],
  [21.8, (w, h) => splitGroup(w, h, 0.5, 8, 'drone')],
  [24.5, (w, h) => gridCore(w, h, 0.45, true)],   // lingers ~12 s in the right half
  [29, (w, h) => swoopers(w, h, false, 2)],
  [34, (w, h) => zig(w, h, 0.8, 4, 0.1)],
  [40, (w, h) => coreBossPack(w, h, 0.5)],        // stays ~29 s
  // W3 (light while the tri boss is up)
  [47, (w, h) => spiders(w, h, 0.25, 4)],
  [55, (w, h) => stopShoot(w, h, [0.22, 0.78], null, 'wave_spider')],
  [62, (w, h) => zig(w, h, 0.75, 4, 0.1)],
  // W4 rings
  [70, (w, h) => ring(w, h, 0.4)],
  [75, (w, h) => swoopers(w, h, true, 2)],
  [86, (w, h) => ring(w, h, 0.6)],
  [92, (w, h) => swoopers(w, h, false, 2)],
  // midboss eye (~36 s)
  [104, (w, h) => eyeBoss(w, h)],
  [118, (w, h) => swoopers(w, h, true, 2)],
  [130, (w, h) => swoopers(w, h, false, 2)],
  // boss snake (slow crossing)
  [146, (w, h) => snake(w, h, 0.5)],
  [154, (w, h) => behindArc(w, h, false, 4)],
  [160, (w, h) => zig(w, h, 0.3, 5)],
  // trap zone
  [166, (w, h) => mines(w, h, [0.2, 0.55, 0.85])],
  [170, (w, h) => caterpillar(w, h, 0.35)],
  [174, (w, h) => gridCore(w, h, 0.5, false)],
  [180, (w, h) => mines(w, h, [0.3, 0.8])],
  [186, (w, h) => swoopers(w, h, true, 2)],
  [192, (w, h) => mines(w, h, [0.15, 0.5, 0.85])],
  [196, (w, h) => ring(w, h, 0.55)],
  [200, (w, h) => caterpillar(w, h, 0.7)],
  [206, (w, h) => mines(w, h, [0.35, 0.7])],
  [212, (w, h) => stopShoot(w, h, [0.3, 0.7])],
  // round 2
  [220, () => [], 'round2'],
  [222, (w, h) => loopers(w, h, 0.35)],
  [226, (w, h) => loopers(w, h, 0.65)],
  [230, (w, h) => swoopers(w, h, true, 3, 'plasma_bomber')],
  [238, (w, h) => jetBoss(w, h)],                 // ~32 s of sweep / dash / spiral
  [252, (w, h) => loopers(w, h, 0.5, 3)],
  [264, (w, h) => saucerCircle(w, h, 0.35)],
  [274, (w, h) => gridCore(w, h, 0.45, true)],
  [282, (w, h) => saucerCircle(w, h, 0.7)],
  [289, (w, h) => zig(w, h, 0.3, 5)],
];

/**
 * Spawn every script entry whose time has come on this field. `st` holds the per-field cursor.
 * Returns the tags of fired entries (e.g. 'round2') for UI.
 */
export function runWaveScript(st, time, list, fw, fh) {
  const tags = [];
  st._waveI = st._waveI || 0;
  while (st._waveI < WAVE_SCRIPT.length && WAVE_SCRIPT[st._waveI][0] <= time) {
    const [, build, tag] = WAVE_SCRIPT[st._waveI++];
    for (const e of build(fw, fh)) list.push(e);
    if (tag) tags.push(tag);
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
  const t = e.mvT, half = e.h * 0.5 + 6;
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
    // reposition (1.4 s arc) → stop and fan (2.4 s) → …
    if (e._ph === 'a') {
      if (!e._aInit) { e._aInit = true; e._fromY = e.y; e._toY = clampY(fh * (0.25 + Math.random() * 0.5)); e._fromX = e.x; e._toX = fw * rnd(0.74, 0.84); }
      const u = Math.min(1, e._pt / 1.4), s = u * u * (3 - 2 * u);
      e.x = e._fromX + (e._toX - e._fromX) * s;
      e.y = e._fromY + (e._toY - e._fromY) * s;
      if (u >= 1) { e._ph = 'b'; e._pt = 0; e._aInit = false; }
    } else {
      e.y = clampY(e._toY + Math.sin(e._pt * 3) * 6);
      if (e._pt > 2.4) { e._ph = 'a'; e._pt = 0; }
    }
    return;
  }
  if (e.boss === 'jet') {
    // sweep (vertical, straight shots) → dash (telegraph, lunge along its row, return) → spiral
    const PH = ['sweep', 'dashwarn', 'dash', 'back', 'spiral'];
    const D = { sweep: 4.2, dashwarn: 0.9, dash: 0.75, back: 1.2, spiral: 4.0 };
    if (!e._jph) { e._jph = 'sweep'; e._pt = 0; }
    if (e._pt > D[e._jph]) {
      e._jph = PH[(PH.indexOf(e._jph) + 1) % PH.length]; e._pt = 0;
      if (e._jph === 'dashwarn') e._peel = true; // escorts break off before the first dash
    }
    const p = e._jph;
    e._ph = p;
    e._warn = p === 'dashwarn' ? 1 : 0;
    e._dashWarn = p === 'dashwarn' ? 1 : 0;
    if (p === 'sweep') {
      const ay = Math.max(0, fh * 0.5 - half);
      e.y = clampY(fh * 0.5 + Math.sin(e._pt * 1.5) * ay);
      e.x += (e.hx - e.x) * Math.min(1, dt * 3);
    } else if (p === 'dash') {
      const u = Math.min(1, e._pt / D.dash);
      e.x = e.hx - (e.hx - fw * 0.36) * Math.sin(u * Math.PI * 0.5);
    } else if (p === 'back') {
      e.x += (e.hx - e.x) * Math.min(1, dt * 3);
    } else if (p === 'spiral') {
      e.x += (e.hx + 20 - e.x) * Math.min(1, dt * 2);
      e.y += (fh * 0.5 - e.y) * Math.min(1, dt * 2);
    }
  }
}

/** Scripted movement. Returns true when handled (skip the default drift). `py` = target ship row. */
export function moveScripted(e, dt, fw, fh, py = fh * 0.5) {
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
    e.y = e.y0 + (e.bob || 10) * Math.sin((e.bf || 1.2) * t + (e.ph || 0));
    e.rot = Math.sin(t * 0.7 + (e.ph || 0)) * 0.25;
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
  const aim = Math.atan2(ty - oy, tx - ox);
  if (f.type === 'boss') { bossFire(e, dt, canFire, shot, aim); return true; }
  // queued burst shots
  if (e._burstN > 0 && canFire) {
    e._burstT -= dt;
    if (e._burstT <= 0) { e._burstN--; e._burstT = f.gap || 0.14; shot(e._burstA + (Math.random() - 0.5) * 0.12, f.spd || 160, 2); }
    return true;
  }
  e._fcd = (e._fcd ?? (0.6 + Math.random() * (f.cd || 2))) - dt;
  if (!canFire || e.noFireLeave || e._fcd > 0) return true;
  if (f.holdOnly && !e._holding) return true;
  if (f.holdOnly && e._warn) return true; // blink first, then shoot
  e._fcd = (f.cd || 2) * (0.8 + Math.random() * 0.4);
  if (f.type === 'straight') shot(Math.PI, f.spd || 150, 2);
  else if (f.type === 'aimed') shot(aim + (Math.random() - 0.5) * 2 * (f.noise || 0.3), f.spd || 150, 2);
  else if (f.type === 'burst') { e._burstN = f.n || 3; e._burstT = 0; e._burstA = aim; }
  else if (f.type === 'fan') { const n = f.n || 5; for (let i = 0; i < n; i++) shot(aim + (i - (n - 1) / 2) * (f.sp || 0.2), f.spd || 140, 2); }
  return true;
}

function bossFire(e, dt, canFire, shot, aim) {
  if (!canFire || e._bt == null || e._ph === 'leave') return;
  e._fcd = (e._fcd ?? 1) - dt;
  if (e.boss === 'tri') {
    // stop-and-fan: two 5-way fans while parked
    if (e._ph === 'b' && e._fcd <= 0 && e._pt > 0.7) {
      e._fcd = 2.4;
      for (let i = -2; i <= 2; i++) shot(aim + i * 0.2, 140, 2);
    }
  } else if (e.boss === 'eye') {
    if (e._fcd <= 0) {
      e._fcd = 2.6 - 0.6 * (1 - (e.core ? e.core.hp / e.core.maxHp : 1));
      for (let i = -1; i <= 1; i++) shot(aim + i * 0.22, 135, 2);
    }
  } else if (e.boss === 'jet') {
    if (e._ph === 'sweep' && e._fcd <= 0) { e._fcd = 0.62; shot(Math.PI, 170, 2); }
    else if (e._ph === 'spiral') {
      // 3-arm rotating spiral, slow bullets: wide gaps to slip through
      if (e._fcd <= 0) {
        e._fcd = 0.27;
        e._spA = (e._spA || 0) + 0.38;
        for (let k = 0; k < 3; k++) shot(e._spA + (Math.PI * 2 * k) / 3, 115, 2);
      }
    } else if (e._ph === 'back' && e._fcd <= 0) { e._fcd = 0.6; for (let i = -1; i <= 1; i++) shot(aim + i * 0.25, 150, 2); }
  }
}
