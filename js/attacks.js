/**
 * 転送キャラの攻撃パターン — building blocks + per-unit loadout driver.
 * Data (UNIT_ATTACKS / ATTACK_PATTERN_INFO) lives in catalog.js; this file implements them.
 *
 * Rules kept from the original enemy AI:
 *  - Lasers are ALWAYS horizontal (vy = 0) and never track the player.
 *  - Homing missiles use limited homing (homeT) via steerEnemyHoming in game.js.
 *  - Player-hit damage stays per projectile: homing 4, everything else 6 (see game.js).
 */
import { spawnBullet, resolveEnemyTier, isLargeEnemy, isWaveKind } from './entities.js?v=20260926003300';
import { unitAttackLoadout } from './catalog.js?v=20260926003300';

const PI = Math.PI;
const TAU = PI * 2;

/** Max live enemy bullets per field (phones). */
export const ENEMY_BULLET_FIELD_CAP = 150;
/** Max live bullets owned by one enemy, by tier. */
const PER_ENEMY_CAP = { swarm: 5, basic: 6, drone: 6, elite: 8, tank: 14, mech: 14, golem: 16, boss: 24 };

/** Patterns that fire lasers (telegraph y-offsets) and ones that always telegraph. */
const LASER_OFFS = {
  laser: (p) => [p.dy || 0],
  pulse: () => [0],
  longlaser: () => [0],
  twinlaser: (p) => [-(p.g || 9), p.g || 9],
  trilaser: (p) => [-(p.g || 14), 0, p.g || 14],
  sweep: (p) => (p.offs || [-60, -30, 0, 30, 60]),
};
const ALWAYS_TELE = new Set(['longlaser', 'sweep']);

/** Keep aimed shots heading toward the player side (never backwards / straight up-down). */
function clampAim(a) {
  // Normalize to (-PI, PI], then keep within ±68° of straight left.
  let d = a - PI;
  while (d > PI) d -= TAU;
  while (d < -PI) d += TAU;
  const lim = 1.19;
  if (d > lim) d = lim;
  else if (d < -lim) d = -lim;
  return PI + d;
}

function makeCtx(e, bullets, tx, ty) {
  const ox = e.x - (e.w || 20) * 0.4;
  const oy = e.y;
  const cap = PER_ENEMY_CAP[resolveEnemyTier(e.kind)] || 8;
  let mine = -1;
  let total = 0;
  const c = {
    e, ox, oy, tx, ty,
    aim: clampAim(Math.atan2(ty - oy, tx - ox)),
    emit(b) {
      if (mine < 0) {
        mine = 0;
        for (const q of bullets) {
          if (q.owner !== 'enemy') continue;
          total++;
          if (q.src === e._uid) mine++;
        }
      }
      if (mine >= cap || total >= ENEMY_BULLET_FIELD_CAP) return null;
      mine++; total++;
      b.src = e._uid;
      bullets.push(b);
      return b;
    },
    orb(ang, spd, o = {}) {
      const b = spawnBullet(ox, oy + (o.dy || 0), Math.cos(ang) * spd, Math.sin(ang) * spd, 'enemy', false, 2,
        { life: o.life != null ? o.life : 3.2 });
      if (o.k) b.k = o.k;
      if (o.r) b.r = o.r;
      if (o.hb) b.hb = o.hb;
      return c.emit(b);
    },
    laser(spd, dy = 0, k) {
      // Always straight horizontal toward player side: vx < 0, vy === 0.
      const b = spawnBullet(ox, oy + dy, -Math.abs(spd), 0, 'enemy', false, 2,
        { laser: true, life: k === 'pulse' ? 1.4 : 2.0 });
      if (k) b.k = k;
      if (k === 'beam') { b.r = 3.5; b.hb = 2; }
      return c.emit(b);
    },
    missile(ang, home = 0.5, spd = 235) {
      const b = spawnBullet(ox, oy, Math.cos(ang) * spd, Math.sin(ang) * spd, 'enemy', true, 2,
        { homeT: home, homeMax: home, life: 2.8 });
      return c.emit(b);
    },
    /** Delayed follow-up shot (burst / stream / spiral …) — re-reads position & target when it fires. */
    later(t, fn) {
      if (t <= 0) { fn(c); return; }
      (e._atkQ || (e._atkQ = [])).push({ t, fn });
    },
  };
  return c;
}

const jit = (s) => (Math.random() - 0.5) * s;

/** Pattern implementations: (ctx, params) → emits bullets. */
export const PATTERNS = {
  single(c, p) {
    const n = p.n || 1;
    // Loosely leans toward the player (like the old basic shot) but flies straight.
    const base = PI + (c.aim - PI) * 0.35;
    for (let i = 0; i < n; i++) c.orb(base + jit(0.1) + (i - (n - 1) / 2) * 0.1, p.spd || 170);
  },
  twin(c, p) {
    const g = p.g || 10, spd = p.spd || 180;
    c.orb(PI, spd, { dy: -g });
    c.orb(PI, spd, { dy: g });
  },
  spread3(c, p) {
    const a = p.a || 0.28, spd = p.spd || 175;
    for (const d of [-a, 0, a]) c.orb(PI + d, spd);
  },
  fan5(c, p) {
    const n = p.n || 5, a = p.a || 0.2, spd = p.spd || 165;
    for (let i = 0; i < n; i++) c.orb(PI + (i - (n - 1) / 2) * a, spd, { k: 'fan' });
  },
  aimed(c, p) {
    const n = p.n || 1, a = p.a || 0.14, spd = p.spd || 240;
    for (let i = 0; i < n; i++) c.orb(c.aim + (i - (n - 1) / 2) * a, spd, { k: 'needle' });
  },
  burst(c, p) {
    const n = p.n || 3, gap = p.gap || 0.13, spd = p.spd || 250;
    for (let i = 0; i < n; i++) c.later(i * gap, (c2) => c2.orb(c2.aim, spd, { k: 'needle' }));
  },
  stream(c, p) {
    const n = p.n || 5, gap = p.gap || 0.08, spd = p.spd || 270;
    for (let i = 0; i < n; i++) c.later(i * gap, (c2) => c2.orb(PI + jit(0.05), spd, { k: 'stream', r: 2.5 }));
  },
  ring(c, p) {
    const n = p.n || 10, spd = p.spd || 130;
    const e = c.e;
    e._ringA = ((e._ringA || 0) + PI / n) % TAU;
    for (let i = 0; i < n; i++) c.orb(e._ringA + (i * TAU) / n, spd, { k: 'petal', life: 3.6 });
  },
  wave(c, p) {
    const n = p.n || 1, spd = p.spd || 150;
    for (let i = 0; i < n; i++) {
      const b = c.orb(PI, spd, { k: 'wave', r: 3.5, life: 3.6 });
      if (!b) break;
      b.wa = p.amp || 28;
      b.wf = p.freq || 5;
      b.wp = (i * TAU) / n;
      b.wt = 0;
      b.wo = 0;
    }
  },
  spiral(c, p) {
    const n = p.n || 10, gap = p.gap || 0.065, step = p.step || 0.42, arms = p.arms || 2, spd = p.spd || 145;
    const e = c.e;
    for (let i = 0; i < n; i++) {
      c.later(i * gap, (c2) => {
        e._spA = ((e._spA || PI) + step) % TAU;
        for (let a = 0; a < arms; a++) c2.orb(e._spA + (a * TAU) / arms, spd, { k: 'petal', life: 3.4 });
      });
    }
  },
  bigorb(c, p) {
    const n = p.n || 1, spd = p.spd || 105;
    const base = PI + (c.aim - PI) * 0.6;
    for (let i = 0; i < n; i++) c.orb(base + (i - (n - 1) / 2) * 0.38, spd, { k: 'big', r: 8, hb: 5, life: 5.5 });
  },
  split(c, p) {
    const b = c.orb(PI + (c.aim - PI) * 0.5, p.spd || 150, { k: 'split', r: 4.5, hb: 1, life: 4 });
    if (!b) return;
    b.st = p.t || 0.6;
    b.sn = p.n || 4;
    b.ss = p.sspd || 150;
  },
  mine(c, p) {
    const n = p.n || 2, spd = p.spd || 95;
    for (let i = 0; i < n; i++) {
      c.orb(PI + (i - (n - 1) / 2) * 0.62 + jit(0.2), spd * (0.85 + Math.random() * 0.3), { k: 'mine', r: 5, hb: 3, life: 7.5 });
    }
  },
  boomerang(c, p) {
    const n = p.n || 1, spd = p.spd || 320;
    for (let i = 0; i < n; i++) {
      const b = c.orb(c.aim + (i - (n - 1) / 2) * 0.32, spd, { k: 'boom', r: 5, hb: 2, life: 3.4 });
      if (b) b.ax = p.ax || 380; // decelerate, then fly back to the right
    }
  },
  pulse(c, p) {
    const n = p.n || 3, gap = p.gap || 0.1, spd = p.spd || 560;
    for (let i = 0; i < n; i++) c.later(i * gap, (c2) => c2.laser(spd, 0, 'pulse'));
  },
  laser(c, p) {
    c.laser(p.spd || 480, p.dy || 0);
  },
  longlaser(c, p) {
    c.laser(p.spd || 640, 0, 'beam');
  },
  twinlaser(c, p) {
    const g = p.g || 9, spd = p.spd || 500;
    c.laser(spd, -g);
    c.laser(spd, g);
  },
  trilaser(c, p) {
    const g = p.g || 14, spd = p.spd || 480;
    c.laser(spd, -g);
    c.laser(spd + 20, 0);
    c.laser(spd, g);
  },
  sweep(c, p) {
    const offs = p.offs || [-60, -30, 0, 30, 60], gap = p.gap || 0.09, spd = p.spd || 520;
    // Top → bottom (alternating direction each volley); every beam stays horizontal.
    const e = c.e;
    e._swDir = e._swDir === 1 ? -1 : 1;
    const list = e._swDir === 1 ? offs : [...offs].reverse();
    list.forEach((dy, i) => c.later(i * gap, (c2) => c2.laser(spd, dy)));
  },
  missile(c, p) {
    const n = p.n || 1;
    for (let i = 0; i < n; i++) c.missile(c.aim + jit(p.jit || 0.3) + (i - (n - 1) / 2) * 0.5, p.home || 0.5, 230 + Math.random() * 30);
  },
  salvo(c, p) {
    const n = p.n || 4, spread = p.a || 1.5, gap = p.gap || 0.06;
    for (let i = 0; i < n; i++) {
      const ang = PI + (n > 1 ? (i / (n - 1) - 0.5) : 0) * spread;
      c.later(i * gap, (c2) => c2.missile(ang, p.home || 0.6, 240));
    }
  },
};

/** True if this enemy uses a per-unit loadout (all non-wave kinds). */
export function usesLoadout(e) {
  return !!e && !isWaveKind(e.kind);
}

function loadoutOf(e) {
  return unitAttackLoadout(e.kind, resolveEnemyTier(e.kind));
}

/** Entries fired by the next volley (does not advance the rotation). */
function peekVolley(e, lo) {
  const seq = lo.seq;
  const per = Math.min(lo.per || 1, seq.length);
  const i0 = (e._atkIdx || 0) % seq.length;
  const out = [];
  for (let k = 0; k < per; k++) out.push(seq[(i0 + k) % seq.length]);
  return out;
}

/**
 * Telegraph y-offsets for the next volley, or null if it needs none.
 * Large sent units telegraph any laser volley; longlaser / sweep always telegraph.
 */
export function loadoutTelegraph(e) {
  const lo = loadoutOf(e);
  const large = e.sent && isLargeEnemy(e);
  let offs = null;
  for (const [pid, p = {}] of peekVolley(e, lo)) {
    const f = LASER_OFFS[pid];
    if (!f) continue;
    if (!large && !ALWAYS_TELE.has(pid)) continue;
    offs = (offs || []).concat(f(p));
  }
  return offs ? [...new Set(offs)].slice(0, 6) : null;
}

/** Fire the next volley of e's loadout and advance the rotation. */
export function fireLoadoutVolley(e, bullets, tx, ty) {
  const lo = loadoutOf(e);
  const entries = peekVolley(e, lo);
  e._atkIdx = ((e._atkIdx || 0) + entries.length) % lo.seq.length;
  const c = makeCtx(e, bullets, tx, ty);
  for (const [pid, p = {}] of entries) {
    const fn = PATTERNS[pid];
    if (fn) fn(c, p);
  }
}

/** Post-volley reload in seconds (±8% jitter so a group doesn't fire in lockstep). */
export function loadoutReload(e) {
  const lo = loadoutOf(e);
  return lo.iv * (0.92 + Math.random() * 0.16);
}

/** Run delayed follow-up shots (burst / stream / spiral / pulse / sweep / salvo). */
export function tickEnemyAttackQueue(e, bullets, tx, ty, dt) {
  const q = e._atkQ;
  if (!q || !q.length) return;
  let c = null;
  for (let i = 0; i < q.length; i++) {
    const it = q[i];
    it.t -= dt;
    if (it.t <= 0) {
      if (!c) c = makeCtx(e, bullets, tx, ty);
      it.fn(c);
      q.splice(i, 1);
      i--;
    }
  }
}

/**
 * Per-frame special bullet motion (wave / split / mine / boomerang).
 * Call BEFORE the generic x += vx*dt step. Newly spawned bullets go to `out`.
 */
export function updateEnemyBullet(b, dt, out) {
  switch (b.k) {
    case 'wave': {
      b.wt += dt;
      const off = Math.sin(b.wt * b.wf + b.wp) * b.wa;
      b.y += off - (b.wo || 0);
      b.wo = off;
      break;
    }
    case 'split': {
      b.st -= dt;
      if (b.st <= 0 && b.life > 0) {
        b.life = 0;
        const n = b.sn || 4;
        const head = Math.atan2(b.vy, b.vx);
        const spread = n >= 6 ? TAU / n : 0.5;
        for (let i = 0; i < n; i++) {
          const a = n >= 6 ? head + i * spread : head + (i - (n - 1) / 2) * spread;
          const s = spawnBullet(b.x, b.y, Math.cos(a) * b.ss, Math.sin(a) * b.ss, 'enemy', false, 2, { life: 2.6 });
          s.k = 'petal';
          s.src = b.src;
          out.push(s);
        }
      }
      break;
    }
    case 'mine': {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 40) {
        const f = Math.exp(-1.5 * dt);
        b.vx *= f;
        b.vy *= f;
      }
      break;
    }
    case 'boom':
      b.vx += (b.ax || 380) * dt;
      b.vy *= Math.exp(-0.6 * dt);
      break;
    default:
      break;
  }
}
