/**
 * v1.5.67 — extra player attack items (自機の攻撃アイテム追加).
 * v1.5.69 — オプション pods redrawn as mecha support drones.
 * v1.5.70 — バリア defensive shield item.
 *
 * Every effect lives inside the field's `fx` list (kind = 'pbeam' | 'option' | 'cmis' |
 * 'cburst' | 'bhole' | 'freeze' | 'disc' | 'barrier'), so it is drawn in the own pane AND in the
 * opponent pane (bot snapshot / net serializeField) exactly like 電撃 / ボム.
 * Logic works on a plain "field" object so the player and COM share one code path:
 *   { enemies, bullets, fx, sx, sy, fw, fh }   (sx/sy = ship position in field px)
 * Damage only lowers e.hp — death / drops / score stay in the game loops.
 * All items are intentionally weaker than ボム (28 to every enemy + full bullet clear).
 */
import { spawnBullet, spawnExplosion, isLargeEnemy } from './entities.js?v=20260926015534';

export const EX_ATTACK_IDS = ['pbeam', 'option', 'cluster', 'blackhole', 'freeze', 'reflect', 'barrier'];
export function isExAttackItem(id) { return EX_ATTACK_IDS.includes(id); }

/** Slot / orb style (merged into render.js ITEM_STYLE). */
export const EX_ITEM_STYLE = {
  pbeam:     { color: '#d58cff', icon: '▶', label: '貫通',     effect: '極太ビーム' },
  option:    { color: '#ff8ec8', icon: '∞', label: 'ビット',   effect: '子機が援護射撃' },
  cluster:   { color: '#ff5c8a', icon: '裂', label: 'クラスター', effect: '分裂ミサイル' },
  blackhole: { color: '#8a6bff', icon: '●', label: '黒穴',     effect: '吸い込み攻撃' },
  freeze:    { color: '#bff4ff', icon: '氷', label: '凍結',     effect: '周囲を凍らせる' },
  reflect:   { color: '#ffc34d', icon: '◇', label: '反射',     effect: '跳ね返る円盤' },
  barrier:   { color: '#6cf0ff', icon: '盾', label: 'バリア',   effect: '一定時間無敵' },
};

// ---- Balance (field px / seconds). Keep all below ボム. ----
export const PBEAM_LIFE = 2.6;   // s
const PBEAM_HALF = 24;           // half height of the beam (px)
const PBEAM_TICK = 0.1;
const PBEAM_DMG = 0.9;           // per tick → ~23 over the whole beam, single lane only
export const OPTION_LIFE = 8;    // s
const OPTION_OFF = 36;           // pod distance above/below ship
const OPTION_FIRE = 0.22;
const OPTION_DMG = 2;
const CLUSTER_N = 4;             // missiles, each splits into 3 bomblets
const CLUSTER_SPLIT_T = 0.42;
const CLUSTER_CHILD_T = 0.36;
const CLUSTER_R = 52;
const CLUSTER_DMG = 5;           // per bomblet (12 bomblets, small areas)
const CLUSTER_PARENT_DMG = 4;
export const BH_LIFE = 2.5;
const BH_PULL_T = 2.0;           // pull phase, then collapse burst
const BH_R = 170;
const BH_DPS = 2.5;
const BH_BURST = 12;             // → ~17 total to enemies caught in the vortex
export const FREEZE_R = 270;
const FREEZE_T = 5.0;            // enemies stop moving / firing
const FREEZE_DMG = 6;
const DISC_N = 4;
export const DISC_LIFE = 3.6;
const DISC_R = 12;
const DISC_SPD = 390;
const DISC_DMG = 3;
const DISC_REHIT = 0.3;
export const BARRIER_LIFE = 5.5; // s — defensive only, weaker role than ボム
export const BARRIER_R = 40;     // shield radius (field px)

const EX_FX_KINDS = new Set(['pbeam', 'option', 'cmis', 'cburst', 'bhole', 'freeze', 'disc', 'barrier']);
export function isExFx(kind) { return EX_FX_KINDS.has(kind); }

/** True while a barrier shield fx is still alive on this field. */
export function hasBarrierFx(fx) {
  if (!fx || !fx.length) return false;
  for (const f of fx) if (f.kind === 'barrier' && f.life > 0) return true;
  return false;
}

function hitBox(e, x, y, pad) {
  return Math.abs(e.x - x) < e.w * 0.45 + pad && Math.abs(e.y - y) < e.h * 0.45 + pad;
}
function inCircle(e, x, y, r) {
  const dx = e.x - x, dy = e.y - y;
  const rr = r + Math.min(e.w, e.h) * 0.3;
  return dx * dx + dy * dy < rr * rr;
}
function killEnemyBullet(b) { if (b.owner === 'enemy') b.life = 0; }

/**
 * Activate one of the new items on a field. Returns a short result string for the
 * info pane banner (e.g. 「（命中3）」) or ''.
 */
export function useExItem(id, F) {
  const { fx } = F;
  const sx = F.sx, sy = F.sy;
  if (id === 'pbeam') {
    const cur = fx.find((f) => f.kind === 'pbeam');
    if (cur) { cur.life = cur.max = PBEAM_LIFE; return ''; }
    fx.unshift({ kind: 'pbeam', x: sx, y: sy, r: PBEAM_HALF, life: PBEAM_LIFE, max: PBEAM_LIFE, _cd: 0 });
    return '';
  }
  if (id === 'option') {
    const cur = fx.find((f) => f.kind === 'option');
    if (cur) { cur.life = cur.max = OPTION_LIFE; return ''; }
    fx.unshift({ kind: 'option', x: sx, y: sy, r: OPTION_OFF, life: OPTION_LIFE, max: OPTION_LIFE, _cd: 0.05 });
    return '';
  }
  if (id === 'cluster') {
    for (let i = 0; i < CLUSTER_N; i++) {
      const ang = -0.5 + (i / (CLUSTER_N - 1)) * 1.0;
      const spd = 360;
      fx.unshift({
        kind: 'cmis', x: sx + 14, y: sy, r: 7, life: 3, max: 3,
        a: [Math.cos(ang) * spd, Math.sin(ang) * spd], _t: CLUSTER_SPLIT_T + i * 0.03, _gen: 0,
      });
    }
    return '';
  }
  if (id === 'blackhole') {
    const cx = Math.min(F.fw * 0.72, sx + F.fw * 0.4);
    const cy = Math.max(50, Math.min(F.fh - 50, sy));
    fx.unshift({ kind: 'bhole', x: cx, y: cy, r: BH_R, life: BH_LIFE, max: BH_LIFE, _burst: false });
    return '';
  }
  if (id === 'freeze') {
    const refs = [];
    for (const e of F.enemies) {
      if (inCircle(e, sx, sy, FREEZE_R)) {
        e.hp -= FREEZE_DMG;
        e.frozenT = FREEZE_T;
        refs.push(e);
      }
    }
    for (const b of F.bullets) {
      if (b.owner !== 'enemy') continue;
      const dx = b.x - sx, dy = b.y - sy;
      if (dx * dx + dy * dy < FREEZE_R * FREEZE_R) b.life = 0;
    }
    const f = { kind: 'freeze', x: sx, y: sy, r: FREEZE_R, life: FREEZE_T, max: FREEZE_T, _refs: refs };
    syncFreeze(f);
    fx.unshift(f);
    return `（凍結${refs.length}）`;
  }
  if (id === 'reflect') {
    const angs = [-0.85, -0.3, 0.3, 0.85];
    for (let i = 0; i < DISC_N; i++) {
      const a = angs[i % angs.length];
      fx.unshift({
        kind: 'disc', x: sx + 12, y: sy, r: DISC_R, life: DISC_LIFE, max: DISC_LIFE,
        a: [Math.cos(a) * DISC_SPD, Math.sin(a) * DISC_SPD], _t: 0, _hit: new Map(),
      });
    }
    return '';
  }
  if (id === 'barrier') {
    const cur = fx.find((f) => f.kind === 'barrier');
    if (cur) { cur.life = cur.max = BARRIER_LIFE; cur._hit = 0; return ''; }
    fx.unshift({ kind: 'barrier', x: sx, y: sy, r: BARRIER_R, life: BARRIER_LIFE, max: BARRIER_LIFE, _hit: 0 });
    return '';
  }
  return '';
}

function syncFreeze(f) {
  f._refs = f._refs.filter((e) => e.hp > 0 && e.frozenT > 0);
  const list = f._refs.slice(0, 16);
  f.t = list.map((e) => [Math.round(e.x), Math.round(e.y)]);
  f.a = list.map((e) => [Math.round(e.w), Math.round(e.h)]);
}

function burstAt(F, f, r, dmg) {
  for (const e of F.enemies) {
    if (inCircle(e, f.x, f.y, r)) e.hp -= dmg;
  }
  f.kind = 'cburst';
  f.r = r;
  f.life = f.max = 0.42;
  f.a = undefined;
}

/**
 * Per-frame update for every extra-item effect in F.fx (call once per frame per field,
 * BEFORE the game loop decrements fx life). Also thaws frozen enemies.
 */
export function tickExItems(F, dt) {
  // Frozen timers (movement/fire skip lives in the game loops: `if (e.frozenT > 0) continue`)
  for (const e of F.enemies) {
    if (e.frozenT > 0) e.frozenT = Math.max(0, e.frozenT - dt);
  }
  const fx = F.fx;
  if (!fx.length) return;
  const spawned = [];
  for (const f of fx) {
    const k = f.kind;
    if (!k || !EX_FX_KINDS.has(k) || f.life <= 0) continue;
    if (k === 'pbeam') {
      f.x = F.sx; f.y = F.sy;
      const half = f.r;
      for (const b of F.bullets) {
        if (b.owner === 'enemy' && b.x > f.x && Math.abs(b.y - f.y) < half + 4) b.life = 0;
      }
      f._cd -= dt;
      if (f._cd <= 0) {
        f._cd += PBEAM_TICK;
        for (const e of F.enemies) {
          if (e.x + e.w * 0.45 > f.x + 10 && Math.abs(e.y - f.y) < half + e.h * 0.42) {
            e.hp -= PBEAM_DMG;
            if (Math.random() < 0.12) F.fx.push(spawnExplosion(e.x - e.w * 0.3, f.y + (Math.random() - 0.5) * half, false));
          }
        }
      }
    } else if (k === 'option') {
      f.x = F.sx; f.y = F.sy;
      f._cd -= dt;
      if (f._cd <= 0) {
        f._cd += OPTION_FIRE;
        for (const s of [-1, 1]) {
          const py = Math.max(8, Math.min(F.fh - 8, f.y + s * f.r));
          F.bullets.push(spawnBullet(f.x + 2, py, 470, 0, 'player', false, OPTION_DMG));
        }
      }
    } else if (k === 'cmis') {
      f._t -= dt;
      const [vx, vy] = f.a;
      f.x += vx * dt; f.y += vy * dt;
      let hit = null;
      for (const e of F.enemies) { if (hitBox(e, f.x, f.y, 6)) { hit = e; break; } }
      const out = f.x > F.fw + 20 || f.y < -10 || f.y > F.fh + 10;
      if (hit || out) {
        if (hit && f._gen === 0) hit.hp -= CLUSTER_PARENT_DMG;
        burstAt(F, f, CLUSTER_R * (f._gen === 0 ? 0.8 : 1), f._gen === 0 ? CLUSTER_DMG * 0.6 : CLUSTER_DMG);
        if (f._gen === 0 && !out) {
          // split on impact too so the salvo still spreads into small blasts
          for (const d of [-0.9, 0, 0.9]) {
            const ang = Math.atan2(vy, vx) + d;
            spawned.push({ kind: 'cmis', x: f.x, y: f.y, r: 5, life: 3, max: 3,
              a: [Math.cos(ang) * 260, Math.sin(ang) * 260], _t: CLUSTER_CHILD_T * 0.6, _gen: 1 });
          }
        }
      } else if (f._t <= 0) {
        if (f._gen === 0) {
          const base = Math.atan2(vy, vx);
          for (const d of [-0.42, 0, 0.42]) {
            spawned.push({ kind: 'cmis', x: f.x, y: f.y, r: 5, life: 3, max: 3,
              a: [Math.cos(base + d) * 330, Math.sin(base + d) * 330], _t: CLUSTER_CHILD_T, _gen: 1 });
          }
          f.kind = 'cburst'; f.r = 18; f.life = f.max = 0.25; f.a = undefined; // split puff
        } else {
          burstAt(F, f, CLUSTER_R, CLUSTER_DMG);
        }
      }
    } else if (k === 'bhole') {
      const age = f.max - f.life;
      if (age < BH_PULL_T) {
        const grow = Math.min(1, age / 0.25);
        const R = f.r * grow;
        for (const e of F.enemies) {
          const dx = f.x - e.x, dy = f.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d > R + Math.min(e.w, e.h) * 0.3) continue;
          const pull = (70 + 160 * (1 - d / (R + 1))) * (isLargeEnemy(e) ? 0.25 : 1) * dt;
          const m = Math.min(pull, d);
          e.x += (dx / d) * m; e.y += (dy / d) * m;
          if (e.holdX != null) e.holdX += (dx / d) * m * 0.6;
          if (e.holdY != null) e.holdY += (dy / d) * m * 0.6;
          e.hp -= BH_DPS * dt;
        }
        for (const b of F.bullets) {
          if (b.owner !== 'enemy') continue;
          const dx = f.x - b.x, dy = f.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < 26) { b.life = 0; continue; }
          if (d < R) { const m = Math.min(d, 320 * dt); b.x += (dx / d) * m; b.y += (dy / d) * m; b.vx *= 0.9; b.vy *= 0.9; }
        }
      } else if (!f._burst) {
        f._burst = true;
        for (const e of F.enemies) {
          if (inCircle(e, f.x, f.y, f.r)) {
            e.hp -= BH_BURST;
            F.fx.push(spawnExplosion(e.x, e.y, false));
          }
        }
        for (const b of F.bullets) {
          if (b.owner !== 'enemy') continue;
          const dx = f.x - b.x, dy = f.y - b.y;
          if (dx * dx + dy * dy < f.r * f.r) b.life = 0;
        }
      }
    } else if (k === 'freeze') {
      syncFreeze(f);
    } else if (k === 'disc') {
      f._t += dt;
      const v = f.a;
      f.x += v[0] * dt; f.y += v[1] * dt;
      const r = f.r;
      if (f.y < r) { f.y = r; v[1] = Math.abs(v[1]); }
      if (f.y > F.fh - r) { f.y = F.fh - r; v[1] = -Math.abs(v[1]); }
      if (f.x > F.fw - r) { f.x = F.fw - r; v[0] = -Math.abs(v[0]); }
      if (f.x < r) { f.x = r; v[0] = Math.abs(v[0]); }
      for (const e of F.enemies) {
        if (!hitBox(e, f.x, f.y, r)) continue;
        const next = f._hit.get(e) || 0;
        if (f._t >= next) {
          e.hp -= DISC_DMG;
          f._hit.set(e, f._t + DISC_REHIT);
          F.fx.push(spawnExplosion(f.x, f.y, false));
        }
      }
      for (const b of F.bullets) {
        if (b.owner === 'enemy' && Math.abs(b.x - f.x) < r + 4 && Math.abs(b.y - f.y) < r + 4) killEnemyBullet(b);
      }
    } else if (k === 'barrier') {
      f.x = F.sx; f.y = F.sy;
      if (f._hit > 0) f._hit = Math.max(0, f._hit - dt);
      const R = f.r;
      for (const b of F.bullets) {
        if (b.owner !== 'enemy' || b.life <= 0) continue;
        const dx = b.x - f.x, dy = b.y - f.y;
        const hb = (b.hb || 0) + (b.r || 0);
        if (dx * dx + dy * dy < (R + 6 + hb) * (R + 6 + hb)) {
          killEnemyBullet(b);
          f._hit = 0.14;
        }
      }
    }
  }
  if (spawned.length) fx.unshift(...spawned);
}

/* =========================== Rendering =========================== */
// f: { x, y, r, life, max, kind, sc, t, a } — already scaled to the pane (sc = pane scale)

const clamp01 = (u) => Math.max(0, Math.min(1, u));

function drawPBeam(ctx, f) {
  const sc = f.sc || 1;
  const age = f.max - f.life;
  const grow = clamp01(age / 0.14);
  const fade = f.life < 0.3 ? clamp01(f.life / 0.3) : 1;
  const half = f.r * grow;
  const x0 = f.x + 12 * sc;
  const x1 = x0 + 4000;
  const y = f.y;
  const now = performance.now() / 1000;
  const flick = 0.88 + 0.12 * Math.sin(now * 40);
  ctx.save();
  ctx.globalAlpha = fade;
  // Outer glow band
  let g = ctx.createLinearGradient(0, y - half * 1.6, 0, y + half * 1.6);
  g.addColorStop(0, 'rgba(190,110,255,0)');
  g.addColorStop(0.5, `rgba(200,120,255,${0.32 * flick})`);
  g.addColorStop(1, 'rgba(190,110,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y - half * 1.6, x1 - x0, half * 3.2);
  // Main beam body
  g = ctx.createLinearGradient(0, y - half, 0, y + half);
  // Translucent body so enemies inside the beam stay visible; bright thin core
  g.addColorStop(0, 'rgba(170,90,255,0.5)');
  g.addColorStop(0.18, 'rgba(210,140,255,0.32)');
  g.addColorStop(0.4, 'rgba(235,190,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.6, 'rgba(235,190,255,0.55)');
  g.addColorStop(0.82, 'rgba(210,140,255,0.32)');
  g.addColorStop(1, 'rgba(170,90,255,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y - half * flick, x1 - x0, half * 2 * flick);
  ctx.strokeStyle = 'rgba(245,215,255,0.9)';
  ctx.lineWidth = 1.5 * sc;
  ctx.beginPath();
  ctx.moveTo(x0, y - half * flick); ctx.lineTo(x1, y - half * flick);
  ctx.moveTo(x0, y + half * flick); ctx.lineTo(x1, y + half * flick);
  ctx.stroke();
  // Travelling energy rings (read as "piercing")
  ctx.strokeStyle = 'rgba(255,240,255,0.75)';
  ctx.lineWidth = 2 * sc;
  const sp = 70 * sc;
  const off = (now * 900 * sc) % sp;
  ctx.beginPath();
  for (let x = x0 + off; x < x0 + 1400 * sc; x += sp) {
    ctx.moveTo(x + 5 * sc, y - half * 1.15);
    ctx.ellipse(x, y, 5 * sc, half * 1.15, 0, -Math.PI / 2, Math.PI * 1.5);
  }
  ctx.stroke();
  // Muzzle flare
  const mg = ctx.createRadialGradient(x0, y, 0, x0, y, half * 1.9 + 6 * sc);
  mg.addColorStop(0, 'rgba(255,255,255,1)');
  mg.addColorStop(0.4, 'rgba(230,160,255,0.8)');
  mg.addColorStop(1, 'rgba(160,80,255,0)');
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.arc(x0, y, half * 1.9 + 6 * sc, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function podPositions(f) {
  const sc = f.sc || 1;
  const now = performance.now() / 1000;
  const bob = Math.sin(now * 5) * 3 * sc;
  return [
    [f.x - 6 * sc, f.y - f.r + bob],
    [f.x - 6 * sc, f.y + f.r - bob],
  ];
}

function drawOption(ctx, f) {
  const sc = f.sc || 1;
  // Blink during the last 1.5s so the end is readable
  if (f.life < 1.5 && Math.floor(performance.now() / 90) % 2 === 0) return;
  const age = f.max - f.life;
  const pop = clamp01(age / 0.2);
  const now = performance.now() / 1000;
  const pulse = 0.7 + 0.3 * Math.sin(now * 14);
  ctx.save();
  // Mechanical tether rods (hard lines, not soft arcs)
  for (const [px, py] of podPositions(f)) {
    const midY = (f.y + py) * 0.5;
    ctx.strokeStyle = 'rgba(160,200,255,0.55)';
    ctx.lineWidth = 1.6 * sc;
    ctx.beginPath();
    ctx.moveTo(f.x - 2 * sc, f.y);
    ctx.lineTo(f.x - 10 * sc, midY);
    ctx.lineTo(px - 4 * sc, py);
    ctx.stroke();
    // joint rivets
    ctx.fillStyle = 'rgba(200,230,255,0.9)';
    ctx.beginPath(); ctx.arc(f.x - 10 * sc, midY, 1.6 * sc, 0, Math.PI * 2); ctx.fill();
  }
  for (const [px, py] of podPositions(f)) {
    drawMechaPod(ctx, px, py, sc * pop, pulse);
  }
  ctx.restore();
}

/** Angular support drone — armor plates, thruster, gun barrel (not a soft orb). */
function drawMechaPod(ctx, px, py, s, pulse) {
  if (s < 0.05) return;
  ctx.save();
  ctx.translate(px, py);

  // Compact thruster plume (hard triangle, not a big soft wash)
  const plume = 0.75 + 0.35 * Math.sin(performance.now() / 45);
  const eg = ctx.createLinearGradient(-17 * s * plume, 0, -5 * s, 0);
  eg.addColorStop(0, 'rgba(80,220,255,0)');
  eg.addColorStop(0.55, `rgba(100,230,255,${0.7 * pulse})`);
  eg.addColorStop(1, 'rgba(255,180,230,0.95)');
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.moveTo(-6 * s, -2.6 * s);
  ctx.lineTo(-15 * s * plume, 0);
  ctx.lineTo(-6 * s, 2.6 * s);
  ctx.closePath();
  ctx.fill();

  // Lower armor plate (darker under-layer for thickness)
  ctx.fillStyle = '#2a3558';
  ctx.beginPath();
  ctx.moveTo(9 * s, 1.5 * s);
  ctx.lineTo(2 * s, 7.5 * s);
  ctx.lineTo(-7 * s, 6 * s);
  ctx.lineTo(-10 * s, 1.5 * s);
  ctx.closePath();
  ctx.fill();

  // Main hull — hard faceted diamond
  const hull = ctx.createLinearGradient(-9 * s, -8 * s, 11 * s, 8 * s);
  hull.addColorStop(0, '#ffffff');
  hull.addColorStop(0.2, '#d0dcf0');
  hull.addColorStop(0.55, '#6a7ea8');
  hull.addColorStop(1, '#2e3c5c');
  ctx.fillStyle = hull;
  ctx.strokeStyle = '#e8f4ff';
  ctx.lineWidth = 1.5 * Math.min(1.25, s);
  ctx.beginPath();
  ctx.moveTo(11 * s, 0);
  ctx.lineTo(4 * s, -7 * s);
  ctx.lineTo(-7 * s, -5.5 * s);
  ctx.lineTo(-10.5 * s, 0);
  ctx.lineTo(-7 * s, 5.5 * s);
  ctx.lineTo(4 * s, 7 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Top / bottom armor fins (hard wedges)
  ctx.fillStyle = '#4a5c88';
  ctx.strokeStyle = '#b8cce8';
  ctx.lineWidth = 1.1 * Math.min(1.25, s);
  ctx.beginPath();
  ctx.moveTo(2 * s, -6.2 * s);
  ctx.lineTo(-1.5 * s, -11 * s);
  ctx.lineTo(-6 * s, -5.8 * s);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(2 * s, 6.2 * s);
  ctx.lineTo(-1.5 * s, 11 * s);
  ctx.lineTo(-6 * s, 5.8 * s);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Panel lines (engraved)
  ctx.strokeStyle = 'rgba(15,30,55,0.65)';
  ctx.lineWidth = 1.05 * Math.min(1.25, s);
  ctx.beginPath();
  ctx.moveTo(7 * s, -2.2 * s); ctx.lineTo(-5 * s, -3.5 * s);
  ctx.moveTo(7 * s, 2.2 * s); ctx.lineTo(-5 * s, 3.5 * s);
  ctx.moveTo(-0.5 * s, -5 * s); ctx.lineTo(-0.5 * s, 5 * s);
  ctx.moveTo(4 * s, -5.5 * s); ctx.lineTo(4 * s, 5.5 * s);
  ctx.stroke();

  // Pink warning stripe (option identity) — chevron on nose
  ctx.strokeStyle = '#ff6eb8';
  ctx.lineWidth = 1.8 * Math.min(1.25, s);
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(3 * s, -5 * s);
  ctx.lineTo(8.5 * s, 0);
  ctx.lineTo(3 * s, 5 * s);
  ctx.stroke();

  // Rectangular sensor / HUD slit (not a round jewel)
  ctx.fillStyle = '#0a1828';
  ctx.fillRect(-1.5 * s, -2.2 * s, 5.5 * s, 4.4 * s);
  const sens = ctx.createLinearGradient(-1.5 * s, -2.2 * s, 4 * s, 2.2 * s);
  sens.addColorStop(0, '#9ef6ff');
  sens.addColorStop(0.45, '#3ad0ff');
  sens.addColorStop(1, '#1550a0');
  ctx.fillStyle = sens;
  ctx.fillRect(-1 * s, -1.6 * s, 4.5 * s, 3.2 * s);
  // Scan line
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(-1 * s, -0.4 * s, 4.5 * s, 0.7 * s);
  ctx.strokeStyle = '#ff8ec8';
  ctx.lineWidth = 0.9 * Math.min(1.25, s);
  ctx.strokeRect(-1.5 * s, -2.2 * s, 5.5 * s, 4.4 * s);

  // Twin railgun barrels
  for (const oy of [-2.8, 2.8]) {
    // barrel housing
    ctx.fillStyle = '#1a2438';
    ctx.strokeStyle = '#c0d0e8';
    ctx.lineWidth = 1 * Math.min(1.25, s);
    ctx.beginPath();
    ctx.moveTo(9 * s, (oy - 1.5) * s);
    ctx.lineTo(16.5 * s, (oy - 1.1) * s);
    ctx.lineTo(16.5 * s, (oy + 1.1) * s);
    ctx.lineTo(9 * s, (oy + 1.5) * s);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // inner bore
    ctx.fillStyle = '#050810';
    ctx.fillRect(14.5 * s, (oy - 0.55) * s, 2.2 * s, 1.1 * s);
    // muzzle brake rings
    ctx.strokeStyle = '#7cf0ff';
    ctx.lineWidth = 1.1 * Math.min(1.25, s);
    ctx.beginPath();
    ctx.moveTo(15.2 * s, (oy - 1.3) * s);
    ctx.lineTo(15.2 * s, (oy + 1.3) * s);
    ctx.stroke();
    ctx.strokeStyle = '#ff6eb8';
    ctx.beginPath();
    ctx.moveTo(16.2 * s, (oy - 1.15) * s);
    ctx.lineTo(16.2 * s, (oy + 1.15) * s);
    ctx.stroke();
  }

  // Rear thruster nozzle (hexagon)
  ctx.fillStyle = '#1a2840';
  ctx.strokeStyle = '#7cf0ff';
  ctx.lineWidth = 1.4 * Math.min(1.25, s);
  ctx.beginPath();
  ctx.moveTo(-9.2 * s, -3.4 * s);
  ctx.lineTo(-12 * s, -1.6 * s);
  ctx.lineTo(-12 * s, 1.6 * s);
  ctx.lineTo(-9.2 * s, 3.4 * s);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = `rgba(120,240,255,${0.55 + 0.35 * pulse})`;
  ctx.fillRect(-11.4 * s, -1.1 * s, 1.6 * s, 2.2 * s);

  // Rivets / bolt heads
  ctx.fillStyle = '#ffe08a';
  for (const [rx, ry] of [[-5.5, -4], [-5.5, 4], [5.5, -4.2], [5.5, 4.2], [-2, -6.5], [-2, 6.5]]) {
    ctx.beginPath();
    ctx.arc(rx * s, ry * s, 1.05 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8a040';
    ctx.beginPath();
    ctx.arc(rx * s, ry * s, 0.45 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe08a';
  }
  ctx.restore();
}

function drawCMissile(ctx, f) {
  const sc = f.sc || 1;
  const v = f.a || [1, 0];
  const ang = Math.atan2(v[1], v[0]);
  const s = (f.r || 6) / 7;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(ang);
  // flame trail
  const tl = 26 * s * (0.8 + 0.2 * Math.sin(performance.now() / 30));
  const g = ctx.createLinearGradient(-tl, 0, 0, 0);
  g.addColorStop(0, 'rgba(255,90,140,0)');
  g.addColorStop(1, 'rgba(255,200,120,0.95)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-tl, 0); ctx.lineTo(-4 * s, -4 * s); ctx.lineTo(-4 * s, 4 * s); ctx.closePath();
  ctx.fill();
  // body
  ctx.fillStyle = '#ff5c8a';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5 * Math.min(1, sc);
  ctx.beginPath();
  ctx.moveTo(10 * s, 0); ctx.lineTo(-4 * s, -5 * s); ctx.lineTo(-2 * s, 0); ctx.lineTo(-4 * s, 5 * s); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawCBurst(ctx, f) {
  const u = clamp01(1 - f.life / f.max);
  const R = f.r * (0.35 + 0.65 * Math.sqrt(u));
  const a = 1 - u;
  ctx.save();
  const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
  g.addColorStop(0, `rgba(255,255,255,${0.9 * a})`);
  g.addColorStop(0.45, `rgba(255,120,170,${0.65 * a})`);
  g.addColorStop(1, 'rgba(255,60,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(255,190,220,${a})`;
  ctx.lineWidth = 2.5 * (f.sc || 1);
  ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawBHole(ctx, f) {
  const sc = f.sc || 1;
  const age = f.max - f.life;
  const now = performance.now() / 1000;
  const cx = f.x, cy = f.y;
  const pullT = BH_PULL_T;
  ctx.save();
  if (age < pullT) {
    const grow = clamp01(age / 0.25);
    const R = f.r * grow;
    // Range disc (dark lens)
    const lens = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    lens.addColorStop(0, 'rgba(10,0,30,0.85)');
    lens.addColorStop(0.35, 'rgba(60,20,140,0.45)');
    lens.addColorStop(1, 'rgba(120,80,255,0.08)');
    ctx.fillStyle = lens;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    // Range boundary (dashed, rotating)
    ctx.strokeStyle = 'rgba(170,140,255,0.7)';
    ctx.lineWidth = 2 * sc;
    ctx.setLineDash([8 * sc, 7 * sc]);
    ctx.lineDashOffset = -now * 60 * sc;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // Spiral arms
    for (let arm = 0; arm < 4; arm++) {
      ctx.strokeStyle = arm % 2 ? 'rgba(200,170,255,0.75)' : 'rgba(140,100,255,0.8)';
      ctx.lineWidth = (3 - arm * 0.4) * sc;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        const rr = R * (0.12 + 0.85 * u);
        const a = arm * Math.PI / 2 - now * 5 + u * 3.2;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.9;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Infalling particles
    ctx.fillStyle = 'rgba(230,220,255,0.9)';
    for (let i = 0; i < 14; i++) {
      const ph = (now * 0.9 + i / 14) % 1;
      const rr = R * (1 - ph);
      const a = i * 2.39 - ph * 4;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 2 * sc, 0, Math.PI * 2);
      ctx.fill();
    }
    // Event horizon core + photon ring
    const core = (14 + 6 * grow) * sc;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx, cy, core, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,255,0.95)';
    ctx.lineWidth = 2.5 * sc;
    ctx.beginPath(); ctx.arc(cx, cy, core + 2 * sc, 0, Math.PI * 2); ctx.stroke();
  } else {
    // Collapse → burst ring expanding to the damage radius
    const u = clamp01((age - pullT) / (f.max - pullT));
    const R = f.r * (0.2 + 0.8 * Math.sqrt(u));
    const a = 1 - u;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.4, `rgba(180,140,255,${0.6 * a})`);
    g.addColorStop(1, 'rgba(90,40,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(230,210,255,${a})`;
    ctx.lineWidth = 5 * sc * a + 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawFreeze(ctx, f) {
  const sc = f.sc || 1;
  const age = f.max - f.life;
  const cx = f.x, cy = f.y;
  ctx.save();
  // Expanding frost wave (first ~0.7s) — shows the exact hit radius
  if (age < 0.7) {
    const grow = clamp01(age / 0.18);
    const fade = age < 0.35 ? 1 : clamp01(1 - (age - 0.35) / 0.35);
    const R = f.r * grow;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, `rgba(230,250,255,${0.35 * fade})`);
    g.addColorStop(0.75, `rgba(150,220,255,${0.22 * fade})`);
    g.addColorStop(1, `rgba(220,250,255,${0.5 * fade})`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`;
    ctx.lineWidth = 3 * sc;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    // Snowflake spokes
    ctx.strokeStyle = `rgba(210,245,255,${0.8 * fade})`;
    ctx.lineWidth = 2 * sc;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + 0.3;
      const ex = cx + Math.cos(a) * R, ey = cy + Math.sin(a) * R;
      ctx.moveTo(cx, cy); ctx.lineTo(ex, ey);
      for (const k of [0.45, 0.72]) {
        const bx = cx + Math.cos(a) * R * k, by = cy + Math.sin(a) * R * k;
        const L = R * 0.12;
        ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a + 0.6) * L, by + Math.sin(a + 0.6) * L);
        ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a - 0.6) * L, by + Math.sin(a - 0.6) * L);
      }
    }
    ctx.stroke();
  }
  // Ice blocks on every frozen enemy (positions synced each frame)
  const t = f.t || [];
  const sz = f.a || [];
  const shatter = f.life < 0.35;
  for (let i = 0; i < t.length; i++) {
    const [x, y] = t[i];
    const w = ((sz[i] && sz[i][0]) || 40) * sc * 0.62;
    const h = ((sz[i] && sz[i][1]) || 34) * sc * 0.62;
    if (shatter && Math.floor(performance.now() / 70) % 2 === 0) continue;
    ctx.fillStyle = 'rgba(170,230,255,0.42)';
    ctx.strokeStyle = 'rgba(240,255,255,0.95)';
    ctx.lineWidth = 2 * sc;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.7, y - h * 0.2);
    ctx.lineTo(x - w * 0.3, y - h * 0.75);
    ctx.lineTo(x + w * 0.5, y - h * 0.65);
    ctx.lineTo(x + w * 0.75, y + h * 0.1);
    ctx.lineTo(x + w * 0.35, y + h * 0.75);
    ctx.lineTo(x - w * 0.55, y + h * 0.6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // facets / shine
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2 * sc;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.3, y - h * 0.75); ctx.lineTo(x - w * 0.05, y + h * 0.05); ctx.lineTo(x + w * 0.75, y + h * 0.1);
    ctx.moveTo(x - w * 0.05, y + h * 0.05); ctx.lineTo(x - w * 0.55, y + h * 0.6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDisc(ctx, f) {
  const sc = f.sc || 1;
  const fade = f.life < 0.4 ? clamp01(f.life / 0.4) : 1;
  const R = f.r;
  const v = f.a || [1, 0];
  const spd = Math.hypot(v[0], v[1]) || 1;
  const spin = performance.now() / 60;
  ctx.save();
  ctx.globalAlpha = fade;
  // short trail
  const tx = f.x - (v[0] / spd) * R * 2.6, ty = f.y - (v[1] / spd) * R * 2.6;
  const g = ctx.createLinearGradient(tx, ty, f.x, f.y);
  g.addColorStop(0, 'rgba(255,200,80,0)');
  g.addColorStop(1, 'rgba(255,210,100,0.7)');
  ctx.strokeStyle = g;
  ctx.lineWidth = R * 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(f.x, f.y); ctx.stroke();
  // disc body
  ctx.fillStyle = '#ffc34d';
  ctx.strokeStyle = '#fff6d6';
  ctx.lineWidth = 2 * sc;
  ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // spinning blades
  ctx.strokeStyle = '#7a4a00';
  ctx.lineWidth = 2 * sc;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = spin + i * (Math.PI * 2 / 3);
    ctx.moveTo(f.x + Math.cos(a) * R * 0.25, f.y + Math.sin(a) * R * 0.25);
    ctx.lineTo(f.x + Math.cos(a + 0.5) * R * 0.9, f.y + Math.sin(a + 0.5) * R * 0.9);
  }
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(f.x, f.y, R * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBarrier(ctx, f) {
  const sc = f.sc || 1;
  // Blink near expiry so the end is readable
  if (f.life < 1.2 && Math.floor(performance.now() / 80) % 2 === 0) return;
  const age = f.max - f.life;
  const pop = clamp01(age / 0.18);
  const fade = f.life < 0.45 ? clamp01(f.life / 0.45) : 1;
  const now = performance.now() / 1000;
  const pulse = 0.85 + 0.15 * Math.sin(now * 9);
  const hitBoost = f._hit > 0 ? 1.15 : 1;
  const R = f.r * pop * pulse * hitBoost;
  const cx = f.x, cy = f.y;
  ctx.save();
  ctx.globalAlpha = fade;
  // Soft energy dome fill
  const g = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
  g.addColorStop(0, 'rgba(180,250,255,0.08)');
  g.addColorStop(0.55, `rgba(80,220,255,${0.14 + (f._hit > 0 ? 0.12 : 0)})`);
  g.addColorStop(0.82, `rgba(100,240,255,${0.28 + (f._hit > 0 ? 0.2 : 0)})`);
  g.addColorStop(1, 'rgba(60,200,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  // Outer ring
  ctx.strokeStyle = f._hit > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(140,245,255,0.9)';
  ctx.lineWidth = (2.4 + (f._hit > 0 ? 1.5 : 0)) * sc;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  // Inner dashed ring (rotating)
  ctx.strokeStyle = 'rgba(200,255,255,0.55)';
  ctx.lineWidth = 1.4 * sc;
  ctx.setLineDash([6 * sc, 5 * sc]);
  ctx.lineDashOffset = -now * 50 * sc;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.78, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  // Hex spokes (shield identity)
  ctx.strokeStyle = 'rgba(160,240,255,0.35)';
  ctx.lineWidth = 1.1 * sc;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + now * 0.4;
    ctx.moveTo(cx + Math.cos(a) * R * 0.28, cy + Math.sin(a) * R * 0.28);
    ctx.lineTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92);
  }
  ctx.stroke();
  // Hit spark ring flash
  if (f._hit > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${clamp01(f._hit / 0.14)})`;
    ctx.lineWidth = 3 * sc;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.05, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/** Draw an extra-item fx. Returns true when handled. */
export function drawExFx(ctx, f) {
  switch (f.kind) {
    case 'pbeam': drawPBeam(ctx, f); return true;
    case 'option': drawOption(ctx, f); return true;
    case 'cmis': drawCMissile(ctx, f); return true;
    case 'cburst': drawCBurst(ctx, f); return true;
    case 'bhole': drawBHole(ctx, f); return true;
    case 'freeze': drawFreeze(ctx, f); return true;
    case 'disc': drawDisc(ctx, f); return true;
    case 'barrier': drawBarrier(ctx, f); return true;
    default: return false;
  }
}
