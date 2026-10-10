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
  { id: 'ram',        label: '体当たり変身',  effect: '変身して敵に体当たり',       desc: '約5.5秒、自機が赤桃色の突撃形態に変身（無敵）。ドラッグで自由に動き、敵にぶつけて爆破。硬い敵には弾かれる。', color: '#ffd0a0', icon: '突' },
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
export const DIRECT_SHOT_DMG = 10; // 10-04: ship-to-ship direct shot 2 → 10 per hit
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


/** DEBUG TEMP: ram item drop weight — restore to 1.7 when debugging is done. */
export const RAM_DROP_WEIGHT = 1.7;
/** DEBUG TEMP: multiply non-boss item drop chance so ram appears early. Restore to 1. */
export const RAM_DROP_CHANCE_MUL = 1;

export function pickPowerupId() {
  const weighted = [
    ['homing', 2], ['laser', 2], ['spread', 3], ['bomb', 2], ['shock', 3], ['rapid', 3],
    ['meteor', 2], ['send', 2.4], ['direct', 2.5],
    // 10-04: heal drops between (was 3.2 / 1.5, then 1.6 / 0.75)
    ['heal', 2.4], ['heal_big', 1.1],
    ['send_mech', 2.3], ['send_golem', 2.3], ['send_tank', 2.3], ['send_drone', 2.3],
    // v1.5.67 extra attack items + v1.5.70 barrier
    ['pbeam', 1.5], ['option', 1.5], ['cluster', 1.5], ['blackhole', 1.5], ['freeze', 1.5], ['reflect', 1.5],
    ['barrier', 1.8],
    ['ram', RAM_DROP_WEIGHT],
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
  // 10-04b: laser now multi-hits by hull width → large ×1.6; 10-04c: normal tiers a bit below pre-10-04
  basic:  { w: 68,  h: 56,  hp: 6,  speedBase: 100, speedRand: 50, score: 10,  color: '#9aa0a8' },
  elite:  { w: 92,  h: 76,  hp: 15, speedBase: 75,  speedRand: 35, score: 30,  color: '#f2f2f6' },
  swarm:  { w: 52,  h: 40,  hp: 3,  speedBase: 150, speedRand: 55, score: 5,   color: '#ff2a3a' },
  boss:   { w: 184, h: 116, hp: 200, speedBase: 34,  speedRand: 0,  score: 200, color: '#b0b4bc' },
  mech:   { w: 176, h: 96,  hp: 80, speedBase: 42,  speedRand: 0,  score: 80,  color: '#f4f4f8' },
  golem:  { w: 168, h: 140, hp: 100, speedBase: 28,  speedRand: 0,  score: 100, color: '#3cbc48' },
  tank:   { w: 180, h: 88,  hp: 110, speedBase: 32,  speedRand: 0,  score: 110, color: '#e02028' },
  drone:  { w: 56,  h: 44,  hp: 8,  speedBase: 130, speedRand: 40, score: 20,  color: '#ffd428' },
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
  // Escort fighters packed in formation around a core unit (fodder for the core chain wipe)
  wave_escort: 'swarm',
  // Grey bipedal walker (elite-class stats, wave-only)
  wave_mech: 'elite',
  // Giant red eye boss: huge central core behind rotating mechanical claws (wave-only)
  wave_eye_boss: 'boss',
  // Scripted STO-recreation kinds (js/waves.js) — wave-only
  wave_grid_core: 'elite',   // red-core ship in the centre of a wedge grid
  wave_ring_core: 'elite',   // red core with a rotating ring of fighter pods
  wave_snake_head: 'boss',   // snake head (controller; its core sits on the orange body ball — user 10-06)
  wave_snake_seg: 'drone',   // silver body segment
  wave_cater: 'drone',       // green caterpillar sphere
  wave_mine: 'drone',        // yellow square trap mine
  wave_pod: 'drone',         // guard debris (ring pod / eye claw / swarm drone) left by a core break → chain
  wave_spider: 'basic',      // green spider ship (user art)
  wave_looper: 'swarm',      // red winged looper (user art)
  wave_saucer: 'swarm',      // small saucer (user art)
  wave_bubble: 'elite',      // 10-04: translucent round bubble (5×5 wall)
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
  if (kind === 'wave_mech') { e.w = 78; e.h = 94; } // upright walker silhouette (same elite HP/score)
  attachCore(e);
  // Big core bosses spawn fully inside the pane so the core is always reachable / readable
  if (isCoreBossKind(kind)) e.y = Math.max(e.h * 0.5 + 6, Math.min(fieldH - e.h * 0.5 - 6, e.y));
  return e;
}

/** Big core units (armored hull + one-shot core): the triangular midboss and the giant red eye. */
export function isCoreBossKind(kind) {
  return kind === 'wave_core_boss' || kind === 'wave_eye_boss';
}

export const CORE_KINDS = new Set(['wave_core_boss', 'wave_swarm_core', 'wave_eye_boss', 'wave_grid_core', 'wave_ring_core', 'wave_snake_head']);
/** Core kinds whose core break drops 大回復 (big units). */
export function bigCoreKind(kind) {
  return kind === 'wave_core_boss' || kind === 'wave_eye_boss' || kind === 'wave_snake_head';
}
/** True for wave kinds that carry a destructible glowing core. */
export function hasCore(e) {
  return !!(e && CORE_KINDS.has(e.kind));
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
    e.core = { ox: -e.w * 0.36, oy: 0, r: CORE_R, hp: CORE_HP.wave_core_boss, maxHp: CORE_HP.wave_core_boss, orbit: 28, ang: Math.random() * Math.PI * 2 }; // exposed at the nose; large orbit so body-centre aim often misses
    e.drones = null;
  } else if (e.kind === 'wave_eye_boss') {
    // Giant red eye: huge centre core (slow wobble) guarded by 8 rotating mechanical claws.
    // Shots on the core row pass the flesh and reach the core unless a claw is in the way.
    e.w = 176; e.h = 176;
    e.hp = Math.round((e.hp || 125) * 1.3);
    e.maxHp = e.hp;
    e.score = Math.max(e.score || 0, 450);
    e.speed = Math.min(e.speed || 34, 30);
    e.core = { ox: 0, oy: 0, r: CORE_R, hp: CORE_HP.wave_eye_boss, maxHp: CORE_HP.wave_eye_boss, orbit: 9, ang: Math.random() * Math.PI * 2 };
    e.drones = [];
    for (let i = 0; i < 8; i++) {
      e.drones.push({ ang: (Math.PI * 2 * i) / 8, dist: 80, r: 15, hp: GUARD_HP.claw, maxHp: GUARD_HP.claw, claw: true });
    }
  } else if (e.kind === 'wave_grid_core') {
    // ~1.5× player core ship in the middle of a wedge grid: core at its nose, armored hull
    e.w = 62; e.h = 52; e.hp = 30; e.maxHp = 30; e.score = Math.max(e.score || 0, 150);
    e.core = { ox: -e.w * 0.3, oy: 0, r: CORE_R, hp: CORE_HP.wave_grid_core, maxHp: CORE_HP.wave_grid_core, orbit: 0, ang: 0 };
    e.drones = null;
  } else if (e.kind === 'wave_ring_core') {
    // Rotating ring: 8 small fighter pods (user art) orbit a glowing red core; pods block shots
    // As in the video (1:48–2:10): a loose loop of 14 small red crab fighters (all facing left) round
    // a red spiked core orb; the loop barely turns, pulls in before its dash wall, then breaks up
    e.w = 96; e.h = 96; e.hp = 40; e.maxHp = 40; e.score = Math.max(e.score || 0, 180);
    e.core = { ox: 0, oy: 0, r: CORE_R, hp: CORE_HP.wave_ring_core, maxHp: CORE_HP.wave_ring_core, orbit: 3, ang: Math.random() * Math.PI * 2 };
    e.drones = [];
    for (let i = 0; i < 14; i++) e.drones.push({ ang: (Math.PI * 2 * i) / 14, dist: RING_R, r: 7.5, hp: GUARD_HP.pod, maxHp: GUARD_HP.pod, pod: true });
  } else if (e.kind === 'wave_snake_head') {
    // Tethered striker head. User 10-06: the CORE is the one differently coloured (orange) ball of the body,
    // not the head — the head object just owns the shared core HP; its position = the ball (e._coreSeg, coreWorld).
    e.w = 14; e.h = 14; e.hp = 60; e.maxHp = 60; e.score = Math.max(e.score || 0, 400); // video: ≈10–12 px red ball tip of the tethered striker
    e.core = { ox: 0, oy: 0, r: CORE_R, hp: CORE_HP.wave_snake_head, maxHp: CORE_HP.wave_snake_head, orbit: 0, ang: 0 };
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
    e.core = { ox: 0, oy: 0, r: CORE_R, hp: CORE_HP.wave_swarm_core, maxHp: CORE_HP.wave_swarm_core, orbit: 22, ang: Math.random() * Math.PI * 2 }; // large orbit: body-centre aim often misses
    const n = 6;
    e.drones = [];
    for (let i = 0; i < n; i++) {
      e.drones.push({
        ang: (Math.PI * 2 * i) / n,
        dist: 36 + (i % 2) * 8,
        r: 12,
        hp: GUARD_HP.drone,
        maxHp: GUARD_HP.drone,
      });
    }
  }
  e._coreFlash = 0;
  e._bodyFlash = 0;
  e._shake = 0;
  e._guardT = 0; e._guardCd = 0;
  // Defensive armour cycle (visible plates): open → warn (plates slide in, blinking) → shut (hits blocked)
  const sc = CORE_SHUTTER[e.kind];
  if (sc) e._sh = { ...sc, t: Math.random() * sc.open * 0.6, st: 0 };
  // Ring: periodic tighten + spin-up (pods close in around the core)

  return e;
}

/**
 * Core HP (normal shot = 2 dmg every 0.16 s ≈ 12.5 dps → small cores ≈ 4–5 hits,
 * bosses ≈ 10–13 hits). Chip damage shows as the ring around the core.
 */
/** Guards around a core (tough: shooting through them is slow — snipe the core instead). */
export const RING_R = 36;
// User 09-29 21:19: every unit attached to a core has the SAME, fairly tough HP (≈4.8 s of normal
// fire each: 2 dmg / 0.16 s) so breaking the core — and watching the chain blow them all — pays off.
export const ATTACHED_HP = 60;
export const GUARD_HP = { escort: ATTACHED_HP, cage: ATTACHED_HP, pod: ATTACHED_HP, claw: ATTACHED_HP, drone: ATTACHED_HP, seg: ATTACHED_HP };
/** Every core is a small glowing point (like the original): careful aim needed. Hit radius = r + pad. */
export const CORE_R = 9, CORE_HIT_PAD = 2;
// User 10-04: every core has the same toughness
export const SHARED_CORE_HP = 14;
export const CORE_HP = {
  wave_swarm_core: SHARED_CORE_HP, wave_grid_core: SHARED_CORE_HP, wave_ring_core: SHARED_CORE_HP,
  wave_snake_head: SHARED_CORE_HP, wave_core_boss: SHARED_CORE_HP, wave_eye_boss: SHARED_CORE_HP,
};
/** Armour cycle seconds: open (vulnerable) / warn (telegraph) / shut (blocked). */
export const CORE_SHUTTER = {
  wave_core_boss: { open: 3.2, warn: 0.6, shut: 0.9 },
  wave_eye_boss: { open: 3.6, warn: 0.6, shut: 1.0 },
  wave_grid_core: { open: 3.0, warn: 0.5, shut: 0.8 },
  wave_swarm_core: { open: 3.4, warn: 0.5, shut: 0.7 },
};
/** 0 open, 1 warn (still hittable), 2 shut. */
export function coreShutState(e) {
  return e && e._sh ? e._sh.st : 0;
}

/**
 * Core chain reaction: breaking a core detonates every unit attached to it (guards, chain links,
 * formation / escort pack), one by one, nearest first:
 * delay = 0.08 + 0.6 × (distance / CHAIN_R) s. Sent (opponent) units and big tiers are not chained.
 */
export const CHAIN_R = 300;
export function isChainable(o) {
  if (!o || o.sent || hasCore(o) || o.hp <= 0 || o._chainT != null) return false;
  if (typeof o.kind !== 'string' || !o.kind.startsWith('wave_')) return false;
  return !LARGE_ENEMY_TIERS.has(resolveEnemyTier(o.kind));
}
/** Original (old src 0:41.467 break → first attached-unit pop 0:42.533): the pack waits until the 0.9 s flash is over,
 *  then pops from the core outward. Was 0.12 s. */
export const CHAIN_FIRST = 1.07;
export const CHAIN_STEP = 0.05; // user 10-10 23:59: half (was 0.1); 10-10: = original footage (one pop per 10 fps game frame, bottom→top); was 0.04 — s between consecutive chain pops; user 10-06: half (was 0.08) — every core type, both fields
export function markCoreChain(e, list) {
  const c = coreWorld(e) || e;
  const seq = [];
  // 1) Guards go first, one by one round the circle (starting from the one nearest the player side)
  if (e.drones && list) {
    const live = e.drones.filter((d) => d.hp > 0);
    const norm = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    live.sort((p, q) => norm(p.ang - Math.PI) - norm(q.ang - Math.PI));
    for (const d of live) {
      d.hp = 0;
      const o = {
        kind: 'wave_pod', _uid: 900000 + Math.floor(Math.random() * 1e6),
        x: e.x + Math.cos(d.ang) * d.dist, y: e.y + Math.sin(d.ang) * d.dist * (d.ky || 1),
        w: d.r * 2.2, h: d.r * 2.2, hp: 1, maxHp: 1, score: 10, speed: 0, noFire: true, noDrop: true,
        phase: 0, surgePhase: 0, surgeAmp: 0, fireCd: 99,
        mv: 'plan', plan: [{ k: 'hold', d: 9 }], mvT: 0, dly: 0,
        spr: e.kind === 'wave_ring_core' ? 'fighter_mk2' : null, rot: d.ang + Math.PI / 2 - Math.PI,
        claw: !!d.claw, podR: d.r,
      };
      list.push(o);
      seq.push(o);
    }
  }
  // 2) Snake body: segment by segment. User 10-06: cores = the orange ball AND the head → the chain ripples out
  //    from the core that broke, both ways (tip side first on ties); the head (even detached and chasing) and the
  //    ball blow in their turn.
  const ball = e._coreSeg;
  const segs = (list || []).filter((o) => o !== e && o._chainOf === e && o.chainIdx != null && isChainable(o));
  if (ball) {
    const k0 = e._coreAt === 'head' ? 0 : ball.chainIdx;
    const pool = segs.map((o) => [o.chainIdx, o]);
    if (list && list.includes(e)) { e.hp = Math.max(1, e.hp); pool.push([0, e]); } // head = element 0 (past the tip)
    pool.sort((p, q) => (Math.abs(p[0] - k0) - Math.abs(q[0] - k0)) || (p[0] - q[0]));
    seq.push(...pool.map((p) => p[1]));
  } else seq.push(...segs.sort((p, q) => p.chainIdx - q.chainIdx));
  // 3) Everything else in range / in formation: nearest first, rippling outward (grids go ring by ring)
  const rest = [];
  for (const o of list || []) {
    if (o === e || seq.includes(o) || !isChainable(o)) continue;
    // User 09-29: only the units ATTACHED to this core (its formation / escort pack) go up — not strays nearby
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (o._lead === e || o._chainOf === e) rest.push([d, o]);
  }
  rest.sort((p, q) => p[0] - q[0]);
  for (const [, o] of rest) seq.push(o);
  seq.forEach((o, i) => { o._chainT = CHAIN_FIRST + i * CHAIN_STEP; o._chainSrc = e; });
  e._chainTotal = seq.length; e._chainDone = 0;
  return seq.length;
}
/** Tick a pending chain detonation; true on the frame it blows (caller adds FX/score as a kill). */
export function tickChain(o, dt) {
  if (o._chainT == null || o.hp <= 0) return false;
  o._chainT -= dt;
  if (o._chainT > 0) return false;
  o.hp = 0;
  o._chainKill = true;
  if (o._chainSrc) o._chainSrc._chainDone = (o._chainSrc._chainDone || 0) + 1;
  return true;
}
export function spawnChainBoom(o) {
  // User 09-29: each chained unit blows up at about TWICE its own size (fireball diameter ≈ 2 × unit)
  return { kind: 'chainboom', x: o.x, y: o.y, r: Math.max(o.w || 30, o.h || 24) * 2, life: 1.2, max: 1.2, sd: (o._uid || 1) % 7 };
}

/**
 * Dense escort formation for a core unit (like the original's packed rectangular packs).
 * Escorts enter from just off the right edge and fly into slots ahead of (left of) the leader,
 * then hold formation while it lives. 2 HP, no guns (contact only), no item drops.
 */
export function spawnCoreEscorts(lead, fw, fh) {
  const boss = isCoreBossKind(lead.kind);
  const out = [];
  const mkEsc = (fdx, fdy, c) => {
    const e = spawnEnemy(fw, fh, 'wave_escort');
    e.w = 38; e.h = 28; e.hp = GUARD_HP.escort; e.maxHp = GUARD_HP.escort; e.score = 15; e.speed = 150;
    e.noFire = true; e.noDrop = true;
    e._lead = lead; e.fdx = fdx; e.fdy = fdy;
    e.x = lead.x + fdx; e.y = Math.max(16, Math.min(fh - 16, lead.y + fdy));
    e.phase = (lead.phase || 0) + c * 0.35;
    out.push(e);
  };
  if (boss) {
    // Bosses (as in the original): escort columns fly ABOVE and BELOW the boss, level with its body.
    // The row in front of the core always stays open, and nobody sits over the player's side.
    const bandRows = lead.h > 100 ? 1 : 2;
    const gx = 44, gy = 34, cols = bandRows === 1 ? 6 : 5;
    const cx0 = Math.min(-(lead.w || 110) * 0.15, (lead.w || 110) * 0.5 - 19 - ((bandRows === 1 ? 6 : 5) - 1) / 2 * 44); // 10-04: no escort past the boss's back edge
    lead.x = Math.max(lead.x, fw + (lead.w || 110) * 0.5 + 30);
    lead._entryX = fw * 0.8;
    for (const sg of [-1, 1]) {
      for (let r = 0; r < bandRows; r++) {
        for (let c = 0; c < cols; c++) {
          mkEsc(cx0 + (c - (cols - 1) / 2) * gx, sg * ((lead.h || 80) * 0.5 + 24 + r * gy), c);
        }
      }
    }
    lead._bandH = (lead.h || 80) * 0.5 + 24 + (bandRows - 1) * gy + 16; // boss keeps its bands on screen
    return out;
  }
  const cols = 4, rows = 2, gx = 46, gy = 34;
  let front = (lead.w || 110) * 0.5;
  if (lead.core) front = Math.max(front, -(lead.core.ox || 0) + (lead.core.orbit || 0) + (lead.core.r || 0));
  if (lead.drones) for (const d of lead.drones) front = Math.max(front, d.dist + d.r * 1.4);
  const x0 = -front - 40;
  lead.x = Math.max(lead.x, fw + 24 - x0 + (cols - 1) * gx);
  lead._entryX = fw * 0.8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) mkEsc(x0 - c * gx, (r - (rows - 1) / 2) * gy * 2.2, c); // rows split above / below the core row
  }
  return out;
}
/** Formation flight; returns true while following a live leader (skip normal drift / fire). */
export function tickEscort(e, dt, fh) {
  const L = e._lead;
  if (!L) return false;
  if (L.hp <= 0 || L.x < -60) { e._lead = null; return false; }
  if (L._peel) {
    // Leader starts an attack run: the pack breaks off and peels away in two arcs (scripted plan)
    const sg = e.fdy < 0 ? -1 : e.fdy > 0 ? 1 : (e._uid % 2 ? 1 : -1);
    e._lead = null;
    e.mv = 'plan'; e.mvT = 0; e.dly = 0; e._pi = 0; e.face = true;
    e.plan = [{ k: 'bez', rel: true, p: [[0, 0], [-70, sg * 15], [-170, sg * 130], [-260, sg * 320]], d: 1.5 + Math.random() * 0.4 }];
    return false;
  }
  // Hold the slot (no wall closing over the core row — the core must stay shootable)
  // docked: rides with the core unit, each fighter bobbing a little out of step (never into the core row)
  const tx = L.x + e.fdx + Math.cos((e.phase || 0) * 0.7) * 2 + (e._gOx || 0), ty = L.y + e.fdy + Math.sin((e.phase += dt * 2.2)) * 4 + (e._gOy || 0); // + rear-guard offset
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  const vmax = (L._escV || 190) * dt;
  if (d > vmax) { e.x += (dx / d) * vmax; e.y += (dy / d) * vmax; } else { e.x = tx; e.y = ty; }
  e.y = Math.max(16, Math.min(fh - 16, e.y));
  return true;
}

/** World-space core centre. */
export function coreWorld(e) {
  if (!e || !e.core) return null;
  const b = e._coreSeg; // snake: core = its orange body ball
  if (b) return { x: b.x, y: b.y, r: e.core.r };
  return { x: e.x + e.core.ox, y: e.y + e.core.oy, r: e.core.r };
}
/** Snake core ball → the head that owns the core HP (null when the core is gone / not out yet). */
export function coreOwnerOf(e) {
  if (!e || !e._coreBall) return null;
  const H = e._chainOf;
  if (!H || !H.core || H.core.hp <= 0 || H.hp <= 0 || H._portalOnly || e._chainT != null) return null;
  return H;
}
/** True for units whose hits go through the core rules (core owners + the snake's core ball). */
export function isCoreTarget(e) { return hasCore(e) || !!(e && e._coreBall); }
/** User 10-06 16:49: the snake has TWO cores — the head and the orange body ball — sharing ONE life (the head's
 *  e.core HP, one gauge). A hit on either lowers it and flashes both (H._coreFlash); 0 → the whole snake chains.
 *  (video user_ref 4:45.6–4:45.8: a shot on the head stops there and the head flashes.) */
export const CORE_FLASH_T = 0.3; // user 10-10: core hit effect 0.3 s
function snakeCoreHit(H, px, py, bx, by, dmg, fxList, where) {
  const c = H.core;
  if (!c || c.hp <= 0 || H.hp <= 0 || H._portalOnly) return { hit: 'none', killed: false };
  if (Math.hypot(bx - px, by - py) >= c.r + CORE_HIT_PAD) return { hit: 'none', killed: false };
  c.hp -= dmg; H._coreFlash = CORE_FLASH_T; H._shake = 0.14; H._coreAt = where;
  if (c.hp > 0) { if (fxList) fxList.push(spawnHitSpark(bx, by)); return { hit: 'corehit', killed: false }; }
  c.hp = 0; H.hp = 0; H._coreBreak = true;
  if (fxList) { fxList.push(spawnExplosion(px, py, true)); fxList.push(spawnHitSpark(px, py)); }
  return { hit: 'core', killed: true };
}

/** Advance swarm-core drone orbits (call each tick). */
export function tickCoreExtras(e, dt) {
  if (!e) return;
  if (e._coreFlash > 0) e._coreFlash = Math.max(0, e._coreFlash - dt);
  if (e._bodyFlash > 0) e._bodyFlash = Math.max(0, e._bodyFlash - dt);
  if (e._shake > 0) e._shake = Math.max(0, e._shake - dt);
  if (e._guardT > 0) e._guardT = Math.max(0, e._guardT - dt);
  if (e._guardCd > 0) e._guardCd = Math.max(0, e._guardCd - dt);
  const sh = e._sh;
  if (sh && e.core && e.core.hp > 0) {
    sh.t += dt;
    const lim = sh.st === 0 ? sh.open : sh.st === 1 ? sh.warn : sh.shut;
    if (sh.t >= lim) { sh.t = 0; sh.st = (sh.st + 1) % 3; }
  }
  const frac = e.core && e.core.maxHp ? Math.max(0, e.core.hp / e.core.maxHp) : 1;
  let spin = 1.6 * (1 + 1.4 * (1 - frac)); // guards spin up as the core weakens
  if (e.kind === 'wave_ring_core') spin = 0; // the video's loop doesn't turn; its mouth stays on the core row
  const rs = e._rs;
  if (rs) {
    // ring: measured shape timeline (compact ring → tall oval → pulled-in oval)
    rs.t += dt;
    const K = rs.key; let i = 0;
    while (i < K.length - 1 && rs.t >= K[i + 1][0]) i++;
    const a = K[i], b = K[Math.min(K.length - 1, i + 1)];
    const u = b[0] > a[0] ? Math.max(0, Math.min(1, (rs.t - a[0]) / (b[0] - a[0]))) : 1;
    const sm = u * u * (3 - 2 * u);
    const rx = a[1] + (b[1] - a[1]) * sm, ry = a[2] + (b[2] - a[2]) * sm;
    // video 1:52–2:04 (kymograph): each crab keeps shuffling a few px along the loop, out of step
    let k = 0;
    for (const d of e.drones || []) {
      if (d.a0 == null) d.a0 = d.ang;
      d.ang = d.a0 + Math.sin(rs.t * 5.7 + k++ * 1.9) * 0.08;
      d.dist = rx; d.ky = ry / rx;
    }
    e.w = rx * 2 + 20; e.h = ry * 2 + 16;
  }
  const tg = e._tight;
  if (tg) {
    tg.t -= dt;
    if (tg.t <= 0) { tg.phase = tg.phase === 'in' ? 'out' : tg.phase === 'warn' ? 'in' : 'warn'; tg.t = tg.phase === 'warn' ? 0.5 : tg.phase === 'in' ? 1.5 : 3.2 - 1.2 * (1 - frac); }
    const want = tg.phase === 'in' ? 1 : 0;
    tg.k += (want - tg.k) * Math.min(1, dt * 6);
    spin *= 1 + 1.6 * tg.k;
    for (const d of e.drones || []) d.dist = (d.d0 || RING_R) * (1 - 0.3 * tg.k);
  }
  if (e.core && e.core.orbit) {
    e.core.ang = (e.core.ang || 0) + dt * 2.1;
    const baseOx = e.kind === 'wave_core_boss' ? -e.w * 0.3 : 0;
    const baseOy = 0;
    e.core.ox = baseOx + Math.cos(e.core.ang) * e.core.orbit;
    e.core.oy = baseOy + Math.sin(e.core.ang) * e.core.orbit * 0.7;
  }
  if (e.drones) {
    for (const d of e.drones) {
      if (d.hp <= 0) continue;
      d.ang += dt * spin;
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
  if (e._coreBall) { // snake core ball: hits land on the head's shared core HP
    const H = coreOwnerOf(e);
    if (!H) return { hit: 'none', killed: false };
    return snakeCoreHit(H, e.x, e.y, bx, by, dmg, fxList, 'ball');
  }
  if (e._coreSeg) return snakeCoreHit(e, e.x, e.y, bx, by, dmg, fxList, 'head'); // snake head = core too (same HP)
  if (!hasCore(e) || !e.core) {
    e.hp -= dmg;
    if (fxList) fxList.push(spawnHitSpark(bx, by));
    return { hit: 'body', killed: e.hp <= 0 };
  }
  const c = e.core;
  const cx = e.x + c.ox, cy = e.y + c.oy;
  // 1) Core
  if (c.hp > 0 && Math.hypot(bx - cx, by - cy) < c.r + CORE_HIT_PAD) {
    if (coreShutState(e) === 2) {
      // Armour closed: blocked (clang), no damage
      e._bodyFlash = 0.1;
      if (fxList) fxList.push(spawnDeflectSpark(bx, by));
      return { hit: 'body', killed: false };
    }
    c.hp -= dmg;
    e._coreFlash = CORE_FLASH_T;
    e._shake = 0.14;
    if (c.hp > 0) {
      if (fxList) fxList.push(spawnHitSpark(bx, by));
      // Escorts close ranks in front of a core under fire (cooldown so it is a moment, not a wall)
      if (e._guardCd <= 0 && c.hp < c.maxHp * 0.75) { e._guardT = 1.6; e._guardCd = 5; }
      return { hit: 'corehit', killed: false };
    }
    c.hp = 0;
    e.hp = 0;
    e._coreBreak = true;
    if (fxList) {
      fxList.push(spawnExplosion(cx, cy, true));
      fxList.push(spawnHitSpark(cx, cy));
      // Guards (pods / claws / drones) are not popped here: markCoreChain turns them into
      // chain debris that blows one after another round the circle.
    }
    return { hit: 'core', killed: true };
  }
  // 2) Drones (swarm only)
  if (e.drones) {
    for (const d of e.drones) {
      if (d.hp <= 0) continue;
      const dx = e.x + Math.cos(d.ang) * d.dist;
      const dy = e.y + Math.sin(d.ang) * d.dist * (d.ky || 1);
      if (Math.hypot(bx - dx, by - dy) < d.r + 4) {
        d.hp -= dmg;
        if (fxList) fxList.push(spawnHitSpark(dx, dy));
        if (d.hp <= 0 && fxList) fxList.push(spawnExplosion(dx, dy, false));
        return { hit: 'drone', killed: false };
      }
    }
  }
  // 3) Body hull (core bosses) — reduced damage + deflect feel.
  //    Eye boss: round flesh, but the core row is open (shots there fly on to the core).
  const eyeHull = e.kind === 'wave_eye_boss'
    && Math.hypot(bx - e.x, by - e.y) < e.w * 0.4 && Math.abs(by - cy) > c.r + CORE_HIT_PAD;
  const triHull = (e.kind === 'wave_core_boss' || e.kind === 'wave_grid_core')
    && Math.abs(bx - e.x) < e.w * 0.45 + 4 && Math.abs(by - e.y) < e.h * 0.45 + 4;
  // The core sits in an open slot in the hull: shots on the core's row, left of the core, fly on
  // to it (never blocked by the hull in front of it)
  const coreLane = Math.abs(by - cy) < c.r + CORE_HIT_PAD && bx < cx + 2;
  if ((eyeHull || triHull) && !coreLane) {
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
  if (e._coreBall) { // snake core ball: only a blast centred on it reaches the core (same rule as other cores)
    if (ox != null && coreOwnerOf(e) && Math.hypot(ox - e.x, oy - e.y) < CORE_R + 18) return applyCoreAwareHit(e, dmg, e.x, e.y, fxList);
    return { hit: 'body', killed: false };
  }
  if (e._coreSeg) { // snake head: a blast centred on it reaches the shared core (same rule as other cores)
    if (ox != null && Math.hypot(ox - e.x, oy - e.y) < CORE_R + 18) return applyCoreAwareHit(e, dmg, e.x, e.y, fxList);
    e._bodyFlash = 0.1; return { hit: 'body', killed: false };
  }
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
        fxList.push(spawnExplosion(e.x + Math.cos(d.ang) * d.dist, e.y + Math.sin(d.ang) * d.dist * (d.ky || 1), false));
      }
    }
  }
  if (isCoreBossKind(e.kind) || e.kind === 'wave_grid_core') {
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
  if (e && e._coreBall) { // snake core ball: the beam row crossing the ball hits the core
    if (coreOwnerOf(e) && Math.abs(e.y - ly) < CORE_R + CORE_HIT_PAD + 1) return applyCoreAwareHit(e, dmg, e.x, e.y, fxList);
    return { hit: 'none', killed: false };
  }
  if (e && e._coreSeg) { // snake head = core (shared HP): the beam row crossing the head hits it
    if (Math.abs(e.y - ly) < CORE_R + CORE_HIT_PAD + 1) return applyCoreAwareHit(e, dmg, e.x, e.y, fxList);
    e._bodyFlash = 0.1;
    if (fxList) fxList.push(spawnDeflectSpark(e.x, ly));
    return { hit: 'body', killed: false };
  }
  const c = coreWorld(e);
  if (c && e.core.hp > 0 && Math.abs(c.y - ly) < c.r + CORE_HIT_PAD + 1) return applyCoreAwareHit(e, dmg, c.x, c.y, fxList);
  if (fxList) fxList.push(spawnDeflectSpark(e.x - e.w * 0.35, ly));
  return applyCoreAwareArea(e, dmg, null, null, fxList);
}

/**
 * Item magnet (same rule on every field: player, COM, online opponent).
 * Pickup box stays ±32 px; an orb within ITEM_MAGNET_R (≈1.9×) of the ship is caught and pulled
 * in with increasing speed until collected. Once caught it stays caught (no drift / no escape).
 */
export const ITEM_PICK_R = 32;
export const ITEM_MAGNET_R = 62;
export function magnetStep(it, sx, sy, dt) {
  const dx = sx - it.x, dy = sy - it.y;
  const d = Math.hypot(dx, dy);
  if (!it._mag && d < ITEM_MAGNET_R) it._mag = 60; // caught: start at 60 px/s
  if (!it._mag) return false;
  it._mag = Math.min(560, it._mag + 900 * dt); // accelerate (≈0.3 s from the edge)
  const step = Math.min(d, it._mag * dt);
  if (d > 1e-6) { it.x += (dx / d) * step; it.y += (dy / d) * step; }
  (it._tr || (it._tr = [])).push([it.x, it.y]);
  if (it._tr.length > 6) it._tr.shift();
  return true;
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

/** Kill explosion (user 10-04b): 2× the old size, 3× the old duration. */
// 10-04d: pixel-art kill blast measured on the video (0:42.9–0:43.7): one blast ≈1.6× the ship
// field there (≈40 px of a 135 px field); game field 341 px (×2.5) → ≈100 px visible (sprite r 70).
export const ECLIPSE_CAP = 24; // concurrent 透明戦隊 explosions per field; the oldest (fading) one makes room
export function spawnEclipse(e) { // 10-05: video explosion frames over the unit, 17 frames at 15 fps = 1.13 s
  return { kind: 'eclipse', x: e.x, y: e.y, r: Math.max(e.w || 60, e.h || 60) / 2, life: 17 / 15, max: 17 / 15, vx: e.vx || 0 };
}
/** Every hit gets its explosion; per unit at most one new one per 0.15 s (rapid volleys), per field ECLIPSE_CAP. */
export function pushEclipse(fx, e, now) {
  if (e._eclAt != null && now - e._eclAt < 0.15 && now >= e._eclAt) return false;
  e._eclAt = now;
  let n = 0, oldest = -1, minLife = 1e9;
  for (let i = 0; i < fx.length; i++) if (fx[i].kind === 'eclipse') { n++; if (fx[i].life < minLife) { minLife = fx[i].life; oldest = i; } }
  if (n >= ECLIPSE_CAP && oldest >= 0) fx.splice(oldest, 1);
  fx.push(spawnEclipse(e));
  return true;
}
export function spawnKillBoom(x, y, big = false) {
  return { kind: 'kboom', x, y, life: big ? 1.24 : 0.79, max: big ? 1.24 : 0.79, // 10-04j: −50% (was 2.48 / 1.58)
    r: big ? 84 : 42 }; // 10-04g: −20% (was 105 / 52.5)
}
/** 10-05b (user): kill boom = 1.1× the enemy's drawn size (sprite = 1.15 × hitbox), no fixed floor.
 *  The pixel blast fills ≈0.8 of its 2r sprite at its widest (visible ≈1.6r) → r = 1.1·size / 1.6.
 *  Very wide hulls: a row of bursts whose combined spread ≈1.1× the hull length. */
const KB_SIZE = 1.1, KB_FILL = 1.6;
export function pushKillBooms(list, e, big = false, large = false) {
  if (large) { pushBigKillBooms(list, e, big); return; }
  const vw = (e.w || 0) * 1.15, vh = (e.h || 0) * 1.15;
  const life = big ? 1.24 : 0.79;
  const one = (x, y, r, dl, sd) => list.push({ kind: 'kboom', x, y, life: life * Math.min(1.6, Math.max(1, r / 70)) + dl, max: life * Math.min(1.6, Math.max(1, r / 70)), r, sd });
  const rOf = (d) => Math.max(8, KB_SIZE * d / KB_FILL);
  const asp = vw > vh ? vw / Math.max(1, vh) : vh / Math.max(1, vw);
  if (asp < 1.8 || Math.max(vw, vh) < 90) { one(e.x, e.y, rOf(Math.max(vw, vh)), 0, null); return; }
  const n = Math.min(4, Math.round(asp)), wide = vw >= vh, L = wide ? vw : vh, s = Math.min(vw, vh);
  const seg = Math.max(s, L / n); // each burst covers its slice of the hull
  one(e.x, e.y, rOf(s), 0, 1);
  for (let i = 0; i < n; i++) {
    const o = ((i + 0.5) / n - 0.5) * KB_SIZE * (L - seg) / Math.max(1, L - L / n), dl = 0.07 * (1 + (i * 2 + 1) % n);
    one(e.x + (wide ? o * L : 0), e.y + (wide ? 0 : o * L), rOf(seg), dl, i + 2);
  }
}

/** Total on-screen time (s) of the pre-10-06 kill boom for e (max life incl. stagger delay). */
export function killBoomTotal(e, big = false) {
  const tmp = []; pushKillBooms(tmp, e, big, false);
  return tmp.reduce((m, f) => Math.max(m, f.life), 0);
}
/** 10-06 (user: デカ敵の爆発のクオリティUP・時間3割短く): big-enemy death = a chain of pixel bursts run along
 *  the hull from one end to the other, measured from the reference videos (user_ref 2:47.0–2:48.75 tall
 *  enemy: 6 bursts top→bottom, ≈0.1 s apart, chain spread ≈35 % of the whole blast, each burst ≈65 %,
 *  the last one the largest; ref2 0:54.7–0:56.3 wide hull: 5 bursts left→right). Each burst plays the
 *  video's white-hot → yellow → gold → brown smoke frames (render.js PXB_*). Total time = 0.7 × the old
 *  kill boom of the same enemy; the combined blast still spans ≈1.1× the drawn hull. */
export const BIG_BOOM_TIME = 0.7, BIG_BOOM_SPAN = 0.35, BIG_BOOM_FILL = 1.6;
export function pushBigKillBooms(list, e, big = false) {
  const T = BIG_BOOM_TIME * killBoomTotal(e, big);
  const vw = (e.w || 0) * 1.15, vh = (e.h || 0) * 1.15;
  const wide = vw >= vh, L = Math.max(1, wide ? vw : vh), s = Math.max(1, wide ? vh : vw);
  const n = Math.max(4, Math.min(7, Math.round(1 + 2 * L / s)));
  const span = BIG_BOOM_SPAN * T, life = T - span;
  const dv = KB_SIZE * s * 0.85, dvl = KB_SIZE * s; // visible burst diameters (last burst = full hull depth)
  const a0 = -KB_SIZE * L / 2 + dv / 2, a1 = KB_SIZE * L / 2 - dvl / 2;
  const seed = ((e.x * 7 + e.y * 13) | 0) & 1023;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1, d = last ? dvl : dv;
    const u = a0 + (a1 - a0) * (i / (n - 1));
    const j = last ? 0 : (((seed + i * 5) % 7) / 6 - 0.5) * (KB_SIZE * s - d); // small zig-zag across the hull
    const dl = span * (i / (n - 1));
    list.push({ kind: 'kboom', big: 1, x: e.x + (wide ? u : j), y: e.y + (wide ? j : u), life: life + dl, max: life, r: d / BIG_BOOM_FILL, sd: seed + i });
  }
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
/**
 * Laser multi-hit (user 10-04b): one beam tick registers up to 10 hits on an enemy,
 * scaled by its hull width (≈1 hit per 18 px). Every hit spawns a small explosion at its
 * point along the hull. Same function for player and COM.
 */
export const LASER_HIT_DMG = 0.5 / 3; // 10-04: laser power 1/3 (was 0.5)
export const LASER_MAX_HITS = 10;
export const FX_SOFT_CAP = 90; // phone guard: past this, laser booms reuse a cheaper life
// User 10-04d: the widest enemy hull (boss tier, 184 px) is the 10-hit reference; others scale by width.
export const LASER_W_MAX = Math.max(...Object.values(ENEMY_TIER_STATS).map((t) => t.w));
export function laserHitCount(e) {
  return Math.max(1, Math.min(LASER_MAX_HITS, Math.floor((LASER_MAX_HITS * (e.w || 20)) / LASER_W_MAX + 1e-6)));
}
export const LASER_BOOM_SCALE = 0.8; // user 10-06: laser pierce boom 20% smaller
export function spawnLaserBoom(x, y, cheap = false) {
  const l = cheap ? 0.12 : 0.24;
  return { x, y, life: l, max: l, r: (27 + Math.random() * 12) * LASER_BOOM_SCALE }; // 10-04: ×3 (was 9–13); 10-06: 2割小さく
}
/** Returns 'core' / 'corehit' / 'body' like applyCoreAwareBeam. */
export function applyLaserTick(e, ly, fxList, shipX) {
  if (e && e._coreBall) { // snake core ball: one core strike per tick (shared core HP), like every core
    const h = applyCoreAwareBeam(e, 1.05 / 3, ly, fxList).hit;
    if (h !== 'none' && fxList) fxList.push(spawnLaserBoom(e.x, ly));
    return h;
  }
  if (hasCore(e)) {
    const h = applyCoreAwareBeam(e, 1.05 / 3, ly, fxList).hit; // core: one strike per tick (core HP is shared); 10-04: 1/3 (was 1.05)
    if (fxList) fxList.push(spawnLaserBoom(Math.max(shipX, e.x - e.w * 0.35), ly));
    return h;
  }
  const n = laserHitCount(e);
  const x0 = Math.max(shipX + 6, e.x - e.w / 2);
  const span = Math.max(1, e.x + e.w / 2 - x0);
  for (let i = 0; i < n; i++) {
    if (e.hp <= 0) break;
    e.hp -= LASER_HIT_DMG;
    if (fxList) fxList.push(spawnLaserBoom(x0 + span * (i + 0.5) / n, ly + (Math.random() - 0.5) * 6, fxList.length > FX_SOFT_CAP));
  }
  return 'body';
}

/** Trim oldest FX down to n, never dropping coins (they carry PT). */
export function trimFx(fx, n) {
  let drop = fx.length - n;
  if (drop <= 0) return;
  const out = [];
  for (const f of fx) { if (drop > 0 && f.kind !== 'coin') { drop--; continue; } out.push(f); }
  fx.length = 0; fx.push(...out);
}

/** Coin drop (user 10-04b): spins (scale-x flip) and is sucked into the destroyer's ship. */
export function spawnCoin(x, y, gold) {
  const a = Math.random() * Math.PI * 2, sp = 50 + Math.random() * 60; // 10-04i: pop-out speed restored
  return { kind: 'coin', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 6, max: 6, r: gold ? 37 : 22, g: gold ? 1 : 0, ph: Math.random() * 6, age: 0 }; // 10-04d: video ratio (small ≈18 px, big ≈30 px of a 135 px field, ×2.5)
}
export const COIN_SILVER_PT = 1;
export const COIN_GOLD_PT = 30; // user 10-04c: gold 3→30
/** Move coins toward (sx,sy); returns PT collected this frame (silver 1, gold 30). */
export function tickCoins(fxList, sx, sy, dt) {
  let pt = 0;
  for (const c of fxList) {
    if (c.kind !== 'coin' || c.life <= 0) continue;
    c.age += dt; c.ph += dt * 9;
    const dx = sx - c.x, dy = sy - c.y, d = Math.hypot(dx, dy) || 1;
    const pull = (c.age < 0.23 && d > 90) ? 0 : Math.min(1140, 165 + c.age * 1300 + (d < 90 ? 450 : 0)); // 10-04i: base restored, 10-04h acceleration kept // 10-04d: within 90 px it is caught at once
    c.vx = c.vx * Math.exp(-4 * dt) + (dx / d) * pull * dt * 6;
    c.vy = c.vy * Math.exp(-4 * dt) + (dy / d) * pull * dt * 6;
    const v = Math.hypot(c.vx, c.vy), vmax = 165 + c.age * 1100;
    if (v > vmax) { c.vx *= vmax / v; c.vy *= vmax / v; }
    c.x += c.vx * dt; c.y += c.vy * dt;
    c.life = Math.max(c.life, 1); // never expire before it reaches the ship
    // 10-04d: pickup radius 10+0.6r → 18+0.9r
    if (Math.hypot(sx - c.x, sy - c.y) < 18 + c.r * 0.9 || c.age > 5) { c.life = 0; pt += c.g ? COIN_GOLD_PT : COIN_SILVER_PT; }
  }
  return pt;
}

export function spawnHitSpark(x, y, r = 24) {
  return {
    kind: 'hit',
    x, y,
    life: 0.18,
    max: 0.18,
    r, // 10-04: shot-hit-on-enemy halved 48 → 24
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
    enemies: state.enemies.filter(e => e.kind !== 'wave_bubble' || e.x - (e.w || 0) / 2 < (state._fw || 1e9)).slice(0, 40).map(e => ({
      x: e.x, y: e.y, w: e.w, h: e.h, kind: e.kind, hp: e.hp, c: e.color, s: !!e.sent,
      at2: (e._chainOf || e._lead) ? 1 : undefined, ch: e.core && !e._coreSeg ? e.core.hp : (e._coreBall && e._chainOf && e._chainOf.core ? e._chainOf.core.hp : undefined), cm: e.core && !e._coreSeg ? e.core.maxHp : (e._coreBall && e._chainOf && e._chainOf.core ? e._chainOf.core.maxHp : undefined), cb: e._coreBall ? 1 : undefined, cf: (e._coreBall ? (e._chainOf && e._chainOf._coreFlash) : e._coreFlash) > 0 ? 1 : undefined, bf: e._coreSeg && e._bodyFlash > 0 ? 1 : undefined, cs: e._sh ? e._sh.st : undefined, sk: e._shake > 0 ? 1 : undefined,
      dr: e.drones ? e.drones.map(d => d.hp) : undefined,
      sp: e.spr || undefined, ro: e.rot || undefined, tn: e.tone || undefined,
      pA: e._chainOf && e._chainOf._portalA != null && e._chainOf._portalA < 1 ? +e._chainOf._portalA.toFixed(2) : undefined, // snake portal fade-in
      pO: e._chainOf && e._chainOf._portalOut != null && e._chainOf._portalOut < 1 ? +e._chainOf._portalOut.toFixed(2) : undefined, // snake portal fade-out
      u: e.kind === 'wave_bubble' ? e._uid : undefined,
      at: e.appearT > 0 ? +e.appearT.toFixed(3) : undefined,
      wt: e.warpT > 0 ? +e.warpT.toFixed(2) : undefined,
      wp: e.warpPop > 0 ? +e.warpPop.toFixed(2) : undefined,
      lt: e.laserTeleT > 0 ? +e.laserTeleT.toFixed(3) : undefined,
      lm: e.laserTeleT > 0 ? +(e.laserTeleMax || 0.6).toFixed(3) : undefined,
      ax: e.laserTeleT > 0 && e.laserAimX != null ? +e.laserAimX.toFixed(1) : undefined,
      ay: e.laserTeleT > 0 && e.laserAimY != null ? +e.laserAimY.toFixed(1) : undefined,
      lo: e.laserTeleT > 0 && e.laserTeleOffs ? e.laserTeleOffs : undefined,
      // sent-unit personality tell (js/sentai.js) — kind, progress, target, rows / columns, cloak alpha, shield, angle, heal glow
      zk: e.zk, zu: e.zu != null ? +e.zu.toFixed(2) : undefined, zx: e.zx != null ? Math.round(e.zx) : undefined, zy: e.zy != null ? Math.round(e.zy) : undefined,
      zc: e.zc, za: e.za != null ? +e.za.toFixed(2) : undefined, zs: e.zs != null ? +e.zs.toFixed(2) : undefined, zg: e.zg != null ? +e.zg.toFixed(2) : undefined,
      hx: e._healFx > 0 ? 1 : undefined,
    })),
    bullets: state.bullets.filter(b => b.owner === 'player' || b.owner === 'enemy').slice(0, 60).map(b => ({
      x: b.x, y: b.y, o: b.owner, h: !!b.homing, vx: b.vx, vy: b.vy,
      L: b.laser ? 1 : undefined,
      D: b.dir ? 1 : undefined,
      k: b.k || undefined,
      r: b.r > 3.5 ? b.r : undefined,
      g: b.tgx != null && b.st > 0 ? [Math.round(b.tgx), Math.round(b.tgy), +(1 - b.st / (b.tg0 || 1)).toFixed(2)] : undefined, // bomb target marker
      bl: b.k === 'mini' && !b.go && b.mt >= b.mh ? 1 : undefined, // mini drone blinking (about to dart)
    })),
    fx: state.fx.filter((f) => f.kind !== 'coin').slice(0, 12).concat(state.fx.filter((f) => f.kind === 'coin').slice(0, 10)).map(f => ({ x: f.x, y: f.y, l: f.life, m: f.max, r: f.r, k: f.kind, t: f.t, a: f.a, g: f.g, ph: f.ph, sd: f.sd, big: f.big })),
    ff: state.ff ? { n: state.ff.n, k: state.ff.k } : undefined,
    scroll: state.scroll,
    status: state.statusText,
    alive: state.alive,
  };
}
