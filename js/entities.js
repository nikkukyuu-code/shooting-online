/** Game entities: player, enemies, bullets, items, effects */

export const POWERUPS = [
  { id: 'homing',     label: '追尾ミサイル',  effect: '敵を追う弾を連射',           color: '#ff66ff', icon: '◆' },
  { id: 'laser',      label: 'レーザー',      effect: '太いレーザーで前方攻撃',     color: '#66ccff', icon: '═' },
  { id: 'send',       label: '敵キャラ送信',  effect: '相手に敵を送る',             color: '#ff8844', icon: '⇒' },
  { id: 'direct',     label: '直接攻撃',      effect: '相手のHPを直接削る',         color: '#ff3333', icon: '※' },
  { id: 'heal',       label: 'HP回復',        effect: '自分のHPを+25',              color: '#44ff88', icon: '+' },
  { id: 'heal_big',   label: '大回復',        effect: '自分のHPを+50',              color: '#22ff66', icon: '++' },
  { id: 'send_mech',  label: '巨大メカ送信',  effect: '相手に巨大メカを送る',       color: '#55ff99', icon: '機' },
  { id: 'send_golem', label: 'ゴーレム送信',  effect: '相手に硬いゴーレムを送る',   color: '#ffbb55', icon: '岩' },
  { id: 'send_tank',  label: '戦車ロボ送信',  effect: '相手に重戦車ロボを送る',     color: '#66aaff', icon: '戦' },
  { id: 'send_drone', label: 'ドローン群送信', effect: '相手にドローンを4体送る',   color: '#33ffff', icon: '群' },
];

export function powerupMeta(id) {
  return POWERUPS.find((p) => p.id === id) || POWERUPS[0];
}


export function pickPowerupId() {
  const weighted = [
    ['homing', 2], ['laser', 2], ['send', 2], ['direct', 2],
    ['heal', 4], ['heal_big', 2],
    ['send_mech', 3], ['send_golem', 3], ['send_tank', 3], ['send_drone', 3],
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
    w: 28,
    h: 18,
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

export function spawnEnemy(fieldW, fieldH, kind = 'basic') {
  const types = {
    basic:  { w: 30, h: 26, hp: 8,  speed: 100 + Math.random() * 50, score: 10,  color: '#ff3b3b' },
    elite:  { w: 40, h: 34, hp: 18, speed: 75 + Math.random() * 35,  score: 30,  color: '#ff66ee' },
    swarm:  { w: 22, h: 18, hp: 3,  speed: 150 + Math.random() * 55, score: 5,   color: '#ffaa33' },
    boss:   { w: 80, h: 64, hp: 120, speed: 34, score: 200, color: '#dde2ea' },
    mech:   { w: 72, h: 60, hp: 55, speed: 42, score: 80,  color: '#55ff99' },
    golem:  { w: 78, h: 70, hp: 70, speed: 28, score: 100, color: '#ffbb55' },
    tank:   { w: 86, h: 52, hp: 85, speed: 32, score: 110, color: '#66ccff' },
    drone:  { w: 28, h: 22, hp: 10, speed: 130 + Math.random() * 40, score: 20, color: '#33ffff' },
  };
  const t = types[kind] || types.basic;
  return {
    kind,
    x: fieldW + 20 + Math.random() * 40,
    y: 30 + Math.random() * Math.max(40, fieldH - 60),
    w: t.w, h: t.h,
    hp: t.hp, maxHp: t.hp,
    speed: t.speed,
    score: t.score,
    color: t.color,
    phase: Math.random() * Math.PI * 2,
    fireCd: 1.2 + Math.random() * 0.8,
    sent: false, // was sent by opponent
  };
}

export function spawnBullet(x, y, vx, vy, owner = 'player', homing = false, dmg = 1) {
  return { x, y, vx, vy, r: homing ? 4 : 3, owner, homing, dmg, life: 3 };
}

export function spawnItem(x, y) {
  const id = pickPowerupId();
  const p = POWERUPS.find((x) => x.id === id) || POWERUPS[0];
  return { x, y, w: 18, h: 18, id: p.id, label: p.label, vy: 20, life: 8 };
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
    })),
    bullets: state.bullets.filter(b => b.owner === 'player' || b.owner === 'enemy').slice(0, 60).map(b => ({
      x: b.x, y: b.y, o: b.owner, h: !!b.homing,
    })),
    fx: state.fx.slice(0, 12).map(f => ({ x: f.x, y: f.y, l: f.life, m: f.max, r: f.r })),
    scroll: state.scroll,
    status: state.statusText,
    alive: state.alive,
  };
}
