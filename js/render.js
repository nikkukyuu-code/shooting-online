/** Canvas rendering for 4-pane portrait shmup
 *  TOP opp / MIDDLE own / BOTTOM-ish ctrl (操作) / BOTTOM info — info 20%, remaining 80% split equally
 */
import { EX_ITEM_STYLE, drawExFx } from './attack_items.js?v=20261006034323';

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
  send:       { color: '#ff8844', icon: '⇒',  label: '敵送信', effect: 'デッキから2体' },
  direct:     { color: '#ff3333', icon: '※',  label: '直撃',   effect: '相手画面の下から通常弾' },
  heal:       { color: '#44ff88', icon: '+',  label: '回復',   effect: 'HP+25' },
  heal_big:   { color: '#22ff66', icon: '++', label: '大回復', effect: 'HP+50' },
  send_mech:  { color: '#88aaff', icon: '艦',  label: '戦艦',   effect: '戦艦級1体' },
  send_golem: { color: '#cc88ff', icon: '塞',  label: '要塞',   effect: '要塞級1体' },
  send_tank:  { color: '#66ddff', icon: '砲',  label: '砲艦',   effect: 'ガンシップ級1体' },
  send_drone: { color: '#33ffff', icon: '群',  label: '無人機', effect: '小型機4機' },
  ram:        { color: '#ff90b0', icon: '突',  label: '体当',   effect: '操作して体当たり' },
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

/**
 * Battle background as in the original footage: plain black, small sparse stars scrolling right → left
 * in 3 depth layers; now and then a star twinkles. Deterministic per seed, ~50 rects per frame (light).
 */
const STAR_LAYERS = [
  { n: 30, spd: 0.22, sz: 1, a: 0.38 },
  { n: 16, spd: 0.5, sz: 1.3, a: 0.55 },
  { n: 7, spd: 1.0, sz: 1.8, a: 0.75 },
];
function nebula(ctx, w, h, scroll, seed = 0) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const t = performance.now() / 1000;
  const k = Math.max(1, Math.min(w, h * 2) / 360); // star size follows canvas scale (DPR)
  ctx.save();
  let idx = 0;
  for (const L of STAR_LAYERS) {
    for (let i = 0; i < L.n; i++, idx++) {
      const h1 = Math.sin((idx + 1) * 12.9898 + seed * 78.233) * 43758.5453;
      const h2 = Math.sin((idx + 1) * 39.3468 + seed * 11.135) * 24634.6345;
      const fx = h1 - Math.floor(h1), fy = h2 - Math.floor(h2);
      const span = w + 8;
      const x = (((fx * span - scroll * L.spd) % span) + span) % span - 4;
      const y = fy * h;
      // twinkle: brief brightening, each star on its own slow cycle (only a few at any time)
      const tw = Math.sin(t * (0.7 + fx * 0.9) + fy * 40);
      const bright = tw > 0.965;
      ctx.globalAlpha = bright ? 1 : L.a;
      ctx.fillStyle = bright ? '#ffffff' : (idx % 5 === 0 ? '#c8d4ff' : '#d8d8d8');
      const s = (L.sz + (bright ? 1 : 0)) * k * 0.5;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      if (bright) { ctx.globalAlpha = 0.35; ctx.fillRect(x - s * 1.5, y - s / 4, s * 3, s / 2); ctx.fillRect(x - s / 4, y - s * 1.5, s / 2, s * 3); }
    }
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

/** 体当たり変身: bulkier armored drill (video ~4:45). */
/** 体当たり変身: reddish/pink distorted energy hull (user_ref / ref2 ~4:45). */
function drawRamShip(ctx, x, y, w, h, t) {
  // video ~4:45: reddish/pink distorted energy mass with jagged white/cyan fringe (not cyan hull)
  ctx.save();
  ctx.translate(x, y);
  const wob = Math.sin(t * 22) * 0.12;
  const wob2 = Math.cos(t * 17) * 0.1;
  // outer jagged white-cyan distortion fringe (video aura)
  ctx.fillStyle = 'rgba(200,230,255,0.28)';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + t * 3;
    const rr = w * (0.72 + 0.18 * Math.sin(t * 15 + i * 1.7));
    const px = Math.cos(a) * rr * 1.05, py = Math.sin(a) * h * 0.85 * (0.9 + 0.2 * Math.sin(i + t * 9));
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  // pink/red distorted body
  ctx.fillStyle = '#ff4a78';
  ctx.beginPath();
  ctx.moveTo(w * 0.68, 0);
  ctx.bezierCurveTo(w * 0.35, -h * (0.95 + wob), -w * 0.05, -h * (0.7 + wob2), -w * 0.55, -h * 0.25);
  ctx.bezierCurveTo(-w * 0.85, 0, -w * 0.55, h * 0.25, -w * 0.05, h * (0.7 - wob2));
  ctx.bezierCurveTo(w * 0.35, h * (0.95 - wob), w * 0.68, 0, w * 0.68, 0);
  ctx.closePath(); ctx.fill();
  // hotter magenta mid
  ctx.fillStyle = '#ff78a0';
  ctx.beginPath(); ctx.ellipse(w * 0.05, 0, w * 0.38, h * 0.42, wob * 0.4, 0, Math.PI * 2); ctx.fill();
  // white-hot core
  const cg = ctx.createRadialGradient(w * 0.08, -h * 0.05, 0, w * 0.05, 0, w * 0.4);
  cg.addColorStop(0, 'rgba(255,255,255,0.98)');
  cg.addColorStop(0.3, 'rgba(255,200,220,0.9)');
  cg.addColorStop(0.65, 'rgba(255,70,110,0.55)');
  cg.addColorStop(1, 'rgba(180,20,60,0)');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.ellipse(w * 0.06, 0, w * 0.36, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  // flicker outline
  ctx.strokeStyle = `rgba(255,40,100,${0.65 + 0.35 * Math.sin(t * 24)})`;
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.ellipse(0, 0, w * (0.58 + wob * 0.08), h * (0.68 + wob2 * 0.08), 0, 0, Math.PI * 2); ctx.stroke();
  // trailing pink wake (only when moving — drawn always as form signature)
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `rgba(255,90,140,${0.4 - i * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(-w * (0.7 + i * 0.38), Math.sin(t * 10 + i) * 2, w * 0.26, h * (0.32 - i * 0.05), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // invincible shimmer (tasteful white/cyan pulse rim)
  const sh = 0.35 + 0.25 * Math.sin(t * 10);
  ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(t * 14)})`;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 4]);
  ctx.lineDashOffset = -t * 40;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * (0.72 + 0.04 * Math.sin(t * 8)), h * (0.82 + 0.04 * Math.cos(t * 7)), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = `rgba(180,230,255,${sh})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.62, h * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}


function drawHpPip(ctx, e) {
  const pct = Math.max(0, e.hp / (e.maxHp || e.hp || 1));
  // Prefer above the unit; if that would clip past the field top, pin just inside.
  let pipY = -e.h * 0.78;
  if (typeof e.y === 'number' && e.y + pipY < 6) pipY = Math.min(e.h * 0.55, -e.y + 6);
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(-e.w * 0.45, pipY, e.w * 0.9, 6);
  ctx.fillStyle = pct < 0.35 ? '#ff4444' : '#33ee66';
  ctx.fillRect(-e.w * 0.45, pipY, e.w * 0.9 * pct, 6);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(-e.w * 0.45, pipY, e.w * 0.9, 6);
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
  return `assets/enemies/${kind}/${frame}.png?v=20261006034323`;
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
for (const id of ['gunship_alpha', 'light_destroyer', 'swarm', 'fighter_mk2', 'drone', 'scout_drone', 'stealth_corvette', 'plasma_bomber', 'scout_frigate', 'gunship_alpha_b']) loadKindSprite(id);

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

/**
 * Wave-only brushed-up sprites (redraws of Sakata's スタートリックオンライン enemies), facing left.
 * assets/enemies/<wave kind>/0.png — body only for core kinds (the live core / drones / claws are
 * drawn on top so hitbox offsets stay exact). Procedural art is the fallback until loaded.
 */
const WAVE_SPRITE_KINDS = ['wave_escort', 'wave_mech', 'wave_core_boss', 'wave_swarm_core', 'wave_eye_boss',
  'wave_striker_pivot', 'wave_striker_link', 'wave_striker_tip', 'wave_striker_saw', 'wave_ring_crab',
  'snake_seg', 'snake_pivot', 'snake_head_art', 'snake_redball', 'snake_portal'];
const waveSprites = Object.create(null);
for (const k of WAVE_SPRITE_KINDS) {
  const img = new Image();
  img.decoding = 'async';
  img.src = enemyAssetUrl(k, 0);
  waveSprites[k] = img;
}
function waveSprite(kind) {
  const img = waveSprites[kind];
  return img && img.complete && img.naturalWidth ? img : null;
}
/** 10-05: 透明戦隊 hit/death explosion = the real frames of the reference video (a6faf877 181.07-182.20 s,
 *  17 source frames at 15 fps), background matted out (black body disk kept), nearest-neighbour ×6. One frame = 40×36 video px
 *  (240×216 in the sheet); the unit's centre sits at (16, 18) video px; the unit radius is 9.75 video px. */
const BUBBLE_BOOM = { img: null, n: 17, fw: 240, fh: 216, cx: 16, cy: 18, vw: 40, vh: 36, vr: 9.75, fps: 15 };
/** Hit ring = the video's own 1-px ring (180.47 s, 21×21 video px, centre 10.5, ×6 nearest). */
const BUBBLE_RING = { img: null, n: 21, c: 10.5 };
if (typeof Image !== 'undefined') {
  const im = new Image(); im.decoding = 'async'; im.src = 'assets/fx/bubble_boom.png?v=20261006034323'; BUBBLE_BOOM.img = im;
  const ri = new Image(); ri.decoding = 'async'; ri.src = 'assets/fx/bubble_ring.png?v=20261006034323'; BUBBLE_RING.img = ri;
}
/** Scripted-wave units that borrow a catalog sprite (e.spr) — spider / looper / saucer / ring pods. */
const SCRIPT_SPRITES = ['gunship_alpha', 'light_destroyer', 'swarm', 'fighter_mk2'];
function scriptSprite(id) {
  if (!enemySprites[id]) loadKindSprite(id);
  const img = enemySprites[id] && enemySprites[id][ENEMY_STATIC_FRAME];
  return img && img.complete && img.naturalWidth ? img : null;
}
const CORE_DRAW_KINDS = new Set(['wave_core_boss', 'wave_swarm_core', 'wave_eye_boss', 'wave_grid_core', 'wave_ring_core', 'wave_snake_head']);
/** Draw sprite centred, aspect kept, fitted inside bw×bh. */
function drawFit(ctx, img, bw, bh, flash) {
  const k = Math.min(bw / img.naturalWidth, bh / img.naturalHeight);
  const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
  if (flash) ctx.filter = 'brightness(1.6)';
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  if (flash) ctx.filter = 'none';
}
function drawCoreSpriteBody(ctx, e, kind, w, h, t, flash) {
  if (kind === 'wave_ring_core') {
    // Ring (video 1:48–2:10): 14 little red crab fighters, all facing left, in a loose loop
    const pod = waveSprite('wave_ring_crab');
    for (const d of e.drones || []) {
      if (d.hp <= 0) continue;
      ctx.save();
      ctx.translate(Math.cos(d.ang) * d.dist, Math.sin(d.ang) * d.dist * (d.ky || 1));
      if (d.w) { ctx.strokeStyle = `rgba(255,60,40,${Math.sin(t * 24) > 0 ? 0.9 : 0.3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, d.r * 1.7, 0, Math.PI * 2); ctx.stroke(); }
      if (pod) drawFit(ctx, pod, d.r * 2.9, d.r * 2.2, false);
      else { ctx.fillStyle = '#d8283a'; ctx.beginPath(); ctx.arc(0, 0, d.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // the red core orb carries yellow spikes (as in the video)
    if (e.core && e.core.hp > 0) {
      ctx.save(); ctx.translate(e.core.ox || 0, e.core.oy || 0); ctx.rotate(t * 1.3);
      ctx.fillStyle = '#ffd23a';
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath(); ctx.moveTo(8, -2.2); ctx.lineTo(15, 0); ctx.lineTo(8, 2.2); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    return true;
  }
  if (kind === 'wave_snake_head') {
    // Video ~4:45: metallic tip + red ring + yellow centre (sprite cut/generated from ref)
    const chase = e.tone === 'chase' || (e.mv === 'snakechase' && e.tone !== 'ret'); // 'ret' = flying back to its slot (no glow)
    const r = Math.min(w, h) * (chase ? 0.78 : 0.62);
    if (e.tone === 'wind' && e._reach && e._tx != null) {
      const px = e._tx - e.x, py = e._ty - e.y, a = e._aimA || Math.PI;
      ctx.save(); ctx.strokeStyle = 'rgba(255,90,60,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * e._reach, py + Math.sin(a) * e._reach); ctx.stroke();
      ctx.restore();
    }
    if (e.tone === 'wind' || chase) {
      const gg = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.2);
      gg.addColorStop(0, 'rgba(255,200,80,0.55)'); gg.addColorStop(0.5, 'rgba(255,60,40,0.35)'); gg.addColorStop(1, 'rgba(255,40,20,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    const tip = waveSprite('snake_head_art');
    if (tip) {
      if (e.rot) { ctx.rotate(e.rot); }
      ctx.imageSmoothingEnabled = false; drawFit(ctx, tip, w * 1.75, h * 1.75, false); // 10-06 video cut: ring+glow ≈ 2× ship height
      return true;
    }
    // fallback procedural
    const yg = ctx.createRadialGradient(-r * 0.15, -r * 0.15, 0, 0, 0, r * 0.55);
    yg.addColorStop(0, '#fff8c0'); yg.addColorStop(0.5, '#ffd020'); yg.addColorStop(1, '#e8a010');
    ctx.fillStyle = yg; ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e02028'; ctx.lineWidth = Math.max(3, r * 0.38);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.stroke();
    return true;
  }
  if (kind === 'wave_grid_core') {
    const sc = waveSprite('wave_swarm_core');
    if (!sc) return false;
    drawFit(ctx, sc, w * 1.1, h * 1.1, flash);
    return true;
  }
  const img = waveSprite(kind);
  if (!img) return false;
  if (kind === 'wave_core_boss') {
    drawFit(ctx, img, w * 1.12, h * 1.12, flash);
    return true;
  }
  if (kind === 'wave_eye_boss') {
    // Rotating mechanical claws (= drones: they block shots) drawn ON TOP of the flesh (were hidden behind it)
    drawFit(ctx, img, w * 0.84, h * 0.84, flash);
    for (const d of e.drones || []) {
      if (d.hp <= 0) continue;
      ctx.save();
      ctx.rotate(d.ang);
      ctx.translate(d.dist, 0);
      const r = d.r;
      if (d.w) { ctx.strokeStyle = `rgba(255,60,40,${Math.sin(t * 24) > 0 ? 0.9 : 0.3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#5a5f6c';
      ctx.strokeStyle = '#262a33';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-r * 1.1, -r * 0.9);
      ctx.lineTo(r * 0.7, -r * 0.55);
      ctx.lineTo(r * 1.35, 0);
      ctx.lineTo(r * 0.7, r * 0.55);
      ctx.lineTo(-r * 1.1, r * 0.9);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8a909c';
      ctx.fillRect(-r * 0.9, -r * 0.25, r * 1.2, r * 0.5);
      ctx.fillStyle = `rgba(255,70,60,${0.7 + 0.3 * Math.sin(t * 6 + d.ang)})`;
      ctx.beginPath(); ctx.arc(r * 0.55, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    return true;
  }
  // Swarm-core: mid triangle ship + grunt-sprite drones
  const esc = waveSprite('wave_escort');
  ctx.strokeStyle = 'rgba(255,70,60,0.25)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 5]);
  ctx.beginPath(); ctx.arc(0, 0, Math.min(w, h) * 0.38, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  for (const d of e.drones || []) {
    if (d.hp <= 0) continue;
    const dx = Math.cos(d.ang) * d.dist, dy = Math.sin(d.ang) * d.dist * (d.ky || 1);
    ctx.save(); ctx.translate(dx, dy);
    if (d.w) { ctx.strokeStyle = `rgba(255,60,40,${Math.sin(t * 24) > 0 ? 0.9 : 0.3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, d.r * 1.5, 0, Math.PI * 2); ctx.stroke(); }
    if (esc) drawFit(ctx, esc, d.r * 2.6, d.r * 2.2, false);
    else { ctx.fillStyle = '#b8bec8'; ctx.beginPath(); ctx.arc(0, 0, d.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  drawFit(ctx, img, Math.min(w, h) * 0.7, Math.min(w, h) * 0.7, flash);
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

/**
 * Core weak-point enemies (wave-only). Dark armored hull / drone ring + a big pulsing
 * cyan-magenta core that is obviously "the target". Local space (translated to e.x,e.y).
 */
function drawCoreEnemy(ctx, e, kind, w, h, t) {
  ctx.save();
  const flash = (e.bodyFlash || e._bodyFlash || 0) > 0;
  if (drawCoreSpriteBody(ctx, e, kind, w, h, t, flash)) {
    // Snake tip = video-cut head art; skip CORE pulse/halo/text (would fatten & recolour it)
    if (kind === 'wave_snake_head') { ctx.restore(); return; }
    // brushed-up sprite body + guards (drones / claws) drawn; core overlay below
  } else if (kind === 'wave_core_boss') {
    // Large grey triangular midboss (nose left), swept red-tipped wings, dark mechanical spine
    const hull = flash ? '#c8d4e0' : '#8a909c';
    const dark = '#3a3f4a';
    // Wings (back-swept delta)
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.lineTo(w * 0.18, -h * 0.5);
    ctx.lineTo(w * 0.5, -h * 0.46);
    ctx.lineTo(w * 0.3, -h * 0.12);
    ctx.lineTo(w * 0.42, 0);
    ctx.lineTo(w * 0.3, h * 0.12);
    ctx.lineTo(w * 0.5, h * 0.46);
    ctx.lineTo(w * 0.18, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = flash ? '#ffffff' : '#c4cad4';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Red wing tips
    ctx.fillStyle = '#e0242a';
    for (const sg of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w * 0.18, sg * h * 0.5);
      ctx.lineTo(w * 0.5, sg * h * 0.46);
      ctx.lineTo(w * 0.42, sg * h * 0.34);
      ctx.lineTo(w * 0.2, sg * h * 0.4);
      ctx.closePath();
      ctx.fill();
    }
    // Panel lines
    ctx.strokeStyle = 'rgba(40,44,54,0.7)';
    ctx.lineWidth = 1.5;
    for (const sg of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(-w * 0.2, sg * h * 0.14); ctx.lineTo(w * 0.3, sg * h * 0.38); ctx.stroke();
    }
    // Dark mechanical spine
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, 0);
    ctx.lineTo(w * 0.05, -h * 0.13);
    ctx.lineTo(w * 0.44, -h * 0.09);
    ctx.lineTo(w * 0.44, h * 0.09);
    ctx.lineTo(w * 0.05, h * 0.13);
    ctx.closePath();
    ctx.fill();
    // Thrusters
    ctx.fillStyle = '#ff7a33';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 9);
    ctx.fillRect(w * 0.44, -h * 0.07, w * 0.07, h * 0.05);
    ctx.fillRect(w * 0.44, h * 0.02, w * 0.07, h * 0.05);
    ctx.globalAlpha = 1;
  } else {
    // Swarm-core: faint tether ring + drones
    // Mid-size triangular core ship (grey, red tips) carrying the core
    {
      const sw = Math.min(w, h) * 0.62, sh = sw * 0.8;
      ctx.fillStyle = flash ? '#c8d4e0' : '#8a909c';
      ctx.beginPath();
      ctx.moveTo(-sw * 0.6, 0); ctx.lineTo(sw * 0.45, -sh * 0.5); ctx.lineTo(sw * 0.3, 0); ctx.lineTo(sw * 0.45, sh * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c4cad4'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#e0242a';
      for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sw * 0.45, sg * sh * 0.5); ctx.lineTo(sw * 0.3, sg * sh * 0.3); ctx.lineTo(sw * 0.22, sg * sh * 0.42); ctx.closePath(); ctx.fill(); }
    }
    ctx.strokeStyle = 'rgba(255,70,60,0.28)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(w, h) * 0.38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const d of e.drones || []) {
      if (d.hp <= 0) continue;
      const dx = Math.cos(d.ang) * d.dist, dy = Math.sin(d.ang) * d.dist * (d.ky || 1);
      ctx.fillStyle = '#b8bec8';
      ctx.beginPath();
      ctx.moveTo(dx - d.r, dy);
      ctx.lineTo(dx + d.r * 0.7, dy - d.r * 0.75);
      ctx.lineTo(dx + d.r * 0.35, dy);
      ctx.lineTo(dx + d.r * 0.7, dy + d.r * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,70,60,0.35)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dx, dy); ctx.stroke();
    }
  }
  // The CORE — strong pulse + rings, cyan/magenta
  const c = e.core;
  if (c && c.hp > 0) {
    const pu = 0.5 + 0.5 * Math.sin(t * 8);
    const r = c.r;
    ctx.shadowBlur = 0;
    const halo = ctx.createRadialGradient(c.ox, c.oy, r * 0.2, c.ox, c.oy, r * (2.1 + pu * 0.5));
    halo.addColorStop(0, 'rgba(255,255,235,0.95)');
    halo.addColorStop(0.3, 'rgba(255,70,50,0.9)');
    halo.addColorStop(0.62, 'rgba(255,20,20,0.45)');
    halo.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(c.ox, c.oy, r * (2.1 + pu * 0.5), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pu > 0.5 ? '#ff5a3c' : '#e8141e';
    ctx.beginPath(); ctx.arc(c.ox, c.oy, r * (0.72 + pu * 0.12), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(c.ox, c.oy, r * 0.32, 0, Math.PI * 2); ctx.fill();
    // Target brackets (reads as "aim here")
    ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.45 * pu})`;
    ctx.lineWidth = 2;
    const b = r * 1.35, L = r * 0.5;
    for (const [sxx, syy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(c.ox + sxx * b, c.oy + syy * (b - L));
      ctx.lineTo(c.ox + sxx * b, c.oy + syy * b);
      ctx.lineTo(c.ox + sxx * (b - L), c.oy + syy * b);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd0c8';
    ctx.font = `bold ${Math.max(9, Math.round(r * 0.62))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.95;
    ctx.fillText('CORE', c.ox, c.oy - b - 3);
    ctx.globalAlpha = 1;
    // Hit flash
    if ((e._coreFlash || 0) > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(c.ox, c.oy, r * 1.05, 0, Math.PI * 2); ctx.fill();
    }
    // Armour plates: warn = sliding in + blinking edges, shut = closed (hits blocked)
    const shs = e._sh ? e._sh.st : (e.cs || 0);
    if (shs) {
      const k = shs === 2 ? 1 : (e._sh ? Math.min(1, e._sh.t / Math.max(0.1, e._sh.warn)) : 0.5) * 0.55;
      const blink = shs === 1 ? (Math.sin(t * 28) > 0 ? 1 : 0.35) : 1;
      for (let q = 0; q < 4; q++) {
        const a0 = q * Math.PI / 2 + Math.PI / 4;
        const off = r * (1.25 - 1.25 * k);
        ctx.save();
        ctx.translate(c.ox + Math.cos(a0) * off, c.oy + Math.sin(a0) * off);
        ctx.fillStyle = shs === 2 ? '#6d7482' : '#8a919e';
        ctx.strokeStyle = shs === 2 ? '#2a2e36' : `rgba(255,190,60,${blink})`;
        ctx.lineWidth = shs === 2 ? 1.5 : 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r * 1.12, a0 - Math.PI / 4, a0 + Math.PI / 4);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      if (shs === 2) {
        ctx.fillStyle = 'rgba(255,60,40,0.55)';
        ctx.fillRect(c.ox - r * 0.7, c.oy - 1.5, r * 1.4, 3);
      }
    }
    // Core HP ring
    const cmax = c.maxHp || e.cm || c.hp;
    const fr = Math.max(0, Math.min(1, c.hp / (cmax || 1)));
    const rr = r + 5;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.arc(c.ox, c.oy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = fr > 0.5 ? '#ffe070' : fr > 0.25 ? '#ff9a3a' : '#ff3a2a';
    ctx.beginPath(); ctx.arc(c.ox, c.oy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fr); ctx.stroke();
  }
  ctx.restore();
}

/** Escort grunt: small swept-wing white/grey fighter (nose left), one red cockpit dot. */
function drawEscort(ctx, w, h, t, e) {
  ctx.save();
  ctx.fillStyle = '#e8ecf2';
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, 0);
  ctx.lineTo(w * 0.1, -h * 0.5);
  ctx.lineTo(w * 0.5, -h * 0.5);
  ctx.lineTo(w * 0.18, -h * 0.1);
  ctx.lineTo(w * 0.38, 0);
  ctx.lineTo(w * 0.18, h * 0.1);
  ctx.lineTo(w * 0.5, h * 0.5);
  ctx.lineTo(w * 0.1, h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7a808c';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#9aa0ac';
  ctx.fillRect(-w * 0.1, -h * 0.07, w * 0.42, h * 0.14);
  ctx.fillStyle = '#ff3a2a';
  ctx.beginPath(); ctx.arc(-w * 0.16, 0, Math.max(2, h * 0.09), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffae40';
  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 12 + (e._uid || 0));
  ctx.fillRect(w * 0.36, -h * 0.05, w * 0.12, h * 0.1);
  ctx.restore();
}

/** Body hit on a core unit: blue-white "弾かれた" spark with a short ricochet line. */
function drawDeflectSpark(ctx, f) {
  const t = 1 - f.life / f.max;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t);
  ctx.strokeStyle = '#cfe8ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(f.x, f.y, (f.r || 10) * (0.4 + t * 0.8), Math.PI * 0.6, Math.PI * 1.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(f.x, f.y);
  ctx.lineTo(f.x - 10 - t * 14, f.y - 6 - t * 10);
  ctx.moveTo(f.x, f.y);
  ctx.lineTo(f.x - 10 - t * 14, f.y + 6 + t * 10);
  ctx.stroke();
  if (t < 0.5) {
    ctx.fillStyle = '#e8f4ff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('カン', f.x + 2, f.y - 10 - t * 10);
  }
  ctx.restore();
}

/** Core destroyed: bright white flash, cyan/magenta double shockwave, rays, 「コア撃破!」 text. */
function drawCoreBreak(ctx, f) {
  const t = 1 - f.life / f.max;
  const R = f.r || 120;
  ctx.save();
  if (t < 0.18) {
    ctx.globalAlpha = (0.18 - t) / 0.18 * 0.85;
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R * 0.9);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(f.x, f.y, R * 0.9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = Math.max(0, 1 - t);
  {
    const fr = R * (0.3 + t * 0.85);
    const fg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, fr);
    fg.addColorStop(0, 'rgba(255,255,230,0.95)');
    fg.addColorStop(0.35, 'rgba(255,225,70,0.85)');
    fg.addColorStop(0.7, 'rgba(255,120,20,0.55)');
    fg.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(f.x, f.y, fr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineWidth = 4 * (1 - t) + 1;
  ctx.strokeStyle = '#ffe45a';
  ctx.beginPath(); ctx.arc(f.x, f.y, R * (0.2 + t * 1.1), 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#ff3a2a';
  ctx.beginPath(); ctx.arc(f.x, f.y, R * (0.1 + t * 0.8), 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12 + t;
    const r0 = R * (0.15 + t * 0.4), r1 = R * (0.35 + t * 0.9);
    ctx.beginPath();
    ctx.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0);
    ctx.lineTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.globalAlpha = Math.min(1, (1 - t) * 1.6);
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#300838';
  ctx.strokeText('コア撃破！', f.x, f.y - 14 - t * 18);
  ctx.fillStyle = '#fff36a';
  ctx.fillText('コア撃破！', f.x, f.y - 14 - t * 18);
  ctx.restore();
}

/** Core chain reaction: one yellow fireball per chained unit (cascades outward from the core). */
function drawChainBoom(ctx, f) {
  drawPxBoom(ctx, f, 0.6); // 10-04g: −20% (was 0.75)
  return;
  // fireball grows fast to radius R (= unit size → diameter ≈ 2× the unit), holds, then fades;
  // a white flash at the start, a shock ring and flying sparks. ~3 gradient-free fills per frame.
  const t = 1 - f.life / f.max;
  const R = f.r || 30;
  const grow = Math.min(1, t / 0.28), ease = 1 - (1 - grow) * (1 - grow);
  const fade = t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.55);
  const rr = R * (0.45 + 0.55 * ease);
  ctx.save();
  ctx.globalAlpha = fade * 0.9;
  ctx.fillStyle = '#ff6a10'; ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffc233'; ctx.beginPath(); ctx.arc(f.x, f.y, rr * 0.74, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = fade;
  ctx.fillStyle = t < 0.12 ? '#ffffff' : '#fff6b0'; ctx.beginPath(); ctx.arc(f.x, f.y, rr * (t < 0.12 ? 0.62 : 0.42 * fade), 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = Math.max(0, 1 - t) * 0.85;
  ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = Math.max(1, 3 * (1 - t));
  ctx.beginPath(); ctx.arc(f.x, f.y, R * (0.6 + t * 0.9), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffe066';
  const sd = f.sd || 0;
  for (let i = 0; i < 8; i++) {
    const a = i * 0.785 + sd;
    const d = R * (0.4 + t * 1.25);
    const s = Math.max(1.5, R * 0.09 * (1 - t));
    ctx.fillRect(f.x + Math.cos(a) * d - s / 2, f.y + Math.sin(a) * d - s / 2, s, s);
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
  // Scripted wave units: short bolts only → just a muzzle glow on each firing lane, no beam line
  if (e.laserAimX != null && Math.abs(e.laserAimX - e.x) < 4) {
    for (const off of offs) {
      const gr = 4 + u * 9;
      const gg = ctx.createRadialGradient(mx, my + off, 0, mx, my + off, gr);
      gg.addColorStop(0, `rgba(255,255,230,${0.6 + 0.35 * flash})`);
      gg.addColorStop(0.45, `rgba(255,150,60,${0.35 + 0.4 * u})`);
      gg.addColorStop(1, 'rgba(255,60,30,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(mx, my + off, gr, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
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

/** Seconds-left threshold where the warp blink stops (5s total − 3s blink = 2s steady). */
const WARP_STEADY_AT = 2;

function drawWarpRing(ctx, w, h, t, warpT, warpPop) {
  // Ellipse hugging the unit (large units are wide and short)
  const rx = w * 0.56 + 10, ry = h * 0.6 + 10;
  const R = Math.max(rx, ry);
  ctx.save();
  ctx.scale(rx / R, ry / R); // draw circles of radius R → ellipse rx×ry
  ctx.shadowBlur = 0;
  if (warpPop > 0) {
    // Ring releases: expand + fade out
    const u = 1 - warpPop / 0.35;
    ctx.globalAlpha = Math.max(0, 1 - u);
    ctx.strokeStyle = 'rgba(160,250,255,1)';
    ctx.lineWidth = 3 * (1 - u) + 1;
    ctx.beginPath();
    ctx.arc(0, 0, R * (1 + u * 0.8), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const blinking = warpT > WARP_STEADY_AT;
  // Soft inner glow
  const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
  g.addColorStop(0, 'rgba(90,220,255,0.02)');
  g.addColorStop(0.75, 'rgba(90,220,255,0.14)');
  g.addColorStop(1, 'rgba(120,240,255,0.32)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  // Main ring (glowing)
  ctx.shadowColor = 'rgba(80,230,255,0.95)';
  ctx.shadowBlur = 10;
  ctx.strokeStyle = blinking ? 'rgba(140,245,255,0.95)' : 'rgba(170,250,255,1)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  // Rotating dashed outer ring
  ctx.shadowBlur = 0;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -t * 30;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, R + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Snake body segment (silver / green caterpillar) — glossy sphere. */
function drawSegBall(ctx, e, w, h, t) {
  const r = Math.min(w, h) * 0.5;
  // rotate segment with chain tangent (accordion faces along body)
  if (e.rot) ctx.rotate(e.rot);
  if (e.tone === 'red') {
    const ball = waveSprite('snake_redball');
    if (ball) { ctx.imageSmoothingEnabled = false; drawFit(ctx, ball, w * 1.5, h * 1.5, false); return; } // video: red link ≈ 0.85× ship
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r);
    g.addColorStop(0, '#ffd0a0'); g.addColorStop(0.35, '#ff5030'); g.addColorStop(0.75, '#c01818'); g.addColorStop(1, '#501010');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (e.tone === 'anchor' || e.tone === 'anchorWind' || e.tone === 'silver' || e.tone === 'portal') {
    const anchor = e.tone !== 'silver';
    if (e.tone === 'portal') { // 10-06: 異次元 portal alone (sphere not out yet), opening up
      const H = e._chainOf, open = H && H._portalOpen != null ? H._portalOpen : 1;
      const R = r * 2.46 * open; // video: portal Ø ≈ 2.46 × sphere Ø
      const portImg = waveSprite('snake_portal');
      ctx.save();
      if (portImg) { ctx.imageSmoothingEnabled = false; ctx.globalAlpha = Math.min(1, 0.6 + 0.4 * open); drawFit(ctx, portImg, R * 2, R * 2, false); }
      else {
        const gr = ctx.createRadialGradient(0, 0, R * 0.15, 0, 0, R);
        gr.addColorStop(0, 'rgba(40,0,0,0.95)'); gr.addColorStop(0.35, 'rgba(180,20,30,0.8)'); gr.addColorStop(0.7, 'rgba(100,10,12,0.3)'); gr.addColorStop(1, 'rgba(60,0,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      return;
    }
    if (anchor) {
      const hot = e.tone === 'anchorWind';
      const portal = (e._chainOf && e._chainOf._portal) || 0;
      const H = e._chainOf;
      const armLive = H && (H.mv === 'arm' || H.mv === 'snakechase'); // glow stays while the head is away (it comes back)
      // video: glow diameter ≈ 2.2 × pivot (measured); strong on entry, soft residual while arm lives
      const R = r * 2.46; // r = pivot radius; video (user_ref 4:46–4:49 median cut): portal Ø ≈ 2.46 × sphere Ø
      const portImg = waveSprite('snake_portal');
      if (portImg && (portal > 0.02 || hot || armLive)) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        const a = 1; // 10-06: video — the portal stays solid dark red behind the sphere (sprite carries its own soft edge)
        ctx.globalAlpha = a;
        drawFit(ctx, portImg, R * 2, R * 2, false);
        ctx.restore();
      } else {
        const gr = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, R);
        gr.addColorStop(0, hot || portal > 0.2 ? 'rgba(40,0,0,0.95)' : 'rgba(120,10,12,0.75)');
        gr.addColorStop(0.35, portal > 0.15 ? 'rgba(180,20,30,0.8)' : (hot ? 'rgba(220,40,30,0.85)' : 'rgba(140,15,18,0.55)'));
        gr.addColorStop(0.7, 'rgba(100,10,12,0.3)');
        gr.addColorStop(1, 'rgba(60,0,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      }
      const piv = waveSprite('snake_pivot') || waveSprite('wave_striker_pivot');
      if (piv) {
        ctx.imageSmoothingEnabled = false;
        drawFit(ctx, piv, w * 1.02, h * 1.02, false);
        return;
      }
    } else {
      const seg = waveSprite('snake_seg');
      if (seg) {
        ctx.imageSmoothingEnabled = false;
        drawFit(ctx, seg, w * 1.35, h * 1.35, false); // video-cut; 1.35 fills spacing for bellows overlap
        return;
      }
    }
  }
  const green = e.tone === 'green' || e.kind === 'wave_cater';
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  if (green) { g.addColorStop(0, '#d8ffc0'); g.addColorStop(0.45, '#4fbf3a'); g.addColorStop(1, '#1d4d18'); }
  else { g.addColorStop(0, '#e8ece4'); g.addColorStop(0.4, '#9aa494'); g.addColorStop(1, '#3a4038'); }
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = green ? 'rgba(20,60,20,0.8)' : 'rgba(30,34,40,0.75)';
  ctx.lineWidth = 1.2; ctx.stroke();
}
/** Guard debris waiting for its turn in the chain (ring pod / eye claw / swarm drone), glowing hot. */
function drawPod(ctx, e, t) {
  const r = e.podR || Math.min(e.w, e.h) * 0.45;
  ctx.save();
  if (e.rot) ctx.rotate(e.rot);
  const img = e.spr ? scriptSprite(e.spr) : (e.claw ? null : waveSprite('wave_escort'));
  if (img) drawFit(ctx, img, r * 2.6, r * 2.4, false);
  else {
    ctx.fillStyle = '#5a5f6c'; ctx.strokeStyle = '#262a33'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, -r * 0.9); ctx.lineTo(r * 0.7, -r * 0.55); ctx.lineTo(r * 1.35, 0); ctx.lineTo(r * 0.7, r * 0.55); ctx.lineTo(-r * 1.1, r * 0.9);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = `rgba(255,${150 + 80 * Math.sin(t * 30)},60,0.45)`;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2); ctx.fill();
}
/** Floating mine: yellow plate with a ring (scrolls with the field). */
function drawMine(ctx, w, h, t) {
  const s = Math.min(w, h);
  ctx.save(); ctx.rotate(t * 0.8);
  ctx.fillStyle = '#e8c21c'; ctx.strokeStyle = '#6b5608'; ctx.lineWidth = 1.5;
  ctx.fillRect(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9); ctx.strokeRect(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9);
  ctx.strokeStyle = `rgba(200,30,20,${0.6 + 0.4 * Math.sin(t * 5)})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.26, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/** Invisible bubble: seen only for a moment when hit (hp drop) → fades back to alpha 0 in 0.3 s. */
const BUBBLE_REVEAL_S = 2 / 15;  // 10-05 video: hit ring = 2 source frames at 15 fps, full strength, then gone
const BUBBLE_ENTRY_S = 0.6;   // one shimmer when a bubble has fully entered the pane
let _paneFw = 1e9;            // width of the pane being drawn (set per pane in the snapshot renderer)
const _bubbleSeen = new Map(); // _uid → { hp, rv, inAt, t } (opponent view draws per-frame copies)
function bubbleAlpha(e) {
  const now = performance.now() / 1000;
  const key = e._uid != null ? e._uid : e;
  let m = _bubbleSeen.get(key);
  if (!m) {
    if (_bubbleSeen.size > 400) for (const [k, v] of _bubbleSeen) if (now - v.t > 3) _bubbleSeen.delete(k);
    m = { hp: e.hp, rv: -9, inAt: e.x + (e.w || 60) / 2 <= _paneFw ? -9 : null, t: now };
    _bubbleSeen.set(key, m);
  }
  if (e.hp < m.hp) m.rv = now;
  if (m.inAt == null && e.x + (e.w || 60) / 2 <= _paneFw) m.inAt = now;
  m.hp = e.hp; m.t = now;
  const kh = 1 - (now - m.rv) / BUBBLE_REVEAL_S;
  const ki = m.inAt != null ? 1 - (now - m.inAt) / BUBBLE_ENTRY_S : 0;
  void ki; // 10-05: no entry shimmer — unhit bubbles stay fully invisible
  return kh > 0 ? 1 : 0;
}
function drawEnemy(ctx, e) {
  if (e.kind === 'wave_bubble') {
    const ba = bubbleAlpha(e);
    if (ba <= 0.01) return;
    ctx.save();
    const r = Math.max(e.w || 60, e.h || 60) / 2;
    ctx.globalAlpha = ba;
    const ri = BUBBLE_RING.img, k = r / 9.75;
    if (ri && ri.complete && ri.naturalWidth) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(ri, e.x - BUBBLE_RING.c * k, e.y - BUBBLE_RING.c * k, BUBBLE_RING.n * k, BUBBLE_RING.n * k);
    } else {
      ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 0.85 * k;
      ctx.beginPath(); ctx.arc(e.x, e.y, 9.25 * k, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    return;
  }
  ctx.save();
  // Edge telegraph: unit about to enter from the top / bottom edge → blinking chevron on the edge
  if (e._edgeWarn) {
    const fhh = e._fh || 300;
    const top = e.y < 0;
    const yy = top ? 10 : fhh - 10;
    const a = Math.sin(performance.now() / 1000 * 18) > 0 ? 0.95 : 0.35;
    ctx.fillStyle = `rgba(255,70,50,${a})`;
    ctx.beginPath();
    ctx.moveTo(e.x - 10, yy + (top ? -6 : 6)); ctx.lineTo(e.x + 10, yy + (top ? -6 : 6)); ctx.lineTo(e.x, yy + (top ? 8 : -8));
    ctx.closePath(); ctx.fill();
    ctx.restore();
    return;
  }
  // Jet boss dash telegraph: red lane along its row
  if (e._dashWarn) {
    const a = 0.18 + 0.2 * (Math.sin(performance.now() / 1000 * 20) > 0 ? 1 : 0);
    ctx.fillStyle = `rgba(255,40,30,${a})`;
    ctx.fillRect(0, e.y - e.h * 0.32, e.x, e.h * 0.64);
  }
  ctx.translate(e.x, e.y);
  if ((e._shake || 0) > 0 || e.sk) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  if (e._warn) {
    // attack telegraph: pulsing red ring
    const pu = Math.sin(performance.now() / 1000 * 24) > 0 ? 0.9 : 0.3;
    ctx.strokeStyle = `rgba(255,60,40,${pu})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, Math.max(e.w, e.h) * 0.62, 0, Math.PI * 2); ctx.stroke();
  }
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

  // Warp-in (transferred units): ring + blink 0–3s, steady 3–5s, ring pop at 5s
  const warpT = e.warpT > 0 ? e.warpT : 0;
  const warpPop = !warpT && e.warpPop > 0 ? e.warpPop : 0;
  if (warpT > 0 || warpPop > 0) drawWarpRing(ctx, w, h, t, warpT, warpPop);
  if (warpT > WARP_STEADY_AT) {
    // Calm blink: 2 per second (0.5s cycle, 6 blinks over 3s), smooth fade 100% → 18% → 100%.
    // Phase follows warp elapsed time, so own pane / opponent pane / online snapshot match.
    const el = Math.max(0, 5 - warpT);
    ctx.globalAlpha = 0.18 + 0.82 * (0.5 + 0.5 * Math.cos(el * Math.PI * 2 / 0.5));
  }

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
    if (CORE_DRAW_KINDS.has(kind)) drawCoreEnemy(ctx, e, kind, w, h, t);
    else if (e.spr && kind !== 'wave_pod' && scriptSprite(e.spr)) {
      ctx.save(); if (e.rot) ctx.rotate(e.rot);
      drawFit(ctx, scriptSprite(e.spr), w * 1.2, h * 1.2, (e.bodyFlash || 0) > 0);
      ctx.restore();
    }
    else if (kind === 'wave_snake_seg' || kind === 'wave_cater') drawSegBall(ctx, e, w, h, t);
    else if (kind === 'wave_mine') drawMine(ctx, w, h, t);
    else if (kind === 'wave_bubble') drawBubble(ctx, w, h, t);
    else if (kind === 'wave_pod') drawPod(ctx, e, t);
    else if ((kind === 'wave_escort' || kind === 'wave_mech') && waveSprite(kind)) drawFit(ctx, waveSprite(kind), w * 1.15, h * 1.15, false);
    else if (kind === 'wave_escort') drawEscort(ctx, w, h, t, e);
    else drawWaveEnemy(ctx, e, kind, sent, w, h, t, pulse);
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
  if (!tiny && !CORE_DRAW_KINDS.has(kind) && kind !== 'wave_snake_seg' && kind !== 'wave_cater' && kind !== 'wave_mine' && kind !== 'wave_pod' && !e.att) drawHpPip(ctx, e); // core-attached units: no life bar

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
    const purple = b.tint === 'in'; // incoming 直接攻撃 shot (same sprite, purple)
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
      } else if (purple) {
        ribbon.addColorStop(0, 'rgba(150,60,255,0)');
        ribbon.addColorStop(0.25, 'rgba(160,70,255,0.06)');
        ribbon.addColorStop(0.55, 'rgba(175,95,255,0.2)');
        ribbon.addColorStop(0.85, 'rgba(200,130,255,0.42)');
        ribbon.addColorStop(1, 'rgba(225,170,255,0.6)');
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
          : (purple ? `rgba(180,100,255,${a})` : `rgba(255,70,90,${a})`);
        ctx.lineWidth = thick;
        ctx.beginPath();
        ctx.moveTo(gx - ux * len * 0.55, gy - uy * len * 0.55);
        ctx.lineTo(gx + ux * len * 0.35, gy + uy * len * 0.35);
        ctx.stroke();
      }
    }
    // Bright elongated core streak (oriented along velocity; light alpha, minimal blur)
    ctx.strokeStyle = homing ? 'rgba(255,180,255,0.92)' : (purple ? 'rgba(215,170,255,0.95)' : 'rgba(255,160,170,0.92)');
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
    if (k === 'bolt') {
      // Short laser bolt: hot white core with an orange-red glow, ~44 px long
      const len = 44;
      ctx.strokeStyle = 'rgba(255,90,50,0.35)';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + len, b.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,245,230,0.98)';
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + len, b.y); ctx.stroke();
    } else if (k === 'saw') {
      // Striker's boomerang saw: the red ring from the video (sprite), spinning, with a spiked rim
      const img = waveSprite('wave_striker_saw'), R = 11;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate((b.spin != null ? b.spin : performance.now() / 110));
      ctx.fillStyle = '#c81e3c';
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = (Math.PI * 2 * i) / 16, rr = i % 2 ? R * 0.92 : R * 1.25; if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
      if (img) drawFit(ctx, img, R * 2.1, R * 2.1, false);
      ctx.restore();
    } else if (k === 'dia') {
      // Small white diamond (tethered striker's escort shots)
      const q = 3.6;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(b.x - q, b.y); ctx.lineTo(b.x, b.y - q); ctx.lineTo(b.x + q, b.y); ctx.lineTo(b.x, b.y + q); ctx.closePath(); ctx.stroke();
    } else if (k === 'dash') {
      // Short white dash laser (as in the original): thin bright streak along its flight line
      const len = 15;
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(b.x - ux * len, b.y - uy * len); ctx.lineTo(b.x + ux * 3, b.y + uy * 3); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,250,0.97)';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(b.x - ux * len, b.y - uy * len); ctx.lineTo(b.x + ux * 3, b.y + uy * 3); ctx.stroke();
    } else if (laser) {
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
  // Magnet pull: fading glow trail + halo while the orb flies to the ship
  if (it.mg) {
    ctx.save();
    const tr = it.tr || [];
    for (let i = 0; i < tr.length; i++) {
      const a = (i + 1) / (tr.length + 1);
      ctx.globalAlpha = 0.35 * a;
      ctx.fillStyle = st.color;
      ctx.beginPath(); ctx.arc(tr[i][0], tr[i][1], R * (0.35 + 0.5 * a), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.55;
    const hg = ctx.createRadialGradient(it.x, it.y, R * 0.4, it.x, it.y, R * 1.9);
    hg.addColorStop(0, 'rgba(255,255,255,0.8)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(it.x, it.y, R * 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
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

function drawHitSpark(ctx, f) {
  const t = 1 - f.life / f.max;
  const r = (f.r || 8) * (0.55 + t * 0.9);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t * 0.85);
  const rg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
  rg.addColorStop(0, '#ffffff');
  rg.addColorStop(0.35, '#ffe08a');
  rg.addColorStop(0.7, '#ff8844');
  rg.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
  ctx.fill();
  // Tiny cross burst
  ctx.strokeStyle = `rgba(255,240,180,${Math.max(0, 0.85 - t)})`;
  ctx.lineWidth = 1.5;
  const arm = r * 0.85;
  ctx.beginPath();
  ctx.moveTo(f.x - arm, f.y);
  ctx.lineTo(f.x + arm, f.y);
  ctx.moveTo(f.x, f.y - arm);
  ctx.lineTo(f.x, f.y + arm);
  ctx.stroke();
  ctx.restore();
}


// ---------- 10-04d pixel-art kill blast + coin (pre-rendered frames, drawn nearest-neighbour) ----------
// Palette sampled from the reference video blasts (0:42.9): dark brown rim, rust, orange, yellow, pale core.
// 10-04f: no near-black entries (they read as black holes); fading is done with alpha only.
const PX_PAL = ['#c8461a', '#dc6418', '#ee8a1c', '#f8b42c', '#fcd848', '#fff4a8'];
const PX_RGB = PX_PAL.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const PX_N = 20, PX_S = 64, PX_VAR = 3; // 10-04g: 2× frames, 2× finer pixels
let _pxBoom = null, _pxCoin = null;
function pxRand(seed) { let x = seed | 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; }
function* buildPxBoomGen(out) {
  for (let v = 0; v < PX_VAR; v++) {
    const rnd = pxRand(977 + v * 131);
    const bumps = []; for (let i = 0; i < 9; i++) bumps.push({ a: rnd() * 6.283, w: 0.5 + rnd() * 0.6, h: 0.15 + rnd() * 0.25 });
    const lobes = []; for (let i = 0; i < 3; i++) { const a = rnd() * 6.283; lobes.push({ x: Math.cos(a) * 1.2, y: Math.sin(a) * 1.2, k: 0.85 + rnd() * 0.1 }); }
    const holes = []; for (let i = 0; i < 6; i++) holes.push({ x: (rnd() - 0.5) * 16, y: (rnd() - 0.5) * 16, r: 1.5 + rnd() * 2.5 });
    const frames = []; out.push(frames);
    for (let f = 0; f < PX_N; f++) {
      const t = f / (PX_N - 1);
      const c = document.createElement('canvas'); c.width = c.height = PX_S;
      const g = c.getContext('2d'); const img = g.createImageData(PX_S, PX_S);
      const R = (PX_S / 2) * 0.72 * (0.45 + 0.55 * Math.min(1, t / 0.3)); // leaves room for the jagged bumps
      const heat = Math.max(0.45, 1 - t * 0.9); // core cools down to orange
      for (let y = 0; y < PX_S; y++) for (let x = 0; x < PX_S; x++) {
        const dx = x - PX_S / 2 + 0.5, dy = y - PX_S / 2 + 0.5;
        const a = Math.atan2(dy, dx);
        let rr = R * (1 + 0.06 * Math.sin(3 * a + bumps[0].a + f * 0.3) + 0.04 * Math.sin(5 * a + bumps[1].a) + 0.025 * Math.sin(9 * a + bumps[2].a - f * 0.5)); // 10-04e: rounder
        for (const b of bumps) rr += R * b.h * 0.15 * Math.max(0, Math.cos((a - b.a) / b.w * 2.2));
        rr *= 0.97 + 0.05 * (((x * 31 + y * 17 + v * 7 + f * 3) % 7) / 6); // light pixel jaggies only
        let d = Math.hypot(dx, dy) / rr;
        for (const l of lobes) d = Math.min(d, Math.hypot(dx - l.x * (R / 10), dy - l.y * (R / 10)) / (rr * l.k));
        if (d > 1) continue;
        // brightness ramp: rim → centre, cools toward orange (never toward black)
        let k = (1 - d) * 5.2 * heat + 1 + (((x * 7 + y * 13 + f) % 5) - 2) * 0.12;
        k = Math.max(0, Math.min(5, Math.round(k)));
        if (d > 0.86) k = 0;
        const rgb = PX_RGB[k]; const i = (y * PX_S + x) * 4;
        img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2];
        // alpha: rim semi-transparent; whole blast fades out by alpha (late frames thin out from the centre)
        const fade = t < 0.4 ? 1 : Math.max(0, 1 - (t - 0.4) / 0.6);
        const thin = t > 0.55 ? Math.max(0, 1 - (1 - d) * (t - 0.55) * 3.2) : 1; // centre clears first (transparent, not black)
        const edge = d > 0.86 ? 0.55 : 1;
        img.data[i + 3] = Math.round(255 * fade * thin * edge);
      }
      g.putImageData(img, 0, 0); frames.push(c);
      yield; // 10-04j: one frame per slice — the 60 frames are built in the background, never in one long task
    }
  }
}
// Build the blast frames in small slices right after load (title screen), so a match start / first kill
// never blocks the main thread (the one-shot build took ≈270 ms on desktop, ≈1 s+ on phones).
function startPxBoomBuild() {
  if (_pxBoom) return;
  _pxBoom = [];
  const gen = buildPxBoomGen(_pxBoom);
  const step = () => {
    const t0 = performance.now();
    let r;
    do { r = gen.next(); } while (!r.done && performance.now() - t0 < 6);
    if (r.done) _pxBoom.ready = true; else setTimeout(step, 0);
  };
  setTimeout(step, 0);
}
if (typeof document !== 'undefined') startPxBoomBuild();
/**
 * 10-04k: match-start preparation (sprite decode + GPU warm-up + blast frames), split across frames.
 * onProgress(0..1). Resolves once everything is ready; instant after the first time.
 */
let _prepDone = false;
export function isMatchPrepDone() { return _prepDone && _pxBoom && _pxBoom.ready; }
export async function prepareMatchAssets(onProgress) {
  startPxBoomBuild(); bubbleSprite();
  for (const id of SCRIPT_SPRITES) if (!enemySprites[id]) loadKindSprite(id);
  const imgs = [];
  for (const k of Object.keys(enemySprites)) { const im = enemySprites[k] && enemySprites[k][ENEMY_STATIC_FRAME]; if (im) imgs.push(im); }
  for (const k of Object.keys(waveSprites)) imgs.push(waveSprites[k]);
  if (BUBBLE_BOOM.img) imgs.push(BUBBLE_BOOM.img);
  if (BUBBLE_RING.img) imgs.push(BUBBLE_RING.img);
  const warm = document.createElement('canvas'); warm.width = warm.height = 48; const wg = warm.getContext('2d');
  const blastTotal = PX_VAR * PX_N;
  const blastDone = () => (_pxBoom ? _pxBoom.reduce((n, v) => n + v.length, 0) : 0);
  const total = imgs.length + blastTotal;
  let done = 0, t0 = performance.now();
  const report = () => { if (onProgress) onProgress(Math.min(1, (done + blastDone()) / total)); };
  const breathe = async () => { if (performance.now() - t0 > 8) { report(); await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); } };
  if (!_prepDone) {
    for (const im of imgs) {
      try { if (!im.complete || !im.naturalWidth) await Promise.race([im.decode(), new Promise((r) => setTimeout(r, 1500))]); else await im.decode(); } catch (_) {}
      try { if (im.naturalWidth) { wg.drawImage(im, 0, 0, 48, 48); wg.filter = 'brightness(1.6)'; wg.drawImage(im, 0, 0, 8, 8); wg.filter = 'none'; } } catch (_) {}
      done++; await breathe();
    }
    _prepDone = true;
  }
  done = imgs.length;
  while (!(_pxBoom && _pxBoom.ready)) { report(); await new Promise((r) => setTimeout(r, 16)); }
  if (onProgress) onProgress(1);
}

// 10-04: translucent pixel bubble (pre-rendered once, 24×24, drawn nearest-neighbour)
let _bubbleSpr = null;
function bubbleSprite() {
  if (_bubbleSpr) return _bubbleSpr;
  const S = 24, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - S / 2 + 0.5, dy = y - S / 2 + 0.5, d = Math.hypot(dx, dy) / (S / 2);
    if (d > 1) continue;
    let col, a;
    if (d > 0.86) { col = '170,230,255'; a = 0.85; }                 // bright rim
    else if (d > 0.72) { col = '110,190,255'; a = 0.45; }
    else { col = '90,160,240'; a = 0.12 + 0.18 * d; }                // see-through body
    if (dx < -2 && dy < -2 && Math.hypot(dx + 4.5, dy + 4.5) < 2.6) { col = '255,255,255'; a = 0.95; } // highlight
    if (dx > 2 && dy > 3 && d > 0.6 && d < 0.8) { col = '200,240,255'; a = 0.55; }                  // lower reflection
    g.fillStyle = `rgba(${col},${a})`; g.fillRect(x, y, 1, 1);
  }
  return (_bubbleSpr = c);
}
function drawBubble(ctx, w, h, t) {
  const spr = bubbleSprite();
  const k = 1 + Math.sin(t * 2.4) * 0.03; // gentle wobble of the skin (no movement)
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spr, -w * k / 2, -h / (k * 2), w * k, h / k);
  ctx.restore();
}

/** Debug/contact-sheet access to the pre-rendered blast frames. */
export function pxBoomFrames() { startPxBoomBuild(); return _pxBoom; }
/** 10-05: 透明戦隊 explosion — plays the video frames (BUBBLE_BOOM) at the video's 15 fps, scaled so the
 *  video unit radius (9.75 px) matches the unit's radius, drifting with the unit. */
function drawEclipse(ctx, f) {
  const B = BUBBLE_BOOM, im = B.img;
  if (!im || !im.complete || !im.naturalWidth) return;
  const el = f.max - f.life;
  const i = Math.floor(el * B.fps);
  if (i < 0 || i >= B.n) return;
  const k = (f.r || 30) / B.vr;
  const x = f.x - (f.vx || 0) * el, y = f.y;
  // plain bilinear from the ×6 sheet (cheap on phone GPUs); no per-size caches → no first-use hitch
  const q = ctx.imageSmoothingQuality; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(im, i * B.fw, 0, B.fw, B.fh, x - B.cx * k, y - B.cy * k, B.vw * k, B.vh * k);
  ctx.imageSmoothingQuality = q;
}
function drawPxBoom(ctx, f, sizeMul = 1) {
  startPxBoomBuild();
  if (f.life > f.max) return; // staggered burst not started yet
  const t = Math.max(0, Math.min(0.999, 1 - f.life / f.max));
  const v = _pxBoom[Math.abs(Math.round((f.sd != null ? f.sd : f.x * 7 + f.y * 3))) % PX_VAR] || _pxBoom[0];
  const fr = v && v[Math.floor(t * PX_N)];
  if (!fr) { // frames still being built (first second after load): cheap plain fireball
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t); ctx.fillStyle = '#f8b42c';
    ctx.beginPath(); ctx.arc(f.x, f.y, (f.r || 42) * sizeMul * (0.5 + 0.5 * t), 0, Math.PI * 2); ctx.fill(); ctx.restore();
    return;
  }
  const D = (f.r || 42) * 2 * sizeMul;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fr, Math.round(f.x - D / 2), Math.round(f.y - D / 2), Math.round(D), Math.round(D));
  ctx.restore();
}
function buildPxCoin() {
  const mk = (cols) => {
    const S = 12, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2);
      if (d > 1) continue;
      g.fillStyle = d > 0.8 ? cols[0] : (d > 0.58 && d < 0.72) ? cols[1] : (x < S / 2 - 1 && y < S / 2 - 1 && d < 0.5) ? cols[3] : cols[2];
      g.fillRect(x, y, 1, 1);
    }
    return c;
  };
  return { gold: mk(['#8a5a00', '#c89000', '#f8d828', '#fff8b0']), silver: mk(['#5c6470', '#8f98a6', '#dde3ec', '#ffffff']) };
}

/** Spinning coin (video: flat yellow disc whose width flips; gold bigger than silver). */
function drawCoin(ctx, f) {
  if (!_pxCoin) _pxCoin = buildPxCoin();
  const r = f.r || 6, k = Math.cos(f.ph || 0);
  const w = Math.max(2, Math.abs(k) * r * 2);
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(f.g ? _pxCoin.gold : _pxCoin.silver, Math.round(f.x - w / 2), Math.round(f.y - r), Math.round(w), Math.round(r * 2));
  if (Math.abs(k) < 0.3) { ctx.fillStyle = f.g ? '#c89000' : '#8f98a6'; ctx.fillRect(Math.round(f.x - 1), Math.round(f.y - r), 2, Math.round(r * 2)); } // edge-on rim
  ctx.restore();
}

function drawCoreLifeBar(ctx, x, y, w, u, k = 1) {
  const h = Math.max(5, 9 * k);
  y = Math.max(h + 2, y);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#3a1418'; ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = u > 0.5 ? '#ff4a5a' : u > 0.25 ? '#ff9a2a' : '#ffe14a';
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, u)), h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, u)), Math.max(1, h * 0.3));
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, 1.5 * k); ctx.strokeRect(x - w / 2 - 0.5, y - 0.5, w + 1, h + 1);
  ctx.restore();
}

/** Floating "+N" when a coin reaches the ship (own field, COM / solo only). */
function drawPtPop(ctx, f) {
  const t = 1 - f.life / f.max;
  const gold = f.n >= 30;
  ctx.save();
  ctx.globalAlpha = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
  const sz = (gold ? 30 : 22) * (t < 0.12 ? 0.7 + 2.5 * t : 1);
  ctx.font = `900 ${sz}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  const y = f.y - t * 40, txt = `+${f.n}PT`;
  ctx.strokeText(txt, f.x, y);
  ctx.fillStyle = gold ? '#ffd21e' : '#eef2f8'; ctx.fillText(txt, f.x, y);
  ctx.restore();
}

/** Running coin PT in the own field (COM only): big number + plain notes; pickups animate here. */
let _coinShown = 0;
function drawCoinHud(ctx, L, pt, lastGold, pop) {
  const x1 = L.own.x + L.own.w - 6, y0 = L.own.y + 6, bw = 150, bh = 62, x0 = x1 - bw;
  const now = performance.now() / 1000;
  if (pt < _coinShown) _coinShown = pt; // new match
  _coinShown += Math.max(pt - _coinShown > 0 ? 0.5 : 0, (pt - _coinShown) * 0.25); // quick roll-up
  if (_coinShown > pt) _coinShown = pt;
  const age = pop ? now - pop.t : 9, gold = pop && pop.gold;
  const bump = age < 0.35 ? Math.sin(age / 0.35 * Math.PI) * (gold ? 0.45 : 0.22) : 0;
  const glow = age < 0.6 ? 1 - age / 0.6 : 0;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.66)'; ctx.fillRect(x0, y0, bw, bh);
  if (glow > 0) { ctx.shadowColor = gold ? '#ffd21e' : '#ffffff'; ctx.shadowBlur = (gold ? 22 : 12) * glow; }
  ctx.strokeStyle = gold && glow > 0 ? '#ffe566' : 'rgba(255,210,30,0.85)'; ctx.lineWidth = 2 + (gold ? 2 : 1) * glow; ctx.strokeRect(x0, y0, bw, bh);
  ctx.shadowBlur = 0;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#f2f2f2';
  ctx.fillText('今回のコイン', x0 + 8, y0 + 12);
  drawCoin(ctx, { x: x0 + 20, y: y0 + 34, r: 11 * (1 + bump * 0.6), g: lastGold ? 1 : 0, ph: 0 });
  ctx.save();
  ctx.translate(x1 - 8, y0 + 34); ctx.scale(1 + bump, 1 + bump);
  if (glow > 0) { ctx.shadowColor = gold ? '#ffd21e' : '#ffffff'; ctx.shadowBlur = (gold ? 18 : 10) * glow; }
  ctx.font = '900 24px sans-serif'; ctx.fillStyle = '#ffe27a'; ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(_coinShown)} PT`, 0, 0);
  ctx.restore();
  ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#cfe3ff'; ctx.textAlign = 'right';
  ctx.fillText('勝つともらえます', x1 - 8, y0 + 53);
  if (pop && age < 1.1) { // +1PT / +30PT pops out under the counter
    const u = age / 1.1;
    ctx.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
    ctx.font = `900 ${gold ? 24 : 18}px sans-serif`; ctx.textAlign = 'right';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    const ty = y0 + bh + 14 + u * 10;
    ctx.strokeText(`+${pop.n}PT`, x1 - 8, ty);
    ctx.fillStyle = gold ? '#ffd21e' : '#eef2f8'; ctx.fillText(`+${pop.n}PT`, x1 - 8, ty);
  }
  ctx.restore();
}

function drawFx(ctx, f) {
  if (drawExFx(ctx, f)) return; // v1.5.67 extra attack items (attack_items.js)
  if (f.kind === 'shock') { drawShockFx(ctx, f); return; }
  if (f.kind === 'bomb') { drawBombFx(ctx, f); return; }
  if (f.kind === 'heal') { drawHealFx(ctx, f); return; }
  if (f.kind === 'coin') { drawCoin(ctx, f); return; }
  if (f.kind === 'kboom') { drawPxBoom(ctx, f); return; }
  if (f.kind === 'eclipse') { drawEclipse(ctx, f); return; }
  if (f.kind === 'ptpop') { drawPtPop(ctx, f); return; }
  if (f.kind === 'hit') { drawHitSpark(ctx, f); return; }
  if (f.kind === 'deflect') { drawDeflectSpark(ctx, f); return; }
  if (f.kind === 'corebreak') { drawCoreBreak(ctx, f); return; }
  if (f.kind === 'chainboom') { drawChainBoom(ctx, f); return; }
  if (f.kind === 'fieldflash') {
    // Whole-field white flash on a core break: hold ~0.25 s, then fade (capped alpha, no strobe)
    const u = 1 - f.life / f.max;
    const pk = f.a || 0.55;
    const a = u < 0.3 ? pk : pk * Math.max(0, 1 - (u - 0.3) / 0.7);
    ctx.save();
    ctx.fillStyle = `rgba(245,245,238,${a})`;
    ctx.fillRect(-4, -4, f.x * 2 + 8, f.y * 2 + 8);
    ctx.restore();
    return;
  }
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

/** 10-04: crisp life-loss tracker per bar (own + opponent): lost chunk holds 0.5 s then drains,
 *  big -N, short shake. Render-side so the opponent bar gets the same treatment. */
const _lifeFx = {};
function lifeFx(key, hp, now) {
  let m = _lifeFx[key];
  if (!m || hp > m.hp + 0.01 && m.ghost <= m.hp + 0.01) { m = _lifeFx[key] = { hp, ghost: hp, hold: 0, t: now, n: 0, nT: -9, sh: -9 }; }
  const dt = Math.min(0.1, Math.max(0, (now - m.t) / 1000)); m.t = now;
  if (hp < m.hp - 0.01) {
    const d = m.hp - hp;
    m.ghost = Math.max(m.ghost, m.hp);
    m.hold = 0.5;
    m.n = now - m.nT < 600 ? m.n + d : d; m.nT = now; m.sh = now;
  } else if (hp > m.hp) { m.ghost = Math.max(m.ghost, hp); }
  m.hp = hp;
  if (m.hold > 0) m.hold -= dt;
  else if (m.ghost > hp) m.ghost = Math.max(hp, m.ghost - Math.max(40, (m.ghost - hp) * 3) * dt);
  const sa = (now - m.sh) / 250;
  return { ghost: m.ghost, hold: m.hold, shake: sa < 1 ? 1 - sa : 0, n: m.n, numA: (now - m.nT) < 900 ? 1 - Math.max(0, (now - m.nT) - 600) / 300 : 0, numAge: (now - m.nT) / 1000 };
}
function drawLifeChunk(ctx, x, y, barW, barH, hp, maxHp, f, now) {
  if (f.ghost <= hp + 0.01) return;
  const x1 = Math.round(x + barW * Math.max(0, hp / maxHp)), x2 = Math.round(x + barW * Math.max(0, f.ghost / maxHp));
  const blink = f.hold > 0 && Math.floor(now / 70) % 2 === 0;
  ctx.fillStyle = blink ? '#ffffff' : '#ff2a2a';
  ctx.fillRect(x1, Math.round(y), Math.max(1, x2 - x1), Math.round(barH));
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
  ctx.strokeRect(x1 + 0.5, Math.round(y) + 0.5, Math.max(1, x2 - x1) - 1, Math.round(barH) - 1);
}
function drawLifeNum(ctx, xEnd, y, barH, f) {
  if (f.numA <= 0 || f.n < 0.5) return;
  const sz = Math.round(Math.max(18, barH * 2.6) * (f.numAge < 0.1 ? 1.35 - f.numAge * 3.5 : 1));
  ctx.save();
  ctx.globalAlpha = f.numA;
  ctx.font = `900 ${sz}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, sz * 0.16); ctx.strokeStyle = '#000';
  const t = `-${Math.round(f.n)}`;
  ctx.strokeText(t, Math.round(xEnd), Math.round(y - f.numAge * 6));
  ctx.fillStyle = '#ff3b3b'; ctx.fillText(t, Math.round(xEnd), Math.round(y - f.numAge * 6));
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
  const now = performance.now();
  const lfS = lifeFx('self', selfHp, now), lfO = lifeFx('opp', oppHp, now);
  const shk = Math.max(shake, lfS.shake, lfO.shake);
  const jx = shk > 0 ? Math.round((Math.random() - 0.5) * 10 * shk) : 0;
  const jy = shk > 0 ? Math.round((Math.random() - 0.5) * 6 * shk) : 0;
  const x = Math.round(x0 + jx);
  const y = Math.round(y0 + jy);
  const selfRatio = Math.max(0, display / maxHp);
  const oppRatio = Math.max(0, oppHp / maxHp);
  const selfLow = selfRatio < 0.3;
  const oppLow = oppRatio < 0.3;
  const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now / 180)); // ~2.8Hz

  // Opaque HUD plate so large enemies never hide life bars
  ctx.fillStyle = 'rgba(4, 6, 14, 0.88)';
  const bgPad = 6;
  ctx.fillRect(x - bgPad, y - bgPad, barW + bgPad * 2 + 28, totalH + bgPad * 2);
  ctx.strokeStyle = 'rgba(255, 210, 150, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - bgPad, y - bgPad, barW + bgPad * 2 + 28, totalH + bgPad * 2);

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
  drawLifeChunk(ctx, x, y, barW, barH, oppHp, maxHp, lfO, now);
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
  void ghost;
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
  drawLifeChunk(ctx, x, ySelf, barW, barH, display, maxHp, lfS, now);
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
  drawLifeNum(ctx, x + barW + 30, y + barH * 0.5 - barH * 0.8, barH, lfO);
  drawLifeNum(ctx, x + barW + 30, ySelf + barH * 0.5 + barH * 0.8, barH, lfS);
  // Finish sequence: the losing side's bar flashes while it drains to 0
  if (fx.koFlashSelf || fx.koFlashOpp) {
    const blink = 0.5 + 0.5 * Math.sin(now / 45);
    const by = fx.koFlashOpp ? y : ySelf;
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${0.18 + 0.42 * blink})`;
    ctx.fillRect(x, by, barW, barH);
    ctx.strokeStyle = `rgba(255,60,60,${0.6 + 0.4 * blink})`;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x - 1, by - 1, barW + 2, barH + 2);
    ctx.restore();
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



function drawDirectTimerHud(ctx, L, localState) {
  const pl = localState.player;
  const ownOn = pl && pl.activePower === 'direct' && pl.activeTimer > 0;
  const inOn = localState.incomingDirect && localState.incomingDirect > 0;
  if (!ownOn && !inOn) return;
  const rem = ownOn ? pl.activeTimer : localState.incomingDirect;
  const sec = Math.max(0, rem).toFixed(1);
  const label = ownOn
    ? `直接攻撃 残り ${sec}秒`
    : `敵の直接攻撃！ 残り ${sec}秒`;
  const fs = Math.max(15, Math.floor(L.own.w * 0.055));
  const x = L.own.x + L.own.w * 0.5;
  const y = L.own.y + Math.max(22, L.own.h * 0.08);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${fs}px "Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif`;
  // Plate behind text
  const tw = ctx.measureText(label).width;
  const padX = 14;
  const padY = 8;
  ctx.fillStyle = ownOn ? 'rgba(80,0,10,0.72)' : 'rgba(40,0,70,0.78)';
  ctx.strokeStyle = ownOn ? 'rgba(255,80,100,0.85)' : 'rgba(180,100,255,0.9)';
  ctx.lineWidth = 2;
  const bx = x - tw * 0.5 - padX;
  const by = y - fs * 0.55 - padY * 0.35;
  const bw = tw + padX * 2;
  const bh = fs + padY * 1.4;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 8);
  else ctx.rect(bx, by, bw, bh);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = ownOn ? '#ff2040' : '#a040ff';
  ctx.shadowBlur = 10;
  ctx.fillStyle = ownOn ? '#ffe8f0' : '#f0e0ff';
  ctx.fillText(label, x, y);
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
const _fitMemo = new Map();
function fitFontSize(ctx, texts, maxW, maxFs, minFs, fontStack, weight) {
  const key = `${texts.join('\u0001')}|${Math.round(maxW)}|${maxFs}|${minFs}|${fontStack}|${weight}`;
  let fs = _fitMemo.get(key);
  if (fs == null) { fs = fitFontSizeRaw(ctx, texts, maxW, maxFs, minFs, fontStack, weight); if (_fitMemo.size > 300) _fitMemo.clear(); _fitMemo.set(key, fs); }
  ctx.font = `${weight} ${fs}px ${fontStack}`;
  return fs;
}
function fitFontSizeRaw(ctx, texts, maxW, maxFs, minFs, fontStack, weight) {
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
const _wrapMemo = new Map();
function wrapToFit(ctx, text, maxW, oneLineFs, minFs, fontStack, weight, twoLineFs = oneLineFs) {
  // 10-04j: memoized — this ran dozens of measureText calls every frame (≈12 % of main-thread time)
  const key = `${text}|${Math.round(maxW)}|${oneLineFs}|${minFs}|${fontStack}|${weight}|${twoLineFs}`;
  const hit = _wrapMemo.get(key);
  if (hit) { ctx.font = `${weight} ${hit.fs}px ${fontStack}`; return hit; }
  const res = wrapToFitRaw(ctx, text, maxW, oneLineFs, minFs, fontStack, weight, twoLineFs);
  if (_wrapMemo.size > 300) _wrapMemo.clear();
  _wrapMemo.set(key, res);
  ctx.font = `${weight} ${res.fs}px ${fontStack}`;
  return res;
}
function wrapToFitRaw(ctx, text, maxW, oneLineFs, minFs, fontStack, weight, twoLineFs = oneLineFs) {
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
  const selfHp = Math.max(0, Math.round(localState.selfHpDisplay ?? localState.player?.hp ?? 100));
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


/**
 * Core ↔ attached-unit bond (user 09-29: it must be obvious which units belong to which core).
 * Every live core draws pulsing energy tethers to each unit docked on it (formation / escort pack,
 * guards, chain links) and every attached unit gets an outline in the core's colour, pulsing in
 * sync with the core. Loose enemies never get this. Local objects only (remote snapshots carry no
 * attachment refs). Cost: 2 strokes per core per pass.
 */
const CORE_BOND_COL = {
  wave_core_boss: [255, 170, 60], wave_grid_core: [255, 90, 90], wave_ring_core: [255, 70, 110],
  wave_eye_boss: [200, 120, 255], wave_snake_head: [255, 110, 70], wave_swarm_core: [120, 255, 140],
};
const CORE_KIND_SET = new Set(Object.keys(CORE_BOND_COL));
function coreBondGroups(enemies) {
  let out = null;
  for (const e of enemies) {
    if (!CORE_KIND_SET.has(e.kind) || !e.core || e.core.hp <= 0 || e.hp <= 0) continue;
    (out || (out = [])).push({ e, m: [] });
  }
  if (!out) return [];
  for (const o of enemies) {
    const L = o._chainOf || o._lead;
    if (!L || o.hp <= 0 || o._chainT != null) continue;
    const g = out.find((q) => q.e === L);
    if (g) g.m.push(o);
  }
  return out;
}
function drawCoreBonds(ctx, groups, sx, sy, pass) {
  const now = performance.now() / 1000;
  for (const { e, m } of groups) {
    const col = CORE_BOND_COL[e.kind] || [255, 200, 80];
    const jet = e.boss === 'jet';
    const [r, g, b] = jet ? [80, 210, 255] : col;
    const p = 0.5 + 0.5 * Math.sin(now * 5.5 + (e._uid || 0));
    const cx = (e.x + (e.core.ox || 0)) * sx, cy = (e.y + (e.core.oy || 0)) * sy;
    const pts = [];
    const snake = e.kind === 'wave_snake_head';
    for (const o of m) pts.push([o.x * sx, o.y * sy, Math.max(o.w || 20, o.h || 16) * 0.62 * Math.min(sx, sy), o]);
    for (const d of e.drones || []) {
      if (d.hp <= 0) continue;
      pts.push([(e.x + Math.cos(d.ang) * d.dist) * sx, (e.y + Math.sin(d.ang) * d.dist * (d.ky || 1)) * sy, d.r * 1.35 * Math.min(sx, sy), null]);
    }
    if (!pts.length) continue;
    ctx.save();
    if (pass === 0) {
      if (!snake) { // the tether's own chain already shows the bond
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.22 + 0.3 * p})`;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 4]); ctx.lineDashOffset = -now * 30;
        ctx.beginPath();
        for (const [x, y] of pts) { ctx.moveTo(cx, cy); ctx.lineTo(x, y); }
        ctx.stroke();
      }
    } else if (!snake) {
      // Snake arm = video-cut metallic chain; bond outlines made it a fat row of red rings — skip.
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.55 + 0.4 * p})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [x, y, rr] of pts) { ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, Math.PI * 2); }
      ctx.stroke();
      // core beacon ring in the same colour, same pulse
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.5 + 0.45 * p})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, (e.core.r || 9) * (1.9 + 0.35 * p) * Math.min(sx, sy), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
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
  _paneFw = fw; // bubble entry shimmer: pane edge in these coordinates
  const bonds = coreBondGroups(enemies);
  if (bonds.length) drawCoreBonds(ctx, bonds, sx, sy, 0);
  for (const e of enemies) {
    if (e.kind === 'wave_bubble') continue; // drawn after the FX: the hit ring sits on top of the explosion (video)
    drawEnemy(ctx, {
      x: e.x * sx, y: e.y * sy, w: (e.w || 20) * sx, h: (e.h || 16) * sy,
      kind: e.kind, hp: e.hp, maxHp: e.maxHp || e.hp || 1, att: (e._chainOf || e._lead || e.at2) ? 1 : 0, color: e.c || e.color || '#c44', sent: e.s || e.sent,
      appearT: e.appearT ?? e.at, appearMax: e.appearMax || 0.9, _uid: e._uid ?? e.u,
      warpT: e.warpT ?? e.wt, warpPop: e.warpPop ?? e.wp,
      laserTeleT: e.laserTeleT ?? e.lt, laserTeleMax: e.laserTeleMax ?? e.lm ?? 0.55,
      laserAimX: (e.laserAimX ?? e.ax) != null ? (e.laserAimX ?? e.ax) * sx : undefined,
      laserAimY: (e.laserAimY ?? e.ay) != null ? (e.laserAimY ?? e.ay) * sy : undefined,
      laserTeleOffs: Array.isArray(e.laserTeleOffs ?? e.lo) ? (e.laserTeleOffs ?? e.lo).map((o) => o * sy) : undefined,
      spr: e.spr ?? e.sp, rot: e.rot ?? e.ro, tone: e.tone ?? e.tn, cm: e.cm, cs: e.cs ?? (e._sh ? e._sh.st : undefined), sk: e.sk ?? (e._shake > 0 ? 1 : 0), _coreFlash: e._coreFlash, _warn: e._warn, _dashWarn: e._dashWarn, claw: e.claw, podR: e.podR != null ? e.podR * Math.min(sx, sy) : undefined,
      core: e.core ? { ox: e.core.ox * sx, oy: e.core.oy * sy, r: e.core.r * Math.min(sx, sy), hp: e.core.hp, maxHp: e.core.maxHp }
        : (e.ch != null ? { ox: e.kind === 'wave_core_boss' ? -(e.w || 66) * 0.3 * sx : e.kind === 'wave_grid_core' ? -(e.w || 62) * 0.3 * sx : 0, oy: 0, r: 9 * Math.min(sx, sy), hp: e.ch, maxHp: e.cm } : undefined),
      drones: e.drones ? e.drones.map((d) => ({ ang: d.ang, dist: d.dist * Math.min(sx, sy), ky: (d.ky || 1) * sy / Math.min(sx, sy), r: d.r * Math.min(sx, sy), hp: d.hp, w: d.w }))
        : (Array.isArray(e.dr) ? e.dr.map((hp, i, a) => ({ ang: (Math.PI * 2 * i) / a.length + performance.now() / 1000 * 1.6, dist: (e.kind === 'wave_eye_boss' ? 80 : e.kind === 'wave_ring_core' ? Math.max(20, ((e.w || 92) - 20) / 2) : 36 + (i % 2) * 8) * Math.min(sx, sy), ky: e.kind === 'wave_ring_core' ? Math.max(1, ((e.h || 92) - 16) / Math.max(1, (e.w || 92) - 20)) : 1, r: (e.kind === 'wave_eye_boss' ? 15 : e.kind === 'wave_ring_core' ? 7.5 : 12) * Math.min(sx, sy), hp })) : undefined),
      bodyFlash: e._bodyFlash || 0,
    });
  }
  if (bonds.length) drawCoreBonds(ctx, bonds, sx, sy, 1);
  // User 10-04d: core life gauge above every core unit (attached guard units stay bar-less)
  for (const e of enemies) {
    const hp = e.core ? e.core.hp : e.ch, mx = e.core ? e.core.maxHp : e.cm;
    if (hp == null || !mx || hp <= 0 || (e.hp ?? 1) <= 0) continue;
    drawCoreLifeBar(ctx, e.x * sx, (e.y - (e.h || 30) / 2) * sy - 14 * Math.min(1, sy), Math.max(56, Math.min(96, (e.w || 40) * 0.9)) * Math.min(1, Math.max(sx, 0.6)), hp / mx, Math.min(1, Math.max(sx, 0.6)));
  }

  const bullets = snap.bullets || [];
  for (const b of bullets) {
    // 直接攻撃 shots use the normal player-shot sprite (oriented by velocity → pointing down).
    // In our own pane they are incoming → purple tint; in the opponent pane they are ours → normal red.
    const isDir = !!(b.D || b.dir);
    drawBullet(ctx, {
      x: b.x * sx, y: b.y * sy, owner: isDir ? 'player' : (b.o || b.owner), homing: isDir ? false : (b.h || b.homing),
      tint: isDir && !darkened ? 'in' : undefined, r: (b.r || 3) * Math.min(sx, sy), vx: b.vx, vy: b.vy,
      laser: !!(b.L || b.laser), k: b.k, st: b.st,
      trail: Array.isArray(b.trail) ? b.trail.map((p) => ({ x: p.x * sx, y: p.y * sy })) : undefined,
    });
  }

  const items = snap.worldItems || [];
  for (const it of items) drawItem(ctx, { x: it.x * sx, y: it.y * sy, id: it.id, life: it.life, mg: !!it._mag, tr: Array.isArray(it._tr) ? it._tr.map(([tx, ty]) => [tx * sx, ty * sy]) : null });

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
      kind: f.k ?? f.kind, sc: sx, g: f.g, ph: f.ph, n: f.n,
      t: tg ? tg.map(([tx, ty]) => [tx * sx, ty * sy]) : undefined,
      a: f.a, sd: f.sd, vx: f.vx != null ? f.vx * sx : undefined,
    });
  }
  for (const e of enemies) {
    if (e.kind !== 'wave_bubble') continue;
    drawEnemy(ctx, { x: e.x * sx, y: e.y * sy, w: (e.w || 20) * sx, h: (e.h || 16) * sy, kind: e.kind, hp: e.hp, _uid: e._uid ?? e.u });
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
    // Opponent using 直接攻撃 also turns nose-up (its shots leave upward, then rise into our pane from below)
    const oppUp = darkened && (snap.directBeam || snap.ap === 'direct');
    const ang = (facingUp || oppUp) ? -Math.PI / 2 : 0;
    let shipColor = darkened ? '#cde' : (snap.invuln > 0 ? '#ffaaaa' : '#e8f0ff');
    if (lowHp) shipColor = lowBlink ? '#ff6688' : '#ff3344';
        const ramOn = !darkened && snap.player && snap.player.activePower === 'ram' && snap.player.activeTimer > 0;
    const oppRam = darkened && (snap.ap === 'ram');
    if (!blink) {
      if (ramOn || oppRam) drawRamShip(ctx, px, py, 48 * Math.min(sx, 1.2), 28 * Math.min(sy, 1.2), performance.now() / 1000);
      else drawShip(ctx, px, py, 28 * Math.min(sx, 1.2), 18 * Math.min(sy, 1.2), shipColor, 1, ang);
    }
    if (!darkened && snap.player) drawLaser(ctx, snap.player, fh);
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

  // Core-hit blink of THIS field only (clipped to the pane; same for both sides)
  const ffa = coreFlashAlpha(snap.ff);
  if (ffa > 0.004) {
    ctx.fillStyle = `rgba(255,255,255,${ffa.toFixed(3)})`;
    ctx.fillRect(-40, -40, fw + 80, fh + 80);
  }

  ctx.restore();
}

/** 10-04: core-hit flash fades out by alpha over ≈0.5 s (h 0.6, w 0.3, break 0.7 held 0.1 s then 0.5 s fade). */
function coreFlashAlpha(ff) {
  if (!ff || ff.t0 == null) return 0;
  const now = performance.now();
  const fade = (age, peak, dur) => (age >= dur ? 0 : peak * Math.pow(1 - age / dur, 1.6));
  const age = Math.max(0, now - ff.t0);
  let a;
  if (ff.k === 'b') a = age < 100 ? 0.7 : fade(age - 100, 0.7, 500);
  else if (ff.k === 'w') a = fade(age, 0.3, 500);
  else a = fade(age, 0.6, 500);
  if (ff.b0 != null) a = Math.max(a, fade(Math.max(0, now - ff.b0), 0.3, 500)); // weak re-boost
  return a;
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
    ff: localState.ff,
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

  const pl = localState.player;

  // Direct-attack remaining-seconds HUD (own or incoming)
  drawDirectTimerHud(ctx, L, localState);
  if (localState.coinHud) drawCoinHud(ctx, L, localState.coinPt || 0, localState.coinLastGold, localState.coinPop);


  drawDamageFlash(ctx, L, localState.damageFlash);
  const playerMaxHp = localState.player.maxHp || 150;
  // Match decided (KO / TIME UP sequence running): drop the red low-HP vignette so the finish text stays readable
  if (!localState.koHp) drawLowHpWarning(ctx, L, localState.player.hp, playerMaxHp);
  drawDamageNumbers(ctx, L, localState.damageNumbers);

  // Divider between opp and own
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, L.oppH - 2, L.W, 3);
  ctx.fillStyle = 'rgba(255,200,150,0.25)';
  ctx.fillRect(0, L.oppH - 1, L.W, 1);

  const oppHp = remoteSnap ? (remoteSnap.php ?? playerMaxHp) : (localState.botHp ?? playerMaxHp);
  // Finish sequence: display-only life override (loser drains to exactly 0)
  const koHp = localState.koHp || null;
  const oppHpShown = koHp && Number.isFinite(koHp.opp) ? koHp.opp : oppHp;
  const selfHpShown = koHp && Number.isFinite(koHp.self) ? koHp.self : null;

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
  drawInfoPanel(ctx, L.info, { ...localState, oppHpDisplay: oppHpShown, selfHpDisplay: selfHpShown });

  // Item effect announcements are drawn inside the info pane (drawInfoPanel),
  // never over the opponent / own stages.

  // Life HUD last (above enemies / FX / panes) so large ships near the top cannot hide it
  drawHpBarsAtBoundary(ctx, L, selfHpShown ?? localState.player.hp, oppHpShown, playerMaxHp, {
    hpGhost: selfHpShown ?? localState.hpGhost,
    hpDisplay: selfHpShown ?? localState.hpDisplay,
    koFlashSelf: !!(koHp && koHp.flashSelf),
    koFlashOpp: !!(koHp && koHp.flashOpp),
    hpShake: localState.hpShake,
    damageFlash: localState.damageFlash,
    healFlash: localState.healFlash,
  });

  if (waiting) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, L.W, L.H);
  }
}


