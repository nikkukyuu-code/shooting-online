/** Game entities: player, enemies, bullets, items, effects */

export const POWERUPS = [
  { id: 'homing',  label: '追尾ミサイル' },
  { id: 'laser',   label: 'レーザー' },
  { id: 'send',    label: '対戦相手へ敵キャラを送信' },
  { id: 'direct',  label: '対戦相手を直接攻撃' },
];

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
    basic:  { w: 24, h: 20, hp: 8, speed: 100 + Math.random() * 50, score: 10, color: '#c44' },
    elite:  { w: 34, h: 28, hp: 18, speed: 75 + Math.random() * 35, score: 30, color: '#a28' },
    swarm:  { w: 16, h: 14, hp: 3, speed: 150 + Math.random() * 55, score: 5,  color: '#e85' },
    boss:   { w: 80, h: 64, hp: 120, speed: 34, score: 200, color: '#888' },
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
  const p = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
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
