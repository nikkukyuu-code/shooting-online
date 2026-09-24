/** Canvas rendering for 4-pane portrait shmup
 *  TOP opp / MIDDLE own / BOTTOM-ish ctrl (操作) / BOTTOM info — info 20%, remaining 80% split equally
 */

export const INFO_RATIO = 0.2;
export const OPP_RATIO = 0.8 / 3;
export const OWN_RATIO = 0.8 / 3;
const ITEM_STYLE = {
  homing:     { color: '#ff66ff', icon: '◆',  label: '追尾',   effect: '追尾弾を連射' },
  laser:      { color: '#66ccff', icon: '═',  label: 'レーザー', effect: '小刻み前方レーザー' },
  spread:     { color: '#ffaa33', icon: '※※', label: '散弾',   effect: '扇状弾幕' },
  bomb:       { color: '#ff5522', icon: '◎',  label: 'ボム',   effect: '画面全体攻撃' },
  shock:      { color: '#88ddff', icon: '⚡',  label: '電撃',   effect: '近距離感電' },
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
  const padTop = Math.max(6, ctrl.h * 0.04);
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

/** User-art enemy sprites: 5 per-kind anim frames (assets/enemies/<kind>/0..4.png).
 * Sourced from tools/source_enemy_sheet.png via tools/extract_user_enemy_sprites.py.
 * Motions: gentle ゆらゆら sway/bob baked into frames — no full spins. */
const ENEMY_KINDS = ['basic', 'drone', 'elite', 'mech', 'tank', 'golem', 'swarm', 'boss'];
const ENEMY_FRAME_COUNT = 5;
/** ms per frame — calm sway (~120–160ms). */
const ENEMY_FRAME_MS = {
  basic: 140,   // walk-bob + sway
  drone: 150,   // hover tilt/bob
  elite: 130,   // engine pulse + soft bank
  mech: 130,    // thruster flicker + soft sway
  tank: 160,    // heavy rock
  golem: 140,   // core pulse + arm sway
  swarm: 130,   // crescent rock/sway
  boss: 160,    // station pulse + soft sway
};
const ENEMY_FRAME_MS_DEFAULT = 140;
/** @type {Record<string, HTMLImageElement[]>} */
const enemySprites = Object.create(null);
let enemySpritesReady = false;
let enemySpritesLoading = false;

function enemyAssetUrl(kind, frame) {
  // Relative to page (GitHub Pages root of this repo); ?v= busts CDN/browser cache
  return `assets/enemies/${kind}/${frame}.png?v=1.5.43`;
}

export function preloadEnemySprites() {
  if (enemySpritesLoading || enemySpritesReady) return;
  enemySpritesLoading = true;
  let pending = 0;
  let loaded = 0;
  for (const kind of ENEMY_KINDS) {
    enemySprites[kind] = [];
    for (let i = 0; i < ENEMY_FRAME_COUNT; i++) {
      pending++;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        loaded++;
        if (loaded >= pending) enemySpritesReady = true;
      };
      img.onerror = () => {
        loaded++;
        if (loaded >= pending) enemySpritesReady = true;
      };
      img.src = enemyAssetUrl(kind, i);
      enemySprites[kind][i] = img;
    }
  }
}

// Kick off load as soon as this module evaluates
preloadEnemySprites();

function enemyFrameMs(kind) {
  return ENEMY_FRAME_MS[kind] || ENEMY_FRAME_MS_DEFAULT;
}

function enemyFrameIndex(e, kind) {
  const t = performance.now();
  const ms = enemyFrameMs(kind || e.kind || 'basic');
  // Desync by spawn x so packs don't animate in lockstep
  const offset = (typeof e.x === 'number' ? e.x : 0) * 0.07;
  return Math.floor((t + offset * ms) / ms) % ENEMY_FRAME_COUNT;
}

function drawEnemySprite(ctx, e, kind) {
  const frames = enemySprites[kind];
  if (!frames) return false;
  const img = frames[enemyFrameIndex(e, kind)];
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

/** Simple placeholder if a sprite fails to load — not the primary look. */
function drawEnemyFallback(ctx, e, kind, sent, w, h, t, pulse) {
  const body = sent ? 'rgba(80,200,220,0.85)' : 'rgba(200,60,70,0.85)';
  const rim = sent ? 'rgba(180,240,255,0.95)' : 'rgba(255,200,200,0.9)';
  const bob = Math.sin(t * 3.2 + (e.phase || 0)) * h * 0.03;
  ctx.save();
  ctx.translate(0, bob);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.48, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // tiny kind initial so missing assets are obvious in debug
  ctx.fillStyle = rim;
  ctx.font = `bold ${Math.max(8, Math.floor(h * 0.35))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((kind || '?')[0].toUpperCase(), 0, 0);
  ctx.restore();
}

function drawEnemy(ctx, e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const sent = !!e.sent;
  const t = performance.now() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 7 + e.x * 0.02);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6;

  const kind = e.kind || 'basic';
  const w = e.w, h = e.h;

  const drew = drawEnemySprite(ctx, e, kind);
  if (!drew) {
    drawEnemyFallback(ctx, e, kind, sent, w, h, t, pulse);
  }

  ctx.shadowBlur = 0;
  // HP pip: same kinds as pre-sprite (skip tiny swarm + basic)
  if (kind !== 'swarm' && kind !== 'basic') drawHpPip(ctx, e);

  if (sent) {
    ctx.fillStyle = 'rgba(100,230,255,0.9)';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SEND', 0, e.h * 0.78);
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
    ctx.fillStyle = '#ff6644';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r || 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawItem(ctx, it) {
  const st = ITEM_STYLE[it.id] || { color: '#ffd24a', icon: '★' };
  ctx.save();
  ctx.translate(it.x, it.y);
  ctx.shadowColor = st.color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = st.color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#111';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(st.icon, 0, 1);
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

function drawFx(ctx, f) {
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

/** Green HP bars near the top/middle pane boundary — with drain ghost + shake. */
function drawHpBarsAtBoundary(ctx, L, selfHp, oppHp, maxHp, fx = {}) {
  const ghost = fx.hpGhost != null ? fx.hpGhost : selfHp;
  const display = fx.hpDisplay != null ? fx.hpDisplay : selfHp;
  const shake = Math.max(0, fx.hpShake || 0);
  const flash = Math.max(0, fx.damageFlash || 0);
  const x0 = L.W * 0.16;
  const barW = L.W * 0.58;
  const barH = Math.max(6, Math.min(11, L.H * 0.012));
  const gap = barH + 6;
  const y0 = L.oppH + Math.max(6, L.ownH * 0.02);
  const jx = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
  const jy = shake > 0 ? (Math.random() - 0.5) * 6 * shake : 0;
  const x = x0 + jx;
  const y = y0 + jy;

  // TOP = opponent (near opponent pane)
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y, barW, barH);
  ctx.fillStyle = '#6f6';
  ctx.fillRect(x, y, barW * Math.max(0, oppHp / maxHp), barH);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barW, barH);
  ctx.font = `600 ${Math.max(8, barH - 1)}px sans-serif`;
  ctx.fillStyle = 'rgba(220,255,220,0.85)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('あいて', x + 4, y + barH * 0.5);

  // BOTTOM = self (near own pane) — lost-HP ghost drains slowly
  const ySelf = y + gap;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x, ySelf, barW, barH);
  // ghost chunk (orange) — stays visible longer
  ctx.fillStyle = flash > 0 ? '#ff5533' : '#ff8844';
  ctx.fillRect(x, ySelf, barW * Math.max(0, ghost / maxHp), barH);
  const ratio = Math.max(0, display / maxHp);
  ctx.fillStyle = ratio < 0.3 ? '#ff3333' : ratio < 0.55 ? '#ffcc33' : '#33ee66';
  ctx.fillRect(x, ySelf, barW * ratio, barH);
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.35 * Math.min(1, flash / 0.35)})`;
    ctx.fillRect(x, ySelf, barW * ratio, barH);
  }
  ctx.strokeStyle = flash > 0 ? '#fff' : 'rgba(255,255,255,0.65)';
  ctx.lineWidth = flash > 0 ? 2 : 1;
  ctx.strokeRect(x, ySelf, barW, barH);
  ctx.font = `700 ${Math.max(9, barH)}px sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.max(0, Math.ceil(display))}`, x - 6, ySelf + barH * 0.5);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,200,0.9)';
  ctx.fillText('じぶん', x + 4, ySelf + barH * 0.5);
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

  // Large status line
  const statusFs = Math.max(14, Math.min(22, area.h * 0.28));
  ctx.font = `700 ${statusFs}px ${fontStack}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 5;
  ctx.fillText(status, area.w * 0.5, area.h * 0.32, area.w * 0.94);
  ctx.shadowBlur = 0;

  // Self / opponent HP
  const hpFs = Math.max(12, Math.min(18, area.h * 0.2));
  ctx.font = `600 ${hpFs}px ${fontStack}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#88ffaa';
  ctx.fillText(`自分 HP ${selfHp}`, area.w * 0.04, area.h * 0.62, area.w * 0.44);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ff8899';
  ctx.fillText(`相手 HP ${oppHp}`, area.w * 0.96, area.h * 0.62, area.w * 0.44);

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
      ctx.fillText(`枠${i + 1}`, r.btnX + r.btnW * 0.5, r.btnY + r.btnH * 0.5);
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
    });
  }

  const bullets = snap.bullets || [];
  for (const b of bullets) {
    drawBullet(ctx, {
      x: b.x * sx, y: b.y * sy, owner: b.o || b.owner, homing: b.h || b.homing, r: 3, vx: b.vx, vy: b.vy,
      trail: Array.isArray(b.trail) ? b.trail.map((p) => ({ x: p.x * sx, y: p.y * sy })) : undefined,
    });
  }

  const items = snap.worldItems || [];
  for (const it of items) drawItem(ctx, { x: it.x * sx, y: it.y * sy, id: it.id });

  const meteors = snap.meteors || [];
  for (const m of meteors) {
    drawMeteor(ctx, {
      x: m.x * sx,
      y: m.y * sy,
      r: (m.r || 16) * Math.min(sx, sy),
      rot: m.rot || 0,
    });
  }

  const fx = snap.fx || [];
  for (const f of fx) drawFx(ctx, { x: f.x * sx, y: f.y * sy, life: f.l ?? f.life, max: f.m ?? f.max, r: (f.r || 14) * sx });

  // player
  const p = snap.player || { x: snap.px ?? 48, y: snap.py ?? 0.5 };
  const py = (p.y <= 1 ? p.y * fh : p.y * sy);
  const px = (p.x || snap.px || 48) * (p.x && p.x > 1 ? sx : 1);
  if (snap.alive !== false) {
    const blink = !darkened && snap.invuln > 0 && Math.floor(performance.now() / 60) % 2 === 0;
    const facingUp = !darkened && snap.player && snap.player.activePower === 'direct' && snap.player.activeTimer > 0;
    const facingDown = darkened && snap.directBeam; // opponent firing down at us
    const ang = facingUp ? -Math.PI / 2 : (facingDown ? Math.PI / 2 : 0);
    if (!blink) drawShip(ctx, px, py, 28 * Math.min(sx, 1.2), 18 * Math.min(sy, 1.2), darkened ? '#cde' : (snap.invuln > 0 ? '#ffaaaa' : '#e8f0ff'), 1, ang);
    if (!darkened && snap.player) drawLaser(ctx, snap.player, fh);
    // Own-pane part of upward direct beam
    if (facingUp) {
      const lr = Math.min(1, snap.player.activeTimer / 0.85);
      drawDirectBeam(ctx, px, py - 16, px, 8, lr);
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


  // HP bars near boundary between top and middle
  const oppHp = remoteSnap ? (remoteSnap.php ?? 100) : (localState.botHp ?? 100);
  drawHpBarsAtBoundary(ctx, L, localState.player.hp, oppHp, 100, {
    hpGhost: localState.hpGhost,
    hpDisplay: localState.hpDisplay,
    hpShake: localState.hpShake,
    damageFlash: localState.damageFlash,
  });
  drawDamageFlash(ctx, L, localState.damageFlash);
  drawDamageNumbers(ctx, L, localState.damageNumbers);

  // Divider between opp and own
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, L.oppH - 2, L.W, 3);
  ctx.fillStyle = 'rgba(255,200,150,0.25)';
  ctx.fillRect(0, L.oppH - 1, L.W, 1);

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

  // Item effect banner (center of own field)
  const ban = localState.itemBanner;
  if (ban && ban.life > 0) {
    const a = Math.min(1, ban.life / 0.35) * Math.min(1, (ban.max - ban.life) / 0.2 + 0.8);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    const bx = L.own.x + L.own.w * 0.5;
    const by = L.own.y + L.own.h * 0.2;
    const tw = L.own.w * 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, bx - tw / 2, by - 18, tw, 36, 8);
    ctx.fill();
    ctx.strokeStyle = ban.color || '#fff';
    ctx.lineWidth = 2;
    roundRect(ctx, bx - tw / 2, by - 18, tw, 36, 8);
    ctx.stroke();
    ctx.fillStyle = ban.color || '#fff';
    ctx.font = `800 ${Math.max(13, L.own.w * 0.045)}px "Hiragino Sans","Noto Sans JP",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ban.text, bx, by, tw * 0.92);
    ctx.restore();
  }

  if (waiting) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, L.W, L.H);
  }
}
