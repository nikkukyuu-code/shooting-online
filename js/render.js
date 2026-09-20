/** Canvas rendering for 3-pane portrait shmup
 *  TOP ~30% opponent | MIDDLE ~45% own | BOTTOM ~25% control
 */

export const OPP_RATIO = 0.30;
export const OWN_RATIO = 0.45;
export const CTRL_RATIO = 0.25;

export function layout(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const oppH = Math.floor(H * OPP_RATIO);
  const ownH = Math.floor(H * OWN_RATIO);
  const ctrlH = H - oppH - ownH; // remainder ≈ 25%
  return {
    W, H, oppH, ownH, ctrlH,
    opp:  { x: 0, y: 0,           w: W, h: oppH },
    own:  { x: 0, y: oppH,        w: W, h: ownH },
    ctrl: { x: 0, y: oppH + ownH, w: W, h: ctrlH },
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

function drawShip(ctx, x, y, w, h, color = '#e8f0ff', facing = 1) {
  ctx.save();
  ctx.translate(x, y);
  if (facing < 0) ctx.scale(-1, 1);
  // body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(w * 0.55, 0);
  ctx.lineTo(-w * 0.45, -h * 0.55);
  ctx.lineTo(-w * 0.2, 0);
  ctx.lineTo(-w * 0.45, h * 0.55);
  ctx.closePath();
  ctx.fill();
  // cockpit
  ctx.fillStyle = '#7fd0ff';
  ctx.beginPath();
  ctx.ellipse(w * 0.1, 0, w * 0.18, h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  // engine glow
  ctx.fillStyle = '#ffcc44';
  ctx.beginPath();
  ctx.moveTo(-w * 0.45, -h * 0.25);
  ctx.lineTo(-w * 0.7, 0);
  ctx.lineTo(-w * 0.45, h * 0.25);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx, e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.kind === 'boss') {
    ctx.fillStyle = '#9aa';
    ctx.beginPath();
    ctx.moveTo(e.w * 0.5, 0);
    ctx.lineTo(-e.w * 0.35, -e.h * 0.5);
    ctx.lineTo(-e.w * 0.15, 0);
    ctx.lineTo(-e.w * 0.35, e.h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff8';
    ctx.lineWidth = 2;
    ctx.stroke();
    // HP pip
    const pct = e.hp / e.maxHp;
    ctx.fillStyle = '#0008';
    ctx.fillRect(-e.w * 0.4, -e.h * 0.65, e.w * 0.8, 5);
    ctx.fillStyle = '#3f3';
    ctx.fillRect(-e.w * 0.4, -e.h * 0.65, e.w * 0.8 * pct, 5);
  } else {
    ctx.fillStyle = e.sent ? '#6cf' : e.color;
    ctx.beginPath();
    ctx.moveTo(-e.w * 0.5, 0);
    ctx.lineTo(e.w * 0.35, -e.h * 0.5);
    ctx.lineTo(e.w * 0.15, 0);
    ctx.lineTo(e.w * 0.35, e.h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff6';
    ctx.fillRect(-2, -2, 4, 4);
  }
  ctx.restore();
}

function drawBullet(ctx, b) {
  ctx.save();
  if (b.owner === 'player') {
    ctx.strokeStyle = b.homing ? '#ff88ff' : '#fff';
    ctx.lineWidth = b.homing ? 3 : 2;
    ctx.shadowColor = b.homing ? '#f0f' : '#8cf';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(b.x - 8, b.y);
    ctx.lineTo(b.x + 6, b.y);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#ff6644';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r || 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawItem(ctx, it) {
  ctx.save();
  ctx.translate(it.x, it.y);
  ctx.fillStyle = '#ffd24a';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 9 : 4;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
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

/** Green HP bars near the top/middle pane boundary. */
function drawHpBarsAtBoundary(ctx, L, selfHp, oppHp, maxHp) {
  const x = L.W * 0.16;
  const barW = L.W * 0.58;
  const barH = Math.max(4, Math.min(8, L.H * 0.008));
  const gap = barH + 5;
  // Sit just below the opp/own divider (into middle pane a bit), matching reference stills
  const y = L.oppH + Math.max(6, L.ownH * 0.02);

  // self
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y, barW, barH);
  ctx.fillStyle = '#3f3';
  ctx.fillRect(x, y, barW * Math.max(0, selfHp / maxHp), barH);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.strokeRect(x, y, barW, barH);
  // opponent
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y + gap, barW, barH);
  ctx.fillStyle = '#6f6';
  ctx.fillRect(x, y + gap, barW * Math.max(0, oppHp / maxHp), barH);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.strokeRect(x, y + gap, barW, barH);
}

function drawLaser(ctx, player, fieldH) {
  if (player.activePower !== 'laser' || player.activeTimer <= 0) return;
  const y = player.y * fieldH;
  ctx.save();
  ctx.globalAlpha = 0.55 + 0.25 * Math.sin(performance.now() / 40);
  ctx.strokeStyle = '#8cf';
  ctx.lineWidth = 10;
  ctx.shadowColor = '#4af';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(player.x + 14, y);
  ctx.lineTo(fieldH * 3, y); // long beam — clipped by field
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(player.x + 14, y);
  ctx.lineTo(fieldH * 3, y);
  ctx.stroke();
  ctx.restore();
}

/** Cooler purple-blue-grey control panel (not a play field). */
function drawControlPanel(ctx, area, localState) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  ctx.translate(area.x, area.y);

  const g = ctx.createLinearGradient(0, 0, 0, area.h);
  g.addColorStop(0, '#3a3a55');
  g.addColorStop(0.4, '#2c2c48');
  g.addColorStop(1, '#1a1a30');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, area.w, area.h);

  // subtle panel sheen
  ctx.fillStyle = 'rgba(120, 130, 180, 0.08)';
  ctx.fillRect(0, 0, area.w, area.h * 0.35);

  // top edge highlight
  ctx.fillStyle = 'rgba(180, 190, 220, 0.22)';
  ctx.fillRect(0, 0, area.w, 2);

  // Queued item icons / pips (center-upper of panel)
  const items = (localState.player && localState.player.items) || [];
  const pipR = Math.max(5, Math.min(9, area.h * 0.06));
  const pipGap = pipR * 2.4;
  const totalW = items.length ? (items.length - 1) * pipGap : 0;
  const startX = area.w * 0.5 - totalW * 0.5;
  const pipY = area.h * 0.32;
  for (let i = 0; i < items.length; i++) {
    const ix = startX + i * pipGap;
    ctx.fillStyle = i === 0 ? '#ffd24a' : '#c8a84a';
    ctx.beginPath();
    ctx.arc(ix, pipY, pipR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Soft virtual-pad hint ring in center when no items
  if (!items.length) {
    ctx.strokeStyle = 'rgba(160, 170, 210, 0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(area.w * 0.5, area.h * 0.38, Math.min(area.w, area.h) * 0.18, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Status / instruction text (DOM also mirrors this; canvas copy for offline/embed)
  const text = localState.statusText || '';
  if (text) {
    const fontSize = Math.max(12, Math.min(18, area.w * 0.045));
    ctx.font = `600 ${fontSize}px "Hiragino Sans","Noto Sans JP","Yu Gothic",Meiryo,sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.fillText(text, area.w * 0.5, area.h * 0.72, area.w * 0.92);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
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

  if (darkened) {
    ctx.fillStyle = 'rgba(20, 10, 40, 0.55)';
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
    drawBullet(ctx, { x: b.x * sx, y: b.y * sy, owner: b.o || b.owner, homing: b.h || b.homing, r: 3 });
  }

  const items = snap.worldItems || [];
  for (const it of items) drawItem(ctx, { x: it.x * sx, y: it.y * sy });

  const fx = snap.fx || [];
  for (const f of fx) drawFx(ctx, { x: f.x * sx, y: f.y * sy, life: f.l ?? f.life, max: f.m ?? f.max, r: (f.r || 14) * sx });

  // player
  const p = snap.player || { x: snap.px ?? 48, y: snap.py ?? 0.5 };
  const py = (p.y <= 1 ? p.y * fh : p.y * sy);
  const px = (p.x || snap.px || 48) * (p.x && p.x > 1 ? sx : 1);
  if (snap.alive !== false) {
    drawShip(ctx, px, py, 28 * Math.min(sx, 1.2), 18 * Math.min(sy, 1.2), darkened ? '#cde' : '#e8f0ff');
    if (!darkened && snap.player) drawLaser(ctx, snap.player, fh);
  }

  ctx.restore();
}

export function renderFrame(ctx, L, localState, remoteSnap, waiting) {
  ctx.clearRect(0, 0, L.W, L.H);

  const localSnap = {
    player: localState.player,
    enemies: localState.enemies,
    bullets: localState.bullets,
    worldItems: localState.items,
    fx: localState.fx,
    scroll: localState.scroll,
    alive: localState.alive,
  };

  // 1) TOP — opponent live view (darkened)
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

  // 2) MIDDLE — player's own gameplay field
  drawField(ctx, L.own, localSnap, { darkened: false });

  // HP bars near boundary between top and middle
  const oppHp = remoteSnap ? (remoteSnap.php ?? 100) : (localState.botHp ?? 100);
  drawHpBarsAtBoundary(ctx, L, localState.player.hp, oppHp, 100);

  // Divider between opp and own
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, L.oppH - 2, L.W, 3);
  ctx.fillStyle = 'rgba(255,200,150,0.25)';
  ctx.fillRect(0, L.oppH - 1, L.W, 1);

  // 3) BOTTOM — control panel (cooler tone; not a play field)
  drawControlPanel(ctx, L.ctrl, localState);

  // Divider between own and control
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, L.oppH + L.ownH - 1, L.W, 2);

  if (waiting) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, L.W, L.H);
  }
}
