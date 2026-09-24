/** Game entities: player, enemies, bullets, items, effects */

export const POWERUPS = [
  { id: 'homing',     label: '追尾ミサイル',  effect: '敵を追う弾を連射',           color: '#ff66ff', icon: '◆' },
  { id: 'laser',      label: 'レーザー',      effect: '小刻みレーザーで前方攻撃',   color: '#66ccff', icon: '═' },
  { id: 'spread',     label: 'ショットガン',  effect: '扇状の弾幕を一斉射撃',       color: '#ffaa33', icon: '※※' },
  { id: 'bomb',       label: 'ボム',          effect: '画面内の敵をまとめて攻撃',   color: '#ff5522', icon: '◎' },
  { id: 'shock',      label: '電撃',          effect: '近くの敵をまとめて感電',     color: '#88ddff', icon: '⚡' },
  { id: 'rapid',      label: '連射強化',      effect: '一定時間すばやく強弾を連射', color: '#ffee44', icon: '≫' },
  { id: 'meteor',     label: '隕石送信',      effect: '相手に隕石攻撃を落とす',     color: '#ff7744', icon: '☄' },
  { id: 'send',       label: '敵キャラ送信',  effect: '相手に敵を送る',             color: '#ff8844', icon: '⇒' },
  { id: 'direct',     label: '直接攻撃',      effect: '小刻み上向きレーザーで相手を直撃', color: '#ff3333', icon: '※' },
  { id: 'heal',       label: 'HP回復',        effect: '自分のHPを+25',              color: '#44ff88', icon: '+' },
  { id: 'heal_big',   label: '大回復',        effect: '自分のHPを+50',              color: '#22ff66', icon: '++' },
  { id: 'send_mech',  label: '戦艦送信',      effect: '相手に宇宙戦艦を送る',       color: '#88aaff', icon: '艦' },
  { id: 'send_golem', label: '要塞送信',      effect: '相手に軌道要塞を送る',       color: '#cc88ff', icon: '塞' },
  { id: 'send_tank',  label: 'ガンシップ送信', effect: '相手に重ガンシップを送る',   color: '#66ddff', icon: '砲' },
  { id: 'send_drone', label: '無人機群送信',  effect: '相手に宇宙ドローンを4機送る', color: '#33ffff', icon: '群' },
];

export function powerupMeta(id) {
  return POWERUPS.find((p) => p.id === id) || POWERUPS[0];
}


export function pickPowerupId() {
  const weighted = [
    ['homing', 2], ['laser', 2], ['spread', 3], ['bomb', 2], ['shock', 3], ['rapid', 3],
    ['meteor', 2], ['send', 2], ['direct', 1],
    ['heal', 2], ['heal_big', 1],
    ['send_mech', 2], ['send_golem', 2], ['send_tank', 2], ['send_drone', 2],
  ];
  let r = Math.random() * weighted.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of weighted) { r -= w; if (r <= 0) return id; }
  return 'homing';
}

export function createPlayer(side = 'self') {
  return {
    side,
    x: 48,
    y: 0.5, // normalized within own field (0..1)
    w: 34,
    h: 22,
    hp: 100,
    maxHp: 100,
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

export function spawnEnemy(fieldW, fieldH, kind = 'basic') {
  const types = {
    // Visual + hitbox sizes ×2 (drawEnemy uses e.w/e.h; player ship unchanged)
    basic:  { w: 68,  h: 56,  hp: 4,  speed: 100 + Math.random() * 50, score: 10,  color: '#9aa0a8' },
    elite:  { w: 92,  h: 76,  hp: 10, speed: 75 + Math.random() * 35,  score: 30,  color: '#f2f2f6' },
    swarm:  { w: 52,  h: 40,  hp: 2,  speed: 150 + Math.random() * 55, score: 5,   color: '#ff2a3a' },
    boss:   { w: 184, h: 116, hp: 70, speed: 34, score: 200, color: '#b0b4bc' },
    mech:   { w: 176, h: 96,  hp: 28, speed: 42, score: 80,  color: '#f4f4f8' },
    golem:  { w: 168, h: 140, hp: 36, speed: 28, score: 100, color: '#3cbc48' },
    tank:   { w: 180, h: 88,  hp: 40, speed: 32, score: 110, color: '#e02028' },
    drone:  { w: 56,  h: 44,  hp: 5,  speed: 130 + Math.random() * 40, score: 20, color: '#ffd428' },
  };
  const t = types[kind] || types.basic;
  return {
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
}

export function spawnBullet(x, y, vx, vy, owner = 'player', homing = false, dmg = 1, opts = {}) {
  const laser = !!opts.laser;
  const b = {
    x, y, vx, vy,
    r: laser ? 2.5 : (homing ? 4 : 3),
    owner, homing, dmg,
    life: opts.life != null ? opts.life : (laser ? 2.2 : 3),
    laser,
  };
  // Limited-homing: steer only while homeT > 0, then fly straight
  if (homing && opts.homeT != null) {
    b.homeT = opts.homeT;
    b.homeMax = opts.homeMax != null ? opts.homeMax : opts.homeT;
  }
  return b;
}

export function spawnItem(x, y) {
  const id = pickPowerupId();
  const p = POWERUPS.find((x) => x.id === id) || POWERUPS[0];
  return { x, y, w: 18, h: 18, id: p.id, label: p.label, vy: 20, life: 8 };
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
      at: e.appearT > 0 ? +e.appearT.toFixed(3) : undefined,
    })),
    bullets: state.bullets.filter(b => b.owner === 'player' || b.owner === 'enemy').slice(0, 60).map(b => ({
      x: b.x, y: b.y, o: b.owner, h: !!b.homing, vx: b.vx, vy: b.vy,
      L: b.laser ? 1 : undefined,
    })),
    fx: state.fx.slice(0, 12).map(f => ({ x: f.x, y: f.y, l: f.life, m: f.max, r: f.r })),
    scroll: state.scroll,
    status: state.statusText,
    alive: state.alive,
  };
}
