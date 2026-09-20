/** Canvas rendering for 3-pane portrait shmup
 *  TOP / MIDDLE / BOTTOM — equal height (1/3 each) (操作画面)
 */

export const OPP_RATIO = 1 / 3;
export const OWN_RATIO = 1 / 3;
const ITEM_STYLE = {
  homing: { color: '#ff66ff', icon: '◆' },
  laser: { color: '#66ccff', icon: '═' },
  send: { color: '#ff8844', icon: '⇒' },
  direct: { color: '#ff3333', icon: '※' },
  heal: { color: '#44ff88', icon: '+' },
  heal_big: { color: '#22ff66', icon: '++' },
  send_mech: { color: '#55ff99', icon: '機' },
  send_golem: { color: '#ffbb55', icon: '岩' },
  send_tank: { color: '#66aaff', icon: '戦' },
  send_drone: { color: '#33ffff', icon: '群' },
};

export const CTRL_RATIO = 1 / 3;

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

/** Hit zone for 「アイテム」 button inside control pane (canvas pixels). */
export function itemButtonRect(ctrl) {
  const bw = Math.max(64, Math.min(110, ctrl.w * 0.24));
  const bh = Math.max(30, Math.min(44, ctrl.h * 0.30));
  const pad = Math.max(8, ctrl.w * 0.02);
  return {
    x: ctrl.x + ctrl.w - bw - pad,
    y: ctrl.y + pad,
    w: bw,
    h: bh,
  };
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

function drawShip(ctx, x, y, w, h, color = '#e8f0ff', facing = 1) {
  ctx.save();
  ctx.translate(x, y);
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

function metalFill(ctx, x0, y0, x1, y1, c0, c1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, c0);
  g.addColorStop(0.5, c1);
  g.addColorStop(1, '#1a1a22');
  return g;
}


function drawEnemy(ctx, e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const col = e.sent ? '#66eeff' : (e.color || e.c || '#ff5566');
  const t = performance.now() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 7 + e.x * 0.02);
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 14;

  const kind = e.kind;
  // Shared: fly leftward silhouette (nose to the left toward player)
  if (kind === 'tank') {
    // Heavy gunship — long hull + ventral cannons
    const g = ctx.createLinearGradient(-e.w, 0, e.w, 0);
    g.addColorStop(0, '#e8fbff'); g.addColorStop(0.45, col); g.addColorStop(1, '#0a2030');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-e.w * 0.55, 0);
    ctx.lineTo(-e.w * 0.2, -e.h * 0.45);
    ctx.lineTo(e.w * 0.45, -e.h * 0.28);
    ctx.lineTo(e.w * 0.55, 0);
    ctx.lineTo(e.w * 0.45, e.h * 0.28);
    ctx.lineTo(-e.w * 0.2, e.h * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.6; ctx.stroke();
    // Twin turrets
    ctx.fillStyle = '#1a3040';
    ctx.fillRect(-e.w * 0.05, -e.h * 0.55, e.w * 0.35, 5);
    ctx.fillRect(-e.w * 0.05, e.h * 0.5, e.w * 0.35, 5);
    ctx.fillStyle = `rgba(80,200,255,${0.5 + 0.4 * pulse})`;
    ctx.beginPath(); ctx.arc(e.w * 0.35, -e.h * 0.52, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.w * 0.35, e.h * 0.52, 3, 0, Math.PI * 2); ctx.fill();
    // Engines
    ctx.fillStyle = `rgba(100,220,255,${0.55 + 0.4 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(e.w * 0.55, -e.h * 0.12);
    ctx.lineTo(e.w * 0.85, 0);
    ctx.lineTo(e.w * 0.55, e.h * 0.12);
    ctx.fill();
    ctx.shadowBlur = 0; drawHpPip(ctx, e);
  } else if (kind === 'golem') {
    // Orbital fortress — hexagonal armored station
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, e.w * 0.55);
    g.addColorStop(0, '#fff'); g.addColorStop(0.35, col); g.addColorStop(1, '#201030');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * e.w * 0.48;
      const y = Math.sin(a) * e.h * 0.48;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    // Core
    ctx.fillStyle = `rgba(255,120,255,${0.6 + 0.35 * pulse})`;
    ctx.beginPath(); ctx.arc(0, 0, e.w * 0.14, 0, Math.PI * 2); ctx.fill();
    // Ring
    ctx.strokeStyle = `rgba(200,160,255,${0.4 + 0.3 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, e.w * 0.62, e.h * 0.22, t, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0; drawHpPip(ctx, e);
  } else if (kind === 'mech' || kind === 'boss') {
    // Capital ship / battleship — multi-deck silhouette
    const g = ctx.createLinearGradient(0, -e.h, 0, e.h);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, col); g.addColorStop(1, '#101828');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-e.w * 0.55, 0);
    ctx.lineTo(-e.w * 0.25, -e.h * 0.35);
    ctx.lineTo(e.w * 0.15, -e.h * 0.5);
    ctx.lineTo(e.w * 0.55, -e.h * 0.2);
    ctx.lineTo(e.w * 0.55, e.h * 0.2);
    ctx.lineTo(e.w * 0.15, e.h * 0.5);
    ctx.lineTo(-e.w * 0.25, e.h * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.8; ctx.stroke();
    // Bridge tower
    ctx.fillStyle = '#9cf';
    roundRectPath(ctx, -e.w * 0.05, -e.h * 0.22, e.w * 0.28, e.h * 0.2, 3);
    ctx.fill();
    // Window lights
    ctx.fillStyle = `rgba(180,230,255,${0.5 + 0.4 * pulse})`;
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(-e.w * 0.35 + i * e.w * 0.12, -e.h * 0.08, 4, 3);
      ctx.fillRect(-e.w * 0.35 + i * e.w * 0.12, e.h * 0.05, 4, 3);
    }
    // Rear thrusters
    ctx.fillStyle = `rgba(80,160,255,${0.55 + 0.4 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(e.w * 0.55, -e.h * 0.15);
    ctx.lineTo(e.w * 0.85, -e.h * 0.05);
    ctx.lineTo(e.w * 0.85, e.h * 0.05);
    ctx.lineTo(e.w * 0.55, e.h * 0.15);
    ctx.fill();
    ctx.shadowBlur = 0; drawHpPip(ctx, e);
  } else if (kind === 'drone' || kind === 'swarm') {
    // Tiny space probes
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, e.w * 0.5);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, col); g.addColorStop(1, '#033');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-e.w * 0.45, 0);
    ctx.lineTo(0, -e.h * 0.45);
    ctx.lineTo(e.w * 0.5, 0);
    ctx.lineTo(0, e.h * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
    // Antenna
    ctx.strokeStyle = `rgba(150,255,255,${0.5 + 0.4 * pulse})`;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.w * 0.55, -e.h * 0.35); ctx.stroke();
    ctx.fillStyle = '#8ff';
    ctx.beginPath(); ctx.arc(e.w * 0.55, -e.h * 0.35, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    if (kind === 'drone') drawHpPip(ctx, e);
  } else if (kind === 'elite') {
    // Elite interceptor — twin-boom space fighter
    const g = ctx.createLinearGradient(-e.w, 0, e.w, 0);
    g.addColorStop(0, '#fff0ff'); g.addColorStop(0.5, col); g.addColorStop(1, '#300040');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-e.w * 0.55, 0);
    ctx.lineTo(-e.w * 0.1, -e.h * 0.55);
    ctx.lineTo(e.w * 0.35, -e.h * 0.25);
    ctx.lineTo(e.w * 0.15, 0);
    ctx.lineTo(e.w * 0.35, e.h * 0.25);
    ctx.lineTo(-e.w * 0.1, e.h * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.stroke();
    // Twin booms
    ctx.fillStyle = '#602080';
    ctx.fillRect(e.w * 0.1, -e.h * 0.48, e.w * 0.4, 4);
    ctx.fillRect(e.w * 0.1, e.h * 0.44, e.w * 0.4, 4);
    // Cockpit
    ctx.fillStyle = '#fcf';
    ctx.beginPath(); ctx.ellipse(-e.w * 0.05, 0, e.w * 0.12, e.h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,100,255,${0.5 + 0.4 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(e.w * 0.15, -e.h * 0.1);
    ctx.lineTo(e.w * 0.55, 0);
    ctx.lineTo(e.w * 0.15, e.h * 0.1);
    ctx.fill();
    ctx.shadowBlur = 0; drawHpPip(ctx, e);
  } else {
    // basic scout — sleek alien dart
    const g = ctx.createLinearGradient(-e.w, -e.h, e.w, e.h);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, col); g.addColorStop(1, '#400010');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-e.w * 0.6, 0);
    ctx.quadraticCurveTo(-e.w * 0.1, -e.h * 0.55, e.w * 0.45, -e.h * 0.2);
    ctx.lineTo(e.w * 0.25, 0);
    ctx.lineTo(e.w * 0.45, e.h * 0.2);
    ctx.quadraticCurveTo(-e.w * 0.1, e.h * 0.55, -e.w * 0.6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();
    // Sensor eye
    const eye = ctx.createRadialGradient(-e.w * 0.15, 0, 0, -e.w * 0.15, 0, 6);
    eye.addColorStop(0, '#fff'); eye.addColorStop(0.35, '#4cf'); eye.addColorStop(1, '#012');
    ctx.fillStyle = eye;
    ctx.beginPath(); ctx.arc(-e.w * 0.15, 0, 5, 0, Math.PI * 2); ctx.fill();
    // Tail thruster
    ctx.fillStyle = `rgba(255,80,120,${0.5 + 0.45 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(e.w * 0.25, -e.h * 0.1);
    ctx.lineTo(e.w * 0.7, 0);
    ctx.lineTo(e.w * 0.25, e.h * 0.1);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  if (e.sent) {
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

/**
 * Bottom control surface (操作画面): purple/blue nebula pad — not a full playfield.
 * Shows status text, item pips, アイテム button, and optional touch crosshair.
 */
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

  // Queued items — color + icon + next label
  const items = (localState.player && localState.player.items) || [];
  const pipR = Math.max(8, Math.min(12, area.h * 0.07));
  const pipGap = pipR * 2.6;
  const pipY = area.h * 0.22;
  const startX = area.w * 0.1;
  for (let i = 0; i < items.length; i++) {
    const id = items[i];
    const st = ITEM_STYLE[id] || { color: '#ffd24a', icon: '?' };
    const ix = startX + i * pipGap;
    ctx.fillStyle = st.color;
    ctx.beginPath();
    ctx.arc(ix, pipY, pipR + (i === 0 ? 2 : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = i === 0 ? '#fff' : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = i === 0 ? 2.5 : 1.5;
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = `bold ${Math.max(9, pipR)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(st.icon, ix, pipY + 0.5);
  }
  if (items.length) {
    const next = ITEM_STYLE[items[0]] || {};
    const metaLabel = (localState.nextItemLabel) || '';
    ctx.font = `600 ${Math.max(10, area.h * 0.065)}px "Hiragino Sans","Noto Sans JP",sans-serif`;
    ctx.fillStyle = next.color || '#ffe08a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(metaLabel || '次のアイテム', startX - pipR, pipY + pipR + 4);
  }

  // 「アイテム」 tap button (top-right of control pane)
  const btn = itemButtonRect({ x: 0, y: 0, w: area.w, h: area.h });
  const hasItem = items.length > 0;
  ctx.fillStyle = hasItem ? 'rgba(255, 210, 74, 0.28)' : 'rgba(80, 90, 140, 0.35)';
  ctx.strokeStyle = hasItem ? 'rgba(255, 230, 140, 0.9)' : 'rgba(180, 190, 230, 0.55)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 6);
  ctx.fill();
  ctx.stroke();
  const btnFont = Math.max(11, Math.min(15, btn.w * 0.28));
  ctx.font = `700 ${btnFont}px "Hiragino Sans","Noto Sans JP","Yu Gothic",Meiryo,sans-serif`;
  ctx.fillStyle = hasItem ? '#fff8e0' : 'rgba(220,225,255,0.7)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 3;
  const nextId = items[0];
  const nextSt = nextId ? ITEM_STYLE[nextId] : null;
  ctx.fillText(nextSt ? `発動 ${nextSt.icon}` : 'アイテム', btn.x + btn.w * 0.5, btn.y + btn.h * 0.42);
  ctx.font = `600 ${Math.max(8, btnFont * 0.65)}px sans-serif`;
  ctx.fillStyle = hasItem ? 'rgba(255,248,224,0.85)' : 'rgba(220,225,255,0.55)';
  ctx.fillText('移動中もOK', btn.x + btn.w * 0.5, btn.y + btn.h * 0.72);
  ctx.shadowBlur = 0;

  // Status strip at bottom of control pane
  const stripH = Math.max(22, area.h * 0.22);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, area.h - stripH, area.w, stripH);
  const text = localState.statusText || '';
  if (text) {
    const fontSize = Math.max(11, Math.min(16, area.w * 0.042));
    ctx.font = `600 ${fontSize}px "Hiragino Sans","Noto Sans JP","Yu Gothic",Meiryo,sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.fillText(text, area.w * 0.5, area.h - stripH * 0.5, area.w * 0.92);
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
    drawBullet(ctx, { x: b.x * sx, y: b.y * sy, owner: b.o || b.owner, homing: b.h || b.homing, r: 3 });
  }

  const items = snap.worldItems || [];
  for (const it of items) drawItem(ctx, { x: it.x * sx, y: it.y * sy, id: it.id });

  const fx = snap.fx || [];
  for (const f of fx) drawFx(ctx, { x: f.x * sx, y: f.y * sy, life: f.l ?? f.life, max: f.m ?? f.max, r: (f.r || 14) * sx });

  // player
  const p = snap.player || { x: snap.px ?? 48, y: snap.py ?? 0.5 };
  const py = (p.y <= 1 ? p.y * fh : p.y * sy);
  const px = (p.x || snap.px || 48) * (p.x && p.x > 1 ? sx : 1);
  if (snap.alive !== false) {
    const blink = !darkened && snap.invuln > 0 && Math.floor(performance.now() / 60) % 2 === 0;
    if (!blink) drawShip(ctx, px, py, 28 * Math.min(sx, 1.2), 18 * Math.min(sy, 1.2), darkened ? '#cde' : (snap.invuln > 0 ? '#ffaaaa' : '#e8f0ff'));
    if (!darkened && snap.player) drawLaser(ctx, snap.player, fh);
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

  // 3) BOTTOM — 操作画面 (purple/blue nebula control pad)
  drawControlPanel(ctx, L.ctrl, localState);

  // Divider between own and control
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, L.oppH + L.ownH - 1, L.W, 2);


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
