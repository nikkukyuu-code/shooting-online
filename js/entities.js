/** Game entities: player, enemies, bullets, items, effects */

export const POWERUPS = [
  { id: 'homing',     label: '追尾ミサイル',  effect: '敵を追う弾を連射',           desc: '一定時間、敵を追尾するミサイルを連射する攻撃アイテム。', color: '#ff66ff', icon: '◆' },
  { id: 'laser',      label: 'レーザー',      effect: '小刻みレーザーで前方攻撃',   desc: '細いレーザーを前方へ連射。直線の敵に強い。', color: '#66ccff', icon: '═' },
  { id: 'spread',     label: 'ショットガン',  effect: '扇状の弾幕を一斉射撃',       desc: '扇状に弾をばらまき、近〜中距離の群れを一掃する。', color: '#ffaa33', icon: '※※' },
  { id: 'bomb',       label: 'ボム',          effect: '画面内の敵をまとめて攻撃',   desc: '画面内の敵に大ダメージ。周囲の敵弾も消しやすい緊急回避用。', color: '#ff5522', icon: '◎' },
  { id: 'shock',      label: '電撃',          effect: '周囲の広範囲の敵を感電',     desc: '自機周囲の広い円内の敵をまとめて感電させる。', color: '#88ddff', icon: '⚡' },
  { id: 'rapid',      label: '連射強化',      effect: '一定時間すばやく強弾を連射', desc: '一定時間、自機の連射速度と弾威力が上がる強化アイテム。', color: '#ffee44', icon: '≫' },
  { id: 'meteor',     label: '隕石送信',      effect: '相手に隕石攻撃を落とす',     desc: '対戦相手のフィールドへ隕石を落とし、直接ダメージを与える。', color: '#ff7744', icon: '☄' },
  { id: 'send',       label: '敵キャラ送信',  effect: 'デッキからランダムに2体送る', desc: '装備デッキの中からランダムに2体を相手フィールドへ送る基本送信アイテム。送られた敵はワープの輪の中に出現し、5秒間（最初の3秒は点滅）無敵・攻撃なし。輪が消えると攻撃開始。', color: '#ff8844', icon: '⇒' },
  { id: 'direct',     label: '直接攻撃',      effect: '自機から撃った通常弾が相手画面の下から出現', desc: '約3.6秒間、自機が上を向き通常弾を真上へ発射。画面の上へ抜けた弾は相手フィールドの下端（同じ横位置）から現れてそのまま上へ飛び、当たるたびに爆発してダメージ。追尾しないので相手は横に動けばよけられる。', color: '#ff3333', icon: '※' },
  { id: 'heal',       label: 'HP回復',        effect: '自分のHPを+25',              desc: '自分のHPを25回復する。ピンチのときの定番回復。', color: '#44ff88', icon: '+' },
  { id: 'heal_big',   label: '大回復',        effect: '自分のHPを+50',              desc: '自分のHPを50回復する大回復。出現率は低め。', color: '#22ff66', icon: '++' },
  { id: 'send_mech',  label: '戦艦送信',      effect: 'デッキの戦艦級を1体送る',   desc: 'デッキの戦艦級（メカ級）からランダムに1体送る。デッキに戦艦級がない時はデッキ最大のユニット。予告レーザーにも注意。', color: '#88aaff', icon: '艦' },
  { id: 'send_golem', label: '要塞送信',      effect: 'デッキの要塞級を1体送る',   desc: 'デッキの要塞級（弩級艦・要塞・伝説級）からランダムに1体送る。デッキに要塞級がない時はデッキ最大のユニット。', color: '#cc88ff', icon: '塞' },
  { id: 'send_tank',  label: 'ガンシップ送信', effect: 'デッキのガンシップ級を1体送る', desc: 'デッキのガンシップ級（巡洋艦・砲艦などタンク級）からランダムに1体送る。デッキにない時はデッキ最大のユニット。', color: '#66ddff', icon: '砲' },
  { id: 'send_drone', label: '無人機群送信',  effect: 'デッキの小型機を4機送る', desc: 'デッキの小型機（ドローン・群体）からランダムに4機送る。デッキに小型機がない時はデッキ最小のユニットを4機。', color: '#33ffff', icon: '群' },
  // v1.5.67 — extra player attack items (logic/visuals in attack_items.js)
  { id: 'pbeam',      label: '貫通ビーム',    effect: '極太ビームで前方を貫通',     desc: '約2.6秒、前方へ極太ビームを照射。当たった敵を全部貫通し、ビーム上の敵弾も消す。', color: '#d58cff', icon: '▶' },
  { id: 'option',     label: 'オプション',    effect: '子機2機が一緒に射撃',         desc: '約8秒、自機の上下にメカ型ビットが展開し、前方へ弾を撃ち続ける。', color: '#ff8ec8', icon: '∞' },
  { id: 'cluster',    label: 'クラスターミサイル', effect: '分裂して小爆発するミサイル', desc: 'ミサイル4発を扇状に発射。途中で3つに分裂し、小さな爆発で周りの敵を巻き込む。', color: '#ff5c8a', icon: '裂' },
  { id: 'blackhole',  label: 'ブラックホール', effect: '敵と敵弾を吸い込み攻撃',     desc: '前方にブラックホールを作り約2秒間敵と敵弾を吸い寄せ、最後に収縮爆発でダメージ。', color: '#8a6bff', icon: '●' },
  { id: 'freeze',     label: 'フリーズ',      effect: '周囲の敵を凍らせる',         desc: '自機のまわりの敵を約5秒凍らせて動きと攻撃を止め、小ダメージ。範囲内の敵弾も消す。', color: '#bff4ff', icon: '氷' },
  { id: 'reflect',    label: 'リフレクター',  effect: '壁で跳ね返る円盤を発射',     desc: '画面の端で跳ね返る円盤を4枚発射。敵を貫通しながら何度も当たり、敵弾も弾く。', color: '#ffc34d', icon: '◇' },
  // v1.5.70 — defensive barrier (logic/visuals in attack_items.js)
  { id: 'barrier',    label: 'バリア',        effect: '一定時間ダメージを防ぐ',     desc: '約5.5秒、自機のまわりにエネルギーシールドを展開。敵弾と体当たりのダメージを防ぐ（攻撃はしない）。', color: '#6cf0ff', icon: '盾' },
];

/** 直接攻撃 window (seconds) + HUD countdown. */
export const DIRECT_DURATION = 3.6;
/**
 * 直接攻撃 shot = the normal shot (speed 420 px/s, damage 2, fired every 0.16s by the normal
 * auto-fire), only redirected. Symmetric for both sides:
 *   1) it leaves the shooter's ship straight UP in the shooter's pane (visual, hits nothing there);
 *   2) when it exits the top it enters the TARGET's field from just below the bottom edge at the
 *      same x and keeps flying UP, hitting the target ship only on real collision.
 * No homing, no aim correction, no pierce. Spawning below the bottom edge means ships in the
 * bottom overhang are still swept by the rising shot (no safe zone).
 */
export const DIRECT_SHOT_SPEED = 420;
export const DIRECT_SHOT_DMG = 2;
/** Spawn y offset below the target field's bottom edge (px). */
export const DIRECT_SHOT_SPAWN_BELOW = 36;

/** Rising direct shot in the target field (height fh). owner: 'player' (in COM field) | 'enemy' (in our field). */
export function spawnDirectShot(x, fh, owner) {
  const b = spawnBullet(x, fh + DIRECT_SHOT_SPAWN_BELOW, 0, -DIRECT_SHOT_SPEED, owner, false, DIRECT_SHOT_DMG, { life: 4 });
  b.dir = true;
  return b;
}

/** Outgoing direct shot leaving the shooter's ship straight up (visual only, no hits in that pane). */
export function spawnDirectOutShot(x, y) {
  const b = spawnBullet(x, y, 0, -DIRECT_SHOT_SPEED, 'player', false, 0, { life: 4 });
  b.dvis = true;
  return b;
}

export function powerupMeta(id) {
  return POWERUPS.find((p) => p.id === id) || POWERUPS[0];
}


export function pickPowerupId() {
  const weighted = [
    ['homing', 2], ['laser', 2], ['spread', 3], ['bomb', 2], ['shock', 3], ['rapid', 3],
    ['meteor', 2], ['send', 2.4], ['direct', 2.5],
    // Heal a bit less common again (was 4.1 / 1.95)
    ['heal', 3.2], ['heal_big', 1.5],
    ['send_mech', 2.3], ['send_golem', 2.3], ['send_tank', 2.3], ['send_drone', 2.3],
    // v1.5.67 extra attack items + v1.5.70 barrier
    ['pbeam', 1.5], ['option', 1.5], ['cluster', 1.5], ['blackhole', 1.5], ['freeze', 1.5], ['reflect', 1.5],
    ['barrier', 1.8],
  ];
  let r = Math.random() * weighted.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of weighted) { r -= w; if (r <= 0) return id; }
  return 'homing';
}

/** Player / COM max HP (v1.5.72: 100→150 for slower, more deliberate matches). */
export const PLAYER_MAX_HP = 150;

/** Non-boss item drop chance on kill (slightly lowered from 0.25). Boss stays guaranteed. */
export const ITEM_DROP_CHANCE = 0.20;
/** COM non-boss drop chance (slightly lowered from 0.28). */
export const BOT_ITEM_DROP_CHANCE = 0.22;

export function createPlayer(side = 'self') {
  return {
    side,
    x: 48,
    y: 0.5, // normalized within own field (0..1)
    w: 34,
    h: 22,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    fireCd: 0,
    invuln: 0,
    score: 0,
    items: [], // queued powerup ids
    activePower: null,
    activeTimer: 0,
    laserCd: 0,
  };
}

let _enemyUidSeq = 1;

/** Base combat stats by tier. Catalog units map onto these via CATALOG.tier. */
export const ENEMY_TIER_STATS = {
  // Visual + hitbox sizes ×2 (drawEnemy uses e.w/e.h; player ship unchanged)
  // v1.5.72: HP ≈1.75× for slower TTK (じっくり倒す) — restored; COM nerf is separate
  basic:  { w: 68,  h: 56,  hp: 7,  speedBase: 100, speedRand: 50, score: 10,  color: '#9aa0a8' },
  elite:  { w: 92,  h: 76,  hp: 18, speedBase: 75,  speedRand: 35, score: 30,  color: '#f2f2f6' },
  swarm:  { w: 52,  h: 40,  hp: 4,  speedBase: 150, speedRand: 55, score: 5,   color: '#ff2a3a' },
  boss:   { w: 184, h: 116, hp: 125, speedBase: 34,  speedRand: 0,  score: 200, color: '#b0b4bc' },
  mech:   { w: 176, h: 96,  hp: 50, speedBase: 42,  speedRand: 0,  score: 80,  color: '#f4f4f8' },
  golem:  { w: 168, h: 140, hp: 64, speedBase: 28,  speedRand: 0,  score: 100, color: '#3cbc48' },
  tank:   { w: 180, h: 88,  hp: 70, speedBase: 32,  speedRand: 0,  score: 110, color: '#e02028' },
  drone:  { w: 56,  h: 44,  hp: 9,  speedBase: 130, speedRand: 40, score: 20,  color: '#ffd428' },
};

/**
 * Wave-only ambient spawn kinds (NOT in shop/deck catalog).
 * Natural play uses these ids; deck send / net receive keep catalog ids.
 */
export const WAVE_KIND_TIERS = {
  wave_basic: 'basic',
  wave_swarm: 'swarm',
  wave_elite: 'elite',
  wave_boss: 'boss',
  // Core weak-point kinds (wave-only, never shop/deck): map to combat tiers for attacks/size
  wave_core_boss: 'boss',
  wave_swarm_core: 'elite',
};
export const WAVE_KIND_IDS = Object.keys(WAVE_KIND_TIERS);
export function isWaveKind(kind) {
  return !!(kind && WAVE_KIND_TIERS[kind]);
}

/** Optional runtime map kind→tier (filled by game from catalog). */
let _kindTier = Object.create(null);
export function setKindTier(map) {
  _kindTier = map || Object.create(null);
}

export function resolveEnemyTier(kind) {
  if (ENEMY_TIER_STATS[kind]) return kind;
  if (WAVE_KIND_TIERS[kind]) return WAVE_KIND_TIERS[kind];
  if (_kindTier[kind] && ENEMY_TIER_STATS[_kindTier[kind]]) return _kindTier[kind];
  return 'basic';
}

/** Large / capital-class tiers (boss, golem, tank, mech + heavy sheet units). */
export const LARGE_ENEMY_TIERS = new Set(['boss', 'golem', 'tank', 'mech']);

/**
 * True for "デカい" units: large tiers, catalog.large, or size/hp above threshold.
 * Used for laser telegraph on sent enemies.
 */
export function isLargeEnemy(e) {
  if (!e) return false;
  if (e.large === true) return true;
  const tier = resolveEnemyTier(e.kind || 'basic');
  if (LARGE_ENEMY_TIERS.has(tier)) return true;
  if ((e.w || 0) >= 150 || (e.h || 0) >= 100) return true;
  if ((e.maxHp || e.hp || 0) >= 40) return true; // track mech floor after HP soften
  return false;
}

/** Large tiers always include laser in pushEnemyAttack. */
export function enemyAttackUsesLaser(kind) {
  const tier = resolveEnemyTier(kind || 'basic');
  return LARGE_ENEMY_TIERS.has(tier)
    || tier === 'drone' || tier === 'elite' || tier === 'basic';
}

export function spawnEnemy(fieldW, fieldH, kind = 'basic') {
  const tier = resolveEnemyTier(kind);
  const base = ENEMY_TIER_STATS[tier] || ENEMY_TIER_STATS.basic;
  const t = {
    w: base.w, h: base.h, hp: base.hp, score: base.score, color: base.color,
    speed: base.speedBase + Math.random() * (base.speedRand || 0),
  };
  const e = {
    kind,
    _uid: _enemyUidSeq++,
    x: fieldW + 20 + Math.random() * 40,
    y: 30 + Math.random() * Math.max(40, fieldH - 60),
    w: t.w, h: t.h,
    hp: t.hp, maxHp: t.hp,
    speed: t.speed,
    score: t.score,
    color: t.color,
    phase: Math.random() * Math.PI * 2,
    surgePhase: Math.random() * Math.PI * 2,
    surgeAmp: 28 + Math.random() * 36,   // forward/back weave in px
    surgeFreq: 1.1 + Math.random() * 1.4,
    fireCd: 1.2 + Math.random() * 0.8,
    sent: false, // was sent by opponent
  };
  return attachCore(e);
}

/** True for wave kinds that carry a destructible glowing core. */
export function hasCore(e) {
  return !!(e && (e.kind === 'wave_core_boss' || e.kind === 'wave_swarm_core'));
}

/**
 * Attach a readable weak-point core (and optional orbiting drones) after spawn.
 * Core is always visible. Body shots deal BODY_DMG_MUL; core destruction kills the unit.
 */
export const CORE_BODY_DMG_MUL = 0.05; // body spray is almost useless — aim the core
export function attachCore(e) {
  if (!e || !hasCore(e)) return e;
  if (e.kind === 'wave_core_boss') {
    // Slightly tankier hull than classic boss; reward is the core one-shot
    e.hp = Math.round((e.hp || 125) * 1.15);
    e.maxHp = e.hp;
    e.score = Math.max(e.score || 0, 350);
    // Core sits near the nose (left / toward player) — easy to spot on phone
    // Core always visible, phone-readable size, slight orbit so aiming matters
    e.core = { ox: -e.w * 0.36, oy: 0, r: Math.max(16, Math.min(e.w, e.h) * 0.18), hp: 1, maxHp: 1, orbit: 10, ang: 0 }; // exposed at the nose (faces the player)
    e.drones = null;
  } else {
    // Swarm-core: elite-sized formation; satellites orbit a central core
    e.w = Math.max(e.w || 92, 110);
    e.h = Math.max(e.h || 76, 110);
    e.hp = 40;
    e.maxHp = 40;
    e.score = Math.max(e.score || 0, 160);
    e.speed = Math.min(e.speed || 75, 70);
    // Core is the only way to clear the swarm; drones are distractions (high HP, no formation wipe)
    e.core = { ox: 0, oy: 0, r: 15, hp: 1, maxHp: 1, orbit: 6, ang: 0 };
    const n = 6;
    e.drones = [];
    for (let i = 0; i < n; i++) {
      e.drones.push({
        ang: (Math.PI * 2 * i) / n,
        dist: 36 + (i % 2) * 8,
        r: 12,
        hp: 8,
        maxHp: 8,
      });
    }
  }
  e._coreFlash = 0;
  e._bodyFlash = 0;
  return e;
}

/** World-space core centre. */
export function coreWorld(e) {
  if (!e || !e.core) return null;
  return { x: e.x + e.core.ox, y: e.y + e.core.oy, r: e.core.r };
}

/** Advance swarm-core drone orbits (call each tick). */
export function tickCoreExtras(e, dt) {
  if (!e) return;
  if (e._coreFlash > 0) e._coreFlash = Math.max(0, e._coreFlash - dt);
  if (e._bodyFlash > 0) e._bodyFlash = Math.max(0, e._bodyFlash - dt);
  if (e.core && e.core.orbit) {
    e.core.ang = (e.core.ang || 0) + dt * 1.35;
    const baseOx = e.kind === 'wave_core_boss' ? -e.w * 0.36 : 0;
    const baseOy = 0;
    e.core.ox = baseOx + Math.cos(e.core.ang) * e.core.orbit;
    e.core.oy = baseOy + Math.sin(e.core.ang) * e.core.orbit * 0.7;
  }
  if (e.drones) {
    for (const d of e.drones) {
      if (d.hp <= 0) continue;
      d.ang += dt * 1.6;
    }
  }
}

/**
 * Apply bullet damage with core / drone / body rules.
 * Returns { hit:'core'|'drone'|'body'|'none', killed:boolean }.
 * fxList receives sparks / deflect / core-break FX entries (plain objects).
 */
export function applyCoreAwareHit(e, dmg, bx, by, fxList) {
  if (!e || e.hp <= 0) return { hit: 'none', killed: false };
  if (!hasCore(e) || !e.core) {
    e.hp -= dmg;
    if (fxList) fxList.push(spawnHitSpark(bx, by));
    return { hit: 'body', killed: e.hp <= 0 };
  }
  const c = e.core;
  const cx = e.x + c.ox, cy = e.y + c.oy;
  // 1) Core
  if (c.hp > 0 && Math.hypot(bx - cx, by - cy) < c.r + 5) {
    c.hp = 0;
    e.hp = 0;
    e._coreBreak = true;
    if (fxList) {
      fxList.push(spawnExplosion(cx, cy, true));
      fxList.push(spawnHitSpark(cx, cy));
      if (e.drones) {
        for (const d of e.drones) {
          if (d.hp <= 0) continue;
          d.hp = 0;
          fxList.push(spawnExplosion(e.x + Math.cos(d.ang) * d.dist, e.y + Math.sin(d.ang) * d.dist, false));
        }
      }
    }
    return { hit: 'core', killed: true };
  }
  // 2) Drones (swarm only)
  if (e.drones) {
    for (const d of e.drones) {
      if (d.hp <= 0) continue;
      const dx = e.x + Math.cos(d.ang) * d.dist;
      const dy = e.y + Math.sin(d.ang) * d.dist;
      if (Math.hypot(bx - dx, by - dy) < d.r + 4) {
        d.hp -= dmg;
        if (fxList) fxList.push(spawnHitSpark(dx, dy));
        if (d.hp <= 0 && fxList) fxList.push(spawnExplosion(dx, dy, false));
        return { hit: 'drone', killed: false };
      }
    }
  }
  // 3) Body hull (core boss) — reduced damage + deflect feel
  if (e.kind === 'wave_core_boss'
      && Math.abs(bx - e.x) < e.w * 0.45 + 4 && Math.abs(by - e.y) < e.h * 0.45 + 4) {
    e.hp -= Math.max(0.05, dmg * CORE_BODY_DMG_MUL);
    e._bodyFlash = 0.16;
    if (fxList) fxList.push(spawnDeflectSpark(bx, by));
    // Body never kills a core boss — only the core does (decisive skill shot)
    if (e.hp < 1) e.hp = 1;
    return { hit: 'body', killed: false };
  }
  // Swarm: shots through empty space between drones miss (no body hull)
  return { hit: 'none', killed: false };
}

/** Soft cyan "弾かれた" spark for body hits on a core boss. */
export function spawnDeflectSpark(x, y) {
  return { kind: 'deflect', x, y, life: 0.22, max: 0.22, r: 10 };
}

/**
 * Area / laser / bomb damage: still damages the unit, but a direct core strike
 * (blast centred on the core) triggers the same instant kill as a bullet.
 */
export function applyCoreAwareArea(e, dmg, ox, oy, fxList) {
  if (!e || e.hp <= 0) return { hit: 'none', killed: false };
  if (!hasCore(e) || !e.core) {
    e.hp -= dmg;
    return { hit: 'body', killed: e.hp <= 0 };
  }
  const c = e.core;
  const cx = e.x + c.ox, cy = e.y + c.oy;
  if (c.hp > 0 && ox != null && Math.hypot(ox - cx, oy - cy) < c.r + 18) {
    return applyCoreAwareHit(e, dmg, cx, cy, fxList);
  }
  // Area hits body (reduced) + chips drones
  if (e.drones) {
    for (const d of e.drones) {
      if (d.hp <= 0) continue;
      d.hp -= dmg * 0.5;
      if (d.hp <= 0 && fxList) {
        fxList.push(spawnExplosion(e.x + Math.cos(d.ang) * d.dist, e.y + Math.sin(d.ang) * d.dist, false));
      }
    }
  }
  if (e.kind === 'wave_core_boss') {
    e.hp -= Math.max(0.05, dmg * CORE_BODY_DMG_MUL);
    if (e.hp < 1) e.hp = 1; // only core ends them
    e._bodyFlash = 0.12;
    return { hit: 'body', killed: false };
  }
  // Swarm: area only thins the drones — the formation survives until its core breaks
  e._bodyFlash = 0.1;
  return { hit: 'body', killed: false };
}

/** Beam tick along row `ly` (x beyond sx): core if the beam crosses it, else area chip. */
export function applyCoreAwareBeam(e, dmg, ly, fxList) {
  const c = coreWorld(e);
  if (c && e.core.hp > 0 && Math.abs(c.y - ly) < c.r + 6) return applyCoreAwareHit(e, dmg, c.x, c.y, fxList);
  if (fxList) fxList.push(spawnDeflectSpark(e.x - e.w * 0.35, ly));
  return applyCoreAwareArea(e, dmg, null, null, fxList);
}

export function spawnBullet(x, y, vx, vy, owner = 'player', homing = false, dmg = 1, opts = {}) {
  const laser = !!opts.laser;
  // Lasers are never homing and never get homeT.
  const useHoming = laser ? false : !!homing;
  const b = {
    x, y, vx, vy,
    r: laser ? 2.5 : (useHoming ? 4 : 3),
    owner, homing: useHoming, dmg,
    life: opts.life != null ? opts.life : (laser ? 2.2 : 3),
    laser,
    // pierce: keep flying until off-screen (used by direct-attack volley)
    pierce: !!opts.pierce,
  };
  // Limited-homing: steer only while homeT > 0, then fly straight
  if (useHoming && opts.homeT != null) {
    b.homeT = opts.homeT;
    b.homeMax = opts.homeMax != null ? opts.homeMax : opts.homeT;
  }
  return b;
}

export function spawnItem(x, y, forcedId) {
  const id = forcedId || pickPowerupId();
  const p = POWERUPS.find((q) => q.id === id) || POWERUPS[0];
  return { x, y, w: 40, h: 40, id: p.id, label: p.label, vy: 20, life: 8 }; // v1.5.67: bigger orb (r 11→20)
}

/** Force a specific powerup id (e.g. heal / heal_big from large-enemy kills). */
export function spawnItemWithId(x, y, id) {
  return spawnItem(x, y, id);
}

export function spawnMeteor(x, y, tx, ty) {
  // Fall straight down on a fixed X (no sideways seek / no homing)
  return {
    x: tx,
    y,
    vx: 0,
    vy: 220 + Math.random() * 80,
    r: 14 + Math.random() * 10,
    rot: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 4,
    life: 2.2,
    max: 2.2,
    hit: false,
    targetY: ty,
  };
}

export function spawnExplosion(x, y, big = false) {
  return {
    x, y,
    life: big ? 0.55 : 0.35,
    max: big ? 0.55 : 0.35,
    r: big ? 28 : 14,
  };
}

/**
 * Compact per-hit spark (bullet / laser / pierce tick).
 * One call per successful hit-detection / damage tick — not a death blast.
 */
export function spawnHitSpark(x, y) {
  return {
    kind: 'hit',
    x, y,
    life: 0.18,
    max: 0.18,
    r: 8,
  };
}

/** 電撃 (shock) hit radius in field pixels — v1.5.63: doubled from 160. */
export const SHOCK_RADIUS = 320;

/** Shock area FX: expanding electric ring to `r` + bolts to each hit target ([x,y] pairs). */
export function spawnShockFx(x, y, r = SHOCK_RADIUS, targets = []) {
  return {
    kind: 'shock',
    x, y, r,
    life: 0.7,
    max: 0.7,
    t: targets.slice(0, 16).map(([tx, ty]) => [Math.round(tx), Math.round(ty)]),
  };
}

/** ボム (bomb) FX total duration (s). Hit logic is screen-wide (every enemy on the stage). */
export const BOMB_FX_LIFE = 1.75; // v1.5.74: longer dramatic beat

/**
 * Bomb FX: short implosion at (x,y), then detonation + double shockwave sweeping the whole
 * stage (r = distance to the farthest pane corner), fireball bloom, debris, embers/smoke and a
 * chained secondary explosion on each hit target ([x,y] pairs). Visual only.
 */
export function spawnBombFx(x, y, fw, fh, targets = []) {
  const r = Math.hypot(Math.max(x, fw - x), Math.max(y, fh - y));
  return {
    kind: 'bomb',
    x, y, r: Math.round(r),
    life: BOMB_FX_LIFE,
    max: BOMB_FX_LIFE,
    t: targets.slice(0, 20).map(([tx, ty]) => [Math.round(tx), Math.round(ty)]),
  };
}

/** Heal / heal_big activation FX (s). Visual only — HP is applied by caller. */
export const HEAL_FX_LIFE = 0.9;
export const HEAL_BIG_FX_LIFE = 1.15;

/**
 * Soft green/cyan recovery aura around the ship. `big` = heal_big (stronger rings / sparkles).
 * Synced via serializeField (kind + a flag). Distinct from bomb (no screen shake / white-out).
 */
export function spawnHealFx(x, y, big = false) {
  const life = big ? HEAL_BIG_FX_LIFE : HEAL_FX_LIFE;
  return {
    kind: 'heal',
    x, y,
    r: big ? 78 : 56,
    life,
    max: life,
    a: big ? 1 : 0,
  };
}

export function serializeField(state) {
  // Compact snapshot for peer sync
  return {
    px: state.player.x,
    py: state.player.y,
    php: state.player.hp,
    items: state.player.items.slice(0, 4),
    ap: state.player.activePower,
    at: state.player.activeTimer,
    enemies: state.enemies.slice(0, 40).map(e => ({
      x: e.x, y: e.y, w: e.w, h: e.h, kind: e.kind, hp: e.hp, c: e.color, s: !!e.sent,
      ch: e.core ? e.core.hp : undefined,
      dr: e.drones ? e.drones.map(d => d.hp) : undefined,
      at: e.appearT > 0 ? +e.appearT.toFixed(3) : undefined,
      wt: e.warpT > 0 ? +e.warpT.toFixed(2) : undefined,
      wp: e.warpPop > 0 ? +e.warpPop.toFixed(2) : undefined,
      lt: e.laserTeleT > 0 ? +e.laserTeleT.toFixed(3) : undefined,
      lm: e.laserTeleT > 0 ? +(e.laserTeleMax || 0.6).toFixed(3) : undefined,
      ax: e.laserTeleT > 0 && e.laserAimX != null ? +e.laserAimX.toFixed(1) : undefined,
      ay: e.laserTeleT > 0 && e.laserAimY != null ? +e.laserAimY.toFixed(1) : undefined,
      lo: e.laserTeleT > 0 && e.laserTeleOffs ? e.laserTeleOffs : undefined,
    })),
    bullets: state.bullets.filter(b => b.owner === 'player' || b.owner === 'enemy').slice(0, 60).map(b => ({
      x: b.x, y: b.y, o: b.owner, h: !!b.homing, vx: b.vx, vy: b.vy,
      L: b.laser ? 1 : undefined,
      D: b.dir ? 1 : undefined,
      k: b.k || undefined,
      r: b.r > 3.5 ? b.r : undefined,
    })),
    fx: state.fx.slice(0, 12).map(f => ({ x: f.x, y: f.y, l: f.life, m: f.max, r: f.r, k: f.kind, t: f.t, a: f.a })),
    scroll: state.scroll,
    status: state.statusText,
    alive: state.alive,
  };
}
