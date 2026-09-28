/**
 * Scripted wave director — recreation of スタートリックオンライン (2011) battle flow, compressed
 * into the 5-minute match. Wave-only kinds (never shop / deck / PT / transfer). Both fields run
 * the SAME script on their own clock (player field: S.time, COM field: B.time) — same rules.
 *
 *  0:02 W1  small grey mech lines (no fire) → firing clusters (slow red round shots, straight)
 *  0:14 W2  white wedge V / diagonals / 5×4 grids → grids with a red-core ship in the centre
 *  0:32     triangular core boss + escort pack
 *  0:36 W3  green spider ships on sine paths, loosely aimed shots
 *  0:53 W4  rotating ring (8 fighter pods around a red core)
 *  1:04     midboss: giant red eye (slow, claws = destructible sections)
 *  1:26     boss: segmented snake (red head = core, silver segments, sine; head kill → body chain)
 *  1:48     mixed reprise
 *  2:10     trap zone: yellow square mines at scroll speed + green caterpillars + snake returns
 *  3:40 R2  red winged loopers (360° vertical loop), red jet boss hovering (rings / clusters),
 *           pink saucer swarms (straight / wavy)
 */
import { spawnEnemy, spawnCoreEscorts, spawnBullet } from './entities.js?v=20260929010859';

const SCROLL = 55; // px/s — trap mines drift at background scroll speed

function mk(kind, fw, fh, x, y, o = {}) {
  const e = spawnEnemy(fw, fh, kind);
  e.x = x; e.y = Math.max(18, Math.min(fh - 18, y));
  Object.assign(e, o);
  if (o.hp != null) e.maxHp = o.hp;
  e.mvT = e.mvT || 0;
  e.y0 = e.y; e.x0 = e.x;
  return e;
}
const vx = (fw, T) => (fw + 80) / T; // speed that crosses the pane in ~T s

// ---------- formations ----------
function mechLine(fw, fh, fy, n, fire) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(mk('wave_mech', fw, fh, fw + 30 + i * 62, fh * fy, {
      w: 40, h: 48, hp: 4, score: 10, mv: 'line', vx: vx(fw, 4.6), dropMul: 0.4,
      fire: fire ? { type: 'straight', spd: 150, cd: 1.6 + Math.random() * 0.8 } : null, noFire: !fire,
    }));
  }
  return out;
}
function mechCluster(fw, fh, fy) {
  const out = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    out.push(mk('wave_mech', fw, fh, fw + 30 + c * 52, fh * fy + (r - 0.5) * 56, {
      w: 40, h: 48, hp: 4, score: 10, mv: 'line', vx: vx(fw, 5), dropMul: 0.4,
      fire: { type: 'straight', spd: 140, cd: 1.4 + Math.random() * 1.2 },
    }));
  }
  return out;
}
const wedge = (fw, fh, x, y, o = {}) => mk('wave_escort', fw, fh, x, y, {
  w: 38, h: 28, hp: 3, score: 10, mv: 'line', vx: vx(fw, 4), dropMul: 0.3, noFire: true, ...o,
});
function vee(fw, fh, fy, n = 7) {
  const out = [];
  const h = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const k = Math.abs(i - h);
    out.push(wedge(fw, fh, fw + 30 + k * 40, fh * fy + (i - h) * 34));
  }
  return out;
}
function diag(fw, fh, down, n = 6) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = down ? fh * 0.14 + i * fh * 0.13 : fh * 0.86 - i * fh * 0.13;
    out.push(wedge(fw, fh, fw + 30 + i * 44, y));
  }
  return out;
}
function grid(fw, fh, fy, cols = 5, rows = 4) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const front = c === 0;
    out.push(wedge(fw, fh, fw + 30 + c * 46, fh * fy + (r - (rows - 1) / 2) * 38, front
      ? { noFire: false, fire: { type: 'straight', spd: 165, cd: 1.8 + Math.random() * 1.4 } } : {}));
  }
  return out;
}
/** 5×5 grid of wedges with a red-core ship in the exact centre; the 3×3 middle is left open. */
function gridCore(fw, fh, fy) {
  const gx = 50, gy = 40;
  const cx = fw + 30 + 2 * gx, cy = Math.max(gy * 2 + 18, Math.min(fh - gy * 2 - 18, fh * fy));
  const lead = mk('wave_grid_core', fw, fh, cx, cy, { mv: 'line', vx: vx(fw, 5.2) });
  const out = [lead];
  for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
    if (Math.abs(r) <= 1 && Math.abs(c) <= 1) continue; // open centre: core stays visible
    out.push(wedge(fw, fh, cx + c * gx, cy + r * gy, { vx: lead.vx, _chainOf: lead, noDrop: true }));
  }
  return out;
}
function spiders(fw, fh, fy, n = 5, amp = 0.16) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(mk('wave_spider', fw, fh, fw + 30 + i * 70, fh * fy, {
      spr: 'gunship_alpha', w: 46, h: 44, hp: 6, score: 15, mv: 'line', vx: vx(fw, 6),
      amp: fh * amp, wf: 2.2, ph: -i * 0.8, dropMul: 0.6,
      fire: { type: 'aimed', spd: 150, cd: 1.8 + Math.random() * 1.2, noise: 0.35 },
    }));
  }
  return out;
}
function ring(fw, fh, fy) {
  return [mk('wave_ring_core', fw, fh, fw + 90, fh * fy, { mv: 'line', vx: vx(fw, 6.5) })];
}
function snake(fw, fh, fy, segs = 6, tone = 'silver') {
  const head = mk('wave_snake_head', fw, fh, fw + 40, fh * fy, {
    mv: 'snake', v: vx(fw, 9), amp: fh * 0.24, wf: 1.5, dly: 0,
    fire: { type: 'aimed', spd: 170, cd: 1.5, noise: 0.2 },
  });
  const out = [head];
  for (let i = 1; i <= segs; i++) {
    out.push(mk('wave_snake_seg', fw, fh, fw + 40, fh * fy, {
      w: 40, h: 40, hp: 10, score: 20, mv: 'snake', v: head.v, amp: head.amp, wf: head.wf,
      dly: i * 0.34, x0: fw + 40, _chainOf: head, chainIdx: i, noFire: true, noDrop: true, tone,
    }));
  }
  for (const e of out) { e.x0 = fw + 40; e.y0 = head.y0; }
  return out;
}
function caterpillar(fw, fh, fy) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    out.push(mk('wave_cater', fw, fh, fw + 40, fh * fy, {
      w: 30, h: 30, hp: 4, score: 10, mv: 'snake', v: vx(fw, 7), amp: fh * 0.18, wf: 2.4,
      dly: i * 0.2, noFire: true, dropMul: 0.3, tone: 'green',
    }));
  }
  for (const e of out) { e.x0 = fw + 40; e.y0 = fh * fy; }
  return out;
}
function mines(fw, fh, rowsF) {
  return rowsF.map((fy, i) => mk('wave_mine', fw, fh, fw + 30 + i * 90, fh * fy, {
    w: 34, h: 34, hp: 8, score: 10, mv: 'line', vx: SCROLL, noFire: true, dropMul: 0.3,
  }));
}
function loopers(fw, fh, fy, n = 4) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(mk('wave_looper', fw, fh, fw + 30 + i * 56, fh * fy, {
      spr: 'light_destroyer', w: 44, h: 40, hp: 4, score: 15, mv: 'loop', vx: vx(fw, 4.2),
      loopX: fw * 0.55, R: Math.min(fh * 0.22, 70), loopDur: 1.6, dropMul: 0.5,
      fire: { type: 'straight', spd: 160, cd: 2.2 + Math.random() }, noFire: false,
    }));
  }
  return out;
}
function jetBoss(fw, fh) {
  const e = mk('wave_core_boss', fw, fh, fw + 110, fh * 0.5, {
    mv: 'hover', vx: 110, hx: fw * 0.68, bob: fh * 0.2, wf: 0.9, hoverDur: 38,
    fire: { type: 'ringcluster', spd: 130, cd: 1.9 },
  });
  return [e, ...spawnCoreEscorts(e, fw, fh).map((s) => Object.assign(s, { noFire: true }))];
}
function saucers(fw, fh, fy, n = 8, wavy = false) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(mk('wave_saucer', fw, fh, fw + 30 + i * 40, fh * fy, {
      spr: 'swarm', w: 34, h: 30, hp: 3, score: 8, mv: 'line', vx: vx(fw, 4.4),
      amp: wavy ? fh * 0.14 : 0, wf: 3, ph: -i * 0.55, dropMul: 0.3, noFire: i % 3 !== 0,
      fire: i % 3 === 0 ? { type: 'straight', spd: 150, cd: 2.4 + Math.random() } : null,
    }));
  }
  return out;
}
function coreBossPack(fw, fh, fy) {
  const e = spawnEnemy(fw, fh, 'wave_core_boss');
  e.y = Math.max(e.h * 0.5 + 6, Math.min(fh - e.h * 0.5 - 6, fh * fy));
  return [e, ...spawnCoreEscorts(e, fw, fh)];
}
function eyeBoss(fw, fh) {
  const e = spawnEnemy(fw, fh, 'wave_eye_boss');
  e.y = fh * 0.5; e.speed = 42;
  return [e, ...spawnCoreEscorts(e, fw, fh)];
}

/** [time s, builder(fw, fh) → enemies, optional tag] */
export const WAVE_SCRIPT = [
  [2, (w, h) => mechLine(w, h, 0.3, 4, false)],
  [4.5, (w, h) => mechLine(w, h, 0.7, 5, false)],
  [7, (w, h) => mechLine(w, h, 0.5, 5, false)],
  [9.5, (w, h) => mechCluster(w, h, 0.28)],
  [12, (w, h) => mechCluster(w, h, 0.72)],
  [14.5, (w, h) => vee(w, h, 0.5)],
  [17, (w, h) => diag(w, h, true)],
  [19.2, (w, h) => diag(w, h, false)],
  [21.5, (w, h) => grid(w, h, 0.5)],
  [25, (w, h) => gridCore(w, h, 0.36)],
  [29, (w, h) => gridCore(w, h, 0.64)],
  [32, (w, h) => coreBossPack(w, h, 0.5)],
  [37, (w, h) => spiders(w, h, 0.3)],
  [41, (w, h) => spiders(w, h, 0.7)],
  [45, (w, h) => spiders(w, h, 0.5, 5, 0.26)],
  [49, (w, h) => [...spiders(w, h, 0.25, 3, 0.1), ...spiders(w, h, 0.75, 3, 0.1)]],
  [53, (w, h) => ring(w, h, 0.36)],
  [58.5, (w, h) => ring(w, h, 0.64)],
  [64, (w, h) => eyeBoss(w, h)],
  [86, (w, h) => snake(w, h, 0.5)],
  [108, (w, h) => vee(w, h, 0.3)],
  [110, (w, h) => mechLine(w, h, 0.75, 5, true)],
  [114, (w, h) => gridCore(w, h, 0.5)],
  [120, (w, h) => ring(w, h, 0.4)],
  [125, (w, h) => spiders(w, h, 0.6)],
  // trap zone
  [131, (w, h) => mines(w, h, [0.2, 0.55, 0.85])],
  [136, (w, h) => caterpillar(w, h, 0.35)],
  [138, (w, h) => mines(w, h, [0.35, 0.7])],
  [145, (w, h) => mines(w, h, [0.15, 0.5, 0.8])],
  [148, (w, h) => gridCore(w, h, 0.4)],
  [152, (w, h) => mines(w, h, [0.3, 0.65])],
  [156, (w, h) => caterpillar(w, h, 0.65)],
  [159, (w, h) => mines(w, h, [0.2, 0.5, 0.85])],
  [163, (w, h) => ring(w, h, 0.55)],
  [166, (w, h) => mines(w, h, [0.4, 0.75])],
  [172, (w, h) => snake(w, h, 0.45)],
  [180, (w, h) => mines(w, h, [0.15, 0.85])],
  [188, (w, h) => caterpillar(w, h, 0.3)],
  [192, (w, h) => mines(w, h, [0.25, 0.6, 0.9])],
  [198, (w, h) => coreBossPack(w, h, 0.45)],
  [206, (w, h) => mines(w, h, [0.3, 0.7])],
  // round 2
  [220, () => [], 'round2'],
  [222, (w, h) => loopers(w, h, 0.35)],
  [227, (w, h) => loopers(w, h, 0.65)],
  [232, (w, h) => loopers(w, h, 0.45, 5)],
  [238, (w, h) => jetBoss(w, h)],
  [256, (w, h) => saucers(w, h, 0.3)],
  [261, (w, h) => saucers(w, h, 0.7, 8, true)],
  [266, (w, h) => saucers(w, h, 0.5, 10, true)],
  [272, (w, h) => gridCore(w, h, 0.4)],
  [278, (w, h) => saucers(w, h, 0.25, 8, true)],
  [283, (w, h) => ring(w, h, 0.6)],
  [288, (w, h) => saucers(w, h, 0.75, 8)],
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

/** Scripted movement. Returns true when handled (skip the default drift). */
export function moveScripted(e, dt, fw, fh) {
  if (!e.mv) return false;
  e.mvT = (e.mvT || 0) + dt;
  const t = e.mvT;
  if (e.mv === 'line') {
    e.x -= (e.vx || 120) * dt;
    if (e.amp) e.y = e.y0 + e.amp * Math.sin((e.wf || 2) * t + (e.ph || 0));
  } else if (e.mv === 'snake') {
    const tt = t - (e.dly || 0);
    if (tt < 0) { e.x = e.x0 + (e.v || 90) * -tt; e.y = e.y0; }
    else { e.x = e.x0 - (e.v || 90) * tt; e.y = e.y0 + (e.amp || 60) * Math.sin((e.wf || 1.5) * tt); }
  } else if (e.mv === 'loop') {
    if (e._loopA == null) {
      e.x -= (e.vx || 150) * dt;
      if (e.x <= (e.loopX || fw * 0.55)) { e._loopA = 0; e._lcx = e.x; e._lcy = e.y - (e.R || 60); }
    } else if (e._loopA < Math.PI * 2) {
      e._loopA = Math.min(Math.PI * 2, e._loopA + (Math.PI * 2 / (e.loopDur || 1.6)) * dt);
      const a = e._loopA, R = e.R || 60;
      e.x = e._lcx - R * Math.sin(a);
      e.y = e._lcy + R * Math.cos(a);
      e.rot = -a; // nose follows the loop
    } else {
      e.rot = 0;
      e.x -= (e.vx || 150) * dt;
    }
  } else if (e.mv === 'hover') {
    if (e._hovT == null) {
      e.x -= (e.vx || 100) * dt;
      if (e.x <= (e.hx || fw * 0.68)) e._hovT = 0;
    } else if (e._hovT < (e.hoverDur || 30)) {
      e._hovT += dt;
      e.y = e.y0 + (e.bob || 50) * Math.sin((e.wf || 1) * e._hovT);
      e.x = e.hx + Math.sin(e._hovT * 0.6) * 18;
    } else {
      e.x -= 90 * dt;
      e.noFireLeave = true;
    }
  } else return false;
  return true;
}

/** Scripted fire (round red shots). Returns true when this unit uses scripted fire. */
export function fireScripted(e, bullets, tx, ty, dt, canFire) {
  const f = e.fire;
  if (!f) return false;
  e._fcd = (e._fcd ?? (0.6 + Math.random() * (f.cd || 2))) - dt;
  if (!canFire || e.noFireLeave || e._fcd > 0) return true;
  e._fcd = (f.cd || 2) * (0.8 + Math.random() * 0.4);
  const ox = e.x - (e.w || 30) * 0.4, oy = e.y;
  const shot = (a, spd, dmg = 2) => {
    const b = spawnBullet(ox, oy, Math.cos(a) * spd, Math.sin(a) * spd, 'enemy', false, dmg, { life: 4.5 });
    b.r = 5; b.orb = true;
    bullets.push(b);
  };
  const aim = Math.atan2(ty - oy, tx - ox);
  if (f.type === 'straight') shot(Math.PI, f.spd || 150, 2);
  else if (f.type === 'aimed') shot(aim + (Math.random() - 0.5) * 2 * (f.noise || 0.3), f.spd || 150, 2);
  else if (f.type === 'ringcluster') {
    e._fAlt = !e._fAlt;
    if (e._fAlt) { const n = 10, a0 = Math.random(); for (let i = 0; i < n; i++) shot(a0 + (Math.PI * 2 * i) / n, f.spd || 130, 2); }
    else for (let i = -2; i <= 2; i++) shot(aim + i * 0.16, (f.spd || 130) + 50, 2);
  }
  return true;
}
