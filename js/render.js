/** Canvas rendering for 4-pane portrait shmup
 *  TOP opp / MIDDLE own / BOTTOM-ish ctrl (操作) / BOTTOM info — info 20%, remaining 80% split equally
 */
import { EX_ITEM_STYLE, drawExFx } from './attack_items.js?v=1.5.83';

export const INFO_RATIO = 0.2;
export const OPP_RATIO = 0.8 / 3;
export const OWN_RATIO = 0.8 / 3;
const ITEM_STYLE = {
  homing:     { color: '#ff66ff', icon: '◆',  label: '追尾',   effect: '追尾弾を連射' },
  laser:      { color: '#66ccff', icon: '═',  label: 'レーザー', effect: '小刻み前方レーザー' },
  spread:     { color: '#ffaa33', icon: '※※', label: '散弾',   effect: '扇状弾幕' },
  bomb:       { color: '#ff5522', icon: '◎',  label: 'ボム',   effect: '画面全体攻撃' },
  shock:      { color: '#88ddff', icon: '⚡',  label: '電撃',   effect: '広範囲感電' },
  rapid:      { color: '#ffee44', icon: '≫',  label: '連射',   effect: '連射強化' },
  meteor:     { color: '#ff7744', icon: '☄',  label: '隕石',   effect: '相手に隕石' },
  send:       { color: '#ff8844', icon: '⇒',  label: '敵送信', effect: '相手に敵を送る' },
  direct:     { color: '#ff3333', icon: '※',  label: '直撃',   effect: '上向き連射レーザー' },
  heal:       { color: '#44ff88', icon: '+',  label: '回復',   effect: 'HP+25' },
  heal_big:   { color: '#22ff66', icon: '++', label: '大回復', effect: 'HP+50' },
  send_mech:  { color: '#88aaff', icon: '艦',  label: '戦艦',   effect: '戦艦を送る' },
  send_golem: { color: '#cc88ff', icon: '塞',  label: '要塞',   effect: '要塞を送る' },
  send_tank:  { color: '#66ddff', icon: '砲',  label: '砲艦',   effect: 'ガンシップ送信' },
  send_drone: { color: '#33ffff', icon: '群',  label: '無人機', effect: 'ドローン4機' },
};
Object.assign(ITEM_STYLE, EX_ITEM_STYLE); // v1.5.67 extra attack items

export const MAX_ITEM_SLOTS = 3;


export const CTRL_RATIO = 0.8 / 3;

export function layout(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const oppH = Math.floor(H * OPP_RATIO);
  const ownH = Math.floor(H * OWN_RATIO);
  const ctrlH = Math.floor(H * CTRL_RATIO);
  const infoH = H - oppH - ownH - ctrlH; // remainder absorbs rounding
  return {
    W, H, oppH, ownH, ctrlH, infoH,
    opp:  { x: 0, y: 0,                     w: W, h: oppH },
    own:  { x: 0, y: oppH,                  w: W, h: ownH },
    ctrl: { x: 0, y: oppH + ownH,           w: W, h: ctrlH },
    info: { x: 0, y: oppH + ownH + ctrlH,   w: W, h: infoH },
  };
}

export function resizeCanvas(canvas) {
  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = Math.max(280, Math.floor(rect.width));
  const cssH = Math.max(420, Math.floor(rect.height));
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  return layout(canvas);
}

/** Hit zone for 「アイテム」 button inside control pane (canvas pixels). */
/** Vertical item slots on the right of the control pane (max 3). */
export function itemSlotRects(ctrl, count = MAX_ITEM_SLOTS) {
  const n = Math.max(1, count | 0);
  const padX = Math.max(8, ctrl.w * 0.02);
  const padTop = Math.max(20, ctrl.h * 0.08); // room for 「アイテム 最大3」 header
  const padBot = Math.max(8, ctrl.h * 0.04); // status moved to info pane
  const gap = Math.max(6, ctrl.h * 0.02);
  const colW = Math.max(100, Math.min(168, ctrl.w * 0.38));
  const availH = ctrl.h - padTop - padBot - gap * (n - 1);
  const slotH = Math.max(52, availH / n);
  const x = ctrl.x + ctrl.w - colW - padX;
  const rects = [];
  for (let i = 0; i < n; i++) {
    const y = ctrl.y + padTop + i * (slotH + gap);
    // button body ~68% of slot, description under it
    const btnH = Math.max(32, slotH * 0.52);
    rects.push({
      x, y, w: colW, h: slotH,
      btnX: x, btnY: y, btnW: colW, btnH,
      descY: y + btnH + 2,
    });
  }
  return rects;
}

/** Hit-test a canvas point against vertical item slots. Returns index or -1. */
export function hitItemSlot(ctrl, canvasX, canvasY, filledCount = MAX_ITEM_SLOTS) {
  const rects = itemSlotRects(ctrl, MAX_ITEM_SLOTS);
  const n = Math.min(filledCount, rects.length);
  for (let i = 0; i < n; i++) {
    const r = rects[i];
    // Whole slot is tappable (button + description), slots are non-overlapping
    if (
      canvasX >= r.x && canvasX <= r.x + r.w &&
      canvasY >= r.y && canvasY <= r.y + r.h
    ) return i;
  }
  return -1;
}

/** @deprecated — use itemSlotRects / hitItemSlot */
export function itemButtonRect(ctrl) {
  const r = itemSlotRects(ctrl, 1)[0];
  return { x: r.btnX, y: r.btnY, w: r.btnW, h: r.btnH };
}

/** Fiery orange/red nebula (play / opponent views). */
function nebula(ctx, w, h, scroll, seed = 0) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2a0c08');
  g.addColorStop(0.35, '#6a220e');
  g.addColorStop(0.65, '#c44518');
  g.addColorStop(1, '#3a100a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 18; i++) {
    const n = (i * 97 + seed * 13) % 200;
    const x = ((n * 17 + scroll * (0.15 + (i % 5) * 0.04)) % (w + 80)) - 40;
    const y = ((n * 31) % (h - 20)) + 10;
    const r = 30 + (n % 50);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, i % 2 ? 'rgba(255,160,40,0.55)' : 'rgba(255,80,20,0.4)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // stars
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#ffe8c8';
  for (let i = 0; i < 40; i++) {
    const n = (i * 53 + seed) % 300;
    const x = ((n * 23 + scroll * 0.5) % (w + 10));
    const y = (n * 41) % h;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.restore();
}

/** Cooler purple/blue nebula for the control surface (操作画面). */
function ctrlNebula(ctx, w, h, scroll, seed = 3) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#1a1030');
  g.addColorStop(0.35, '#2a1a55');
  g.addColorStop(0.65, '#3a2a78');
  g.addColorStop(1, '#121828');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.4;
  for (let i = 0; i < 16; i++) {
    const n = (i * 89 + seed * 17) % 200;
    const x = ((n * 19 + scroll * (0.1 + (i % 4) * 0.03)) % (w + 80)) - 40;
    const y = ((n * 29) % (h - 16)) + 8;
    const r = 28 + (n % 45);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, i % 2 ? 'rgba(140,120,255,0.5)' : 'rgba(60,140,220,0.4)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#d8e0ff';
  for (let i = 0; i < 28; i++) {
    const n = (i * 47 + seed * 3) % 300;
    const x = ((n * 21 + scroll * 0.35) % (w + 10));
    const y = (n * 37) % h;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.restore();
}


function roundRectPath(ctx, x, y, w, h, rad) {
  const rr = Math.min(rad, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawShip(ctx, x, y, w, h, color = '#e8f0ff', facing = 1, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle || 0);
  if (facing < 0) ctx.scale(-1, 1);
  const t = performance.now() / 1000;

  // Engine plume (animated)
  const plume = 0.75 + 0.35 * Math.sin(t * 18);
  const eg = ctx.createRadialGradient(-w * 0.55, 0, 0, -w * 0.7, 0, w * 0.55);
  eg.addColorStop(0, 'rgba(255,255,220,0.95)');
  eg.addColorStop(0.35, 'rgba(255,160,40,0.85)');
  eg.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.moveTo(-w * 0.4, -h * 0.22);
  ctx.lineTo(-w * (0.55 + 0.35 * plume), 0);
  ctx.lineTo(-w * 0.4, h * 0.22);
  ctx.closePath();
  ctx.fill();

  // Soft shadow under ship
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.55, w * 0.35, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wing / body gradient
  const body = ctx.createLinearGradient(-w * 0.5, -h, w * 0.55, h);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.25, color);
  body.addColorStop(0.7, '#9eb6d8');
  body.addColorStop(1, '#4a6288');
  ctx.fillStyle = body;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.58, 0);
  ctx.quadraticCurveTo(w * 0.2, -h * 0.15, -w * 0.15, -h * 0.62);
  ctx.lineTo(-w * 0.48, -h * 0.28);
  ctx.lineTo(-w * 0.22, 0);
  ctx.lineTo(-w * 0.48, h * 0.28);
  ctx.lineTo(-w * 0.15, h * 0.62);
  ctx.quadraticCurveTo(w * 0.2, h * 0.15, w * 0.58, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Armor plate lines
  ctx.strokeStyle = 'rgba(30,50,80,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.15, -h * 0.12);
  ctx.lineTo(-w * 0.25, -h * 0.35);
  ctx.moveTo(w * 0.15, h * 0.12);
  ctx.lineTo(-w * 0.25, h * 0.35);
  ctx.stroke();

  // Cockpit glass
  const glass = ctx.createLinearGradient(0, -h * 0.2, w * 0.25, h * 0.2);
  glass.addColorStop(0, '#dff6ff');
  glass.addColorStop(0.45, '#3ec8ff');
  glass.addColorStop(1, '#0a4a88');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.ellipse(w * 0.12, 0, w * 0.2, h * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.stroke();
  // Specular
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(w * 0.08, -h * 0.1, w * 0.07, h * 0.1, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Nose tip glow
  ctx.fillStyle = '#ff6688';
  ctx.beginPath();
  ctx.arc(w * 0.5, 0, Math.max(2, w * 0.05), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHpPip(ctx, e) {
  const pct = Math.max(0, e.hp / (e.maxHp || e.hp || 1));
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(-e.w * 0.45, -e.h * 0.78, e.w * 0.9, 6);
  ctx.fillStyle = pct < 0.35 ? '#ff4444' : '#33ee66';
  ctx.fillRect(-e.w * 0.45, -e.h * 0.78, e.w * 0.9 * pct, 6);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(-e.w * 0.45, -e.h * 0.78, e.w * 0.9, 6);
}

/** User-art enemy sprites: static frame 0 only (assets/enemies/<kind>/0.png).
 * Sourced from tools/source_enemy_sheet.png via tools/extract_user_enemy_sprites.py.
 * No frame cycling / no ゆらゆら sway — single static pose per kind. */
/** All drawable enemy kind ids (classic 8 + shop catalog). Extended at runtime via registerEnemyKinds. */
let ENEMY_KINDS = ['basic', 'drone', 'elite', 'mech', 'tank', 'golem', 'swarm', 'boss'];
const ENEMY_STATIC_FRAME = 0;
/** @type {Record<string, HTMLImageElement[]>} */
const enemySprites = Object.create(null);
let enemySpritesReady = false;
let enemySpritesLoading = false;

function enemyAssetUrl(kind, frame) {
  // Relative to page (GitHub Pages root of this repo); ?v= busts CDN/browser cache
  return `assets/enemies/${kind}/${frame}.png?v=1.5.83`;
}

function loadKindSprite(kind) {
  if (enemySprites[kind] && enemySprites[kind][ENEMY_STATIC_FRAME]) return;
  enemySprites[kind] = [];
  const img = new Image();
  img.decoding = 'async';
  img.src = enemyAssetUrl(kind, ENEMY_STATIC_FRAME);
  enemySprites[kind][ENEMY_STATIC_FRAME] = img;
}

export function preloadEnemySprites() {
  if (enemySpritesLoading) return;
  enemySpritesLoading = true;
  for (const kind of ENEMY_KINDS) loadKindSprite(kind);
  enemySpritesReady = true;
  enemySpritesLoading = false;
}

export function registerEnemyKinds(ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  const set = new Set(ENEMY_KINDS);
  for (const id of ids) {
    // Wave ambient kinds use procedural draw — never load catalog sprites for them
    if (!id || String(id).startsWith('wave_')) continue;
    set.add(id);
  }
  ENEMY_KINDS = [...set];
  for (const id of ids) {
    if (!id || String(id).startsWith('wave_')) continue;
    loadKindSprite(id);
  }
}

// Kick off load as soon as this module evaluates
preloadEnemySprites();

function drawEnemySprite(ctx, e, kind) {
  const frames = enemySprites[kind];
  if (!frames) return false;
  const img = frames[ENEMY_STATIC_FRAME];
  if (!img || !img.complete || !img.naturalWidth) return false;
  const sent = !!e.sent;
  const w = e.w, h = e.h;
  // Draw slightly larger than hitbox for readable silhouette; hitbox unchanged
  const dw = w * 1.15;
  const dh = h * 1.15;
  ctx.save();
  if (sent) {
    // Cyan shift for opponent-sent units (matches prior sent palette)
    ctx.filter = 'hue-rotate(160deg) saturate(1.25) brightness(1.05)';
  }
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.filter = 'none';
  ctx.restore();
  return true;
}

/** True for ambient wave-only kinds (no catalog sprite). */
function isWaveKindId(kind) {
  return typeof kind === 'string' && kind.startsWith('wave_');
}

/**
 * Procedural space-enemy silhouettes for wave-only ambient spawns.
 * Nose points left (toward the player). Distinct from catalog sprite art.
 */
function drawWaveEnemy(ctx, e, kind, sent, w, h, t, pulse) {
  const tier = (kind || '').replace(/^wave_/, '') || 'basic';
  const hull = sent ? '#4ec8e0' : ({
    swarm: '#e84858',
    basic: '#a8b0bc',
    elite: '#d8dce8',
    boss: '#c0c4cc',
  }[tier] || '#a8b0bc');
  const accent = sent ? '#b8f0ff' : ({
    swarm: '#ff8890',
    basic: '#6a7380',
    elite: '#8890a0',
    boss: '#ff5533',
  }[tier] || '#6a7380');
  const thruster = 0.55 + 0.45 * pulse;

  // No under-glow / rim ellipse — ship silhouette only (v1.5.61: removed ring look)
  ctx.save();
  if (tier === 'swarm') {
    // Tiny dart
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(-w * 0.48, 0);
    ctx.lineTo(w * 0.38, -h * 0.38);
    ctx.lineTo(w * 0.22, 0);
    ctx.lineTo(w * 0.38, h * 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(w * 0.18, -h * 0.08, w * 0.22 * thruster, h * 0.16);
  } else if (tier === 'elite') {
    // Twin-wing fighter
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(w * 0.05, -h * 0.52);
    ctx.lineTo(w * 0.42, -h * 0.18);
    ctx.lineTo(-w * 0.05, -h * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.05, h * 0.52);
    ctx.lineTo(w * 0.42, h * 0.18);
    ctx.lineTo(-w * 0.05, h * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(-w * 0.48, 0);
    ctx.lineTo(w * 0.12, -h * 0.28);
    ctx.lineTo(w * 0.48, -h * 0.1);
    ctx.lineTo(w * 0.48, h * 0.1);
    ctx.lineTo(w * 0.12, h * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = sent ? '#e8ffff' : '#2a3340';
    ctx.beginPath();
    ctx.ellipse(-w * 0.12, 0, w * 0.14, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sent ? '#88e8ff' : '#ff6644';
    ctx.globalAlpha = 0.7 + 0.3 * thruster;
    ctx.fillRect(w * 0.38, -h * 0.12, w * 0.14 * thruster, h * 0.08);
    ctx.fillRect(w * 0.38, h * 0.04, w * 0.14 * thruster, h * 0.08);
    ctx.globalAlpha = 1;
  } else if (tier === 'boss') {
    // Capital hull
    ctx.fillStyle = accent;
    ctx.fillRect(-w * 0.1, -h * 0.48, w * 0.55, h * 0.18);
    ctx.fillRect(-w * 0.1, h * 0.3, w * 0.55, h * 0.18);
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.lineTo(-w * 0.15, -h * 0.38);
    ctx.lineTo(w * 0.45, -h * 0.22);
    ctx.lineTo(w * 0.5, 0);
    ctx.lineTo(w * 0.45, h * 0.22);
    ctx.lineTo(-w * 0.15, h * 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = sent ? '#c8f8ff' : '#3a4050';
    ctx.fillRect(-w * 0.28, -h * 0.14, w * 0.35, h * 0.28);
    ctx.strokeStyle = sent ? '#88e0ff' : '#ff4422';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w * 0.28, -h * 0.14, w * 0.35, h * 0.28);
    ctx.fillStyle = sent ? '#66d8ff' : '#ff5533';
    ctx.globalAlpha = 0.65 + 0.35 * thruster;
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(w * 0.42, i * h * 0.16 - h * 0.05, w * 0.12 * thruster, h * 0.1);
    }
    ctx.globalAlpha = 1;
  } else {
    // basic: compact wedge fighter
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.48);
    ctx.lineTo(w * 0.35, -h * 0.08);
    ctx.lineTo(-w * 0.1, -h * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, h * 0.48);
    ctx.lineTo(w * 0.35, h * 0.08);
    ctx.lineTo(-w * 0.1, h * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(-w * 0.48, 0);
    ctx.lineTo(w * 0.2, -h * 0.32);
    ctx.lineTo(w * 0.42, 0);
    ctx.lineTo(w * 0.2, h * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = sent ? '#e0ffff' : '#1e2430';
    ctx.beginPath();
    ctx.ellipse(-w * 0.08, 0, w * 0.12, h * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sent ? '#88e8ff' : '#ff6644';
    ctx.globalAlpha = 0.7 + 0.3 * thruster;
    ctx.fillRect(w * 0.32, -h * 0.08, w * 0.16 * thruster, h * 0.16);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/** Simple placeholder if a catalog sprite fails to load — not the primary look. */
function drawEnemyFallback(ctx, e, kind, sent, w, h, t, pulse) {
  if (isWaveKindId(kind)) {
    drawWaveEnemy(ctx, e, kind, sent, w, h, t, pulse);
    return;
  }
  const body = sent ? 'rgba(80,200,220,0.85)' : 'rgba(200,60,70,0.85)';
  const rim = sent ? 'rgba(180,240,255,0.95)' : 'rgba(255,200,200,0.9)';
  ctx.save();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.48, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = rim;
  ctx.font = `bold ${Math.max(8, Math.floor(h * 0.35))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((kind || '?')[0].toUpperCase(), 0, 0);
  ctx.restore();
}

/** Warning aim-beam + muzzle charge for large sent laser telegraph. */
function drawLaserTelegraph(ctx, e, t) {
  const teleT = e.laserTeleT || 0;
  if (teleT <= 0) return;
  const teleMax = e.laserTeleMax || 0.55;
  const u = 1 - Math.max(0, Math.min(1, teleT / teleMax)); // 0→1 as charge fills
  const w = e.w || 40;
  const h = e.h || 30;
  // Muzzle on the left (shots fly toward player)
  const mx = -w * 0.42;
  const my = 0;
  // Fixed horizontal warning beam leftward — never aim at player Y.
  const ang = Math.PI; // straight left
  const beamLen = Math.max(220, (e.laserAimX != null ? Math.abs(e.laserAimX - e.x) : 320));
  const flash = u > 0.75 ? (0.55 + 0.45 * Math.sin(t * 40)) : (0.35 + 0.25 * Math.sin(t * 18));

  // Multi-beam patterns (twin / triple / sweep) warn on every lane; each lane stays horizontal.
  const offs = Array.isArray(e.laserTeleOffs) && e.laserTeleOffs.length ? e.laserTeleOffs : [0];
  const multi = offs.length > 1;
  for (const off of offs) {
    ctx.save();
    // Warning aim line (dashed / flickering) — always horizontal
    ctx.translate(mx, my + off);
    ctx.rotate(ang);
    ctx.globalAlpha = 0.35 + 0.55 * u;
    ctx.strokeStyle = u > 0.7 ? 'rgba(255,80,60,0.95)' : 'rgba(255,200,60,0.85)';
    ctx.lineWidth = (multi ? 1.2 : 1.5) + u * (multi ? 1.6 : 2.5);
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(beamLen, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    // Soft glow core along beam
    ctx.globalAlpha = 0.12 + 0.28 * u * flash;
    ctx.strokeStyle = 'rgba(255,120,80,0.9)';
    ctx.lineWidth = (multi ? 4 : 6) + u * (multi ? 5 : 10);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(beamLen * (0.55 + 0.45 * u), 0);
    ctx.stroke();
    ctx.restore();
  }

  // Muzzle charge glow
  ctx.save();
  const glowR = 6 + u * 14;
  const g = ctx.createRadialGradient(mx, my, 0, mx, my, glowR);
  g.addColorStop(0, `rgba(255,255,200,${0.55 + 0.4 * flash})`);
  g.addColorStop(0.4, `rgba(255,140,40,${0.45 * u + 0.2})`);
  g.addColorStop(1, 'rgba(255,40,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(mx, my, glowR, 0, Math.PI * 2);
  ctx.fill();
  // Bright core
  ctx.globalAlpha = 0.7 + 0.3 * flash;
  ctx.fillStyle = u > 0.8 ? '#fff' : '#ffe080';
  ctx.beginPath();
  ctx.arc(mx, my, 2 + u * 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ！ warning marker above unit
  ctx.save();
  const bounce = Math.sin(t * 14) * 2;
  ctx.globalAlpha = 0.75 + 0.25 * flash;
  ctx.fillStyle = u > 0.7 ? '#ff4422' : '#ffcc33';
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = 3;
  ctx.font = `bold ${Math.max(14, Math.floor(h * 0.28))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const label = '！';
  const ly = -h * 0.62 + bounce;
  ctx.strokeText(label, 0, ly);
  ctx.fillText(label, 0, ly);
  // Small charge ring around marker
  ctx.globalAlpha = 0.5 + 0.4 * u;
  ctx.strokeStyle = u > 0.7 ? 'rgba(255,60,40,0.9)' : 'rgba(255,200,60,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, ly - 8, 10 + u * 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * u);
  ctx.stroke();
  ctx.restore();
}

function drawEnemy(ctx, e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const sent = !!e.sent;
  const t = performance.now() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 7 + e.x * 0.02);
  const appearT = (sent && e.appearT > 0) ? e.appearT : 0;
  const appearMax = e.appearMax || 0.9;
  const appearU = appearT > 0 ? appearT / appearMax : 0; // 1→0 over FX
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6;

  const kind = e.kind || 'basic';
  const w = e.w, h = e.h;

  // Sent-unit spawn FX: rapid blink + scale pop + cyan ring (~0.9s)
  if (appearT > 0) {
    const blink = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 28 + (e._uid || 0)));
    const pop = 1 + 0.45 * appearU; // start big, settle to 1
    ctx.globalAlpha = blink;
    ctx.scale(pop, pop);
    // Expanding cyan ring / flash
    const ringR = Math.max(w, h) * (0.55 + (1 - appearU) * 0.9);
    ctx.save();
    ctx.globalAlpha = Math.min(1, appearU * 1.2) * 0.85;
    ctx.strokeStyle = 'rgba(120,240,255,0.95)';
    ctx.lineWidth = 2.5 + appearU * 2;
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(80,220,255,${0.18 * appearU})`;
    ctx.beginPath();
    ctx.arc(0, 0, ringR * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Wave ambient kinds: procedural only (never catalog sprites)
  if (isWaveKindId(kind)) {
    drawWaveEnemy(ctx, e, kind, sent, w, h, t, pulse);
  } else {
    const drew = drawEnemySprite(ctx, e, kind);
    if (!drew) {
      drawEnemyFallback(ctx, e, kind, sent, w, h, t, pulse);
    }
  }

  ctx.shadowBlur = 0;
  // HP pip: same kinds as pre-sprite (skip tiny swarm + basic)
  // Skip HP pip for tiny tiers (basic/swarm) — catalog kinds may share those tiers
  const tierKey = isWaveKindId(kind) ? kind.replace(/^wave_/, '') : kind;
  const tiny = tierKey === 'swarm' || tierKey === 'basic'
    || (e.w && e.w <= 70 && e.h && e.h <= 60);
  if (!tiny) drawHpPip(ctx, e);

  if (sent) {
    const labelA = appearT > 0 ? (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 18))) : 0.9;
    ctx.globalAlpha = labelA;
    ctx.fillStyle = appearT > 0 ? 'rgba(180,255,255,1)' : 'rgba(100,230,255,0.9)';
    ctx.font = appearT > 0 ? 'bold 11px sans-serif' : 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SEND', 0, e.h * 0.78);
  }
  // Laser telegraph (large sent units) — drawn in local space after body
  if (e.laserTeleT > 0) {
    ctx.globalAlpha = 1;
    drawLaserTelegraph(ctx, e, t);
  }
  ctx.restore();
}

function drawBullet(ctx, b) {
  ctx.save();
  if (b.owner === 'player') {
    const homing = !!b.homing;
    // Trail direction: behind flight. Player shots go +X; fall back to left of x.
    // Use unscaled vx/vy for angle (direction only — do not scale by sx/sy).
    const vx = (typeof b.vx === 'number') ? b.vx : 280;
    const vy = (typeof b.vy === 'number') ? b.vy : 0;
    const spd = Math.hypot(vx, vy) || 1;
    const ux = vx / spd;
    const uy = vy / spd;
    const ang = Math.atan2(vy, vx);
    const trail = (homing && Array.isArray(b.trail) && b.trail.length > 1) ? b.trail : null;
    ctx.shadowBlur = 0;
    ctx.lineCap = 'round';
    if (trail) {
      // Curved ribbon along position history (natural arcs when turning)
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
      ctx.lineTo(b.x, b.y);
      const n = trail.length;
      const g0 = trail[0];
      const ribbon = ctx.createLinearGradient(g0.x, g0.y, b.x, b.y);
      ribbon.addColorStop(0, 'rgba(255,80,200,0)');
      ribbon.addColorStop(0.25, 'rgba(255,100,210,0.06)');
      ribbon.addColorStop(0.55, 'rgba(255,130,225,0.18)');
      ribbon.addColorStop(0.85, 'rgba(255,160,240,0.38)');
      ribbon.addColorStop(1, 'rgba(255,190,255,0.55)');
      ctx.strokeStyle = ribbon;
      ctx.lineWidth = 5.5;
      ctx.stroke();
      // Ghost afterimages along path — alpha fades toward rear
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1); // 0 at oldest → 1 near tip
        const a = t * t * 0.55;
        if (a < 0.02) continue;
        const p0 = trail[Math.max(0, i - 1)];
        const p1 = trail[i];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const ds = Math.hypot(dx, dy) || 1;
        const tx = dx / ds;
        const ty = dy / ds;
        const len = 12 + t * 18;
        const thick = 2.8 * (0.35 + t * 0.75);
        ctx.strokeStyle = `rgba(255,120,220,${a})`;
        ctx.lineWidth = thick;
        ctx.beginPath();
        ctx.moveTo(p1.x - tx * len * 0.55, p1.y - ty * len * 0.55);
        ctx.lineTo(p1.x + tx * len * 0.35, p1.y + ty * len * 0.35);
        ctx.stroke();
      }
    } else {
      // Soft continuous ribbon — alpha→0 at tail, denser near tip (transparency, not blur)
      const ribbonLen = homing ? 72 : 85;
      const rx0 = b.x - ux * ribbonLen;
      const ry0 = b.y - uy * ribbonLen;
      const ribbon = ctx.createLinearGradient(rx0, ry0, b.x, b.y);
      if (homing) {
        ribbon.addColorStop(0, 'rgba(255,80,200,0)');
        ribbon.addColorStop(0.25, 'rgba(255,100,210,0.06)');
        ribbon.addColorStop(0.55, 'rgba(255,130,225,0.18)');
        ribbon.addColorStop(0.85, 'rgba(255,160,240,0.38)');
        ribbon.addColorStop(1, 'rgba(255,190,255,0.55)');
      } else {
        ribbon.addColorStop(0, 'rgba(255,40,70,0)');
        ribbon.addColorStop(0.25, 'rgba(255,50,80,0.06)');
        ribbon.addColorStop(0.55, 'rgba(255,70,95,0.18)');
        ribbon.addColorStop(0.85, 'rgba(255,110,130,0.38)');
        ribbon.addColorStop(1, 'rgba(255,150,160,0.55)');
      }
      ctx.strokeStyle = ribbon;
      ctx.lineWidth = homing ? 5.5 : 5;
      ctx.beginPath();
      ctx.moveTo(rx0, ry0);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // Ghost afterimages: strong alpha fade at tail → opaque near tip
      const ghosts = 13;
      const gap = homing ? 7.5 : 9;
      for (let i = ghosts; i >= 1; i--) {
        const t = 1 - i / ghosts; // 0 at tail → ~1 near tip
        const a = t * t * 0.55; // quadratic fade — strongly transparent at tail
        if (a < 0.02) continue;
        const len = 12 + t * 18;
        const thick = (homing ? 2.8 : 2.4) * (0.35 + t * 0.75);
        const gx = b.x - ux * gap * i;
        const gy = b.y - uy * gap * i;
        ctx.strokeStyle = homing
          ? `rgba(255,120,220,${a})`
          : `rgba(255,70,90,${a})`;
        ctx.lineWidth = thick;
        ctx.beginPath();
        ctx.moveTo(gx - ux * len * 0.55, gy - uy * len * 0.55);
        ctx.lineTo(gx + ux * len * 0.35, gy + uy * len * 0.35);
        ctx.stroke();
      }
    }
    // Bright elongated core streak (oriented along velocity; light alpha, minimal blur)
    ctx.strokeStyle = homing ? 'rgba(255,180,255,0.92)' : 'rgba(255,160,170,0.92)';
    ctx.lineWidth = homing ? 3.0 : 2.8;
    ctx.beginPath();
    ctx.moveTo(b.x - ux * 10, b.y - uy * 10);
    ctx.lineTo(b.x + ux * 8, b.y + uy * 8);
    ctx.stroke();
    // Hot white core
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = homing ? 1.5 : 1.4;
    ctx.beginPath();
    ctx.moveTo(b.x - ux * 5, b.y - uy * 5);
    ctx.lineTo(b.x + ux * 5, b.y + uy * 5);
    ctx.stroke();
    // Homing: small diamond / missile tip rotated to face velocity
    if (homing) {
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(255,210,255,0.95)';
      ctx.strokeStyle = 'rgba(255,120,220,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(7, 0);       // tip forward
      ctx.lineTo(0, 3.2);     // right wing
      ctx.lineTo(-4, 0);      // rear
      ctx.lineTo(0, -3.2);    // left wing
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // tiny bright nose
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(2.5, 1.4);
      ctx.lineTo(2.5, -1.4);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Enemy projectiles
    const vx = (typeof b.vx === 'number') ? b.vx : -160;
    const vy = (typeof b.vy === 'number') ? b.vy : 0;
    const spd = Math.hypot(vx, vy) || 1;
    const ux = vx / spd;
    const uy = vy / spd;
    const ang = Math.atan2(vy, vx);
    const laser = !!b.laser;
    const homing = !!b.homing;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 0;

    const k = b.k;
    if (laser) {
      // Fast cyan laser pulse streak (distinct from orange missiles)
      // k: 'beam' = long thick beam, 'pulse' = short green pulse
      const beam = k === 'beam';
      const pulse = k === 'pulse';
      const len = beam ? 64 : pulse ? 13 : 26;
      // Force horizontal draw for enemy lasers (vy must be 0)
      const lx = -1, ly = 0;
      ctx.strokeStyle = beam ? 'rgba(150,120,255,0.4)' : pulse ? 'rgba(60,255,170,0.35)' : 'rgba(40,180,255,0.35)';
      ctx.lineWidth = beam ? 11 : 6;
      ctx.beginPath();
      ctx.moveTo(b.x - lx * len, b.y - ly * len);
      ctx.lineTo(b.x + lx * len * 0.4, b.y + ly * len * 0.4);
      ctx.stroke();
      ctx.strokeStyle = beam ? 'rgba(190,170,255,0.95)' : pulse ? 'rgba(110,255,200,0.95)' : 'rgba(80,220,255,0.95)';
      ctx.lineWidth = beam ? 5 : 3.2;
      ctx.beginPath();
      ctx.moveTo(b.x - lx * len * 0.85, b.y - ly * len * 0.85);
      ctx.lineTo(b.x + lx * 6, b.y + ly * 6);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220,255,255,0.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(b.x - lx * 8, b.y - ly * 8);
      ctx.lineTo(b.x + lx * 5, b.y + ly * 5);
      ctx.stroke();
    } else if (homing) {
      // Limited-homing missile — orange/red diamond + thicker trail (not a laser)
      const trail = (Array.isArray(b.trail) && b.trail.length > 1) ? b.trail : null;
      if (trail) {
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
        ctx.lineTo(b.x, b.y);
        const g0 = trail[0];
        const ribbon = ctx.createLinearGradient(g0.x, g0.y, b.x, b.y);
        ribbon.addColorStop(0, 'rgba(255,60,20,0)');
        ribbon.addColorStop(0.45, 'rgba(255,90,40,0.28)');
        ribbon.addColorStop(1, 'rgba(255,150,60,0.7)');
        ctx.strokeStyle = ribbon;
        ctx.lineWidth = 6;
        ctx.stroke();
      } else {
        const ribbonLen = 58;
        const rx0 = b.x - ux * ribbonLen;
        const ry0 = b.y - uy * ribbonLen;
        const ribbon = ctx.createLinearGradient(rx0, ry0, b.x, b.y);
        ribbon.addColorStop(0, 'rgba(255,60,20,0)');
        ribbon.addColorStop(0.45, 'rgba(255,90,40,0.28)');
        ribbon.addColorStop(1, 'rgba(255,150,60,0.7)');
        ctx.strokeStyle = ribbon;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(rx0, ry0);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(255,160,70,0.98)';
      ctx.strokeStyle = 'rgba(255,70,30,0.95)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(0, 3.8);
      ctx.lineTo(-5, 0);
      ctx.lineTo(0, -3.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff8e8';
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(3, 1.4);
      ctx.lineTo(3, -1.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (k) {
      drawEnemyShot(ctx, b, k, ux, uy, ang);
    } else {
      // Default enemy orb
      ctx.fillStyle = '#ff6644';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r || 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Per-pattern enemy shot looks (cheap: a few arcs/lines, no blur). */
function drawEnemyShot(ctx, b, k, ux, uy, ang) {
  const r = b.r || 3;
  const now = performance.now() / 1000;
  const dot = (x, y, rr, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); };
  const streak = (len, w, c) => {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
    ctx.moveTo(b.x - ux * len, b.y - uy * len); ctx.lineTo(b.x + ux * len * 0.35, b.y + uy * len * 0.35); ctx.stroke();
  };
  switch (k) {
    case 'needle': // aimed / burst — yellow dart
      streak(15, 5, 'rgba(255,210,60,0.4)');
      streak(11, 2.2, '#fff2a0');
      break;
    case 'stream': // rapid stream — small amber streak
      streak(8, 3.4, 'rgba(255,180,40,0.85)');
      dot(b.x, b.y, 1.3, '#fff');
      break;
    case 'fan':
      dot(b.x, b.y, r + 1.2, 'rgba(255,120,40,0.35)');
      dot(b.x, b.y, r, '#ff8a3a');
      break;
    case 'petal': // ring / spiral / split shards — pink
      dot(b.x, b.y, r + 1.4, 'rgba(255,80,200,0.3)');
      dot(b.x, b.y, r, '#ff5fd2');
      dot(b.x, b.y, 1.2, '#fff');
      break;
    case 'wave':
      ctx.strokeStyle = 'rgba(60,255,170,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, r + 3, 0, Math.PI * 2); ctx.stroke();
      dot(b.x, b.y, r, '#3dffb0');
      break;
    case 'big': { // slow plasma orb
      const pul = 1 + Math.sin(now * 10 + b.x * 0.05) * 0.08;
      dot(b.x, b.y, r * 1.55 * pul, 'rgba(200,70,255,0.25)');
      dot(b.x, b.y, r * pul, '#c24cff');
      dot(b.x, b.y, r * 0.45, '#f6d8ff');
      break;
    }
    case 'split': {
      const warn = b.st != null && b.st < 0.22;
      dot(b.x, b.y, r + (warn ? 3 : 1.5), warn ? 'rgba(255,255,160,0.5)' : 'rgba(255,150,40,0.35)');
      dot(b.x, b.y, r, '#ffa030');
      dot(b.x, b.y, 1.6, '#fff');
      break;
    }
    case 'mine': {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(now * 1.5 + b.y * 0.01);
      ctx.strokeStyle = '#ff5060'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(Math.cos(a) * (r + 3.5), Math.sin(a) * (r + 3.5));
      }
      ctx.stroke();
      ctx.restore();
      dot(b.x, b.y, r, '#6a1422');
      ctx.strokeStyle = '#ff5060'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
      if (Math.floor(now * 4 + b.x * 0.01) % 2 === 0) dot(b.x, b.y, 1.8, '#ffe066');
      break;
    }
    case 'boom': { // spinning three-blade boomerang
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(now * 14);
      ctx.fillStyle = '#ffd040';
      ctx.strokeStyle = 'rgba(255,120,30,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = i * (Math.PI * 2 / 3);
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(a + 0.5) * r * 1.4, Math.sin(a + 0.5) * r * 1.4, Math.cos(a) * r * 1.8, Math.sin(a) * r * 1.8);
        ctx.quadraticCurveTo(Math.cos(a - 0.3) * r * 0.8, Math.sin(a - 0.3) * r * 0.8, 0, 0);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
    default:
      dot(b.x, b.y, r, '#ff6644');
  }
}

/** Pickup orb radius in field px (v1.5.67: 11 → 20 so items read clearly vs enemies/bullets). */
export const ITEM_ORB_R = 20;

function drawItem(ctx, it) {
  const st = ITEM_STYLE[it.id] || { color: '#ffd24a', icon: '★' };
  const id = it.id;
  // v1.5.74: bomb = flashiest orb (strongest item); heal / heal_big also stand out on the field
  const isBomb = id === 'bomb';
  const isHeal = id === 'heal' || id === 'heal_big';
  const isHealBig = id === 'heal_big';
  const R = isBomb ? ITEM_ORB_R * 1.35 : (isHealBig ? ITEM_ORB_R * 1.22 : (isHeal ? ITEM_ORB_R * 1.12 : ITEM_ORB_R));
  const now = performance.now() / 1000;
  ctx.save();
  ctx.translate(it.x, it.y);
  // Blink/pulse when remaining lifetime ≤ 5s (despawn warning)
  if (typeof it.life === 'number' && it.life <= 5) {
    const hz = 3; // ~3 Hz smooth pulse — visible, not seizure-fast
    const pulse = 0.5 + 0.5 * Math.sin(now * Math.PI * 2 * hz);
    ctx.globalAlpha = 0.22 + 0.78 * pulse;
  }
  // Always-on identity pulse for bomb / heal (independent of despawn blink)
  const idPulse = 0.5 + 0.5 * Math.sin(now * Math.PI * 2 * (isBomb ? 2.2 : 1.6));

  if (isBomb) {
    // Outer flame corona — largest / hottest so the strongest item is unmistakable
    const coronaR = R * (2.35 + 0.25 * idPulse);
    const corona = ctx.createRadialGradient(0, 0, R * 0.35, 0, 0, coronaR);
    corona.addColorStop(0, `rgba(255,240,180,${0.55 + 0.25 * idPulse})`);
    corona.addColorStop(0.35, `rgba(255,120,30,${0.45 + 0.2 * idPulse})`);
    corona.addColorStop(0.7, `rgba(255,40,0,${0.22 + 0.12 * idPulse})`);
    corona.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(0, 0, coronaR, 0, Math.PI * 2);
    ctx.fill();
    // Spinning dashed ring (thicker / faster)
    ctx.strokeStyle = `rgba(255,220,120,${0.85 + 0.15 * idPulse})`;
    ctx.lineWidth = 3.2;
    ctx.setLineDash([8, 4]);
    ctx.lineDashOffset = -now * 48;
    ctx.beginPath();
    ctx.arc(0, 0, R + 8 + 2 * idPulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Second counter-rotating ring
    ctx.strokeStyle = `rgba(255,80,20,${0.55 + 0.25 * idPulse})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = now * 36;
    ctx.beginPath();
    ctx.arc(0, 0, R + 14 + 3 * idPulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (isHeal) {
    // Soft green/cyan aura + expanding breath rings
    const auraR = R * (2.05 + 0.18 * idPulse);
    const aura = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, auraR);
    aura.addColorStop(0, `rgba(180,255,220,${0.5 + 0.2 * idPulse})`);
    aura.addColorStop(0.45, `rgba(40,255,140,${0.35 + 0.15 * idPulse})`);
    aura.addColorStop(1, 'rgba(0,200,120,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, auraR, 0, Math.PI * 2);
    ctx.fill();
    // Breath rings
    for (let i = 0; i < (isHealBig ? 3 : 2); i++) {
      const u = (now * 0.9 + i * 0.33) % 1;
      const rr = R * (1.15 + 1.1 * u);
      const aa = (1 - u) * (0.55 - i * 0.08);
      ctx.strokeStyle = `rgba(${isHealBig ? '80,255,200' : '100,255,160'},${aa})`;
      ctx.lineWidth = 2.2 - u;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Slow dashed pickup ring
    ctx.strokeStyle = `rgba(220,255,240,${0.7 + 0.3 * idPulse})`;
    ctx.lineWidth = 2.4;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -now * 20;
    ctx.beginPath();
    ctx.arc(0, 0, R + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    // Soft colour halo (default items)
    const halo = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.75);
    halo.addColorStop(0, st.color);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha *= 0.55;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha /= 0.55;
    // Rotating dashed "pickup" ring — nothing else on the stage looks like this
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -now * 24;
    ctx.beginPath();
    ctx.arc(0, 0, R + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Glossy body in the item colour
  const body = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
  if (isBomb) {
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.25, '#ffe090');
    body.addColorStop(0.55, '#ff5522');
    body.addColorStop(1, '#aa1800');
  } else if (isHeal) {
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.3, isHealBig ? '#b8ffe0' : '#c8ffd8');
    body.addColorStop(0.65, st.color);
    body.addColorStop(1, isHealBig ? '#00aa66' : '#118844');
  } else {
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.35, st.color);
    body.addColorStop(1, st.color);
  }
  ctx.fillStyle = body;
  ctx.shadowColor = isBomb ? '#ff6620' : (isHeal ? '#44ff99' : st.color);
  ctx.shadowBlur = isBomb ? 22 + 8 * idPulse : (isHeal ? 16 + 5 * idPulse : 10);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = isBomb ? `rgba(255,240,180,${0.9 + 0.1 * idPulse})` : '#ffffff';
  ctx.lineWidth = isBomb ? 3.4 : (isHeal ? 2.8 : 2.5);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, R - 2.2, 0, Math.PI * 2);
  ctx.stroke();

  // Icon — large, dark, fitted inside the orb (2-char icons shrink to fit)
  // Bomb / heal: bigger, higher-contrast so they read at a glance
  const icon = String(st.icon || '★');
  let fs = Math.round(R * (isBomb ? 1.22 : (isHeal ? 1.18 : 1.05)));
  ctx.font = `900 ${fs}px "Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif`;
  const maxW = R * 1.5;
  const w = ctx.measureText(icon).width;
  if (w > maxW) {
    fs = Math.max(10, Math.floor(fs * maxW / w));
    ctx.font = `900 ${fs}px "Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = isBomb || isHeal ? 4 : 3;
  ctx.strokeStyle = isBomb ? 'rgba(255,255,200,0.95)' : (isHeal ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.75)');
  ctx.strokeText(icon, 0, 1);
  ctx.fillStyle = isBomb ? '#2a0800' : (isHeal ? '#063318' : '#111');
  ctx.fillText(icon, 0, 1);

  // Tiny rising sparkles for heal orbs (cheap, few particles)
  if (isHeal) {
    const n = isHealBig ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + now * 1.4;
      const dist = R * (1.25 + 0.35 * Math.sin(now * 3 + i));
      const sx = Math.cos(ang) * dist;
      const sy = Math.sin(ang) * dist * 0.75 - 4 * Math.sin(now * 4 + i);
      const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(now * 5 + i * 1.7));
      ctx.fillStyle = `rgba(200,255,230,${a})`;
      ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
    }
  }
  ctx.restore();
}

function drawMeteor(ctx, m) {
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(m.rot || 0);
  // fire trail
  ctx.globalAlpha = 0.75;
  const trail = ctx.createLinearGradient(0, -m.r * 2.8, 0, m.r);
  trail.addColorStop(0, 'rgba(255,220,80,0)');
  trail.addColorStop(0.45, 'rgba(255,140,40,0.55)');
  trail.addColorStop(1, 'rgba(255,60,0,0.15)');
  ctx.fillStyle = trail;
  ctx.beginPath();
  ctx.moveTo(-m.r * 0.45, 0);
  ctx.lineTo(0, -m.r * 3.2);
  ctx.lineTo(m.r * 0.45, 0);
  ctx.closePath();
  ctx.fill();
  // rock body
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(-m.r * 0.25, -m.r * 0.2, 1, 0, 0, m.r);
  g.addColorStop(0, '#f0d0a0');
  g.addColorStop(0.45, '#b87333');
  g.addColorStop(1, '#4a2810');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -m.r);
  ctx.lineTo(m.r * 0.85, -m.r * 0.35);
  ctx.lineTo(m.r * 0.7, m.r * 0.65);
  ctx.lineTo(-m.r * 0.55, m.r * 0.75);
  ctx.lineTo(-m.r * 0.9, -m.r * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,200,120,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // hot cracks
  ctx.strokeStyle = 'rgba(255,120,40,0.8)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-m.r * 0.2, -m.r * 0.3);
  ctx.lineTo(m.r * 0.15, m.r * 0.2);
  ctx.moveTo(m.r * 0.1, -m.r * 0.5);
  ctx.lineTo(-m.r * 0.05, m.r * 0.4);
  ctx.stroke();
  ctx.restore();
}

/** Jagged lightning polyline from (x1,y1) to (x2,y2). */
function boltPath(ctx, x1, y1, x2, y2, jag, segs) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  ctx.moveTo(x1, y1);
  for (let i = 1; i < segs; i++) {
    const u = i / segs;
    const off = (Math.random() - 0.5) * 2 * jag;
    ctx.lineTo(x1 + dx * u + nx * off, y1 + dy * u + ny * off);
  }
  ctx.lineTo(x2, y2);
}

/** 電撃 area FX: shows the exact hit circle (radius f.r) + bolts to hit targets. */
function drawShockFx(ctx, f) {
  const t = Math.min(1, Math.max(0, 1 - f.life / f.max));
  const R = f.r;
  const grow = Math.min(1, t / 0.15); // ring shoots out to full radius in ~0.1s
  const fade = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
  const cx = f.x, cy = f.y;
  ctx.save();
  // Area fill — the whole hit circle tinted electric blue (source-over so it reads on red nebula)
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  rg.addColorStop(0, `rgba(170,230,255,${0.42 * fade})`);
  rg.addColorStop(0.7, `rgba(40,140,255,${0.26 * fade})`);
  rg.addColorStop(1, `rgba(70,190,255,${0.40 * fade})`);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(cx, cy, R * grow, 0, Math.PI * 2);
  ctx.fill();
  // Boundary: jagged electric ring exactly at the hit radius
  const rr = R * grow;
  ctx.shadowColor = `rgba(90,200,255,${fade})`;
  ctx.shadowBlur = 10;
  const n = Math.max(24, Math.round(rr / 8));
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? `rgba(90,200,255,${0.55 * fade})` : `rgba(235,250,255,${0.95 * fade})`;
    ctx.lineWidth = pass === 0 ? 7 : 2.2;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 7;
      const x = cx + Math.cos(a) * (rr + j);
      const y = cy + Math.sin(a) * (rr + j);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Radial bolts reaching the edge
  ctx.strokeStyle = `rgba(200,240,255,${0.75 * fade})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const spokes = 10;
  const rot = t * 2.2;
  for (let i = 0; i < spokes; i++) {
    const a = rot + (i / spokes) * Math.PI * 2;
    boltPath(ctx, cx, cy, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, Math.max(4, rr * 0.05), 7);
  }
  ctx.stroke();
  // Bolts to each hit enemy (bright)
  const targets = f.t || [];
  if (targets.length && grow >= 1) {
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? `rgba(120,210,255,${0.6 * fade})` : `rgba(255,255,255,${fade})`;
      ctx.lineWidth = pass === 0 ? 6 : 2;
      ctx.beginPath();
      for (const [tx, ty] of targets) {
        const d = Math.hypot(tx - cx, ty - cy);
        boltPath(ctx, cx, cy, tx, ty, Math.max(4, d * 0.06), Math.max(4, Math.round(d / 22)));
      }
      ctx.stroke();
    }
  }
  // Core flash at the ship
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 34);
  core.addColorStop(0, `rgba(255,255,255,${fade})`);
  core.addColorStop(1, 'rgba(120,220,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ---------- ボム (bomb) FX — the strongest item, most spectacular effect ---------- */
const BOMB_CHARGE = 0.22;   // v1.5.74: longer implosion beat before detonation
const BOMB_SWEEP1 = 0.42;   // 1st shockwave: centre → farthest corner
const BOMB_SWEEP2 = 0.68;   // 2nd (trailing) shockwave
const BOMB_DEBRIS = 40;
const BOMB_EMBERS = 22;
const BOMB_SMOKE = 10;

/** Deterministic 0..1 hash so particles need no stored state (works for net snapshots too). */
function bombRand(seed, i) {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
const easeOut3 = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

/** Seconds since the bomb FX spawned. */
function bombAge(f) { return Math.max(0, f.max - f.life); }

/** Pane-level shake offset + full flash strength from any active bomb FX in this pane. */
function bombPaneFx(list, sc) {
  let shake = 0, flash = 0, tint = 0, dark = 0;
  for (const f of list) {
    if ((f.k ?? f.kind) !== 'bomb') continue;
    const age = Math.max(0, (f.m ?? f.max) - (f.l ?? f.life));
    const d = age - BOMB_CHARGE;
    if (d < 0) {
      shake = Math.max(shake, 3.5 * (d + BOMB_CHARGE) / BOMB_CHARGE); // charge tremble
      dark = Math.max(dark, 0.62 * (d + BOMB_CHARGE) / BOMB_CHARGE); // stage dims as energy gathers
    } else {
      if (d < 0.7) shake = Math.max(shake, 16 * Math.pow(1 - d / 0.7, 2));
      if (d < 0.38) flash = Math.max(flash, 1.0 * (1 - d / 0.38)); // full white-out pulse
      if (d < 1.15) tint = Math.max(tint, 0.42 * (1 - d / 1.15));
    }
  }
  const k = Math.max(0.5, Math.min(1.2, sc || 1));
  return {
    sx: shake > 0 ? (Math.random() - 0.5) * 2 * shake * k : 0,
    sy: shake > 0 ? (Math.random() - 0.5) * 2 * shake * k : 0,
    flash, tint, dark,
  };
}

function drawBombFx(ctx, f) {
  const age = bombAge(f);
  const cx = f.x, cy = f.y;
  const R = f.r;                       // reaches the farthest corner = whole stage
  const sc = Math.max(0.45, Math.min(1.3, f.sc || 1));
  const seed = Math.round(cx * 7 + cy * 13) % 997;
  ctx.save();

  // 1) Charge-up / implosion (~0.14s): streaks + ring collapsing into the ship
  if (age < BOMB_CHARGE + 0.04) {
    const u = Math.min(1, age / BOMB_CHARGE);
    const a0 = Math.max(0, 1 - Math.max(0, age - BOMB_CHARGE) / 0.04);
    const ringR = (110 - 100 * easeOut3(u)) * sc;
    ctx.strokeStyle = `rgba(255,150,50,${0.6 * a0})`;
    ctx.lineWidth = 9 * sc;
    ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,240,190,${a0})`;
    ctx.lineWidth = 2.5 * sc;
    ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,200,90,${a0})`;
    ctx.lineWidth = 3 * sc;
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + bombRand(seed, i) * 0.4;
      const r1 = (120 - 110 * u) * sc + bombRand(seed, i + 50) * 20 * sc;
      const r2 = r1 + 22 * sc * (1 - u * 0.6);
      ctx.moveTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    ctx.stroke();
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, (16 + 30 * u) * sc);
    cg.addColorStop(0, `rgba(255,255,255,${a0})`);
    cg.addColorStop(0.5, `rgba(255,220,120,${0.8 * a0})`);
    cg.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(cx, cy, (16 + 30 * u) * sc, 0, Math.PI * 2); ctx.fill();
  }

  const d = age - BOMB_CHARGE;         // time since detonation
  if (d >= 0) {
    const life = f.max - BOMB_CHARGE;
    const fadeAll = d < life * 0.7 ? 1 : Math.max(0, 1 - (d - life * 0.7) / (life * 0.3));

    // 2) Scorched area behind the 1st wave (orange heat over the swept stage)
    const w1 = R * easeOut3(d / BOMB_SWEEP1);
    const heat = Math.max(0, 1 - d / 0.9);
    if (heat > 0 && w1 > 2) {
      const hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w1);
      hg.addColorStop(0, `rgba(255,230,150,${0.45 * heat})`);
      hg.addColorStop(0.55, `rgba(255,120,30,${0.28 * heat})`);
      hg.addColorStop(1, `rgba(255,60,10,${0.38 * heat})`);
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(cx, cy, w1, 0, Math.PI * 2); ctx.fill();
    }

    // 3) Double shockwave rings sweeping the whole stage
    const rings = [
      { r: w1, a: Math.max(0, 1 - Math.max(0, d - BOMB_SWEEP1 * 0.6) / 0.4), w: 20, c: '255,170,50', core: '255,250,220' },
      { r: R * easeOut3((d - 0.12) / BOMB_SWEEP2), a: d < 0.12 ? 0 : Math.max(0, 1 - Math.max(0, d - 0.12 - BOMB_SWEEP2 * 0.6) / 0.45), w: 12, c: '255,70,20', core: '255,200,120' },
    ];
    for (const rg of rings) {
      if (rg.a <= 0 || rg.r < 2) continue;
      ctx.strokeStyle = `rgba(${rg.c},${0.55 * rg.a})`;
      ctx.lineWidth = rg.w * sc;
      ctx.beginPath(); ctx.arc(cx, cy, rg.r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(${rg.core},${0.95 * rg.a})`;
      ctx.lineWidth = Math.max(1.5, rg.w * 0.25 * sc);
      ctx.beginPath(); ctx.arc(cx, cy, rg.r - rg.w * 0.2 * sc, 0, Math.PI * 2); ctx.stroke();
    }

    // 4) Smoke puffs (lingering, drift up)
    for (let i = 0; i < BOMB_SMOKE; i++) {
      const st = 0.25 + bombRand(seed, i + 300) * 0.15;
      const sd = d - st;
      if (sd <= 0) continue;
      const u = sd / (life - st);
      if (u >= 1) continue;
      const a = bombRand(seed, i + 310) * Math.PI * 2;
      const dist = (40 + 70 * bombRand(seed, i + 320)) * sc * easeOut3(u * 2);
      const px = cx + Math.cos(a) * dist, py = cy + Math.sin(a) * dist * 0.7 - 50 * sc * u;
      const pr = (26 + 40 * u) * sc;
      const sg = ctx.createRadialGradient(px, py, 0, px, py, pr);
      const al = 0.32 * Math.sin(Math.PI * Math.min(1, u * 1.3 + 0.15)) * fadeAll;
      sg.addColorStop(0, `rgba(70,40,35,${al})`);
      sg.addColorStop(1, 'rgba(40,20,20,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    }

    // 5) Fireball bloom — grows fast, rises into a mushroom-like cap, then cools
    const fbU = Math.min(1, d / 0.32);
    const fbR = (92 * easeOut3(fbU) + 20 * Math.min(1, d / 0.85)) * sc; // v1.5.74: bigger bloom
    const cool = Math.max(0, Math.min(1, (d - 0.35) / 0.7)); // 0 hot → 1 cooled
    const rise = 38 * sc * easeOut3(d / 1.0);
    const fbA = Math.max(0, 1 - Math.max(0, d - 0.55) / (life - 0.55));
    if (fbA > 0) {
      // stem
      if (d > 0.12) {
        const sg = ctx.createLinearGradient(cx, cy, cx, cy - rise);
        sg.addColorStop(0, `rgba(255,140,40,${0.55 * fbA})`);
        sg.addColorStop(1, `rgba(255,90,20,${0.25 * fbA})`);
        ctx.fillStyle = sg;
        const sw = fbR * 0.32;
        ctx.beginPath();
        ctx.moveTo(cx - sw, cy); ctx.lineTo(cx - sw * 0.6, cy - rise);
        ctx.lineTo(cx + sw * 0.6, cy - rise); ctx.lineTo(cx + sw, cy);
        ctx.closePath(); ctx.fill();
      }
      const fy = cy - rise;
      const g = ctx.createRadialGradient(cx, fy, 0, cx, fy, fbR);
      const hot = 1 - cool;
      g.addColorStop(0, `rgba(255,255,${Math.round(230 * hot + 120 * cool)},${fbA})`);
      g.addColorStop(0.35, `rgba(255,${Math.round(210 * hot + 110 * cool)},${Math.round(90 * hot + 40 * cool)},${0.92 * fbA})`);
      g.addColorStop(0.7, `rgba(${Math.round(255 * hot + 170 * cool)},${Math.round(90 * hot + 40 * cool)},20,${0.7 * fbA})`);
      g.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, fy, fbR * 1.12, fbR * (0.9 - 0.15 * cool), 0, 0, Math.PI * 2); ctx.fill();
      // mushroom cap: wide rolling cloud billowing out on top once it rises
      if (d > 0.25) {
        const cu = Math.min(1, (d - 0.25) / 0.45);
        const capY = fy - fbR * (0.35 + 0.25 * cu);
        const capW = fbR * (0.8 + 0.7 * easeOut3(cu)), capH = fbR * (0.35 + 0.2 * cu);
        const cg2 = ctx.createRadialGradient(cx, capY, 0, cx, capY, capW);
        cg2.addColorStop(0, `rgba(255,${Math.round(200 - 90 * cool)},${Math.round(90 - 50 * cool)},${0.75 * fbA * cu})`);
        cg2.addColorStop(0.6, `rgba(${Math.round(230 - 90 * cool)},${Math.round(80 - 40 * cool)},30,${0.5 * fbA * cu})`);
        cg2.addColorStop(1, 'rgba(90,20,10,0)');
        ctx.fillStyle = cg2;
        ctx.beginPath(); ctx.ellipse(cx, capY, capW, capH, 0, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 6) Debris sparks — ballistic streaks flying out
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.2 * sc;
    for (let i = 0; i < BOMB_DEBRIS; i++) {
      const lifeP = 0.45 + bombRand(seed, i + 100) * 0.45;
      if (d > lifeP) continue;
      const u = d / lifeP;
      const a = bombRand(seed, i) * Math.PI * 2;
      const spd = (260 + 420 * bombRand(seed, i + 200)) * sc;
      const dist = spd * lifeP * easeOut3(u) * 0.9;
      const grav = 90 * sc * u * u;
      const x = cx + Math.cos(a) * dist, y = cy + Math.sin(a) * dist + grav;
      const tl = (18 * (1 - u) + 4) * sc;
      const al = 1 - u;
      ctx.strokeStyle = i % 3 === 0 ? `rgba(255,255,210,${al})` : (i % 3 === 1 ? `rgba(255,190,60,${al})` : `rgba(255,90,30,${al})`);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - Math.cos(a) * tl, y - Math.sin(a) * tl - 2 * sc * u);
      ctx.stroke();
    }

    // 7) Chained secondary explosions on every hit target (as the 1st wave reaches them)
    const targets = f.t || [];
    for (let i = 0; i < targets.length; i++) {
      const [tx, ty] = targets[i];
      const dist = Math.hypot(tx - cx, ty - cy);
      // invert easeOut3 to find when wave 1 reaches this distance, plus a small chain stagger
      const reach = Math.min(1, dist / (R || 1));
      const tHit = BOMB_SWEEP1 * (1 - Math.cbrt(1 - reach)) + (i % 5) * 0.03;
      const e = d - tHit;
      if (e < 0 || e > 0.5) continue;
      const u = e / 0.5;
      const er = (12 + 40 * easeOut3(u)) * sc;
      const al = 1 - u;
      const eg = ctx.createRadialGradient(tx, ty, 0, tx, ty, er);
      eg.addColorStop(0, `rgba(255,255,230,${al})`);
      eg.addColorStop(0.4, `rgba(255,190,60,${0.9 * al})`);
      eg.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(tx, ty, er, 0, Math.PI * 2); ctx.fill();
      // spark burst (short streaks, no outline ring)
      ctx.strokeStyle = `rgba(255,230,150,${al})`;
      ctx.lineWidth = 2 * sc;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + bombRand(seed, i * 7 + k) * 0.8;
        const r1 = er * (0.6 + 0.5 * u), r2 = r1 + 12 * sc * (1 - u);
        ctx.moveTo(tx + Math.cos(a) * r1, ty + Math.sin(a) * r1);
        ctx.lineTo(tx + Math.cos(a) * r2, ty + Math.sin(a) * r2);
      }
      ctx.stroke();
      // 2nd pop slightly later (chain feel)
      if (e > 0.12) {
        const u2 = (e - 0.12) / 0.38;
        const ox = (bombRand(seed, i + 400) - 0.5) * 26 * sc, oy = (bombRand(seed, i + 410) - 0.5) * 20 * sc;
        const r2 = (6 + 20 * easeOut3(u2)) * sc;
        const g2 = ctx.createRadialGradient(tx + ox, ty + oy, 0, tx + ox, ty + oy, r2);
        g2.addColorStop(0, `rgba(255,240,180,${1 - u2})`);
        g2.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(tx + ox, ty + oy, r2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 8) Embers — slow glowing specks drifting up, flickering (lingering after the blast)
    for (let i = 0; i < BOMB_EMBERS; i++) {
      const st = 0.2 + bombRand(seed, i + 500) * 0.2;
      const e = d - st;
      if (e <= 0) continue;
      const u = e / (life - st);
      if (u >= 1) continue;
      const a = bombRand(seed, i + 510) * Math.PI * 2;
      const dist = (50 + 150 * bombRand(seed, i + 520)) * sc * easeOut3(Math.min(1, u * 2.5));
      const x = cx + Math.cos(a) * dist + Math.sin(e * 6 + i) * 6 * sc;
      const y = cy + Math.sin(a) * dist * 0.8 - 60 * sc * u;
      const fl = 0.6 + 0.4 * Math.sin(e * 30 + i * 1.7);
      ctx.fillStyle = `rgba(255,${160 + (i % 4) * 20},60,${(1 - u) * fl})`;
      const s = (2 + (i % 3)) * sc;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  }
  ctx.restore();
}

/* ---------- Heal / heal_big activation FX — rewarding, not as flashy as bomb ---------- */
function drawHealFx(ctx, f) {
  const age = Math.max(0, f.max - f.life);
  const life = f.max || 0.9;
  const t = Math.min(1, age / life);
  const big = !!(f.a);
  const cx = f.x, cy = f.y;
  const sc = Math.max(0.45, Math.min(1.3, f.sc || 1));
  const baseR = (f.r || (big ? 78 : 56)) * (f.sc ? 1 : sc); // r already scaled when drawn via drawField
  const fade = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
  const seed = Math.round(cx * 5 + cy * 11) % 997;
  const rnd = (i) => { const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return v - Math.floor(v); };
  ctx.save();

  // Soft cyan-green fill pulse
  const grow = easeOut3(Math.min(1, age / 0.28));
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * grow);
  rg.addColorStop(0, `rgba(220,255,240,${0.55 * fade})`);
  rg.addColorStop(0.4, `rgba(60,255,160,${0.32 * fade})`);
  rg.addColorStop(1, `rgba(20,180,120,0)`);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(cx, cy, baseR * grow, 0, Math.PI * 2);
  ctx.fill();

  // Expanding soft rings
  const nRings = big ? 3 : 2;
  for (let i = 0; i < nRings; i++) {
    const st = i * 0.08;
    const u = Math.max(0, Math.min(1, (age - st) / (life * 0.7)));
    if (u <= 0) continue;
    const rr = baseR * (0.35 + 0.9 * easeOut3(u));
    const aa = (1 - u) * fade * (0.85 - i * 0.15);
    ctx.strokeStyle = `rgba(${big ? '120,255,220' : '100,255,170'},${aa})`;
    ctx.lineWidth = (big ? 5 : 3.5) * sc * (1 - u * 0.5);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${aa * 0.7})`;
    ctx.lineWidth = 1.4 * sc;
    ctx.beginPath();
    ctx.arc(cx, cy, rr - 2 * sc, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Rising sparkles / plus bits
  const n = big ? 14 : 10;
  for (let i = 0; i < n; i++) {
    const st = rnd(i) * 0.2;
    const u = (age - st) / (life - st);
    if (u <= 0 || u >= 1) continue;
    const a = rnd(i + 20) * Math.PI * 2;
    const dist = (18 + 55 * rnd(i + 40)) * sc * easeOut3(Math.min(1, u * 1.4));
    const x = cx + Math.cos(a) * dist;
    const y = cy + Math.sin(a) * dist * 0.7 - 50 * sc * u;
    const al = Math.sin(Math.PI * u) * fade;
    if (i % 3 === 0) {
      ctx.fillStyle = `rgba(200,255,230,${al})`;
      ctx.font = `900 ${Math.round(12 * sc)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', x, y);
    } else {
      ctx.fillStyle = `rgba(160,255,210,${al})`;
      const s = (2 + (i % 3)) * sc;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  }

  // Bright core at the ship
  const coreR = (22 + 18 * Math.sin(Math.min(1, age / 0.2) * Math.PI)) * sc * (big ? 1.2 : 1);
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  cg.addColorStop(0, `rgba(255,255,255,${fade})`);
  cg.addColorStop(0.45, `rgba(160,255,210,${0.75 * fade})`);
  cg.addColorStop(1, 'rgba(40,200,120,0)');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFx(ctx, f) {
  if (drawExFx(ctx, f)) return; // v1.5.67 extra attack items (attack_items.js)
  if (f.kind === 'shock') { drawShockFx(ctx, f); return; }
  if (f.kind === 'bomb') { drawBombFx(ctx, f); return; }
  if (f.kind === 'heal') { drawHealFx(ctx, f); return; }
  const t = 1 - f.life / f.max;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t);
  const rg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (0.5 + t));
  rg.addColorStop(0, '#fff');
  rg.addColorStop(0.4, '#ffcc44');
  rg.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * (0.5 + t), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** HP bars at the bottom edge of the opponent pane — drain ghost + shake + low-HP pulse. */
function drawHpBarsAtBoundary(ctx, L, selfHp, oppHp, maxHp, fx = {}) {
  const ghost = fx.hpGhost != null ? fx.hpGhost : selfHp;
  const display = fx.hpDisplay != null ? fx.hpDisplay : selfHp;
  const shake = Math.max(0, fx.hpShake || 0);
  const flash = Math.max(0, fx.damageFlash || 0);
  const healFlash = Math.max(0, fx.healFlash || 0);
  const x0 = L.W * 0.12;
  const barW = L.W * 0.66;
  const barH = Math.max(7, Math.min(12, L.H * 0.013));
  const gap = Math.max(4, barH * 0.55);
  const totalH = barH * 2 + gap;
  const padBot = Math.max(4, Math.min(10, L.oppH * 0.035));
  // Sit at the bottom of the opponent frame (above the opp/own divider)
  const y0 = L.oppH - padBot - totalH;
  const jx = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
  const jy = shake > 0 ? (Math.random() - 0.5) * 6 * shake : 0;
  const x = x0 + jx;
  const y = y0 + jy;
  const now = performance.now();
  const selfRatio = Math.max(0, display / maxHp);
  const oppRatio = Math.max(0, oppHp / maxHp);
  const selfLow = selfRatio < 0.3;
  const oppLow = oppRatio < 0.3;
  const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now / 180)); // ~2.8Hz

  // Soft backdrop so bars stay readable over the opponent field
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  const bgPad = 4;
  ctx.fillRect(x - bgPad, y - bgPad, barW + bgPad * 2 + 28, totalH + bgPad * 2);

  // TOP = opponent
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x, y, barW, barH);
  let oppFill = oppLow ? '#ff3333' : oppRatio < 0.55 ? '#ffcc33' : '#6f6';
  if (oppLow) {
    ctx.save();
    ctx.shadowColor = `rgba(255,40,40,${0.55 * pulse})`;
    ctx.shadowBlur = 10 * pulse;
    ctx.fillStyle = oppFill;
    ctx.globalAlpha = 0.65 + 0.35 * pulse;
    ctx.fillRect(x, y, barW * oppRatio, barH);
    ctx.restore();
  } else {
    ctx.fillStyle = oppFill;
    ctx.fillRect(x, y, barW * oppRatio, barH);
  }
  ctx.strokeStyle = oppLow ? `rgba(255,120,120,${0.5 + 0.5 * pulse})` : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = oppLow ? 1.5 : 1;
  ctx.strokeRect(x, y, barW, barH);
  ctx.font = `600 ${Math.max(8, barH - 1)}px sans-serif`;
  ctx.fillStyle = 'rgba(220,255,220,0.9)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('あいて', x + 4, y + barH * 0.5);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.fillText(`${Math.max(0, Math.ceil(oppHp))}`, x + barW - 4, y + barH * 0.5);

  // BOTTOM = self — lost-HP ghost drains slowly
  const ySelf = y + barH + gap;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x, ySelf, barW, barH);
  ctx.fillStyle = flash > 0 ? '#ff5533' : '#ff8844';
  ctx.fillRect(x, ySelf, barW * Math.max(0, ghost / maxHp), barH);
  if (selfLow) {
    ctx.save();
    ctx.shadowColor = `rgba(255,20,20,${0.7 * pulse})`;
    ctx.shadowBlur = 12 * pulse;
    ctx.fillStyle = '#ff2222';
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.fillRect(x, ySelf, barW * selfRatio, barH);
    ctx.restore();
  } else {
    ctx.fillStyle = selfRatio < 0.55 ? '#ffcc33' : '#33ee66';
    ctx.fillRect(x, ySelf, barW * selfRatio, barH);
  }
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.35 * Math.min(1, flash / 0.35)})`;
    ctx.fillRect(x, ySelf, barW * selfRatio, barH);
  }
  if (healFlash > 0) {
    const hf = Math.min(1, healFlash / 0.55);
    ctx.save();
    ctx.shadowColor = `rgba(80,255,160,${0.8 * hf})`;
    ctx.shadowBlur = 14 * hf;
    ctx.fillStyle = `rgba(160,255,210,${0.45 * hf})`;
    ctx.fillRect(x, ySelf, barW * selfRatio, barH);
    ctx.restore();
  }
  ctx.strokeStyle = selfLow
    ? `rgba(255,80,80,${0.55 + 0.45 * pulse})`
    : (healFlash > 0 ? `rgba(160,255,210,${0.7 + 0.3 * Math.min(1, healFlash / 0.55)})` : (flash > 0 ? '#fff' : 'rgba(255,255,255,0.65)'));
  ctx.lineWidth = selfLow || flash > 0 || healFlash > 0 ? 2 : 1;
  ctx.strokeRect(x, ySelf, barW, barH);
  ctx.font = `700 ${Math.max(9, barH)}px sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.max(0, Math.ceil(display))}`, x - 6, ySelf + barH * 0.5);
  ctx.textAlign = 'left';
  ctx.fillStyle = selfLow ? `rgba(255,160,160,${0.75 + 0.25 * pulse})` : 'rgba(255,255,200,0.9)';
  ctx.fillText('じぶん', x + 4, ySelf + barH * 0.5);
  if (selfLow) {
    ctx.textAlign = 'right';
    ctx.fillStyle = `rgba(255,90,90,${0.7 + 0.3 * pulse})`;
    ctx.font = `800 ${Math.max(8, barH - 1)}px sans-serif`;
    ctx.fillText('危険', x + barW - 4, ySelf + barH * 0.5);
  }
}

/** Persistent red edge vignette + tint while local HP is under 30%. */
function drawLowHpWarning(ctx, L, selfHp, maxHp = 100) {
  const ratio = Math.max(0, selfHp / maxHp);
  if (ratio >= 0.3 || ratio <= 0) return;
  const now = performance.now();
  const pulse = 0.5 + 0.5 * Math.sin(now / 220);
  // Stronger as HP drops further below 30%
  const danger = Math.min(1, (0.3 - ratio) / 0.3);
  const a = (0.12 + 0.18 * danger) * (0.65 + 0.35 * pulse);

  ctx.save();
  // Full-canvas edge vignette
  const g = ctx.createRadialGradient(
    L.W * 0.5, L.H * 0.45, L.W * 0.22,
    L.W * 0.5, L.H * 0.45, L.W * 0.78,
  );
  g.addColorStop(0, 'rgba(255,0,0,0)');
  g.addColorStop(0.55, `rgba(180,0,0,${a * 0.35})`);
  g.addColorStop(1, `rgba(120,0,0,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.W, L.H);

  // Own-field top/bottom red strips for an urgent frame
  const strip = Math.max(3, L.own.h * 0.035);
  ctx.fillStyle = `rgba(255, 40, 40, ${0.25 + 0.35 * pulse * danger})`;
  ctx.fillRect(L.own.x, L.own.y, L.own.w, strip);
  ctx.fillRect(L.own.x, L.own.y + L.own.h - strip, L.own.w, strip);
  ctx.fillRect(L.own.x, L.own.y, strip * 0.7, L.own.h);
  ctx.fillRect(L.own.x + L.own.w - strip * 0.7, L.own.y, strip * 0.7, L.own.h);
  ctx.restore();
}

function drawDamageFlash(ctx, L, flash) {
  if (!flash || flash <= 0) return;
  const a = Math.min(0.45, flash * 1.2);
  ctx.save();
  ctx.fillStyle = `rgba(255, 30, 30, ${a})`;
  // Own field vignette
  ctx.fillRect(L.own.x, L.own.y, L.own.w, L.own.h);
  ctx.restore();
}

function drawDamageNumbers(ctx, L, nums) {
  if (!nums || !nums.length) return;
  ctx.save();
  for (const n of nums) {
    const t = n.life / n.max;
    const x = L.own.x + n.x;
    const y = L.own.y + n.y * L.own.h;
    ctx.globalAlpha = Math.max(0, t);
    ctx.font = `900 ${Math.max(16, L.own.w * 0.07)}px sans-serif`;
    ctx.fillStyle = '#ff4444';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(n.text, x, y);
    ctx.fillText(n.text, x, y);
  }
  ctx.restore();
}

function drawDirectBeam(ctx, x0, y0, x1, y1, lifeRatio = 1, tint = 'own') {
  // Straight-line staccato bolts only (no sideways jitter = no "homing" look)
  // tint: 'own' = red upward (player), 'incoming' = purple downward (opponent)
  const now = performance.now();
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const boltLen = Math.max(16, Math.min(30, len * 0.1));
  const gap = boltLen * 0.5;
  const n = Math.max(4, Math.floor(len / (boltLen + gap)));
  const baseA = Math.max(0.3, Math.min(1, lifeRatio));
  const isIn = tint === 'incoming';
  const glow = isIn ? '#a040ff' : '#ff2040';
  const outer = isIn ? '#c060ff' : '#ff3355';
  const core = isIn ? '#f0e8ff' : '#ffe8f0';

  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = glow;

  for (let i = 0; i < n; i++) {
    const phase = (now / 28 + i * 1.7) % 1;
    if (phase > 0.58) continue;
    const t0 = i / n;
    const t1 = Math.min(1, t0 + boltLen / len);
    const ax = x0 + ux * len * t0;
    const ay = y0 + uy * len * t0;
    const bx = x0 + ux * len * t1;
    const by = y0 + uy * len * t1;
    const a = baseA * (0.55 + 0.45 * (1 - phase / 0.58));

    ctx.globalAlpha = a * 0.85;
    ctx.strokeStyle = outer;
    ctx.lineWidth = 7;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    ctx.globalAlpha = a;
    ctx.strokeStyle = core;
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  if ((now / 50) % 1 < 0.7) {
    const spark = 10 + 8 * Math.sin(now / 30);
    const g = ctx.createRadialGradient(x1, y1, 0, x1, y1, spark);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    if (isIn) {
      g.addColorStop(0.35, 'rgba(180,100,255,0.6)');
      g.addColorStop(1, 'rgba(120,0,200,0)');
    } else {
      g.addColorStop(0.35, 'rgba(255,90,110,0.6)');
      g.addColorStop(1, 'rgba(255,0,40,0)');
    }
    ctx.globalAlpha = baseA;
    ctx.fillStyle = g;

    ctx.beginPath();
    ctx.arc(x1, y1, spark, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLaser(ctx, player, fieldH) {
  if (player.activePower !== 'laser' || player.activeTimer <= 0) return;
  // Straight forward staccato bolts — NO vertical weave (that looked like homing)
  const now = performance.now();
  const x0 = player.x + 16;
  const y = player.y * fieldH;
  const maxX = Math.max(x0 + 40, fieldH * 2.2);
  const span = maxX - x0;
  const boltLen = 28;
  const spacing = 52;
  // Sliding wave of bolts moving purely on +X
  const scroll = (now * 0.55) % spacing;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = '#4af';

  for (let x = x0 + scroll; x < maxX; x += spacing) {
    // Blink each bolt briefly
    const phase = ((now / 30) + x * 0.05) % 1;
    if (phase > 0.55) continue;
    const a = 0.55 + 0.45 * (1 - phase / 0.55);
    const xA = x;
    const xB = Math.min(maxX, x + boltLen);

    ctx.globalAlpha = a * 0.9;
    ctx.strokeStyle = '#66ddff';
    ctx.lineWidth = 7;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(xA, y);
    ctx.lineTo(xB, y);
    ctx.stroke();

    ctx.globalAlpha = a;
    ctx.strokeStyle = '#eefcff';
    ctx.lineWidth = 2.4;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(xA, y);
    ctx.lineTo(xB, y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Control surface (操作画面): purple/blue nebula pad — not a full playfield.
 * Shows item slots, control ship, and optional touch crosshair (status lives in info pane).
 */

/** Canvas pixels per CSS pixel (DPR the canvas was sized with). */
function canvasCssScale(ctx) {
  const c = ctx.canvas;
  const cw = c && c.clientWidth;
  return cw ? Math.max(1, c.width / cw) : 1;
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

/** Largest font (step down from maxFs to minFs) where every line fits maxW on one line. */
function fitFontSize(ctx, texts, maxW, maxFs, minFs, fontStack, weight) {
  let fs = maxFs;
  for (; fs > minFs; fs -= 1) {
    ctx.font = `${weight} ${fs}px ${fontStack}`;
    if (texts.every((t) => ctx.measureText(t).width <= maxW)) return fs;
  }
  ctx.font = `${weight} ${minFs}px ${fontStack}`;
  return minFs;
}

/** Break text into ≤2 lines (prefers breaking at spaces / before （), char-level for JP. */
function splitTwo(ctx, text, maxW) {
  const chars = Array.from(text);
  let cut = 0;
  let w = 0;
  for (let i = 0; i < chars.length; i++) {
    w = ctx.measureText(chars.slice(0, i + 1).join('')).width;
    if (w > maxW) break;
    cut = i + 1;
  }
  if (cut >= chars.length) return [text];
  // Prefer a natural break point in the back half of line 1
  for (let i = cut; i > cut * 0.5; i--) {
    const ch = chars[i];
    if (ch === ' ' || ch === '　' || ch === '（' || ch === '(' || ch === '/' || chars[i - 1] === '：' || chars[i - 1] === '、') {
      cut = i;
      break;
    }
  }
  const l1 = chars.slice(0, cut).join('').trimEnd();
  const l2 = chars.slice(cut).join('').trimStart();
  return [l1, ellipsize(ctx, l2, maxW)];
}

/**
 * Fit text into maxW: one line at up to oneLineFs, else two lines at up to twoLineFs,
 * shrinking down to minFs; truncates with … if still too long.
 */
function wrapToFit(ctx, text, maxW, oneLineFs, minFs, fontStack, weight, twoLineFs = oneLineFs) {
  for (let fs = oneLineFs; fs >= Math.max(minFs, oneLineFs * 0.8); fs -= 1) {
    ctx.font = `${weight} ${fs}px ${fontStack}`;
    if (ctx.measureText(text).width <= maxW) return { lines: [text], fs };
  }
  for (let fs = twoLineFs; fs >= minFs; fs -= 1) {
    ctx.font = `${weight} ${fs}px ${fontStack}`;
    const lines = splitTwo(ctx, text, maxW);
    if (lines.length === 1 || !lines[1].endsWith('…')) return { lines, fs };
  }
  ctx.font = `${weight} ${minFs}px ${fontStack}`;
  return { lines: splitTwo(ctx, text, maxW), fs: minFs };
}

/**
 * Bottom information pane (~20%): status, HP, layout guide.
 */
function drawInfoPanel(ctx, area, localState) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  ctx.translate(area.x, area.y);

  // Dark readable panel
  const g = ctx.createLinearGradient(0, 0, 0, area.h);
  g.addColorStop(0, '#1a1428');
  g.addColorStop(1, '#0c0a14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, area.w, area.h);

  // Top edge highlight
  ctx.fillStyle = 'rgba(200, 210, 255, 0.35)';
  ctx.fillRect(0, 0, area.w, 2);

  const fontStack = '"Hiragino Sans","Noto Sans JP","Yu Gothic",Meiryo,sans-serif';
  const selfHp = Math.max(0, Math.round(localState.player?.hp ?? 100));
  const oppHp = Math.max(0, Math.round(
    localState.oppHpDisplay ?? localState.botHp ?? 100
  ));
  const status = localState.statusText || '';

  // Status / item information line (item names, pickups, usage announcements
  // live HERE — never over the stages). Wraps to ≤2 lines inside its box.
  const u = canvasCssScale(ctx);
  const boxX = area.w * 0.03;
  const boxY = area.h * 0.05;
  const boxW = area.w * 0.94;
  const boxH = area.h * 0.45;
  const tut = localState.tutorial;
  const tutOn = !!(tut && tut.total > 0 && tut.i < tut.total);
  const ban = localState.itemBanner;
  const banOn = !tutOn && !!(ban && ban.life > 0 && ban.text);
  const textW = boxW - Math.max(10 * u, boxW * 0.04);
  const baseFs = Math.max(12 * u, Math.min(20 * u, boxH * 0.4));
  const minFs = Math.max(11 * u, Math.min(13 * u, boxH * 0.26));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (tutOn) {
    // In-battle tutorial card (info pane only — never on the stage)
    const head = `チュートリアル ${tut.i + 1}/${tut.total}　【${tut.title || '案内'}】`;
    const body = tut.text || '';
    const foot = '左タップ：次へ　　右タップ：とばす';
    ctx.save();
    ctx.fillStyle = 'rgba(8, 24, 48, 0.78)';
    roundRect(ctx, boxX, boxY, boxW, boxH, 8 * u);
    ctx.fill();
    ctx.strokeStyle = '#6cf0ff';
    ctx.lineWidth = Math.max(1.5, 2.2 * u);
    roundRect(ctx, boxX, boxY, boxW, boxH, 8 * u);
    ctx.stroke();
    // progress bar
    const prog = (tut.i + Math.max(0, Math.min(1, 1 - tut.life / 3.8))) / tut.total;
    ctx.fillStyle = 'rgba(108, 240, 255, 0.35)';
    ctx.fillRect(boxX + 4 * u, boxY + boxH - 5 * u, (boxW - 8 * u) * prog, 3 * u);
    const fsHead = fitFontSize(ctx, [head], textW, Math.min(baseFs, boxH * 0.28), minFs, fontStack, 800);
    ctx.font = `800 ${fsHead}px ${fontStack}`;
    ctx.fillStyle = '#9ef6ff';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3 * u;
    ctx.fillText(ellipsize(ctx, head, textW), area.w * 0.5, boxY + boxH * 0.28);
    const fsBody = fitFontSize(ctx, [body], textW, Math.min(baseFs, boxH * 0.32), minFs, fontStack, 700);
    ctx.font = `700 ${fsBody}px ${fontStack}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ellipsize(ctx, body, textW), area.w * 0.5, boxY + boxH * 0.58);
    const fsFoot = Math.max(9 * u, Math.min(12 * u, boxH * 0.18));
    ctx.font = `600 ${fsFoot}px ${fontStack}`;
    ctx.fillStyle = 'rgba(200, 230, 255, 0.85)';
    ctx.fillText(foot, area.w * 0.5, boxY + boxH * 0.84);
    ctx.restore();
  } else if (banOn) {
    const a = Math.max(0, Math.min(1, ban.life / 0.35));
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * a;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    roundRect(ctx, boxX, boxY, boxW, boxH, 8 * u);
    ctx.fill();
    ctx.strokeStyle = ban.color || '#ffd24a';
    ctx.lineWidth = Math.max(1.5, 2 * u);
    roundRect(ctx, boxX, boxY, boxW, boxH, 8 * u);
    ctx.stroke();
    // Secondary detail (e.g. send result) when it differs from the item line
    const extra = (status && status !== ban.text && !/^敵を倒して/.test(status)) ? status : '';
    let lines;
    let fs;
    if (extra) {
      fs = fitFontSize(ctx, [ban.text, extra], textW, Math.min(baseFs, boxH * 0.34), minFs, fontStack, 800);
      lines = [ellipsize(ctx, ban.text, textW), ellipsize(ctx, extra, textW)];
    } else {
      ({ lines, fs } = wrapToFit(ctx, ban.text, textW, baseFs, minFs, fontStack, 800, Math.min(baseFs, boxH * 0.36)));
    }
    ctx.font = `800 ${fs}px ${fontStack}`;
    const lh = fs * 1.2;
    const cy = boxY + boxH * 0.5;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3 * u;
    for (let i = 0; i < lines.length; i++) {
      const y = cy + (i - (lines.length - 1) / 2) * lh;
      ctx.fillStyle = i === 0 ? '#ffffff' : '#ffe9a8';
      ctx.fillText(lines[i], area.w * 0.5, y);
    }
    ctx.restore();
  } else if (status) {
    const { lines, fs } = wrapToFit(ctx, status, textW, baseFs, minFs, fontStack, 700, Math.min(baseFs, boxH * 0.36));
    ctx.font = `700 ${fs}px ${fontStack}`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 5;
    const lh = fs * 1.2;
    const cy = boxY + boxH * 0.5;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], area.w * 0.5, cy + (i - (lines.length - 1) / 2) * lh);
    }
    ctx.shadowBlur = 0;
  }

  // Self / opponent HP (warn when under 30%)
  const hpFs = Math.max(12, Math.min(18, area.h * 0.2));
  ctx.font = `600 ${hpFs}px ${fontStack}`;
  ctx.textAlign = 'left';
  const selfLow = selfHp < 30;
  const oppLow = oppHp < 30;
  const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(performance.now() / 200));
  ctx.fillStyle = selfLow ? `rgba(255,70,70,${0.75 + 0.25 * pulse})` : '#88ffaa';
  ctx.fillText(selfLow ? `自分 HP ${selfHp} 危険` : `自分 HP ${selfHp}`, area.w * 0.04, area.h * 0.62, area.w * 0.44);
  ctx.textAlign = 'right';
  ctx.fillStyle = oppLow ? `rgba(255,100,120,${0.75 + 0.25 * pulse})` : '#ff8899';
  ctx.fillText(oppLow ? `相手 HP ${oppHp} 危険` : `相手 HP ${oppHp}`, area.w * 0.96, area.h * 0.62, area.w * 0.44);

  // Compact layout labels
  const labFs = Math.max(10, Math.min(14, area.h * 0.14));
  ctx.font = `500 ${labFs}px ${fontStack}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(210, 220, 255, 0.75)';
  ctx.fillText('上:相手｜中:自分｜下:操作', area.w * 0.5, area.h * 0.86, area.w * 0.94);

  ctx.restore();
}

function drawControlPanel(ctx, area, localState) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  ctx.translate(area.x, area.y);

  ctrlNebula(ctx, area.w, area.h, (localState.scroll || 0) * 0.4, 5);

  // Soft darkening so it reads as a pad, not another playfield
  ctx.fillStyle = 'rgba(10, 8, 28, 0.22)';
  ctx.fillRect(0, 0, area.w, area.h);

  // Top edge highlight (divider feel)
  ctx.fillStyle = 'rgba(180, 190, 255, 0.28)';
  ctx.fillRect(0, 0, area.w, 2);

  // Control ship — touch this to move (mirrors playfield position)
  const touch = localState.ctrlTouch || {};
  const p = localState.player || {};
  const sx = (touch.x != null ? touch.x : 0.14) * area.w;
  const sy = (touch.y != null ? touch.y : (p.y <= 1 ? p.y : 0.5)) * area.h;
  const shipW = Math.max(34, area.w * 0.12);
  const shipH = Math.max(22, area.h * 0.14);
  // Grab hint ring
  ctx.strokeStyle = touch.active ? 'rgba(120, 220, 255, 0.75)' : 'rgba(200, 220, 255, 0.4)';
  ctx.lineWidth = touch.active ? 2.5 : 1.5;
  ctx.setLineDash(touch.active ? [] : [4, 4]);
  ctx.beginPath();
  ctx.arc(sx, sy, Math.max(shipW, shipH) * 0.85, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  drawShip(ctx, sx, sy, shipW, shipH, '#e8f0ff');
  // Label
  ctx.font = `600 ${Math.max(10, area.h * 0.07)}px "Hiragino Sans","Noto Sans JP",sans-serif`;
  ctx.fillStyle = 'rgba(230,240,255,0.75)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(touch.active ? 'ドラッグ中（他の指で発動可）' : '自機をドラッグ', sx, sy + shipH * 0.7);

  // Vertical item slots (max 3) on the right — button + description under each
  const items = (localState.player && localState.player.items) || [];
  const slots = itemSlotRects({ x: 0, y: 0, w: area.w, h: area.h }, MAX_ITEM_SLOTS);
  if (slots.length) {
    const head = slots[0];
    const hFs = Math.max(11, Math.min(15, area.h * 0.06));
    ctx.font = `700 ${hFs}px "Hiragino Sans","Noto Sans JP",sans-serif`;
    ctx.fillStyle = 'rgba(180, 230, 255, 0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.fillText(`アイテム 最大${MAX_ITEM_SLOTS}`, head.x + head.w * 0.5, head.y - 3);
    ctx.shadowBlur = 0;
  }
  for (let i = 0; i < slots.length; i++) {
    const r = slots[i];
    const id = items[i];
    const filled = !!id;
    const st = filled ? (ITEM_STYLE[id] || { color: '#ffd24a', icon: '?', label: '?', effect: '' }) : null;

    // Button body
    ctx.fillStyle = filled ? 'rgba(255, 210, 74, 0.32)' : 'rgba(60, 70, 110, 0.35)';
    ctx.strokeStyle = filled ? (st.color || 'rgba(255,230,140,0.95)') : 'rgba(160,170,210,0.45)';
    ctx.lineWidth = filled ? 3 : 1.5;
    roundRect(ctx, r.btnX, r.btnY, r.btnW, r.btnH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = filled ? 3 : 0;
    if (filled) {
      const iconFs = Math.max(16, Math.min(26, r.btnH * 0.42));
      ctx.font = `700 ${iconFs}px "Hiragino Sans","Noto Sans JP",sans-serif`;
      ctx.fillStyle = '#fff8e0';
      ctx.fillText(`${st.icon} ${st.label || ''}`, r.btnX + r.btnW * 0.5, r.btnY + r.btnH * 0.45);
    } else {
      ctx.font = `600 ${Math.max(11, r.btnH * 0.28)}px "Hiragino Sans","Noto Sans JP",sans-serif`;
      ctx.fillStyle = 'rgba(200,210,240,0.55)';
      ctx.fillText(`空 ${i + 1}/${MAX_ITEM_SLOTS}`, r.btnX + r.btnW * 0.5, r.btnY + r.btnH * 0.5);
    }
    ctx.shadowBlur = 0;

    // Description under button — large + high-contrast
    const descFs = Math.max(14, Math.min(20, r.w * 0.125));
    const descH = Math.max(descFs + 10, r.h - r.btnH - 4);
    ctx.fillStyle = filled ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.28)';
    roundRect(ctx, r.btnX, r.descY - 2, r.btnW, descH, 8);
    ctx.fill();
    ctx.font = `700 ${descFs}px "Hiragino Sans","Noto Sans JP",sans-serif`;
    ctx.fillStyle = filled ? '#fff8d0' : 'rgba(200,210,240,0.65)';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 2;
    ctx.fillText(filled ? (st.effect || '') : '空', r.btnX + r.btnW * 0.5, r.descY - 2 + descH * 0.5, r.btnW * 0.94);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draw one field into a clipped region. `snap` is local state or remote snapshot. */
export function drawField(ctx, area, snap, opts = {}) {
  const { darkened = false } = opts;
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  ctx.translate(area.x, area.y);

  const fw = area.w;
  const fh = area.h;
  const sx = snap._sx || 1;
  const sy = snap._sy || 1;

  // Bomb: brief shake of THIS stage pane only + full-pane flash (see drawBombFx)
  const bombPane = bombPaneFx(snap.fx || [], sx);
  if (bombPane.sx || bombPane.sy) {
    ctx.fillStyle = '#1a0806';
    ctx.fillRect(0, 0, fw, fh);
    ctx.translate(bombPane.sx, bombPane.sy);
  }

  nebula(ctx, fw, fh, (snap.scroll || 0) * (darkened ? 0.7 : 1), darkened ? 7 : 0);

  // Opponent view: same fiery nebula, ~20% darker — NOT a purple starfield
  if (darkened) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(0, 0, fw, fh);
  }

  const enemies = snap.enemies || [];
  for (const e of enemies) {
    drawEnemy(ctx, {
      x: e.x * sx, y: e.y * sy, w: (e.w || 20) * sx, h: (e.h || 16) * sy,
      kind: e.kind, hp: e.hp, maxHp: e.maxHp || e.hp || 1, color: e.c || e.color || '#c44', sent: e.s || e.sent,
      appearT: e.appearT ?? e.at, appearMax: e.appearMax || 0.9, _uid: e._uid,
      laserTeleT: e.laserTeleT ?? e.lt, laserTeleMax: e.laserTeleMax ?? e.lm ?? 0.55,
      laserAimX: (e.laserAimX ?? e.ax) != null ? (e.laserAimX ?? e.ax) * sx : undefined,
      laserAimY: (e.laserAimY ?? e.ay) != null ? (e.laserAimY ?? e.ay) * sy : undefined,
      laserTeleOffs: Array.isArray(e.laserTeleOffs ?? e.lo) ? (e.laserTeleOffs ?? e.lo).map((o) => o * sy) : undefined,
    });
  }

  const bullets = snap.bullets || [];
  for (const b of bullets) {
    drawBullet(ctx, {
      x: b.x * sx, y: b.y * sy, owner: b.o || b.owner, homing: b.h || b.homing, r: (b.r || 3) * Math.min(sx, sy), vx: b.vx, vy: b.vy,
      laser: !!(b.L || b.laser), k: b.k, st: b.st,
      trail: Array.isArray(b.trail) ? b.trail.map((p) => ({ x: p.x * sx, y: p.y * sy })) : undefined,
    });
  }

  const items = snap.worldItems || [];
  for (const it of items) drawItem(ctx, { x: it.x * sx, y: it.y * sy, id: it.id, life: it.life });

  const meteors = snap.meteors || [];
  for (const m of meteors) {
    drawMeteor(ctx, {
      x: m.x * sx,
      y: m.y * sy,
      r: (m.r || 16) * Math.min(sx, sy),
      rot: m.rot || 0,
    });
  }

  // Bomb charge-up: stage dims as the energy gathers (drawn under the FX so the implosion glows)
  if (bombPane.dark > 0) {
    ctx.fillStyle = `rgba(0,0,0,${bombPane.dark})`;
    ctx.fillRect(-60, -60, fw + 120, fh + 120);
  }

  const fx = snap.fx || [];
  for (const f of fx) {
    const tg = f.t || null;
    drawFx(ctx, {
      x: f.x * sx, y: f.y * sy, life: f.l ?? f.life, max: f.m ?? f.max, r: (f.r || 14) * sx,
      kind: f.k ?? f.kind, sc: sx,
      t: tg ? tg.map(([tx, ty]) => [tx * sx, ty * sy]) : undefined,
      a: f.a,
    });
  }

  // player
  const p = snap.player || { x: snap.px ?? 48, y: snap.py ?? 0.5 };
  const py = (p.y <= 1 ? p.y * fh : p.y * sy);
  const px = (p.x || snap.px || 48) * (p.x && p.x > 1 ? sx : 1);
  if (snap.alive !== false) {
    const invulnBlink = !darkened && snap.invuln > 0 && Math.floor(performance.now() / 60) % 2 === 0;
    const hpVal = snap.player?.hp ?? snap.php;
    const lowHp = !darkened && hpVal != null && hpVal / (snap.player?.maxHp || 150) < 0.3;
    // Slow danger blink when under 30% (does not hide ship completely)
    const lowBlink = lowHp && Math.floor(performance.now() / 140) % 2 === 0;
    const blink = invulnBlink;
    const facingUp = !darkened && snap.player && snap.player.activePower === 'direct' && snap.player.activeTimer > 0;
    const facingDown = darkened && snap.directBeam; // opponent firing down at us
    const ang = facingUp ? -Math.PI / 2 : (facingDown ? Math.PI / 2 : 0);
    let shipColor = darkened ? '#cde' : (snap.invuln > 0 ? '#ffaaaa' : '#e8f0ff');
    if (lowHp) shipColor = lowBlink ? '#ff6688' : '#ff3344';
    if (!blink) drawShip(ctx, px, py, 28 * Math.min(sx, 1.2), 18 * Math.min(sy, 1.2), shipColor, 1, ang);
    if (!darkened && snap.player) drawLaser(ctx, snap.player, fh);
    // Own-pane part of upward direct beam
    if (facingUp) {
      const lr = Math.min(1, snap.player.activeTimer / 0.85);
      drawDirectBeam(ctx, px, py - 16, px, 8, lr);
    }
  }

  // Bomb detonation: white → orange full-pane flash, then a fading warm tint
  if (bombPane.flash > 0 || bombPane.tint > 0) {
    const m = 60; // cover the shake offset margin

    if (bombPane.tint > 0) {
      ctx.fillStyle = `rgba(255,110,30,${bombPane.tint})`;
      ctx.fillRect(-m, -m, fw + m * 2, fh + m * 2);
    }
    if (bombPane.flash > 0) {
      const fl = bombPane.flash;
      ctx.fillStyle = `rgba(255,${Math.round(200 + 55 * fl)},${Math.round(120 + 135 * fl)},${fl})`;
      ctx.fillRect(-m, -m, fw + m * 2, fh + m * 2);
    }
  }

  ctx.restore();
}

export function renderFrame(ctx, L, localState, remoteSnap, waiting) {
  ctx.clearRect(0, 0, L.W, L.H);

  const localSnap = {
    player: localState.player,
    invuln: localState.player && localState.player.invuln,
    enemies: localState.enemies,
    bullets: localState.bullets,
    worldItems: localState.items,
    fx: localState.fx,
    meteors: localState.meteors,
    scroll: localState.scroll,
    alive: localState.alive,
  };

  // 1) TOP — opponent live view (same fiery nebula, slightly dimmer)
  let oppDraw;
  if (remoteSnap) {
    const sx = L.opp.w / (remoteSnap._fw || L.own.w);
    const sy = L.opp.h / (remoteSnap._fh || L.own.h);
    oppDraw = { ...remoteSnap, _sx: sx, _sy: sy, player: { x: remoteSnap.px, y: remoteSnap.py } };
  } else {
    oppDraw = localState.botSnap || {
      scroll: localState.scroll * 0.9,
      enemies: [],
      bullets: [],
      fx: [],
      px: 48,
      py: 0.5,
      php: localState.botHp ?? 100,
      alive: true,
      _sx: L.opp.w / L.own.w,
      _sy: L.opp.h / L.own.h,
    };
  }
  drawField(ctx, L.opp, oppDraw, { darkened: true });

  // 2) MIDDLE — player's own gameplay field (display)
  drawField(ctx, L.own, localSnap, { darkened: false });

  // Cross-pane direct-attack beam (own ship → opponent)
  const pl = localState.player;
  if (pl && pl.activePower === 'direct' && pl.activeTimer > 0) {
    const px = L.own.x + (pl.x || 48);
    const py = L.own.y + (pl.y <= 1 ? pl.y * L.own.h : pl.y);
    const lr = Math.min(1, pl.activeTimer / 0.85);
    // Straight UP only (same X) — never slant toward opponent ship
    drawDirectBeam(ctx, px, L.own.y + 4, px, L.opp.y + L.opp.h * 0.45, lr);
  }
  // Incoming: FROM opponent pane DOWN onto us. Spark must be at the TOP
  // (never at our ship — that looked like we were firing upward with no item).
  if (localState.incomingDirect && localState.incomingDirect > 0) {
    const lr = Math.min(1, localState.incomingDirect / 0.85);
    const px = L.own.x + (pl.x || 48);
    const py = L.own.y + (pl.y <= 1 ? pl.y * L.own.h : pl.y);
    // Endpoint (spark) = opponent side; start = just above our ship
    drawDirectBeam(ctx, px, py - 10, px, L.opp.y + 12, lr, 'incoming');
  }


  drawDamageFlash(ctx, L, localState.damageFlash);
  const playerMaxHp = localState.player.maxHp || 150;
  drawLowHpWarning(ctx, L, localState.player.hp, playerMaxHp);
  drawDamageNumbers(ctx, L, localState.damageNumbers);

  // Divider between opp and own
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, L.oppH - 2, L.W, 3);
  ctx.fillStyle = 'rgba(255,200,150,0.25)';
  ctx.fillRect(0, L.oppH - 1, L.W, 1);

  // HP bars at bottom of opponent pane (above divider; keeps own playfield clear)
  const oppHp = remoteSnap ? (remoteSnap.php ?? playerMaxHp) : (localState.botHp ?? playerMaxHp);
  drawHpBarsAtBoundary(ctx, L, localState.player.hp, oppHp, playerMaxHp, {
    hpGhost: localState.hpGhost,
    hpDisplay: localState.hpDisplay,
    hpShake: localState.hpShake,
    damageFlash: localState.damageFlash,
    healFlash: localState.healFlash,
  });

  // 3) Control — 操作画面 (purple/blue nebula pad)
  drawControlPanel(ctx, L.ctrl, localState);

  // Divider between own and control
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, L.oppH + L.ownH - 1, L.W, 2);

  // Divider above info + 4) info pane
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, L.oppH + L.ownH + L.ctrlH - 1, L.W, 2);
  ctx.fillStyle = 'rgba(180,190,255,0.3)';
  ctx.fillRect(0, L.oppH + L.ownH + L.ctrlH, L.W, 1);
  drawInfoPanel(ctx, L.info, { ...localState, oppHpDisplay: oppHp });

  // Item effect announcements are drawn inside the info pane (drawInfoPanel),
  // never over the opponent / own stages.

  if (waiting) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, L.W, L.H);
  }
}


