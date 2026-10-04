import { runWaveScript, moveScripted, fireScripted, tickRearGuard } from './waves.js?v=20261004164833';
import {
  POWERUPS, powerupMeta, pickPowerupId, DIRECT_DURATION, DIRECT_SHOT_DMG, DIRECT_SHOT_SPEED, spawnDirectShot, spawnDirectOutShot, createPlayer, spawnEnemy, spawnBullet, spawnItem, spawnItemWithId, spawnExplosion, spawnHitSpark, spawnMeteor, serializeField, SHOCK_RADIUS, spawnShockFx, spawnBombFx, spawnHealFx,
  PLAYER_MAX_HP, ITEM_DROP_CHANCE, BOT_ITEM_DROP_CHANCE,
  setKindTier, resolveEnemyTier, isLargeEnemy, enemyAttackUsesLaser,
  WAVE_KIND_TIERS, LARGE_ENEMY_TIERS,
  hasCore, tickCoreExtras, applyCoreAwareHit, applyCoreAwareArea, applyCoreAwareBeam, coreWorld, magnetStep, ITEM_MAGNET_R,
  markCoreChain, tickChain, spawnChainBoom, spawnKillBoom, applyLaserTick, spawnCoin, tickCoins, trimFx, spawnCoreEscorts, tickEscort, CHAIN_R, isCoreBossKind, bigCoreKind,
} from './entities.js?v=20261004164833';
import { resizeCanvas, renderFrame, layout, INFO_RATIO, OPP_RATIO, OWN_RATIO, CTRL_RATIO, itemSlotRects, hitItemSlot, MAX_ITEM_SLOTS, registerEnemyKinds } from './render.js?v=20261004164833';
import { sfx } from './audio.js?v=20261004164833';
import { isExAttackItem, useExItem, tickExItems, hasBarrierFx } from './attack_items.js?v=20261004164833';
import { ALL_KIND_IDS, CATALOG_BY_ID, unitStats, atkDamageMul, defHpMul, pickSendKinds, sentUnitHp } from './catalog.js?v=20261004164833';
import { hitBattleCounter } from './stats.js?v=20261004164833';
import { loadMeta, grantComVictoryPt, grantCoinPt, COM_DECK, DECK_SIZE, buildComDeck, COM_DIFFICULTY, COUNTER_LABEL, comAiForLevel, comRankInfo, recordComResult } from './meta.js?v=20261004164833';
import { usesLoadout, loadoutTelegraph, fireLoadoutVolley, loadoutReload, tickEnemyAttackQueue, updateEnemyBullet } from './attacks.js?v=20261004164833';

const HINT = '敵を倒してアイテム取得（デカ敵は回復が出やすい・所持最大3つ）';
const TUTORIAL_KEY = 'shootingOnline_tutorialDone';
const TUTORIAL_STEPS = [
  { title: '操作', text: '下の操作画面で自機をドラッグ（←→↑↓／WASDでも移動）' },
  { title: 'アイテム', text: '右の枠をタップして発動。敵を倒すとドロップします' },
  { title: 'デカ敵', text: 'デカい敵を倒すと回復アイテムが出る' },
  { title: '所持上限', text: 'アイテムは最大3つ。枠がいっぱいのとき拾うと、新しいほうは消えます' },
  { title: '勝ち方', text: '相手より長く生き残ろう。送信や攻撃アイテムで相手を攻めよう' },
];
const TUTORIAL_STEP_SEC = 3.8;

const WAIT = '対戦相手を待っています';

/**
 * Warp-in for transferred (sent) units: 0–3s enters from off-screen right (ease-out) inside a
 * blinking ring, 3–5s steady ring + unit at the hold point.
 * During the whole 5s the unit is invulnerable (shots pass through), harmless
 * (no fire, no body damage). At 5s the ring pops and the unit starts attacking.
 */
export const WARP_TOTAL = 5;
export const WARP_BLINK = 3;
const WARP_POP = 0.35;
const warping = (e) => e && e.warpT > 0;
/** Advance warp timers; returns true while the unit is still warping (skip move/fire). */
function tickWarp(e, dt) {
  if (e.warpPop > 0) e.warpPop = Math.max(0, e.warpPop - dt);
  if (!(e.warpT > 0)) return false;
  // Queued arrival (pane crowded with just-arrived sent units): wait off-screen, then warp in
  if (e.arriveDelay > 0) {
    e.arriveDelay = Math.max(0, e.arriveDelay - dt);
    if (e.warpX0 != null) e.x = e.warpX0;
    if (e.holdY != null) e.y = e.holdY;
    if (e.warpHp != null && e.hp < e.warpHp) e.hp = e.warpHp;
    return true;
  }
  e.warpT = Math.max(0, e.warpT - dt);
  // 0–3s: glide in from off-screen (ease-out) to the hold point; 3–5s: hold still
  if (e.warpX0 != null && e.holdX != null) {
    const u = Math.min(1, (WARP_TOTAL - e.warpT) / WARP_BLINK);
    const ease = 1 - Math.pow(1 - u, 3);
    e.x = e.warpX0 + (e.holdX - e.warpX0) * ease;
    if (e.holdY != null) e.y = e.holdY;
  }
  if (e.warpHp != null && e.hp < e.warpHp) e.hp = e.warpHp; // safety net: no damage while warping
  if (e.warpT > 0) return true;
  // Ring off → start attacking right away
  e.warpPop = WARP_POP;
  e.fireCd = Math.min(e.fireCd || 1, 0.25 + Math.random() * 0.35);
  return false;
}

/** 10-04h: core-break / big-enemy heal is no longer guaranteed — 50 % (player and COM alike). */
const HEAL_GUARANTEE_P = 0.75;

/** Match time limit (seconds). Hidden test override: globalThis.__shootingMatchSec (not exposed in UI). */
const MATCH_TIME_SEC = 300;
function matchTimeSec() {
  const o = Number(globalThis.__shootingMatchSec);
  return Number.isFinite(o) && o > 0 ? o : MATCH_TIME_SEC;
}
function fmtClock(sec) {
  const t = Math.max(0, Math.ceil(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// Register catalog sprites + tier map (catalog + wave ambient kinds)
registerEnemyKinds(ALL_KIND_IDS);
setKindTier({
  ...Object.fromEntries(ALL_KIND_IDS.map((id) => [id, (CATALOG_BY_ID[id] && CATALOG_BY_ID[id].tier) || id])),
  ...WAVE_KIND_TIERS,
});

/** How many copies a send-item type spawns from the deck. */

/** Homing missile: limited turn rate + sticky lock-on (no instant snap). */
const HOMING_TURN_RATE = 10.5; // rad/s (~9–12)
const HOMING_SPD = 380;
const HOMING_TRAIL_CAP = 12;

function steerHomingBullet(b, enemies, dt, fieldW) {
  let target = null;
  if (b.lockKey != null) {
    target = enemies.find((e) => e._uid === b.lockKey) || null;
    // Drop lock if dead, far behind, or offscreen
    if (target && (target.hp <= 0 || target.x < b.x - 50 || target.x > fieldW + 80 || target.x < -40)) {
      target = null;
      b.lockKey = null;
    }
  }
  if (!target) {
    let best = null;
    let bestD = 1e9;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      if (e.x < b.x - 20) continue; // roughly ahead
      const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      target = best;
      b.lockKey = best._uid;
    }
  }
  if (target) {
    const desired = Math.atan2(target.y - b.y, target.x - b.x);
    let cur = Math.atan2(b.vy || 0, b.vx || 1);
    let delta = desired - cur;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxTurn = HOMING_TURN_RATE * dt;
    if (delta > maxTurn) delta = maxTurn;
    else if (delta < -maxTurn) delta = -maxTurn;
    const ang = cur + delta;
    b.vx = Math.cos(ang) * HOMING_SPD;
    b.vy = Math.sin(ang) * HOMING_SPD;
  }
}

function pushHomingTrail(b) {
  if (!b.homing) return;
  b.trail = b.trail || [];
  b.trail.push({ x: b.x, y: b.y });
  if (b.trail.length > HOMING_TRAIL_CAP) b.trail.shift();
}

/** Enemy limited-homing: steer toward ship only while homeT > 0, then go straight. */
const ENEMY_HOMING_TURN = 7.0; // rad/s — weaker than player (10.5)
const ENEMY_HOMING_SPD = 280;

function steerEnemyHoming(b, tx, ty, dt) {
  // Hard guard: lasers never home, even if homing/homeT was set by mistake.
  if (b.laser) return;
  if (!b.homing || b.owner !== 'enemy') return;
  if (typeof b.homeT === 'number') {
    if (b.homeT <= 0) return;
    b.homeT -= dt;
  }
  const desired = Math.atan2(ty - b.y, tx - b.x);
  let cur = Math.atan2(b.vy || 0, b.vx || -1);
  let delta = desired - cur;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const maxTurn = ENEMY_HOMING_TURN * dt;
  if (delta > maxTurn) delta = maxTurn;
  else if (delta < -maxTurn) delta = -maxTurn;
  const ang = cur + delta;
  b.vx = Math.cos(ang) * ENEMY_HOMING_SPD;
  b.vy = Math.sin(ang) * ENEMY_HOMING_SPD;
}

/**
 * Kind-tuned enemy attack: normal / laser pulses / limited-homing missiles.
 * tx,ty = target ship position in field pixels.
 */
function pushEnemyAttack(e, bullets, tx, ty) {
  const kind = resolveEnemyTier(e.kind || 'basic');
  const ox = e.x - (e.w || 20) * 0.4;
  const oy = e.y;
  // Missiles may aim at live target; lasers NEVER use player tx/ty for direction.
  const missileAim = Math.atan2(ty - oy, tx - ox);

  const fireNormal = (vx, vy, dmg = 2) => {
    bullets.push(spawnBullet(ox, oy, vx, vy, 'enemy', false, dmg));
  };
  // Always straight horizontal toward player side: vx < 0, vy === 0.
  // yOff = parallel beam spawn offset in px (not aim angle / not player Y).
  const fireLaser = (spd = 480, dmg = 2, yOff = 0) => {
    bullets.push(spawnBullet(
      ox, oy + yOff, -Math.abs(spd), 0,
      'enemy', false, dmg, { laser: true, life: 2.0 },
    ));
  };
  const fireMissile = (homeDur = 0.55, angJitter = 0.3) => {
    const a = missileAim + (Math.random() - 0.5) * angJitter;
    const spd = 230 + Math.random() * 30;
    // Spawn dmg field lowered (was 3); player hit uses softened 2/4
    bullets.push(spawnBullet(
      ox, oy, Math.cos(a) * spd, Math.sin(a) * spd,
      'enemy', true, 2,
      { homeT: homeDur, homeMax: homeDur, life: 2.8 },
    ));
  };

  if (kind === 'swarm') {
    fireNormal(-170 - Math.random() * 30, (Math.random() - 0.5) * 28, 1);
  } else if (kind === 'basic') {
    if (Math.random() < 0.4) fireLaser(400, 2);
    else fireNormal(-165 - Math.random() * 25, (ty - oy) * 0.4, 2);
  } else if (kind === 'drone') {
    fireLaser(440, 2);
    if (Math.random() < 0.3) fireMissile(0.4, 0.4);
  } else if (kind === 'elite') {
    fireLaser(500, 2);
    fireNormal(-150, -36, 1);
    fireNormal(-150, 36, 1);
    if (Math.random() < 0.6) fireMissile(0.5);
  } else if (kind === 'mech') {
    fireLaser(520, 2, -8);
    fireLaser(500, 2, 8);
    fireMissile(0.6, 0.25);
    fireNormal(-145, -48, 1);
    fireNormal(-145, 48, 1);
  } else if (kind === 'golem') {
    fireLaser(460, 2, -12);
    fireLaser(480, 2, 0);
    fireLaser(460, 2, 12);
    if (Math.random() < 0.35) fireMissile(0.45);
  } else if (kind === 'tank') {
    fireLaser(510, 2);
    fireNormal(-185, -55, 2);
    fireNormal(-185, 0, 2);
    fireNormal(-185, 55, 2);
    if (Math.random() < 0.45) fireMissile(0.48);
  } else if (kind === 'boss') {
    fireLaser(540, 3, -10);
    fireLaser(520, 2, 10);
    fireMissile(0.65, 0.2);
    fireMissile(0.5, 0.45);
    fireNormal(-170, -40, 2);
    fireNormal(-170, 40, 2);
  } else {
    fireNormal(-160 - Math.random() * 30, (Math.random() - 0.5) * 24, 2);
  }
}

/** Laser charge telegraph duration for large sent enemies (readable "about to fire"). */
const LASER_TELE_DUR = 0.55;

/**
 * Fire-cycle for one enemy: large sent + laser → telegraph first, then pushEnemyAttack.
 * computeReload() returns the post-shot fireCd.
 * Returns true if a shot was fired this frame.
 */
function tickEnemyLaserFire(e, bullets, tx, ty, dt, canFire, computeReload) {
  // Catalog / sent units use their own per-unit loadout (js/attacks.js); wave_* keep pushEnemyAttack.
  const lo = usesLoadout(e);
  if (lo) tickEnemyAttackQueue(e, bullets, tx, ty, dt);
  const fire = () => (lo ? fireLoadoutVolley(e, bullets, tx, ty) : pushEnemyAttack(e, bullets, tx, ty));
  const reload = () => (lo ? loadoutReload(e) : computeReload());
  if (e.laserTeleT > 0) {
    e.laserTeleT = Math.max(0, e.laserTeleT - dt);
    // Telegraph is fixed horizontal — never track player.
    if (e.laserTeleT <= 0) {
      e.laserTeleT = 0;
      // Missiles still get live tx/ty for limited home; lasers ignore them.
      fire();
      e.laserAimX = undefined;
      e.laserAimY = undefined;
      e.laserTeleOffs = undefined;
      e.fireCd = reload();
      return true;
    }
    return false;
  }
  e.fireCd -= dt;
  if (!canFire || e.fireCd > 0) return false;
  // Laser volleys of large sent units (and long / sweep lasers) charge a telegraph first
  const teleOffs = lo
    ? loadoutTelegraph(e)
    : ((e.sent && isLargeEnemy(e) && enemyAttackUsesLaser(e.kind)) ? [0] : null);
  if (teleOffs) {
    e.laserTeleT = LASER_TELE_DUR;
    e.laserTeleMax = LASER_TELE_DUR;
    // Fixed horizontal warning beam(s) from muzzle leftward (NOT player aim).
    e.laserAimX = e.x - 400;
    e.laserAimY = e.y;
    e.laserTeleOffs = teleOffs.length === 1 && teleOffs[0] === 0 ? undefined : teleOffs;
    e.fireCd = 0;
    return false;
  }
  e.fireCd = reload();
  // No telegraph: clear any stale lock so lasers fire straight left.
  e.laserAimX = undefined;
  e.laserAimY = undefined;
  fire();
  return true;
}



/** Bullet → ship damage with the firing unit's 攻撃力 multiplier (1 for wave enemies). */
function scaledHitDmg(base, b) {
  const m = b && Number.isFinite(b.atk) && b.atk > 0 ? b.atk : 1;
  return Math.max(1, Math.round(base * m));
}

/**
 * 直接攻撃 hit test: same ship hurtbox as other bullets vs that ship.
 * Player ship ±16 (+hb), COM ship ±13/±12 (+hb). No clamping of y → edge overhang is still hittable.
 */
function directShotHits(b, sx, sy, hx, hy) {
  const hb = b.hb || 0;
  return Math.abs(b.x - sx) < hx + hb && Math.abs(b.y - sy) < hy + hb;
}

/** COM perception of an invisible bubble: hp drop = hit flash seen; usable from react … react + 0.6 s. */
function comSeesBubble(e, now, react) {
  if (e._hpC == null) e._hpC = e.hp;
  if (e.hp < e._hpC) e._rvC = now;
  e._hpC = e.hp;
  if (e._rvC == null) return false;
  const dt = now - e._rvC;
  return dt >= react && dt <= react + 0.6;
}

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui; // { statusBar, endOverlay, endMessage }
    this.L = layout(canvas);
    this.net = null;
    this.running = false;
    this.waiting = true;
    this.ended = false;
    this.useBot = false;
    this.comDifficulty = 'strong'; // 'normal' | 'strong'
    this.remoteSnap = null;
    this.pointerY = 0.5;
    this.pointerX = 0.14; // normalized 0..1 within own field width (left=back, right=forward)
    this.pointerDown = false;
    this.ctrlTouch = { active: false, x: 0.5, y: 0.5 };
    this.draggingShip = false;
    this.shipPointerId = null; // pointer/touch that grabbed the ship // finger pos in ctrl pane (0..1)
    this._lastTs = 0;
    this._spawnAcc = 0;
    this._bossAcc = 0;
    this._syncAcc = 0;
    this._bot = null;
    this._raf = 0;
    this._onResize = () => { this.L = resizeCanvas(this.canvas); };
    this._playerDeck = null; // length 5 unit ids
    this._deckCursor = 0;
    this._comDeck = COM_DECK.slice();
    this._lastComDeck = null;
    this._comDeckCursor = 0;
    this._ptReward = null; // { gain, total, remainingHp } when COM win grants PT
  }

  resetLocal() {
    const p = createPlayer('self');
    this.state = {
      player: p,
      enemies: [],
      bullets: [],
      items: [],
      fx: [],
      meteors: [],
      scroll: 0,
      alive: true,
      statusText: WAIT,
      time: 0,
      botHp: PLAYER_MAX_HP,
      botSnap: null,
    };
    this.ended = false;
    this.waiting = true;
    this.remoteSnap = null;
    this._oppShown = null;
    this.pointerY = 0.5;
    this.pointerX = 0.14;
    this.ctrlTouch = { active: false, x: 0.5, y: 0.5 };
    this.draggingShip = false;
    this.shipPointerId = null;
    this.ui.endOverlay.classList.add('hidden');
    this._ptReward = null;
    this._endInfo = null;
    this._ko = null;
    this.clearKoFx();
    // Match timer / sudden death (延長戦)
    this.matchLeft = matchTimeSec();
    this.suddenDeath = false;
    this._sdDecided = false;
    this._sdReported = false;
    this._sdSelfHp = null;
    this._sdBotHp = null;
    this._timerSyncAcc = 0;
    this._timerShown = '';
    this.renderMatchTimer(true);
    this._deckCursor = 0;
    this._comDeckCursor = 0;
    // Load equipped deck (always 5)
    try {
      const meta = loadMeta();
      this._playerDeck = (meta.deck && meta.deck.length === DECK_SIZE)
        ? meta.deck.slice()
        : loadMeta().deck.slice();
    } catch (_) {
      this._playerDeck = ['basic', 'drone', 'elite', 'swarm', 'tank'];
    }
    this._comDeck = COM_DECK.slice();
    this._comDeckInfo = null;
    // COM battle: rebuild a strength-matched deck EVERY match (avoid last lineup).
    // Online P2P is unchanged — the opponent uses their own deck.
    if (this.useBot) {
      this.rebuildComDeck();
    }
    // Clear victory celebration DOM if present
    if (this.ui.endOverlay) {
      this.ui.endOverlay.classList.remove('victory', 'defeat', 'pt-show');
      const extras = this.ui.endOverlay.querySelectorAll('.vic-fx, .pt-reward, .vic-banner, .end-reason');
      extras.forEach((el) => el.remove());
    }
    this.setStatus(WAIT);
  }

  setStatus(text) {
    this.state.statusText = text;
    this.ui.statusBar.textContent = text;
  }

  isTutorialDone() {
    try { return localStorage.getItem(TUTORIAL_KEY) === '1'; } catch (_) { return false; }
  }

  markTutorialDone() {
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (_) {}
  }

  /** Start in-battle tips (info pane only). force=true ignores localStorage. */
  maybeStartTutorial(force = false) {
    if (!this.state || this.ended) return;
    if (!force && this.isTutorialDone()) return;
    if (this.state.tutorial) return;
    this.state.tutorial = {
      i: 0,
      life: TUTORIAL_STEP_SEC,
      total: TUTORIAL_STEPS.length,
    };
    this._applyTutorialStatus();
  }

  _applyTutorialStatus() {
    const t = this.state && this.state.tutorial;
    if (!t) return;
    const step = TUTORIAL_STEPS[t.i];
    if (!step) { this.finishTutorial(); return; }
    t.title = step.title;
    t.text = step.text;
    const line = `チュートリアル ${t.i + 1}/${t.total}　【${step.title}】${step.text}　〔次へ／とばす〕`;
    this.setStatus(line);
  }

  advanceTutorial() {
    const t = this.state && this.state.tutorial;
    if (!t) return;
    t.i += 1;
    if (t.i >= t.total) { this.finishTutorial(); return; }
    t.life = TUTORIAL_STEP_SEC;
    this._applyTutorialStatus();
  }

  skipTutorial() {
    if (!this.state || !this.state.tutorial) return;
    this.finishTutorial();
  }

  finishTutorial() {
    if (!this.state) return;
    this.state.tutorial = null;
    this.markTutorialDone();
    if (!this.ended && !this.waiting) this.setStatus(HINT);
  }

  tickTutorial(dt) {
    const t = this.state && this.state.tutorial;
    if (!t) return;
    t.life -= dt;
    if (t.life <= 0) this.advanceTutorial();
  }

  /** Info-pane tap during tutorial: left/center = next, right = skip. */
  handleTutorialTap(relX) {
    if (!this.state || !this.state.tutorial) return false;
    if (relX >= 0.72) this.skipTutorial();
    else this.advanceTutorial();
    return true;
  }

  start({ net, bot = false, comDifficulty = 'strong' } = {}) {
    this.stopLoop();
    this.net = net;
    this.useBot = bot;
    this.comDifficulty = (bot && (comDifficulty === 'normal' || comDifficulty === 'strong'))
      ? comDifficulty
      : 'strong';
    // Enemy level (win-rate based) is fixed at match start; only COM behaviour depends on it
    this._comRank = null;
    this._comRankChange = null;
    this._tutorialMatch = false;
    try { this._comRank = bot ? comRankInfo(this.comDifficulty) : null; } catch (_) { this._comRank = null; }
    this.comLevel = this._comRank ? this._comRank.level : null;
    this._comProf = null;
    this.resetLocal();
    this.L = resizeCanvas(this.canvas);
    window.addEventListener('resize', this._onResize);
    this.bindInput();

    if (bot) {
      this.waiting = false;
      this._initBot();
      // Worldwide battle counter (bc): every CPU battle counts once
      hitBattleCounter();
      // Rebuild again here so every COM match gets a new lineup even if reset ran early.
      this.rebuildComDeck();
      const msg = this.comDeckStatusText();
      this.setStatus(msg);
      setTimeout(() => {
        if (!this.ended && !this.waiting && this.state && this.state.statusText === msg) this.setStatus(HINT);
      }, 4200);
      // First-time (or forced) in-battle tutorial in the info pane
      setTimeout(() => { if (!this.ended && !this.waiting) this.maybeStartTutorial(!!this._forceTutorial); this._forceTutorial = false; }, 700);
    } else if (net) {
      net.on('data', (msg) => this.onNet(msg));
      net.on('disconnected', () => {
        if (!this.ended) this.setStatus('接続が切れました');
      });
      // Resend hello when DataConnection opens (first send may have been before open)
      net.on('connected', (info) => {
        if (info && info.bot) return;
        if (!this.running || this.ended) return;
        net.send({ type: 'hello', role: net.role });
        if (this.waiting && net.ready) this.beginMatch();
      });
    }

    this.running = true;
    this._lastTs = performance.now();
    this._raf = requestAnimationFrame((t) => this.frame(t));

    // Handshake — send only if conn already open; otherwise connected handler will send
    if (net && !bot) {
      if (net.ready) {
        net.send({ type: 'hello', role: net.role });
        // stay in waiting until mutual hello — also allow local start after short delay
        setTimeout(() => {
          if (this.waiting && net.ready) {
            net.send({ type: 'start' });
            this.beginMatch();
          }
        }, 600);
      }
    }
  }

  beginMatch() {
    if (!this.waiting) return;
    this.waiting = false;
    this.setStatus(HINT);
    if (this.net && !this.useBot) this.net.send({ type: 'start' });
    // Worldwide battle counter (bc): online match counted by the host only (no double count)
    if (this.net && !this.useBot && this.net.role === 'host' && !this._battleCounted) {
      this._battleCounted = true;
      hitBattleCounter();
    }
    setTimeout(() => { if (!this.ended && !this.waiting) this.maybeStartTutorial(!!this._forceTutorial); this._forceTutorial = false; }, 700);
  }

  _initBot() {
    this._bot = {
      y: 0.5,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      fireCd: 0,
      spawnAcc: 0,
      enemies: [],
      bullets: [],
      fx: [],
      meteors: [],
      scroll: 0,
      items: [],
      orbs: [],
      time: 0,
      powerCd: 0,
      reactDelay: 0,
      dodgeDir: 0,
      aimNoise: 0,
      humanPanic: 0,
      moveVel: 0,
      invuln: 0,
      activePower: null,
      activeTimer: 0,
      laserCd: 0,
      thinkAcc: 0,
      preferredY: 0.5,
      lastDodgeDir: 1,
      x: 48,
      preferredX: 48,
      moveVelX: 0,
      surgePhase: 0,
    };
    this.state.botHp = PLAYER_MAX_HP;
  }

  /**
   * COM AI + reward profile for the selected difficulty. Behaviour comes from the enemy level
   * (meta.js comAiForLevel: win-rate based, fixed for the whole match); PT from the difficulty.
   */
  comProfile() {
    const d = this.comDifficulty === 'normal' ? 'normal' : 'strong';
    const meta = COM_DIFFICULTY[d] || COM_DIFFICULTY.strong;
    const lv = this.comLevel || (d === 'normal' ? 1 : 30);
    if (!this._comProf || this._comProf.level !== lv || this._comProf.id !== meta.id) {
      this._comProf = { ...meta, ...comAiForLevel(lv) };
    }
    return this._comProf;
  }

  stopLoop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.unbindInput();
  }

  destroy() {
    this.stopLoop();
    this._ko = null;
    this.clearKoFx();
    this.renderCountdown(null);
    this.renderMatchTimer(true);
    if (this.net) {
      try { this.net.destroy(); } catch (_) {}
    }
  }

  bindInput() {
    const c = this.canvas;
    const mapPoint = (clientX, clientY) => {
      const rect = c.getBoundingClientRect();
      const scaleX = c.width / rect.width;
      const scaleY = c.height / rect.height;
      return {
        canvasX: (clientX - rect.left) * scaleX,
        canvasY: (clientY - rect.top) * scaleY,
        relX: (clientX - rect.left) / rect.width,
        relY: (clientY - rect.top) / rect.height,
      };
    };

    const slotIndexAt = (canvasX, canvasY) => {
      const filled = (this.state.player && this.state.player.items) ? this.state.player.items.length : 0;
      return hitItemSlot(this.L.ctrl, canvasX, canvasY, filled);
    };

    const ctrlTop = () => OPP_RATIO + OWN_RATIO;
    const ctrlBot = () => ctrlTop() + CTRL_RATIO;

    // Allow slight vertical overhang past stage edges (~half ship) while
    // keeping full control. Do NOT hard-stop at 0/1 — that felt stuck.
    // Slight overhang for feel — hitboxes still use real Y (no edge safe zone)
    const PTR_Y_MIN = -0.08;
    const PTR_Y_MAX = 1.08;
    const PTR_X_MIN = 0.06;
    const PTR_X_MAX = 0.88;
    // Grab may start a bit outside the ctrl pad (ship rim overhangs when clipped).
    const GRAB_EDGE_PAD = 0.02; // fraction of full canvas height

    const tryGrabOrMoveShip = (pid, relX, relY, isDown) => {
      const localY = (relY - ctrlTop()) / CTRL_RATIO;
      const localX = relX;
      const hitR = 0.16;
      const dx = localX - this.pointerX;
      const dy = localY - this.pointerY;
      const onShip = (dx * dx + dy * dy) <= hitR * hitR;

      if (isDown) {
        // Initial grab: near/inside ctrl (pad so overhanging ship remains tappable)
        if (relY < ctrlTop() - GRAB_EDGE_PAD || relY >= ctrlBot() + GRAB_EDGE_PAD) return false;
        if (!onShip) return false;
        this.draggingShip = true;
        this.shipPointerId = pid;
      } else if (!this.draggingShip || this.shipPointerId !== pid) {
        return false;
      }
      // While dragging: keep tracking even if finger leaves the ctrl pane
      // (top → own field, bottom → info). That was the "stuck at edge" feel.

      this.pointerY = Math.max(PTR_Y_MIN, Math.min(PTR_Y_MAX, localY));
      this.pointerX = Math.max(PTR_X_MIN, Math.min(PTR_X_MAX, localX));
      this.pointerDown = true;
      this.ctrlTouch = { active: true, x: this.pointerX, y: this.pointerY };
      return true;
    };

    const releaseShipPointer = (pid) => {
      if (this.shipPointerId == null || this.shipPointerId === pid) {
        this.draggingShip = false;
        this.shipPointerId = null;
        this.pointerDown = false;
        if (this.ctrlTouch) this.ctrlTouch.active = false;
      }
    };

    // Item: fire immediately on press (filled slot only). Debounce in tryUsePower
    // stops pointerdown + touchstart double-fire.
    const pressItemSlot = (canvasX, canvasY) => {
      const slot = slotIndexAt(canvasX, canvasY);
      if (slot < 0) return false;
      const items = (this.state && this.state.player && this.state.player.items) || [];
      if (slot >= items.length || !items[slot]) return false;
      this.tryUsePower(slot);
      return true;
    };

    // Pointer events (mouse / pen / one finger with pointer events)
    this._onPointerDown = (e) => {
      e.preventDefault();
      const p = mapPoint(e.clientX, e.clientY);
      // Tutorial lives in the top info pane — tap to advance / skip (not on stage)
      if (p.relY < INFO_RATIO && this.handleTutorialTap(p.relX)) return;
      if (pressItemSlot(p.canvasX, p.canvasY)) return;
      // Allow a thin strip past ctrl bottom (info) so overhanging ship stays grabbable
      if (p.relY < OPP_RATIO || p.relY >= ctrlBot() + 0.02) return;
      tryGrabOrMoveShip(e.pointerId, p.relX, p.relY, true);
    };
    this._onPointerMove = (e) => {
      if (!this.draggingShip || this.shipPointerId !== e.pointerId) return;
      e.preventDefault();
      const p = mapPoint(e.clientX, e.clientY);
      tryGrabOrMoveShip(e.pointerId, p.relX, p.relY, false);
    };
    this._onPointerUp = (e) => {
      releaseShipPointer(e.pointerId);
    };

    // Multi-touch: ship finger + item finger at once
    this._onTouchStart = (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        const p = mapPoint(touch.clientX, touch.clientY);
        if (p.relY < INFO_RATIO && this.handleTutorialTap(p.relX)) continue;
        // tryUsePower debounce ignores duplicate within 90ms after pointerdown
        if (pressItemSlot(p.canvasX, p.canvasY)) continue;
        if (p.relY < OPP_RATIO || p.relY >= ctrlBot() + 0.02) continue;
        tryGrabOrMoveShip(touch.identifier, p.relX, p.relY, true);
      }
    };
    this._onTouchMove = (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (!this.draggingShip || this.shipPointerId !== touch.identifier) continue;
        const p = mapPoint(touch.clientX, touch.clientY);
        tryGrabOrMoveShip(touch.identifier, p.relX, p.relY, false);
      }
    };
    this._onTouchEnd = (e) => {
      for (const touch of e.changedTouches) {
        releaseShipPointer(touch.identifier);
      }
    };

    c.addEventListener('pointerdown', this._onPointerDown, { passive: false });
    c.addEventListener('pointermove', this._onPointerMove, { passive: false });
    c.addEventListener('pointerup', this._onPointerUp);
    c.addEventListener('pointercancel', this._onPointerUp);
    c.addEventListener('touchstart', this._onTouchStart, { passive: false });
    c.addEventListener('touchmove', this._onTouchMove, { passive: false });
    c.addEventListener('touchend', this._onTouchEnd);
    c.addEventListener('touchcancel', this._onTouchEnd);
    this.bindKeyboard();
  }

  bindKeyboard() {
    this._keys = new Set();
    this._onKeyDown = (e) => {
      this._keys.add(e.key);
      if ((e.key === 'Enter' || e.key === ' ') && this.state && this.state.tutorial) { this.advanceTutorial(); return; }
      if ((e.key === 'Escape') && this.state && this.state.tutorial) { this.skipTutorial(); return; }
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','W','s','S','a','A','d','D',' ','Enter'].includes(e.key)) e.preventDefault();
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) this.tryUsePower(0);
    };
    this._onKeyUp = (e) => { this._keys.delete(e.key); };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  unbindKeyboard() {
    if (!this._onKeyDown) return;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  unbindInput() {
    const c = this.canvas;
    if (this._onPointerDown) {
      c.removeEventListener('pointerdown', this._onPointerDown);
      c.removeEventListener('pointermove', this._onPointerMove);
      c.removeEventListener('pointerup', this._onPointerUp);
      c.removeEventListener('pointercancel', this._onPointerUp);
      c.removeEventListener('touchstart', this._onTouchStart);
      c.removeEventListener('touchmove', this._onTouchMove);
      c.removeEventListener('touchend', this._onTouchEnd);
      c.removeEventListener('touchcancel', this._onTouchEnd);
    }
    this.unbindKeyboard();
  }


  applyPlayerDamage(amount, cause = 'hit') {
    const P = this.state.player;
    const before = P.hp;
    const dmg = Math.max(0, Math.min(amount, before));
    if (dmg <= 0) return 0;
    P.hp = Math.max(0, P.hp - dmg);
    // Visual feedback state
    this.state.hpGhost = Math.max(this.state.hpGhost ?? before, before);
    this.state.hpGhostHold = 0.85; // keep lost chunk visible before draining
    this.state.damageFlash = 0.55;
    this.state.hpShake = 0.55;
    this.state.damageNumbers = this.state.damageNumbers || [];
    this.state.damageNumbers.push({
      x: P.x + 20,
      y: (P.y <= 1 ? P.y : 0.5),
      text: `-${Math.round(dmg)}`,
      life: 0.9,
      max: 0.9,
    });
    if (this.state.hpDisplay == null) this.state.hpDisplay = before;
    return dmg;
  }

  /* ------------------------------------------------------------------
   * 5-minute match timer + 延長戦 (sudden death)
   *  - Counts only while the match is running (not waiting / ended).
   *  - 0:00 → more remaining HP wins. Equal HP → sudden death: first side to take damage loses.
   *  - CPU: decided locally. Online: host is authoritative (timer sync, time-up verdict,
   *    sudden-death result); the guest only displays and reports its own damage.
   * ------------------------------------------------------------------ */
  isOnline() {
    return !!(this.net && !this.useBot);
  }

  isHost() {
    return this.isOnline() && this.net.role === 'host';
  }

  oppHpNow() {
    if (this.useBot) return this._bot ? this._bot.hp : this.state.botHp;
    return this.remoteSnap && Number.isFinite(this.remoteSnap.php) ? this.remoteSnap.php : null;
  }

  tickMatchTimer(dt) {
    if (this.waiting || this.ended) return;
    const P = this.state.player;
    if (this.suddenDeath) {
      this.tickSuddenDeath();
      return;
    }
    this.matchLeft = Math.max(0, this.matchLeft - dt);
    if (this.isOnline()) {
      if (!this.isHost()) return; // guest: display only; waits for host timeUp
      this._timerSyncAcc += dt;
      if (this._timerSyncAcc >= 1) {
        this._timerSyncAcc = 0;
        this.net.send({ type: 'timer', left: +this.matchLeft.toFixed(2) });
      }
    }
    if (this.matchLeft > 0) return;
    const self = Math.max(0, Math.round(P.hp));
    const oppRaw = this.oppHpNow();
    const opp = oppRaw == null ? self : Math.max(0, Math.round(oppRaw));
    if (self === opp) {
      this.startSuddenDeath();
      if (this.isHost()) this.net.send({ type: 'timeUp', result: 'sudden', hostHp: self, guestHp: opp });
      return;
    }
    const won = self > opp;
    if (this.isHost()) {
      this.net.send({ type: 'timeUp', result: won ? 'host' : 'guest', hostHp: self, guestHp: opp });
    }
    this.finish(won, { reason: 'time', selfHp: self, oppHp: opp });
  }

  startSuddenDeath() {
    this.suddenDeath = true;
    this.matchLeft = 0;
    this._sdSelfHp = this.state.player.hp;
    this._sdBotHp = this.useBot && this._bot ? this._bot.hp : null;
    this.setStatus('延長戦！先にダメージを受けた方の負け');
    this.renderMatchTimer(true);
  }

  /** Detect the first damage after sudden death started (frame-based HP drop; heals just raise the baseline). */
  tickSuddenDeath() {
    if (this._sdDecided || this.ended) return;
    const P = this.state.player;
    const selfHit = this._sdSelfHp != null && P.hp < this._sdSelfHp - 1e-6;
    if (!selfHit && this._sdSelfHp != null) this._sdSelfHp = Math.max(this._sdSelfHp, P.hp);
    if (this.useBot) {
      const B = this._bot;
      const botHit = B && this._sdBotHp != null && B.hp < this._sdBotHp - 1e-6;
      if (B && !botHit) this._sdBotHp = Math.max(this._sdBotHp ?? B.hp, B.hp);
      if (selfHit || botHit) {
        this._sdDecided = true;
        // Same frame: the player is treated as hit first (rare; keeps the result deterministic)
        this.finish(!selfHit, { reason: 'sudden', selfHp: Math.round(P.hp), oppHp: Math.round(B.hp) });
      }
      return;
    }
    if (!selfHit) return;
    if (this.isHost()) {
      this._sdDecided = true;
      this.net.send({ type: 'sdResult', loser: 'host', hostHp: Math.round(P.hp) });
      this.finish(false, { reason: 'sudden', selfHp: Math.round(P.hp), oppHp: this.oppHpNow() });
    } else if (!this._sdReported) {
      // Guest reports its own damage; the host decides (avoids double results)
      this._sdReported = true;
      this.net.send({ type: 'sdHit', guestHp: Math.round(P.hp) });
    }
  }

  /** Top-of-screen timer (DOM). force = re-render even if the text did not change. */
  renderMatchTimer(force = false) {
    const el = typeof document !== 'undefined' ? document.getElementById('match-timer') : null;
    if (!el) return;
    const active = this.running && !this.waiting && !this.ended;
    let key;
    if (!active) key = 'off';
    else if (this.suddenDeath) key = 'sd';
    else key = fmtClock(this.matchLeft);
    // Big center countdown (10…1) + red edge vignette in the last 10 s
    const leftNow = active && !this.suddenDeath ? Math.ceil(this.matchLeft) : null;
    this.renderCountdown(leftNow != null && leftNow <= 10 && leftNow >= 1 ? leftNow : null);
    if (!force && key === this._timerShown) return;
    this._timerShown = key;
    if (key === 'off') {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const main = el.querySelector('.mt-main');
    const sub = el.querySelector('.mt-sub');
    if (key === 'sd') {
      el.className = 'match-timer sudden';
      if (main) main.textContent = '延長戦！';
      if (sub) { sub.textContent = '先にダメージを受けた方の負け'; sub.hidden = false; }
      return;
    }
    const left = Math.ceil(this.matchLeft);
    // last 30 s: yellow pulse; last 10 s: red, faster pulse
    el.className = 'match-timer' + (left <= 10 ? ' danger final' : left <= 30 ? ' warn' : '');
    if (main) main.textContent = `残り ${key}`;
    if (sub) { sub.textContent = ''; sub.hidden = true; }
  }

  /** Center countdown number (null = hide). Re-triggers the pop animation once per second. */
  renderCountdown(n) {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('ui-overlay');
    if (!host) return;
    let cd = document.getElementById('match-countdown');
    let vg = document.getElementById('match-vignette');
    if (n == null) {
      if (cd) cd.hidden = true;
      if (vg) vg.hidden = true;
      this._cdShown = null;
      return;
    }
    if (!cd) { cd = document.createElement('div'); cd.id = 'match-countdown'; cd.className = 'match-countdown'; host.appendChild(cd); }
    if (!vg) { vg = document.createElement('div'); vg.id = 'match-vignette'; vg.className = 'match-vignette'; host.appendChild(vg); }
    vg.hidden = false;
    cd.hidden = false;
    if (this._cdShown === n) return;
    this._cdShown = n;
    cd.textContent = String(n);
    cd.classList.remove('pop');
    void cd.offsetWidth; // restart CSS animation
    cd.classList.add('pop');
  }

  /** Our direct shot collided with the COM ship: normal shot damage + spark + small explosion (opp pane). */
  onDirectHitBot(b) {
    const B = this._bot;
    if (!B || this.ended) return;
    B.hp = Math.max(0, B.hp - (b.dmg || DIRECT_SHOT_DMG));
    this.state.botHp = B.hp;
    B.fx.push(spawnExplosion(b.x, b.y, false));
    B.fx.push(spawnHitSpark(b.x, b.y));
  }

  /** An incoming direct shot collided with our ship: normal shot damage + spark + small explosion. */
  onDirectHitPlayer(b) {
    if (this.ended) return;
    const S = this.state;
    this.applyPlayerDamage(b.dmg || DIRECT_SHOT_DMG, 'direct');
    // Explosion at the front of fx so the 12-entry net snapshot keeps it (opponent sees it too)
    S.fx.unshift(spawnExplosion(b.x, b.y, false));
    S.fx.push(spawnHitSpark(b.x, b.y));
    sfx.hit();
  }

  /** Hand our direct shot over to the opponent: COM field (top, falling) or online directShot message. */
  handOffDirectShot(x) {
    if (this.ended) return;
    const fw = this.L.own.w;
    if (this.useBot && this._bot) {
      this._bot.bullets.push(spawnDirectShot(x, this.L.own.h, 'player'));
    } else if (this.net && this.net.ready) {
      this.net.send({ type: 'directShot', x: +(x / fw).toFixed(4) });
    }
  }

  /** Incoming direct shot (COM or online): falls straight down from the top of OUR field at x. */
  pushIncomingDirectShot(x) {
    this.state.bullets.push(spawnDirectShot(x, this.L.own.h, 'enemy'));
  }

  tryUsePower(index = 0) {
    if (this.waiting || this.ended || !this.state.alive) return;
    const p = this.state.player;
    // Prevent double-fire from pointerdown + touchstart only (keep short so taps feel instant)
    const now = performance.now();
    if (this._itemUseAt && now - this._itemUseAt < 90) return;
    if (!p.items.length) {
      this.setStatus(HINT);
      return;
    }
    const i = index | 0;
    // Only the tapped slot — never fall back to another item
    if (i < 0 || i >= p.items.length) return;
    const id = p.items[i];
    // Timed powers (homing/laser/rapid/direct) can't stack on each other.
    // Instant items — especially send_* — must always fire immediately.
    const DURATION = new Set(['homing', 'laser', 'rapid', 'direct']);
    if (p.activeTimer > 0 && DURATION.has(id)) return;
    p.items.splice(i, 1);
    this._itemUseAt = now;
    this._powerFromItem = true;
    this.activatePower(id);
    this._powerFromItem = false;
  }



  /**
   * Mark a transferred (send-item) enemy.
   * Spawns just off the right edge, then lingers in the right zone (~2.2s) with
   * bob/weave/fire allowed — no leftward advance until linger ends.
   */
  /**
   * Arrival spot for a sent unit: never on top of other sent units that are still warping in /
   * lingering on the right (same batch or earlier arrivals). Picks the candidate point with the
   * largest clearance (box = unit + warp ring + a little bob), clamped inside the pane.
   * Runs on the receiving field only (online: the receiver places them locally and streams its
   * field as usual), so both peers see the same thing. Same rule for player / COM / online.
   */
  /** First core enemy of the match: one-line tip. */
  coreTip() {
    if (this._coreTipShown || this.ended || this.waiting) return;
    this._coreTipShown = true;
    this.setStatus('コアを狙え！ 壊すとまわりの敵も連鎖で倒せる');
    setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 2600);
  }

  /**
   * Core-hit blink of ONE battle field only (the field of the side that hit — as in the original).
   * F = that side's field state (this.state for us, this._bot for the COM); drawn clipped to that
   * field by drawField (HUD, the other field and the control pad are never covered).
   * Every hit blinks. Photosensitivity (tracked per field): a full blink (0.7 peak, ~90 ms) at most
   * once per 333 ms; hits arriving sooner get a weak short blink (0.28, ~50 ms). break: 0.7, ~350 ms.
   * Same strength and rules for both sides.
   */
  fieldFlash(F, kind) {
    if (!F) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const strong = kind === 'break' || now - (F._ffAt ?? -1e9) >= 333;
    if (strong) F._ffAt = now;
    // 10-04: flashes now fade out over ~0.5 s; a weak (≤3/s capped) hit only re-boosts a softer glow
    const prev = F.ff;
    if (kind !== 'break' && !strong && prev && prev.t0 != null) { F.ff = { ...prev, n: (prev.n || 0) + 1, b0: now }; return; }
    const k = kind === 'break' ? 'b' : strong ? 'h' : 'w';
    F.ff = { n: ((prev && prev.n) || 0) + 1, k, t0: now };
  }

  /** Core destroyed: big chain explosion + score burst (the decisive shot). */
  onCoreBreak(e, fx, mine, list) {
    // Core break: only the breaker's field blinks white (a bit longer than a hit), same for both sides
    this.fieldFlash(mine ? this.state : this._bot, 'break');
    const chained = markCoreChain(e, list); // cascading yellow chain wipe of the pack around the core
    fx.push({ kind: 'corebreak', x: e.x + (e.core ? e.core.ox : 0), y: e.y + (e.core ? e.core.oy : 0), r: Math.max(e.w, e.h) * 0.9, life: 0.9, max: 0.9 });
    fx.push(spawnExplosion(e.x - e.w * 0.25, e.y - e.h * 0.2, true));
    fx.push(spawnExplosion(e.x + e.w * 0.25, e.y + e.h * 0.2, true));
    if (mine) {
      this.state.player.score += e.score; // burst on top of the normal kill score
      try { sfx.explode(); } catch (_) {}
      e._coreMsg = e.kind === 'wave_snake_head' ? 'コア撃破！ 大蛇を倒した！' : isCoreBossKind(e.kind) ? 'コア撃破！ ボスを倒した！' : 'コア撃破！';
      this.setStatus(e._coreMsg);
      this._chainMsgSrc = e;
      if (!chained) setTimeout(() => { if (!this.ended && !this.waiting && this._chainMsgSrc === e) this.setStatus(HINT); }, 1600);
    }
  }

  placeSentEnemy(e, fw, fh, field) {
    const bobOf = (u) => { const t = resolveEnemyTier(u.kind); return (t === 'swarm' || t === 'drone') ? 28 : 18; };
    const hwOf = (u) => (u.w || 40) * 0.5 + 4;
    const hhOf = (u) => (u.h || 30) * 0.5 + 4;
    const mh = Math.max(28, (e.h || 30) * 0.6 + 8);
    const xMin = fw * 0.42;
    const xMax = Math.max(xMin, fw - (e.w || 40) * 0.56 - 12);
    const yMin = mh, yMax = Math.max(mh, fh - mh);
    const hwE = hwOf(e), hhE = hhOf(e), bobE = bobOf(e);
    // Sent units still arriving / lingering; each holds its slot until ~its linger ends (+ time to leave)
    const busy = (field || []).filter((o) => o && o !== e && o.sent && o.holdX != null && (o.warpT > 0 || o.lingerT > 0))
      .map((o) => ({
        o,
        x: o.warpT > 0 ? o.holdX : o.x,
        y: o.holdY != null ? o.holdY : o.y,
        until: (o.arriveDelay || 0) + (o.warpT || 0) + (o.lingerT || 0) + 0.3,
        // when its glide-in from the right edge starts (negative = already started)
        glide: o.warpT > 0 ? (o.arriveDelay || 0) - (WARP_TOTAL - o.warpT) : -99,
      }));
    const NX = 7, NY = 9;
    const pick = (delay) => {
      const others = busy.filter((b) => b.until > delay);
      let best = null, bestS = -1e9, bestClr = -1e9;
      for (let i = 0; i < NX; i++) {
        for (let j = 0; j < NY; j++) {
          const x = xMin + (xMax - xMin) * (i / (NX - 1));
          const y = yMin + (yMax - yMin) * (j / (NY - 1));
          let clr = 60;
          for (const b of others) {
            const hs = hwE + hwOf(b.o);
            let gx = Math.abs(x - b.x) - hs;
            // Glide path: the later glider must not slide in through the other one (same row)
            if (Math.abs(b.glide - delay) > 0.05) {
              const laterIsMe = delay > b.glide;
              if (laterIsMe ? b.x > x - hs : x > b.x - hs) gx = -1e9;
            }
            const gy = Math.abs(y - b.y) - (hhE + hhOf(b.o) + Math.abs(bobE - bobOf(b.o)));
            clr = Math.min(clr, Math.max(gx, gy));
          }
          // mild preference for the classic right-side band + randomness (no fixed grid look)
          const sc = clr - Math.abs(x - fw * 0.79) / fw * 12 + Math.random() * 6;
          if (sc > bestS) { bestS = sc; best = [x, y]; bestClr = clr; }
        }
      }
      return { pos: best, clr: bestClr };
    };
    // No off-screen waiting: every sent unit warps in right away at the best spot available
    // (max clearance / least overlap). A little overlap is fine when the pane is packed.
    const res = pick(0);
    e.arriveDelay = 0;
    e.holdX = res.pos[0];
    e.holdY = res.pos[1];
  }

  markSentEnemy(e, fw, fh, field = null) {
    e.sent = true;
    // 攻撃力 / 防御力 (catalog.js): ATK scales this unit's bullet damage to the receiving ship,
    // DEF raises its HP. Same rule for player-sent, COM-sent and online-received units.
    const st = unitStats(e.kind);
    if (st && !e._statsApplied) {
      e._statsApplied = true;
      e.atk = st.atk;
      e.def = st.def;
      e.atkMul = atkDamageMul(st.atk);
      // Base HP (with small-class floor) × 防御力 — catalog.js sentUnitHp (same value shown in deck/shop)
      const hp = sentUnitHp(e.kind) || Math.max(1, Math.round((e.maxHp || e.hp || 1) * defHpMul(st.def)));
      e.hp = hp;
      e.maxHp = hp;
    }
    // Spread arrivals: never stacked on other sent units that just arrived (clamped inside the pane)
    this.placeSentEnemy(e, fw, fh, field);
    // Units of a batch bob / weave in unison while lingering → they keep their spacing
    e.phase = 0;
    e.surgePhase = 0;
    e.surgeFreq = 1.4;
    e.surgeAmp = Math.min(e.surgeAmp || 32, 24);
    // Start fully off-screen on the right; tickWarp glides it to holdX by 3s
    e.warpX0 = fw + (e.w || 40) * 0.6 + 16;
    e.x = e.warpX0;
    e.y = e.holdY;
    e.appearT = 0; // old 0.9s pop FX replaced by the warp ring
    e.warpT = WARP_TOTAL;
    e.warpMax = WARP_TOTAL;
    e.warpHp = e.hp;
    e.warpPop = 0;
    e.laserTeleT = 0;
    // After the warp: stay on the right for a clear beat before pressing left (move/shoot)
    e.lingerT = 2.2;
    return e;
  }

  /** Next unit id from the player's equipped deck (round-robin). */
  nextPlayerDeckKind() {
    const deck = this._playerDeck && this._playerDeck.length ? this._playerDeck : ['basic', 'drone', 'elite', 'swarm', 'tank'];
    const kind = deck[this._deckCursor % deck.length];
    this._deckCursor = (this._deckCursor + 1) % deck.length;
    return kind;
  }


  /** Fresh COM deck each match: strength ~player, composition randomized, avoids last match. */
  rebuildComDeck() {
    this._comDeckCursor = 0;
    try {
      const info = buildComDeck(this._playerDeck, Math.random, {
        avoid: this._lastComDeck || [],
        difficulty: this.comDifficulty || 'strong',
      });
      if (info && Array.isArray(info.deck) && info.deck.length === DECK_SIZE
        && info.deck.every((id) => CATALOG_BY_ID[id])) {
        this._comDeck = info.deck.slice();
        this._comDeckInfo = info;
        this._lastComDeck = info.deck.slice();
        return info;
      }
    } catch (_) { /* fall through */ }
    const d = COM_DECK.slice();
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    this._comDeck = d;
    this._comDeckInfo = {
      deck: d.slice(),
      score: 0,
      playerScore: 0,
      level: 0,
    };
    this._lastComDeck = d.slice();
    return this._comDeckInfo;
  }

  comDeckStatusText() {
    const ids = this._comDeck || [];
    const names = ids.map((id) => (CATALOG_BY_ID[id] && CATALOG_BY_ID[id].name) || id);
    const lv = this._comDeckInfo && this._comDeckInfo.level;
    const diff = (this.comProfile && this.comProfile().label) || '';
    const ctr = this._comDeckInfo && COUNTER_LABEL[this._comDeckInfo.counter];
    const head = (lv ? `相手デッキ 強さ${lv}/10` : '相手デッキ') + (ctr ? `・${ctr}` : '');
    const tag = diff ? `【${diff} 敵Lv${this.comLevel || '?'}】` : '';
    return `${tag}${head}：${names.join(' / ')}`;
  }

  nextComDeckKind() {
    const deck = this._comDeck && this._comDeck.length ? this._comDeck : COM_DECK;
    const kind = deck[this._comDeckCursor % deck.length];
    this._comDeckCursor = (this._comDeckCursor + 1) % deck.length;
    return kind;
  }

  /** Build spawn kind list for a send-* powerup from the equipped deck. */
  kindsFromDeck(itemId, forCom = false) {
    // Random (not deck order); typed sends only pick their unit group (catalog.js SEND_GROUPS)
    const deck = forCom
      ? (this._comDeck && this._comDeck.length ? this._comDeck : COM_DECK)
      : (this._playerDeck && this._playerDeck.length ? this._playerDeck : ['basic', 'drone', 'elite', 'swarm', 'tank']);
    return pickSendKinds(itemId, deck);
  }

  sendLabelForKinds(kinds, fallback) {
    const names = kinds.map((k) => (CATALOG_BY_ID[k] && CATALOG_BY_ID[k].name) || k);
    const uniq = [...new Set(names)];
    if (uniq.length === 1) return `${fallback || '敵送信'}（${uniq[0]}×${kinds.length}）`;
    return `${fallback || '敵送信'}（デッキ）`;
  }

  /** Push sent enemies into bot field or net. kinds: string | string[] */
  sendToOpponent(kinds, statusLabel) {
    const list = Array.isArray(kinds) ? kinds : [kinds];
    const fw = this.L.own.w, fh = this.L.own.h;
    if (this.useBot) {
      for (const kind of list) {
        const e = this.markSentEnemy(spawnEnemy(fw, fh, kind), fw, fh, this._bot.enemies);
        this._bot.enemies.push(e);
      }
    } else if (this.net) {
      this.net.send({ type: 'sendEnemies', kinds: list });
    }
    if (statusLabel) this.setStatus(statusLabel);
    const p = this.state.player;
    p.activePower = null;
    p.activeTimer = 0;
    setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1600);
  }


  showItemBanner(meta, extra = '') {
    if (!meta) return;
    const line = `${meta.icon || ''} ${meta.label}：${meta.effect}${extra ? ' ' + extra : ''}`;
    this.setStatus(line);
    this.state.itemBanner = {
      text: line,
      color: meta.color || '#fff',
      life: 1.6,
      max: 1.6,
    };
  }


  /** Spawn visible falling meteors into a field's meteor list. */
  /**
   * Meteors fall straight onto the opponent ship only (fixed X column).
   * aimX: ship x in field pixels; aimY: ship y (0..1 or pixels).
   */
  rainMeteors(list, fw, fh, aimY, count = 4, aimX = null) {
    if (!list) return;
    const shipX = aimX != null ? aimX : fw * 0.22;
    const shipY = aimY <= 1 ? aimY * fh : aimY;
    for (let i = 0; i < count; i++) {
      const y = -40 - Math.random() * 70 - i * 36;
      const tx = shipX + (Math.random() - 0.5) * 18;
      const ty = shipY + (Math.random() - 0.5) * 12;
      list.push(spawnMeteor(tx, y, tx, ty));
    }
  }

  activatePower(id) {
    const p = this.state.player;
    const meta = powerupMeta(id);
    this.showItemBanner(meta);
    sfx.power();

    if (id === 'homing') {
      p.activePower = 'homing';
      p.activeTimer = 6;
    } else if (id === 'laser') {
      p.activePower = 'laser';
      p.activeTimer = 4;
    } else if (id === 'send' || id === 'send_mech' || id === 'send_golem' || id === 'send_tank' || id === 'send_drone') {
      const kinds = this.kindsFromDeck(id, false);
      this.sendToOpponent(kinds, this.sendLabelForKinds(kinds, meta?.label));
    } else if (id === 'spread') {
      // Shotgun fan burst
      const by = p.y * this.L.own.h;
      for (let i = -3; i <= 3; i++) {
        const ang = i * 0.18;
        const spd = 480;
        this.state.bullets.push(spawnBullet(
          p.x + 18, by,
          Math.cos(ang) * spd, Math.sin(ang) * spd,
          'player', false, 2,
        ));
      }
      this.state.fx.push(spawnExplosion(p.x + 30, by, false));
      p.activePower = null;
      p.activeTimer = 0;
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1000);
    } else if (id === 'bomb') {
      // Screen bomb: heavy damage to all enemies, clear nearby enemy bullets
      let hits = 0;
      const targets = [];
      for (const e of this.state.enemies) {
        if (warping(e)) continue;
        if (hasCore(e)) applyCoreAwareArea(e, 28, null, null, null); else
        e.hp -= 28;
        this.state.fx.push(spawnExplosion(e.x, e.y, resolveEnemyTier(e.kind) === 'boss'));
        targets.push([e.x, e.y]);
        hits++;
      }
      this.state.bullets = this.state.bullets.filter((b) => b.owner === 'player');
      // Stage-wide bomb FX from the ship (front of list so it survives net snapshot slice)
      this.state.fx.unshift(spawnBombFx(p.x, p.y * this.L.own.h, this.L.own.w, this.L.own.h, targets));
      this.showItemBanner(meta, `（敵${hits}体）`);
      p.activePower = null;
      p.activeTimer = 0;
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1200);
    } else if (id === 'shock') {
      // Lightning: damage nearby enemies
      const py = p.y * this.L.own.h;
      let hits = 0;
      const targets = [];
      for (const e of this.state.enemies) {
        if (warping(e)) continue;
        const dx = e.x - p.x;
        const dy = e.y - py;
        if (dx * dx + dy * dy < SHOCK_RADIUS * SHOCK_RADIUS) {
          if (hasCore(e)) applyCoreAwareArea(e, 18, null, null, null); else
          e.hp -= 18;
          this.state.fx.push(spawnExplosion(e.x, e.y, false));
          targets.push([e.x, e.y]);
          hits++;
        }
      }
      // Area FX drawn at the exact hit radius (front of list so it survives net snapshot slice)
      this.state.fx.unshift(spawnShockFx(p.x, py, SHOCK_RADIUS, targets));
      this.showItemBanner(meta, `（命中${hits}）`);
      p.activePower = null;
      p.activeTimer = 0;
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1200);
    } else if (id === 'rapid') {
      p.activePower = 'rapid';
      p.activeTimer = 5.5;
    } else if (id === 'meteor') {
      // Visible meteor rain on opponent field + damage
      const dmg = 14;
      const fw = this.L.own.w, fh = this.L.own.h;
      if (this.useBot) {
        this._bot.hp = Math.max(0, this._bot.hp - dmg);
        this.state.botHp = this._bot.hp;
        if (!this._bot.meteors) this._bot.meteors = [];
        this.rainMeteors(this._bot.meteors, fw, fh, this._bot.y, 5, 48);
      } else if (this.net) {
        this.net.send({ type: 'meteorHit', dmg });
        // Local preview on own field too so the player sees rocks falling away
        this.rainMeteors(this.state.meteors, fw, fh, 0.35, 3, 48);
      } else {
        this.rainMeteors(this.state.meteors, fw, fh, p.y, 4, p.x);
      }
      this.showItemBanner(meta);
      p.activePower = null;
      p.activeTimer = 0;
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1600);
    } else if (id === 'heal') {
      const before = p.hp;
      p.hp = Math.min(p.maxHp || PLAYER_MAX_HP, p.hp + 25);
      this.state.hpGhost = p.hp;
      this.state.hpDisplay = p.hp;
      this.state.healFlash = 0.7;
      this.showItemBanner(meta, `（+${p.hp - before}）`);
      p.activePower = null;
      p.activeTimer = 0;
      // Front of list so it survives net snapshot slice (like bomb / shock)
      this.state.fx.unshift(spawnHealFx(p.x + 8, p.y * this.L.own.h, false));
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1200);
    } else if (id === 'heal_big') {
      const before = p.hp;
      p.hp = Math.min(p.maxHp || PLAYER_MAX_HP, p.hp + 50);
      this.state.hpGhost = p.hp;
      this.state.hpDisplay = p.hp;
      this.state.healFlash = 0.95;
      this.showItemBanner(meta, `（+${p.hp - before}）`);
      p.activePower = null;
      p.activeTimer = 0;
      this.state.fx.unshift(spawnHealFx(p.x + 8, p.y * this.L.own.h, true));
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1200);
    } else if (id === 'direct') {
      // Only when actually consumed from inventory (never from net / COM / pickup)
      if (!this._powerFromItem) {
        console.warn('blocked direct without item');
        return;
      }
      // For DIRECT_DURATION the normal shot stream is redirected into the opponent's field
      // (falls straight down from the top at our x). Hits only on real collision.
      p.activePower = 'direct';
      p.activeTimer = DIRECT_DURATION;
      this.showItemBanner(meta);
      if (!this.useBot && this.net) {
        // HUD countdown start on the receiver (no damage; shots follow as directShot messages)
        this.net.send({ type: 'directStart', dur: DIRECT_DURATION });
      }
      this.state.fx.push(spawnExplosion(p.x + 8, p.y * this.L.own.h - 20, false));
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1600);
    } else if (isExAttackItem(id)) {
      // v1.5.67+ extra items (貫通 / ビット / クラスター / 黒穴 / 凍結 / 反射 / バリア)
      const extra = useExItem(id, this.exField());
      if (extra) this.showItemBanner(meta, extra);
      p.activePower = null;
      p.activeTimer = 0;
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1400);
    }
  }

  /** Own-field view for attack_items.js (shared with COM via botExField). */
  exField() {
    const S = this.state;
    return {
      enemies: S.enemies, bullets: S.bullets, fx: S.fx,
      sx: S.player.x, sy: S.player.y * this.L.own.h, fw: this.L.own.w, fh: this.L.own.h,
    };
  }

  botExField() {
    const B = this._bot;
    return {
      enemies: B.enemies, bullets: B.bullets, fx: B.fx,
      sx: B.x || 48, sy: B.y * this.L.own.h, fw: this.L.own.w, fh: this.L.own.h,
    };
  }

  onNet(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'hello' || msg.type === 'start') {
      this.beginMatch();
      return;
    }
    if (msg.type === 'state') {
      // Opponent's core-hit blink: replay it on our clock when its counter changes
      const rf = msg.state && msg.state.ff;
      const prevF = this.remoteSnap && this.remoteSnap.ff;
      if (rf) rf.t0 = prevF && prevF.n === rf.n ? prevF.t0 : performance.now();
      this.remoteSnap = msg.state;
      this.remoteSnap._fw = msg.fw;
      this.remoteSnap._fh = msg.fh;
      return;
    }
    if (msg.type === 'sendEnemies') {
      const kinds = msg.kinds || null;
      const fw = this.L.own.w, fh = this.L.own.h;
      if (kinds && kinds.length) {
        for (const kind of kinds) {
          this.state.enemies.push(this.markSentEnemy(spawnEnemy(fw, fh, kind), fw, fh, this.state.enemies));
        }
      } else {
        const n = msg.count || 3;
        for (let i = 0; i < n; i++) {
          const e = spawnEnemy(fw, fh, i === n - 1 ? 'elite' : 'swarm');
          this.state.enemies.push(this.markSentEnemy(e, fw, fh, this.state.enemies));
        }
      }
      this.setStatus('対戦相手から敵が送られてきた！');
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1400);
      return;
    }
    if (msg.type === 'meteorHit') {
      const dmg = msg.dmg || 14;
      this.applyPlayerDamage(dmg, 'direct');
      if (!this.state.meteors) this.state.meteors = [];
      this.rainMeteors(this.state.meteors, this.L.own.w, this.L.own.h, this.state.player.y, 5, this.state.player.x);
      this.setStatus('対戦相手の隕石攻撃！');
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1400);
      return;
    }
    if (msg.type === 'directStart') {
      // Incoming only — do NOT set player.activePower (that made it look like WE fired)
      this.state.incomingDirect = DIRECT_DURATION;
      this.setStatus('相手の直接攻撃！ 下から来る弾をよけろ');
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1600);
      return;
    }
    if (msg.type === 'directShot') {
      // Receiver simulates the shot + collision locally → damage counts exactly once (here)
      const nx = Number(msg.x);
      if (Number.isFinite(nx)) {
        if (!(this.state.incomingDirect > 0)) this.state.incomingDirect = DIRECT_DURATION;
        this.pushIncomingDirectShot(Math.max(0, Math.min(1, nx)) * this.L.own.w);
      }
      return;
    }
    if (msg.type === 'timer') {
      // Guest: host-authoritative clock
      if (!this.isHost() && Number.isFinite(msg.left) && !this.suddenDeath) this.matchLeft = Math.max(0, msg.left);
      return;
    }
    if (msg.type === 'timeUp') {
      if (this.ended || this.isHost()) return;
      const self = Number(msg.guestHp);
      const opp = Number(msg.hostHp);
      if (msg.result === 'sudden') {
        this.startSuddenDeath();
        return;
      }
      this.matchLeft = 0;
      this.finish(msg.result === 'guest', { reason: 'time', selfHp: self, oppHp: opp });
      return;
    }
    if (msg.type === 'sdHit') {
      // Host: guest took the first damage in sudden death → guest loses (unless already decided)
      if (!this.isHost() || this.ended || this._sdDecided) return;
      this._sdDecided = true;
      this.net.send({ type: 'sdResult', loser: 'guest', guestHp: msg.guestHp });
      this.finish(true, { reason: 'sudden', selfHp: Math.round(this.state.player.hp), oppHp: msg.guestHp });
      return;
    }
    if (msg.type === 'sdResult') {
      if (this.isHost() || this.ended) return;
      this._sdDecided = true;
      const won = msg.loser === 'host';
      this.finish(won, { reason: 'sudden', selfHp: Math.round(this.state.player.hp), oppHp: this.oppHpNow() });
      return;
    }
    if (msg.type === 'over') {
      // opponent reports result from their view
      if (msg.youWin) this.finish(true);
      else this.finish(false);
    }
  }

  frame(ts) {
    if (!this.running) return;
    try {
      // rAF timestamps can be slightly earlier than performance.now() set at start → never negative dt
      const dt = Math.max(0, Math.min(0.05, (ts - (this._lastTs || ts)) / 1000)) || 0.016;
      this._lastTs = ts;

      if (!this.waiting && !this.ended) {
        { const o = this.oppHpNow(); if (Number.isFinite(o) && o > 0) this._oppShown = o; } // last positive life shown
        this.update(dt);
        if (this.useBot) this.updateBot(dt);
        if (!this.ended) this.tickMatchTimer(dt);
        this._syncAcc += dt;
        if (this._syncAcc > 0.05) {
          this._syncAcc = 0;
          this.syncOut();
        }
      } else if (this._ko) {
        this.tickKo(dt);
      } else {
        this.state.scroll += 20 * dt;
      }

      this.state.ctrlTouch = this.ctrlTouch;
      const items = (this.state.player && this.state.player.items) || [];
      const ni = items[0];
      if (ni) {
        const m = powerupMeta(ni) || {};
        this.state.nextItemLabel = `${m.icon || ''} ${m.label || ''}：${m.effect || ''}`;
      } else this.state.nextItemLabel = '';
      renderFrame(this.ctx, this.L, this.state, this.remoteSnap, this.waiting);
      this.renderMatchTimer();
    } catch (err) {
      console.error('frame error', err);
      this.setStatus('一時エラー（継続中）');
    }
    this._raf = requestAnimationFrame((t) => this.frame(t));
  }

  syncOut() {
    if (!this.net || this.useBot || !this.net.ready) return;
    const snap = serializeField(this.state);
    snap.worldItems = this.state.items.map((it) => ({ x: it.x, y: it.y, id: it.id, life: it.life, _mag: it._mag, _tr: it._tr }));
    this.net.send({
      type: 'state',
      state: snap,
      fw: this.L.own.w,
      fh: this.L.own.h,
    });
  }

  update(dt) {
    const S = this.state;
    const P = S.player;
    const fw = this.L.own.w;
    const fh = this.L.own.h;

    S.time += dt;
    S.scroll += 60 * dt;

    // Keyboard nudge (Y = up/down, X = back/forward along flight axis)
    if (this._keys) {
      // Match touch clamps: slight Y overhang past 0/1, X unchanged
      if (this._keys.has('ArrowUp') || this._keys.has('w') || this._keys.has('W')) this.pointerY = Math.max(-0.08, this.pointerY - 1.2 * dt);
      if (this._keys.has('ArrowDown') || this._keys.has('s') || this._keys.has('S')) this.pointerY = Math.min(1.08, this.pointerY + 1.2 * dt);
      if (this._keys.has('ArrowLeft') || this._keys.has('a') || this._keys.has('A')) this.pointerX = Math.max(0.06, this.pointerX - 1.2 * dt);
      if (this._keys.has('ArrowRight') || this._keys.has('d') || this._keys.has('D')) this.pointerX = Math.min(0.88, this.pointerX + 1.2 * dt);
    }
    // Keep control-pad ship marker synced with actual ship when not grabbing
    if (!this.draggingShip) {
      this.ctrlTouch = {
        active: false,
        x: this.pointerX,
        y: this.pointerY,
      };
    }
    // Move player toward pointer (free 2D within own field)
    P.y += (this.pointerY - P.y) * Math.min(1, 12 * dt);
    const targetX = this.pointerX * fw;
    P.x += (targetX - P.x) * Math.min(1, 12 * dt);
    P.x = Math.max(20, Math.min(fw * 0.88, P.x));
    if (P.invuln > 0) P.invuln -= dt;

    // HP drain / damage VFX tick
    if (this.state.hpDisplay == null) this.state.hpDisplay = P.hp;
    if (this.state.hpGhost == null) this.state.hpGhost = P.hp;
    // Smooth display chase toward real HP
    this.state.hpDisplay += (P.hp - this.state.hpDisplay) * Math.min(1, 8 * dt);
    // Ghost lags behind then catches up (shows lost chunk)
    if (this.state.hpGhostHold == null) this.state.hpGhostHold = 0;
    if (this.state.hpGhostHold > 0) this.state.hpGhostHold -= dt;
    if (this.state.hpGhost > P.hp) {
      // Hold the orange "lost" chunk, then drain slowly (~1.5s after hold)
      if (this.state.hpGhostHold <= 0) {
        const speed = 0.45; // lower = longer visible drain
        this.state.hpGhost += (P.hp - this.state.hpGhost) * Math.min(1, speed * dt);
        if (this.state.hpGhost - P.hp < 0.15) this.state.hpGhost = P.hp;
      }
    } else {
      this.state.hpGhost = P.hp;
    }
    if (this.state.damageFlash > 0) this.state.damageFlash -= dt;
    if (this.state.healFlash > 0) this.state.healFlash -= dt;
    if (this.state.hpShake > 0) this.state.hpShake -= dt;
    if (this.state.damageNumbers) {
      for (const n of this.state.damageNumbers) {
        n.life -= dt;
        n.y -= 0.25 * dt; // float up in normalized space
      }
      this.state.damageNumbers = this.state.damageNumbers.filter((n) => n.life > 0);
    }

    if (this.state.itemBanner) {
      this.state.itemBanner.life -= dt;
      if (this.state.itemBanner.life <= 0) this.state.itemBanner = null;
    }
    this.tickTutorial(dt);
    if (S.incomingDirect > 0) {
      S.incomingDirect -= dt;
      if (S.incomingDirect < 0) S.incomingDirect = 0;
    }
    if (P.activeTimer > 0) {
      P.activeTimer -= dt;
      if (P.activeTimer <= 0) {
        P.activePower = null;
        if (!this.ended) {
          if (P.items.length) {
            const n = powerupMeta(P.items[0]);
            this.setStatus(`次: ${n.icon} ${n.label}（${n.effect}） / アイテムで発動`);
          } else this.setStatus(HINT);
        }
      }
    }

    // Auto fire
    P.fireCd -= dt;
    const fireRate = P.activePower === 'homing' ? 0.16
      : P.activePower === 'rapid' ? 0.1
      : 0.16; // normal: denser stream (was 0.28)
    if (P.fireCd <= 0 && S.alive) {
      P.fireCd = fireRate;
      const by = P.y * fh;
      if (P.activePower === 'homing') {
        this._homingShotN = (this._homingShotN || 0) + 1;
        const n = this._homingShotN;
        const fan = ((n % 5) - 2) * 0.09 + (Math.random() - 0.5) * 0.05;
        const spd0 = 320;
        S.bullets.push(spawnBullet(
          P.x + 16, by,
          Math.cos(fan) * spd0, Math.sin(fan) * spd0 + ((n % 5) - 2) * 18,
          'player', true, 3,
        ));
        sfx.shot();
      } else if (P.activePower === 'rapid') {
        S.bullets.push(spawnBullet(P.x + 16, by, 520, 0, 'player', false, 3));
        S.bullets.push(spawnBullet(P.x + 16, by - 6, 500, -30, 'player', false, 2));
        S.bullets.push(spawnBullet(P.x + 16, by + 6, 500, 30, 'player', false, 2));
        sfx.shot();
      } else if (P.activePower === 'direct') {
        // 直接攻撃: the same normal shot (speed/damage/rate) leaves our ship straight UP (ship faces up).
        // It hits nothing in our pane; when it exits the top it is handed off to the opponent's field
        // (see handOffDirectShot) — enters there from the BOTTOM edge at the same x and keeps rising.
        S.bullets.push(spawnDirectOutShot(P.x, by - 14));
        sfx.shot();
      } else {
        // denser fire, slightly weaker per shot (4→2)
        S.bullets.push(spawnBullet(P.x + 16, by, 420, 0, 'player', false, 2));
        sfx.shot();
      }
    }

    // Laser damage — every tick hit = one small spark at contact (pierce beam)
    if (P.activePower === 'laser' && P.activeTimer > 0) {
      P.laserCd = (P.laserCd || 0) - dt;
      if (P.laserCd <= 0) {
        P.laserCd = 0.07;
        const ly = P.y * fh;
        for (const e of S.enemies) {
          if (warping(e)) continue;
          if (Math.abs(e.y - ly) < e.h * 0.55 + 8 && e.x > P.x) {
            // 10-04b: up to 10 hits per tick by hull width, a small explosion at every hit
            const bh = applyLaserTick(e, ly, S.fx, P.x);
            if (bh === 'core') this.onCoreBreak(e, S.fx, true, S.enemies); else if (bh === 'corehit') this.fieldFlash(S, 'hit');
          }
        }
      }
    }

    // v1.5.67 extra attack items (beam / pods / missiles / vortex / freeze / discs)
    tickExItems(this.exField(), dt);

    // Spawn enemies — scripted STO-recreation waves (js/waves.js), same script on the COM field
    {
      const n0 = S.enemies.length;
      const tags = runWaveScript(S, S.time, S.enemies, fw, fh);
      if (S.enemies.slice(n0).some((e) => hasCore(e))) this.coreTip();
      if (tags.includes('round2')) {
        this.setStatus('ROUND 2');
        setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1800);
      }
      // light filler so a quiet stretch never goes empty (same on both fields)
      this._spawnAcc += dt;
      const late = S.time > 240; // 10-04d: denser filler in the last minute / 延長戦 (same rule on the COM field)
      if (this._spawnAcc >= (late ? 2 : 3) && S.enemies.filter((e) => !e.sent && !e._chainOf).length < (late ? 6 : 4)) {
        this._spawnAcc = 0;
        S.enemies.push(spawnEnemy(fw, fh, Math.random() < 0.5 ? 'wave_basic' : 'wave_swarm'));
      }
    }

    // Update enemies (vertical weave + forward/back surge)
    for (const e of S.enemies) {
      if (tickWarp(e, dt)) continue; // warp-in: scripted glide / hold, no fire
      if (e.frozenT > 0) continue; // フリーズ: no movement / no fire while frozen
      if (e._chainT != null) continue; // doomed by a core chain: holds its place until its turn to pop
      tickCoreExtras(e, dt);
      tickRearGuard(e, dt, P.x, P.y * fh, S.bullets, fw, fh); // rear units patrol, cover and shoot
      if (tickEscort(e, dt, fh)) continue; // formation escort: follows its core unit, no guns
      if (e._entryX != null) { if (e.x > e._entryX) e.x -= 120 * dt; else e._entryX = null; } // core boss + pack fly in together
      e.phase += dt * 2;
      e.surgePhase = (e.surgePhase || 0) + dt * (e.surgeFreq || 1.4);
      if (e.appearT > 0) e.appearT = Math.max(0, e.appearT - dt);
      if (e.lingerT > 0) e.lingerT = Math.max(0, e.lingerT - dt);
      const surge = Math.sin(e.surgePhase) * (e.surgeAmp || 32);
      // Sent: linger on the right (bob/weave OK, no left push) until lingerT expires
      if (moveScripted(e, dt, fw, fh, P.y * fh, P.x)) { /* scripted STO path */ } else if (e.sent && e.lingerT > 0) {
        if (e.holdX == null) e.holdX = fw * (0.72 + Math.random() * 0.14);
        if (e.holdY == null) e.holdY = e.y;
        // Enter right zone from off-screen, then weave in place
        if (e.x > e.holdX + (e.surgeAmp || 32) + 8) {
          e.x -= Math.max(60, e.speed) * dt;
        } else {
          const targetX = e.holdX + surge * 0.85;
          e.x += (targetX - e.x) * Math.min(1, 5 * dt);
          e.y = e.holdY + Math.sin(e.phase) * ((() => { const t = resolveEnemyTier(e.kind); return (t === 'swarm' || t === 'drone') ? 28 : 18; })());
        }
      } else {
        // Drift left (normal waves + sent after linger ends)
        const advance = e.speed + Math.cos(e.surgePhase) * (e.speed * 0.55);
        e.x -= advance * dt;
        if (!LARGE_ENEMY_TIERS.has(resolveEnemyTier(e.kind))) {
          e.y += Math.sin(e.phase) * 18 * dt;
        } else {
          // Heavy units also nudge forward/back a bit
          e.x += Math.sin(e.surgePhase * 0.7) * 22 * dt;
        }
      }
      if (!e.mv) e.y = Math.max(16, Math.min(fh - 16, e.y)); // scripted paths may enter / leave via the top & bottom edges
      const onScreen = e.x < fw + 10;
      const parked = (e.sent && e.lingerT > 0) ? e.x <= (e.holdX || fw) + 8 : true;
      if (!fireScripted(e, S.bullets, P.x, P.y * fh, dt, onScreen && !e.noFire)) tickEnemyLaserFire(e, S.bullets, P.x, P.y * fh, dt, onScreen && parked && !e.noFire, () => {
        const tier = resolveEnemyTier(e.kind);
        return e.sent
          ? ((tier === 'boss' || tier === 'tank' || tier === 'mech') ? 0.95
            : (tier === 'golem' || tier === 'elite') ? 1.2
            : 1.55 + Math.random() * 0.4)
          : ((tier === 'boss' || tier === 'tank') ? 1.15
            : (tier === 'mech' || tier === 'golem') ? 1.4 + Math.random() * 0.4
            : tier === 'elite' ? 1.7 + Math.random() * 0.5
            : 2.25 + Math.random() * 0.8);
      });
    }

    // Bullets (player homing + enemy limited-homing, then trail)
    const pyAim = P.y * fh;
    const spawnedEB = [];
    for (const b of S.bullets) {
      if (b.homing && b.owner === 'player') {
        steerHomingBullet(b, S.enemies, dt, fw);
      } else if (b.homing && b.owner === 'enemy' && !b.laser) {
        steerEnemyHoming(b, P.x, pyAim, dt);
      }
      if (b.k && b.owner === 'enemy') updateEnemyBullet(b, dt, spawnedEB);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      pushHomingTrail(b);
    }
    for (const b of spawnedEB) S.bullets.push(b);
    // 直接攻撃: our upward shot left the top of our pane → continue it in the opponent's field
    for (const b of S.bullets) {
      if (b.dvis && b.life > 0 && b.y < -12) {
        b.life = 0;
        this.handOffDirectShot(b.x);
      }
    }

    // Items float
    for (const it of S.items) {
      it.life -= dt;
      if (magnetStep(it, P.x, P.y * fh, dt)) continue; // magnet: pulled to the ship
      it.y += Math.sin(S.time * 3 + it.x) * 10 * dt;
      it.x -= 30 * dt;
      it.y = Math.max(24, Math.min(fh - 24, it.y)); // bigger orb stays inside the pane
    }

    // FX
    S.coinHud = !!(this.useBot && !this.isOnline()); // PvP: coins animate, no PT shown anywhere
    {
      const got = tickCoins(S.fx, P.x, P.y * fh, dt);
      if (got > 0) {
        S.coinPt = (S.coinPt || 0) + got;
        if (S.coinHud) { S.coinLastGold = got >= 30; S.coinPop = { n: got, t: performance.now() / 1000, gold: got >= 30 }; } // animated at the HUD counter (render.js drawCoinHud)
      }
    }
    for (const f of S.fx) f.life -= dt;

    // Collisions player bullets -> enemies
    for (const b of S.bullets) {
      if (b.owner !== 'player' || b.dvis) continue; // direct shots fly out of our pane without hitting
      for (const e of S.enemies) {
        if (warping(e) || e.passShots) continue; // shots pass through warping units / striker chain
        if (hasCore(e)) {
          // Core weak point: core = instant kill, drones/body = almost nothing (deflect)
          const r = applyCoreAwareHit(e, b.dmg || 1, b.x, b.y, S.fx);
          if (r.hit === 'none') continue;
          if (r.hit === 'core') this.onCoreBreak(e, S.fx, true, S.enemies);
          else if (r.hit === 'corehit') this.fieldFlash(S, 'hit');
          if (!b.pierce) b.life = 0;
          break;
        }
        if (Math.abs(b.x - e.x) < e.w * 0.45 + 4 && Math.abs(b.y - e.y) < e.h * 0.45 + 4) {
          e.hp -= b.dmg;
          // pierce (direct volley / laser bullets): keep flying until off-screen
          if (!b.pierce) b.life = 0;
          // Every successful hit (incl. pierce/laser) = one small boom at contact
          S.fx.push(spawnHitSpark(b.x, b.y));
          break;
        }
      }
    }

    // Enemy death -> items
    const remain = [];
    for (const e of S.enemies) {
      // Core enemies only die when the core breaks (items / rams / ex-weapons can't finish them)
      if (tickChain(e, dt)) {
        S.fx.push(spawnChainBoom(e));
        // live 「連鎖 N機！」 counter: counts up with each sequential pop
        const src = e._chainSrc;
        if (src && src === this._chainMsgSrc) {
          this.setStatus(`${src._coreMsg || 'コア撃破！'}　連鎖 ${src._chainDone}機！`);
          if (src._chainDone >= (src._chainTotal || 0)) setTimeout(() => { if (!this.ended && !this.waiting && this._chainMsgSrc === src) this.setStatus(HINT); }, 1400);
        }
      }
      if (hasCore(e) && !e._coreBreak && e.hp < 1) e.hp = 1;
      if (e.hp <= 0) {
        if (e._chainT != null && !e._chainKill) { // doomed unit finished off early (shot / rammed): still part of the chain
          e._chainKill = true; S.fx.push(spawnChainBoom(e));
          if (e._chainSrc) e._chainSrc._chainDone = (e._chainSrc._chainDone || 0) + 1;
        }
        if (!e._chainKill) S.fx.push(spawnKillBoom(e.x, e.y, resolveEnemyTier(e.kind) === 'boss')); // chain pops use the 2× chain boom
        S.fx.push(spawnCoin(e.x, e.y, this.coinGold(e)));
        sfx.explode();
        P.score += e.score;
        if (e._coreBreak) {
          // コア撃破: 大回復確定 + アイテム確定 (swarm: 回復 + アイテム)
          if (Math.random() < HEAL_GUARANTEE_P) S.items.push(spawnItemWithId(e.x, e.y, bigCoreKind(e.kind) ? 'heal_big' : 'heal'));
          S.items.push(spawnItem(e.x + 26, e.y));
        } else if (isLargeEnemy(e) && !(e._chainOf || e._lead || e._chainT != null)) { // core-attached units: no guaranteed heal
          // デカギャラ撃破: 回復確定（ボス級は大回復）
          const healId = resolveEnemyTier(e.kind) === 'boss' ? 'heal_big' : 'heal';
          if (Math.random() < HEAL_GUARANTEE_P) S.items.push(spawnItemWithId(e.x, e.y, healId));
        } else if (!e.noDrop && Math.random() < (resolveEnemyTier(e.kind) === 'boss' ? 1 : ITEM_DROP_CHANCE * (e.dropMul ?? 1))) {
          S.items.push(spawnItem(e.x, e.y));
        }
        // Damage bot passively a bit when scoring? No — only via powers / race.
      } else if (e.x > -40) {
        remain.push(e);
      }
    }
    S.enemies = remain;

    // Enemy bullets -> player (homing missiles weaker: ~67% of normal/laser)
    // v1.5.70: barrier short-circuits damage (shield absorbs bullets)
    const playerBarrier = hasBarrierFx(S.fx);
    for (const b of S.bullets) {
      if (b.owner !== 'enemy' || b.life <= 0) continue;
      // Use real ship Y even when slightly past 0/1 (overhang still hittable)
      const py = P.y * fh;
      const hb = b.hb || 0; // bigger hurtbox for big orbs / mines / beams
      const bx = b.k === 'bolt' ? Math.max(b.x, Math.min(b.x + 44, P.x)) : b.x; // short bolt = 44 px segment
      if (Math.abs(bx - P.x) < 16 + hb && Math.abs(b.y - py) < 16 + hb) {
        if (playerBarrier) {
          b.life = 0;
          const bar = S.fx.find((f) => f.kind === 'barrier' && f.life > 0);
          if (bar) bar._hit = 0.14;
          continue;
        }
        if (b.dir) {
          // 直接攻撃 shot: every real collision = normal shot damage + explosion (no invuln gate)
          b.life = 0;
          this.onDirectHitPlayer(b);
          continue;
        }
        if (P.invuln <= 0) {
          // v1.5.72: 3/5 base; × firing unit's 攻撃力 multiplier (b.atk, sent units only)
          const hitDmg = scaledHitDmg(b.homing ? 3 : 5, b);
          this.applyPlayerDamage(hitDmg, 'bullet');
          P.invuln = 0.75;
          b.life = 0;
          S.fx.push(spawnHitSpark(P.x, py));
          sfx.hit();
        }
      }
    }

    // Enemy body -> player (warping units are harmless)
    for (const e of S.enemies) {
      if (warping(e)) continue;
      const py = P.y * fh;
      if (Math.abs(e.x - P.x) < e.w * 0.4 + 12 && (Math.abs(e.y - py) < e.h * 0.4 + 12 || (e._edge && (py - e.y) * e._edge > 0))) { // bubble wall edge rows also cover the off-edge overhang
        if (playerBarrier) {
          const bar = S.fx.find((f) => f.kind === 'barrier' && f.life > 0);
          if (bar) bar._hit = 0.14;
          e.hp -= 1; // ship still scrapes the enemy a bit
          continue;
        }
        if (P.invuln <= 0) {
          this.applyPlayerDamage(8, 'ram'); // v1.5.72: was 10
          P.invuln = 0.9;
          e.hp -= 1;
          S.fx.push(spawnExplosion(P.x, py, true));
        }
      }
    }

    // Collect items — heal applies instantly on pickup
    const leftItems = [];
    for (const it of S.items) {
      const py = P.y * fh;
      if (Math.abs(it.x - P.x) < 32 && Math.abs(it.y - py) < 32) { // v1.5.67: matches bigger orb
        sfx.pickup();
        if (it.id === 'heal' || it.id === 'heal_big') {
          this.activatePower(it.id);
        } else {
          const meta = powerupMeta(it.id);
          if (P.items.length < MAX_ITEM_SLOTS) {
            P.items.push(it.id);
            if (meta) this.setStatus(`入手 ${meta.icon} ${meta.label}（${meta.effect}）`);
          } else {
            // Inventory full — orb is consumed/wasted (info pane only, not on stage)
            const name = meta ? `${meta.icon}${meta.label}` : 'アイテム';
            this.setStatus(`アイテムがいっぱいです（最大${MAX_ITEM_SLOTS}つ）　${name}は消えました`);
          }
        }
      } else if (it.life > 0 && it.x > -20) {
        leftItems.push(it);
      }
    }
    S.items = leftItems;


    // Falling meteors (visible rocks)
    if (!S.meteors) S.meteors = [];
    for (const m of S.meteors) {
      m.vx = 0; // never drift into enemy lanes
      m.vy += 260 * dt;
      m.y += m.vy * dt;
      m.rot = (m.rot || 0) + (m.spin || 0) * dt;
      m.life -= dt;
      // Impact only near target ship Y — visual only (HP already applied to opponent)
      if (!m.hit && m.y >= (m.targetY != null ? m.targetY : fh * 0.55)) {
        m.hit = true;
        m.life = Math.min(m.life, 0.2);
        S.fx.push(spawnExplosion(m.x, m.y, true));
      }
    }
    S.meteors = S.meteors.filter((m) => m.life > 0 && m.y < fh + 60);

    // Cleanup — keep bullets past top/bottom so edge overhang is not a safe zone
    S.bullets = S.bullets.filter((b) => b.life > 0 && b.x > -30 && b.x < fw + 80 && b.y > -90 && b.y < fh + 90);
    S.fx = S.fx.filter((f) => f.life > 0);
    trimFx(S.fx, 140); // keeps coins

    // Show next item hint on bar when idle
    if (P.activeTimer <= 0 && P.items.length && S.statusText === HINT) {
      // keep hint until they tap — also flash next item name lightly
    }

    // Win/lose: HP
    if (P.hp <= 0) {
      S.alive = false;
      this.finish(false);
      return;
    }
    const oppHp = this.useBot ? this.state.botHp : (this.remoteSnap ? this.remoteSnap.php : null);
    if (oppHp != null && oppHp <= 0) {
      this.finish(true);
    }
  }

  updateBot(dt) {
    const _cp = this.comProfile();
    const B = this._bot;
    if (!B) return;
    const fw = this.L.own.w;
    const fh = this.L.own.h;
    let shipX = B.x || 48;
    B.time += dt;
    B.scroll += 55 * dt;
    if (B.invuln == null) B.invuln = 0;
    if (B.invuln > 0) B.invuln -= dt;
    if (B.directBeam > 0) B.directBeam -= dt;
    if (B.activeTimer > 0) {
      B.activeTimer -= dt;
      if (B.activeTimer <= 0) B.activePower = null;
    }

    // --- COM movement: threat-predicting planner (samples candidate positions, projects enemy
    // bullets / ships / laser telegraphs a short horizon ahead, picks the safest spot that still
    // lines up a shot). Difficulty = reaction (new bullets unseen for a moment), horizon, replan
    // interval, perception noise and rare lapses — not raw speed or stats.
    if (!Number.isFinite(B.x)) B.x = 48;
    if (!Number.isFinite(B.y)) B.y = 0.5;
    if (B.moveVel == null) B.moveVel = 0;
    if (B.moveVelX == null) B.moveVelX = 0;
    if (B.preferredY == null) B.preferredY = 0.5;
    const AI = globalThis.__aiOverride ? { ...(_cp.ai || {}), ...globalThis.__aiOverride } : (_cp.ai || {});
    const horizon = AI.horizon || 0.6;
    const react = AI.react != null ? AI.react : 0.1;
    const noise = AI.noise || 0;
    const margin = AI.margin != null ? AI.margin : 5;
    // The COM 'hand' drags a virtual pointer (like the player's finger); the ship follows it with
    // exactly the player's ship response. Hand speed / reaction are AI quality, not ship stats.
    const handPx = (AI.hand || 2) * fh; // px/s
    const vyMax = handPx;
    const vxMax = handPx;
    const shipY0 = B.y * fh;
    // Threats the COM has "noticed" (reaction delay on freshly fired shots)
    const threats = [];
    for (const b of B.bullets) {
      if (b.life <= 0) continue;
      if (b.owner !== 'enemy' && !b.dir) continue;
      if (b._seenT == null) { b._seenT = B.time; b._nz = (Math.random() - 0.5) * 2 * noise; b._juke = !!(b.homing && AI.juke && Math.random() < AI.juke); }
      if (B.time - b._seenT < react) continue;
      threats.push(b);
    }
    // Attention: a human only tracks the nearest few shots
    if (AI.attn && threats.length > AI.attn) {
      threats.sort((p, q) => Math.hypot(p.x - shipX, p.y - B.y * fh) - Math.hypot(q.x - shipX, q.y - B.y * fh));
      threats.length = AI.attn;
    }
    // COM sees only what a human sees: invisible bubbles count only shortly after a hit revealed them
    // (noticed after the reaction delay, remembered ~0.6 s), never while fully invisible.
    const VE = B.enemies.filter((e) => e.kind !== 'wave_bubble' || comSeesBubble(e, B.time, react));
    const enemyPressure = VE.filter((e) => e.x < fw * 0.7).length;

    // Target to aim at (heavier / closer / aligned first)
    let focus = null;
    let focusVal = -1e9;
    for (const e of VE) {
      if (e.x < shipX - 10 || warping(e)) continue; // don't aim at invulnerable warp-ins
      const kindW = ({ boss: 5, mech: 4, golem: 4, tank: 4, elite: 3, drone: 2, basic: 1.5, swarm: 1 })[resolveEnemyTier(e.kind)] || 1;
      const dist = Math.max(20, e.x - shipX);
      const align = 1 - Math.min(1, Math.abs(e.y / fh - B.y) / 0.28);
      let val = kindW * 16 / Math.sqrt(dist) + align * 5 + (e.x < 160 ? 1.8 : 0);
      // Visible core (human-like): noticed only after coreNotice s; then it becomes a priority target
      if (hasCore(e) && e.core && e.core.hp > 0) {
        if (e._comCoreSeenT == null) e._comCoreSeenT = B.time;
        if (B.time - e._comCoreSeenT >= (AI.coreNotice ?? 0.9)) val += 30 * (AI.corePri ?? 0);
      }
      if (val > focusVal) { focusVal = val; focus = e; }
    }
    // Human distraction (level-scaled): now and then the eye jumps to another visible enemy for ~1 s
    if (B._distT > 0) B._distT -= dt;
    else if (Math.random() < (AI.distract ?? 0) * dt) {
      const others = VE.filter((e) => e !== focus && !hasCore(e) && e.x > shipX + 20 && e.x < fw && e.y > 0 && e.y < fh);
      if (others.length) { B._distE = others[Math.floor(Math.random() * others.length)]; B._distT = 0.7 + Math.random() * 0.7; }
    }
    if (B._distT > 0 && B._distE && VE.includes(B._distE)) focus = B._distE;
    // Aim point: a core is tracked with a human hand/eye lag (no lead) + slowly drifting aim error
    let aimY = focus ? focus.y : null;
    let coreAim = false;
    // Before the core is noticed, a core unit is just a big target: aim at its body with the same
    // drifting hand error (beginners spray around it; experts barely wobble)
    if (focus && hasCore(focus) && focus.core && focus.core.hp > 0) {
      if (B._bodyNzE !== focus) { B._bodyNzE = focus; B._bodyNz = (Math.random() - 0.5) * 2 * (AI.coreNoise ?? 10); }
      B._bodyNz += ((Math.random() - 0.5) * 2 * (AI.coreNoise ?? 10) - B._bodyNz) * Math.min(1, 1.2 * dt);
      aimY = focus.y + B._bodyNz;
    }
    if (focus && hasCore(focus) && focus.core && focus.core.hp > 0 && B.time - (focus._comCoreSeenT ?? B.time) >= (AI.coreNotice ?? 0.9)) {
      const cw = coreWorld(focus);
      if (B._coreTgt !== focus) { B._coreTgt = focus; B._coreTrackY = focus.y; B._coreNz = (Math.random() - 0.5) * 2 * (AI.coreNoise ?? 10); }
      B._coreTrackY += (cw.y - B._coreTrackY) * Math.min(1, dt / Math.max(0.05, AI.coreLag ?? 0.3));
      B._coreNz += ((Math.random() - 0.5) * 2 * (AI.coreNoise ?? 10) - B._coreNz) * Math.min(1, 1.2 * dt);
      aimY = B._coreTrackY + B._coreNz;
      // Sniping (skill, level-scaled): look for a clear lane past the guards onto the core and aim
      // through it (visible bodies only; re-judged every ~0.3 s with the usual hand lag)
      if ((AI.coreSnipe ?? 0) > 0) {
        B._snipeT = (B._snipeT || 0) - dt;
        if (B._snipeT <= 0) {
          B._snipeT = 0.3;
          B._snipeOff = null;
          if (Math.random() < AI.coreSnipe) {
            const blocked = (y) => VE.some((o) => o !== focus && !warping(o) && o.hp > 0 && o.x > shipX && o.x < cw.x - cw.r
              && Math.abs(o.y - y) < (o.h || 30) * 0.45 + 4);
            const guardBlk = (y) => (focus.drones || []).some((d) => d.hp > 0 && Math.abs(focus.y + Math.sin(d.ang) * d.dist * (d.ky || 1) - y) < d.r + 4
              && focus.x + Math.cos(d.ang) * d.dist < cw.x);
            if (blocked(aimY) || guardBlk(aimY)) {
              for (const k of [0, -0.5, 0.5, -0.8, 0.8]) {
                const y = cw.y + k * (cw.r - 2);
                if (!blocked(y) && !guardBlk(y)) { B._snipeOff = y - cw.y; break; }
              }
            }
          }
        }
        if (B._snipeOff != null) aimY = B._coreTrackY + B._snipeOff + B._coreNz * 0.5;
      }
      coreAim = true;
    } else B._coreTgt = null;

    const STEPS = [0.06, 0.13, 0.2, 0.28, 0.36, 0.45, 0.55, 0.66, 0.78, 0.9].filter((t) => t <= horizon + 1e-6);
    const posAt = (x0, y0, cx, cy, t) => {
      const dx = cx - x0, dy = cy - y0;
      const mx = vxMax * t, my = vyMax * t;
      return [x0 + Math.sign(dx) * Math.min(Math.abs(dx), mx), y0 + Math.sign(dy) * Math.min(Math.abs(dy), my)];
    };
    const dangerOf = (cx, cy, noHoming = false, shotsOnly = false) => {
      let d = 0;
      for (const b of threats) {
        if (b.homing && !b.laser && b.owner === 'enemy' && b.homeT > 0) {
          if (noHoming) continue;
          // Limited-homing missile: simulate its steering toward our projected path.
          // Bait skill (b._juke): hold still while it homes, then sidestep once it flies straight.
          let mx = b.x, my = b.y + (b._nz || 0), mvx = b.vx || -1, mvy = b.vy || 0, hT = b.homeT;
          const hbm = (b.hb || 0) + margin + 3;
          const H = horizon + 0.25, h = 0.04;
          const tw = b._juke ? b.homeT : 0;
          for (let t = h; t <= H; t += h) {
            const [sx, sy] = t <= tw ? [shipX, shipY0] : posAt(shipX, shipY0, cx, cy, t - tw);
            if (hT > 0) {
              hT -= h;
              const des = Math.atan2(sy - my, sx - mx);
              const cur = Math.atan2(mvy, mvx);
              let dl = des - cur;
              while (dl > Math.PI) dl -= Math.PI * 2;
              while (dl < -Math.PI) dl += Math.PI * 2;
              const mt = ENEMY_HOMING_TURN * h;
              const a = cur + Math.max(-mt, Math.min(mt, dl));
              mvx = Math.cos(a) * ENEMY_HOMING_SPD; mvy = Math.sin(a) * ENEMY_HOMING_SPD;
            }
            mx += mvx * h; my += mvy * h;
            const ax = Math.abs(mx - sx), ay = Math.abs(my - sy);
            if (ax < 16 + hbm && ay < 16 + hbm) { d += 10 / (0.18 + t); break; }
            if (ax < 26 + hbm && ay < 22 + hbm) d += 0.3 / (0.25 + t);
          }
          continue;
        }
        const hb = (b.hb || 0) + margin + (b.homing ? 4 : 0);
        const bvx = b.vx || 0, bvy = b.vy || 0;
        const bny = b._nz || 0;
        for (const t of STEPS) {
          if (t > b.life) break;
          const bx0 = b.x + bvx * t, by = b.y + bvy * t + bny;
          const [sx, sy] = posAt(shipX, shipY0, cx, cy, t);
          const bx = b.k === 'bolt' ? Math.max(bx0, Math.min(bx0 + 44, sx)) : bx0; // short bolt = 44 px segment
          const ax = Math.abs(bx - sx), ay = Math.abs(by - sy);
          if (ax < 16 + hb && ay < 16 + hb) { d += 10 / (0.18 + t); break; }
          if (ax < 26 + hb && ay < 22 + hb) d += 0.6 / (0.25 + t);
        }
      }
      if (!shotsOnly) for (const e of VE) {
        if (warping(e)) continue;
        const parkedE = e.sent && e.lingerT > 0;
        // formation escorts visibly move with their leader (not at their own top speed)
        const spd = parkedE ? 0 : ((e._lead && e._lead.hp > 0 ? e._lead.speed : e.speed) || 60) * 1.55;
        const rx = (e.w || 30) * 0.4 + 8 + margin + 10, ry = (e.h || 30) * 0.4 + 8 + margin + 12;
        // Tethered striker head: moves along its own (visible) line once the COM has noticed the lunge
        const armH = e.mv === 'arm' ? e : e.mv === 'armseg' ? e._chainOf : null;
        const armMv = !!armH && (armH._ph === 'strike' || armH._ph === 'swing' || armH._ph === 'coil') && armH._pt >= react;
        const evx = armH ? (armMv ? (e._vx || 0) : 0) : -spd, evy = armMv ? (e._vy || 0) : 0;
        // a curling striker (visible wind-up) is about to thrust: stay out of its reach
        if (e.mv === 'arm' && (e._ph === 'coil' || e._ph === 'strike') && e._pt >= react) {
          // visible wind-up aim line / the thrusting chain itself: get off that lane or back out of reach
          const R = (e._reach || fw * 0.56) + 18, A = e._ph === 'coil' ? (e._aimA ?? Math.PI) : (e._A ?? Math.PI);
          const ux = Math.cos(A), uy = Math.sin(A), W = 28 + margin;
          const qx = cx - e._tx, qy = cy - e._ty, along = qx * ux + qy * uy, side = Math.abs(qx * uy - qy * ux);
          if (along > 0 && along < R && side < W) d += (e._ph === 'strike' ? 10 : 5) * (1 - side / (W + 1)) * (along > R - 18 ? (R - along) / 18 : 1);
          else if (e._ph === 'coil' && Math.hypot(qx, qy) < R) d += 0.4;
        }
        for (const t of STEPS) {
          const ex = e.x + evx * t, ey = e.y + evy * t;
          const [sx, sy] = posAt(shipX, shipY0, cx, cy, t);
          if (Math.abs(ex - sx) < rx && Math.abs(ey - sy) < ry) { d += 12 / (0.18 + t); break; }
        }
        // general standoff: close enemies ram and fire point-blank missiles that can't be dodged
        {
          const dd = Math.hypot((e.x - cx) * 0.8, e.y - cy);
          const r = AI.standR ?? 150;
          if (dd < r) d += (AI.standW ?? 0) * (1 - dd / r);
        }
        // keep a respectful distance from big ships (ramming + point-blank volleys)
        if (isLargeEnemy(e)) {
          const dd = Math.hypot(e.x - cx, e.y - cy);
          const r = (e.w || 80) * 0.75 + 50;
          if (dd < r) d += 2.2 * (1 - dd / r);
        }
        // laser telegraph lanes (about to fire straight left)
        if (e.laserTeleT > 0 && e.x > cx) {
          const offs = e.laserTeleOffs || [0];
          for (const o of offs) if (Math.abs(cy - (e.y + o)) < 16 + margin) d += 5;
        }
        // don't sit in the firing line of a unit that is about to shoot
        if (!e.noFire && e.x > cx && Math.abs(e.y - cy) < 14 && (e.fireCd || 0) < 0.35) d += 0.7; // escorts never shoot (visible)
      }
      return d;
    };

    B._planAcc = (B._planAcc || 0) - dt;
    if (B._lapse > 0) B._lapse -= dt;
    else if (AI.lapseChance && Math.random() < AI.lapseChance * dt) B._lapse = 0.25 + Math.random() * 0.25;
    if (B._tx == null) { B._tx = B.x; B._ty = shipY0; }
    let curDanger = 0;
    if (B._planAcc <= 0 && !(B._lapse > 0)) {
      B._planAcc = AI.replan || 0.07;
      // Stay back: distance buys time once enemy missiles stop homing (they fly straight after)
      const prefX = fw * (AI.prefX || 0.1);
      const cands = [[B._tx, B._ty], [B.x, shipY0]];
      const xs = [0.07, 0.13, 0.2, 0.28, 0.37, 0.47, 0.6, 0.74].map((k) => k * fw);
      for (const cx of xs) for (let k = 0; k <= 12; k++) cands.push([cx, fh * (0.04 + 0.92 * k / 12)]);
      for (const it of B.orbs) {
        if (it._seenT == null || it._skip || B.time - it._seenT < (AI.orbNotice ?? 0.5)) continue;
        cands.push([it.x - 30 * 0.3, it.y]);
        // smart route (strong COM): meet the drifting orb where the magnet can catch it, not where it is now
        if (AI.pickSafe) { const tA = Math.max(0, Math.hypot(it.x - B.x, it.y - shipY0) - ITEM_MAGNET_R * 0.8) / Math.max(1, handPx); cands.push([it.x - 30 * tA - ITEM_MAGNET_R * 0.5, it.y]); }
      }
      // Line-up spots on the (tracked, noisy) core row: here, a bit back, a bit forward
      if (coreAim) for (const kx of [0, -0.06, 0.06]) cands.push([B.x + kx * fw, aimY]);
      // fine candidates around the current position
      for (const [ox, oy] of [[0, -0.06], [0, 0.06], [-0.05, 0], [0.05, 0], [0, -0.12], [0, 0.12]]) cands.push([B.x + ox * fw, shipY0 + oy * fh]);
      let best = null, bestC = 1e9;
      for (const [cx0, cy0] of cands) {
        const cx = Math.max(20, Math.min(fw * 0.88, cx0));
        const cy = Math.max(fh * 0.02, Math.min(fh * 0.98, cy0));
        const dz = dangerOf(cx, cy);
        let c = dz;
        // Item pickup desire vs safety (strong: skips orbs sitting in danger; normal: greedier)
        for (const it of B.orbs) {
          const heal = it.id === 'heal' || it.id === 'heal_big';
          const hpR = B.hp / (B.maxHp || PLAYER_MAX_HP);
          const v = heal ? (hpR < 0.5 ? 3 : hpR < 0.85 ? 1.6 : 0.5) : (B.items.length < MAX_ITEM_SLOTS ? 1.9 : 0);
          if (v <= 0) continue;
          if (it._seenT == null) { it._seenT = B.time; it._skip = Math.random() < (AI.orbMiss || 0); } // weak COM overlooks some orbs
          if (it._skip) continue;
          if (B.time - it._seenT < (AI.orbNotice ?? 0.5)) continue; // human: notice the orb first
          if (dz > (AI.pickSafe ? (AI.pickDz ?? 2) : 6)) continue; // too risky here → give up on it (for now)
          if (AI.pickSafe) {
            // only when the way there looks clear too (midpoint of the drag)
            // smart route: straight drag, or an L-shaped detour (vertical first / horizontal first) — the safest one counts
            const mk = it._midK === B.time ? it._midD : (it._midK = B.time, it._midD = (() => {
              const gx = Math.max(B.x, it.x - ITEM_MAGNET_R * 0.6), gy = it.y;
              const straight = Math.max(dangerOf((B.x + gx) / 2, (shipY0 + gy) / 2), dangerOf((B.x * 3 + gx) / 4, (shipY0 * 3 + gy) / 4));
              const vFirst = Math.max(dangerOf(B.x, (shipY0 + gy) / 2), dangerOf(B.x, gy), dangerOf((B.x + gx) / 2, gy));
              const hFirst = Math.max(dangerOf((B.x + gx) / 2, shipY0), dangerOf(gx, shipY0), dangerOf(gx, (shipY0 + gy) / 2));
              return Math.min(straight, vFirst, hFirst);
            })());
            if (mk > (AI.pickDz ?? 2)) continue;
          }
          // Magnet: it only needs to get within ~ITEM_MAGNET_R, the orb flies in by itself
          const tArr = Math.max(0, Math.hypot(it.x - B.x, it.y - shipY0) - ITEM_MAGNET_R * 0.8) / Math.max(1, handPx);
          if (tArr > it.life - 0.2) continue; // can't make it in time
          const dd = Math.max(0, Math.hypot(it.x - 30 * tArr - cx, it.y - cy) - ITEM_MAGNET_R * 0.6);
          const pR = AI.pickR || 165;
          if (dd < pR) c -= (AI.pickW || 1) * v * (1 - dd / pR); // go for items fairly actively (wider pull at higher level)
        }
        if (focus) {
          // Core target: tighter band + extra pull (coreAlignW); danger terms above still win
          const al = Math.abs(cy - aimY) / fh;
          const aW = (AI.alignW ?? 1.1) * (coreAim ? (AI.coreAlignW ?? 1) : 1);
          c += al < (coreAim ? 0.035 : 0.05) ? -aW : Math.min(1.2, al * 3) * aW / 1.1;
        } else c += Math.abs(cy - fh * 0.5) / fh * 0.8;
        // Beginner nerves: low levels shy away from the row of a big core unit (fear of its shots)
        if (AI.coreFear) {
          for (const e of VE) {
            if (!hasCore(e) || !e.core || e.core.hp <= 0 || e.x < cx + 20 || warping(e)) continue;
            if (Math.abs(coreWorld(e).y - cy) < 34) { c += AI.coreFear; break; }
          }
        }
        c += Math.abs(cx - prefX) / fw * (AI.prefW ?? 0.9);
        c += Math.hypot((cx - B.x) / fw, (cy - shipY0) / fh) * (AI.wanderW ?? 0.5); // don't wander (higher level: calmer, shorter dodges)
        if (cy < fh * 0.1 || cy > fh * 0.9) c += 0.35; // edges trap you
        // Line of fire: prefer rows with (visible, hittable) enemies ahead of the ship
        if (AI.lofW) {
          let lof = 0;
          for (const e of VE) {
            if (warping(e) || e.x < cx + 10) continue;
            if (Math.abs(e.y - cy) < (e.h || 30) * 0.45 + 6) lof += isLargeEnemy(e) ? 1.5 : 1;
          }
          c -= AI.lofW * Math.min(3, lof) / 3 * 1.2;
        }
        // Walls / corners: graded penalty (a human hugging an edge has nowhere to go and shoots nothing)
        if (AI.edgeW) {
          const ed = Math.min(cy / fh, 1 - cy / fh);
          const eP = Math.max(0, (0.16 - ed) / 0.16);
          const cP = cx < fw * 0.12 ? 1 : 0;
          c += AI.edgeW * (eP * 0.8 + eP * cP * 0.7);
        }
        // Skill (higher level): don't back into the left wall — passing enemies fly over you there
        // and fire at point-blank range with nowhere left to go
        if (AI.wallW) c += AI.wallW * Math.max(0, (0.16 - cx / fw) / 0.16);
        if (Math.abs(cx - B._tx) < 2 && Math.abs(cy - B._ty) < 2) c -= 0.35; // hysteresis (no jitter)
        // Skill (higher level): commit to a dodge instead of flip-flopping between far-apart spots
        if (AI.commitW && Math.hypot((cx - B._tx) / fw, (cy - B._ty) / fh) < 0.12) c -= AI.commitW;
        if (c < bestC) { bestC = c; best = [cx, cy]; }
      }
      if (best) {
        let bx = best[0], by = best[1];
        const moved = Math.hypot(bx - B._tx, by - B._ty);
        if (moved > fh * 0.08 && AI.overcommit && Math.random() < AI.overcommit) {
          // over-commit: keep going a little past the chosen spot
          const k = 0.15 + Math.random() * 0.25;
          bx += (bx - B.x) * k; by += (by - shipY0) * k;
        }
        B._tx = Math.max(20, Math.min(fw * 0.88, bx)); B._ty = Math.max(fh * 0.02, Math.min(fh * 0.98, by));
      }
    }
    curDanger = dangerOf(B.x, shipY0);
    const dodging = curDanger > 1.5;
    // Human-like core pursuit: when relatively safe, gently pull the pointer onto the (lagged, noisy) core row
    // Core window (human skill, scaled by level): the core row is judged by the visible SHOTS on it
    // (escorts never shoot; the pack is slow) plus a body-clearance check right around the spot.
    // Accept a window when the shots there are about as safe as here; lower levels are more hesitant.
    let coreWin = false;
    if (coreAim && B._ty != null) {
      const sx = Math.min(B._tx, B.x);
      const shotsHere = dangerOf(B.x, shipY0, false, true);
      const shotsRow = dangerOf(sx, aimY, false, true);
      const bodyNear = VE.some((e) => !warping(e) && Math.abs(e.x - sx) < (e.w || 30) * 0.5 + 34 && Math.abs(e.y - aimY) < (e.h || 30) * 0.5 + 22);
      coreWin = !bodyNear && shotsRow < (AI.coreTol ?? 1.2) && shotsHere < (AI.coreTol ?? 1.2) + 1.5;
      // a tethered striker winding up / thrusting (visible): its tip is the core, so its row IS the lunge lane
      const armBusy = VE.some((e) => e.mv === 'arm' && (e._ph === 'coil' || e._ph === 'strike' || e._ph === 'hold') && (e._ph !== 'coil' || e._pt >= react));
      if (armBusy) coreWin = false;
      if (globalThis.__comDbg) globalThis.__comDbg.push([+shotsHere.toFixed(2), +shotsRow.toFixed(2), bodyNear ? 1 : 0, coreWin ? 1 : 0]);
    }
    if (coreWin) {
      B._ty += (aimY - B._ty) * Math.min(1, (AI.corePull ?? 0.45) * Math.min(1, 4 * dt) * 10);
    }

    // Bait a homing missile: keep still while it is still steering (if nothing else is coming)
    const jukeHold = threats.some((b) => b._juke && b.homeT > 0.04 && Math.hypot(b.x - shipX, b.y - shipY0) < 240)
      && dangerOf(B.x, shipY0, true) < 1.5;
    // Hand moves the virtual pointer toward the planned spot; ship follows it like the player's ship
    if (!Number.isFinite(B.ptrX) || !Number.isFinite(B.ptrY) || !Number.isFinite(B.pvx) || !Number.isFinite(B.pvy)) { B.ptrX = B.x; B.ptrY = B.y; B.pvx = 0; B.pvy = 0; }
    {
      // Finger-like drag: speed capped (AI.hand field-heights/s), acceleration-limited (reaches
      // full speed in ~AI.accT s), eases in on arrival → smooth curved paths, no teleports.
      const dx = jukeHold ? 0 : B._tx - B.ptrX, dy = jukeHold ? 0 : B._ty - B.ptrY * fh;
      const dl = Math.hypot(dx, dy);
      const vCap = Math.min(handPx, dl * 6);
      const dvx = dl > 1e-6 ? (dx / dl) * vCap : 0, dvy = dl > 1e-6 ? (dy / dl) * vCap : 0;
      const acc = handPx / (AI.accT || 0.18) * dt;
      const ex = dvx - B.pvx, ey = dvy - B.pvy, el = Math.hypot(ex, ey);
      const k = el > acc ? acc / el : 1;
      B.pvx += ex * k; B.pvy += ey * k;
      B.ptrX += B.pvx * dt;
      B.ptrY += (B.pvy * dt) / fh;
      if (B.ptrX < fw * 0.06 || B.ptrX > fw * 0.88) { B.ptrX = Math.max(fw * 0.06, Math.min(fw * 0.88, B.ptrX)); B.pvx = 0; }
      if (B.ptrY < -0.08 || B.ptrY > 1.08) { B.ptrY = Math.max(-0.08, Math.min(1.08, B.ptrY)); B.pvy = 0; }
    }
    B.y += (B.ptrY - B.y) * Math.min(1, 12 * dt);
    B.x += (B.ptrX - B.x) * Math.min(1, 12 * dt);
    B.x = Math.max(20, Math.min(fw * 0.88, B.x));
    B.preferredY = B.y;
    shipX = B.x;

    B.aimNoise += ((Math.random() - 0.5) * _cp.aimNoiseAmp - B.aimNoise) * Math.min(1, 1.4 * dt);

    // --- Fire control: lead aim, burst when aligned, powers ---
    B.fireCd -= dt;
    const aligned = focus && Math.abs(aimY / fh - (B.y + (B.aimNoise || 0))) < (dodging ? 0.1 : 0.12);
    // Offense matches the player exactly (same rates / damage) — fairness.
    // Softness comes from reaction / aim / movement / items elsewhere.
    const fireRate = B.activePower === 'homing' ? 0.16
      : B.activePower === 'rapid' ? 0.1
      : 0.16; // match player normal stream
    if (B.fireCd <= 0) {
      B.fireCd = fireRate;
      const by = B.y * fh;
      if (B.activePower === 'homing') {
        B._homingShotN = (B._homingShotN || 0) + 1;
        const n = B._homingShotN;
        const fan = ((n % 5) - 2) * 0.09 + (Math.random() - 0.5) * 0.05;
        const spd0 = 320;
        B.bullets.push(spawnBullet(
          shipX + 16, by,
          Math.cos(fan) * spd0, Math.sin(fan) * spd0 + ((n % 5) - 2) * 18,
          'player', true, 3,
        ));
      } else if (B.activePower === 'rapid') {
        B.bullets.push(spawnBullet(shipX + 16, by, 520, 0, 'player', false, 3));
        B.bullets.push(spawnBullet(shipX + 16, by - 6, 500, -30, 'player', false, 2));
        B.bullets.push(spawnBullet(shipX + 16, by + 6, 500, 30, 'player', false, 2));
      } else if (B.activePower === 'direct' && B.activeTimer > 0) {
        // COM 直接攻撃 (fair mirror): same normal shot leaves the COM ship upward in its pane;
        // on exiting the top it enters OUR field from the bottom at the same x (hand-off below).
        B.bullets.push(spawnDirectOutShot(shipX, B.y * fh - 14));
      } else {
        // Same as player: denser, weaker per shot
        B.bullets.push(spawnBullet(shipX + 16, by, 420, 0, 'player', false, 2));
      }
    }

    // Laser beam while active — every tick hit = one small spark (match player)
    if (B.activePower === 'laser' && B.activeTimer > 0) {
      B.laserCd = (B.laserCd || 0) - dt;
      if (B.laserCd <= 0) {
        B.laserCd = 0.07;
        const by = B.y * fh;
        for (const e of B.enemies) {
          if (warping(e)) continue;
          if (e.x > shipX && Math.abs(e.y - by) < (e.h * 0.55 + 8)) {
            const bh = applyLaserTick(e, by, B.fx, shipX); // same rule as the player
            if (bh === 'core') this.onCoreBreak(e, B.fx, false, B.enemies); else if (bh === 'corehit') this.fieldFlash(B, 'hit');
          }
        }
      }
    }

    // v1.5.67 extra attack items on the COM field (same logic as the player)
    tickExItems(this.botExField(), dt);

    // Homing bullet steering (bot field): same turn-rate + sticky lock as player
    for (const b of B.bullets) {
      if (!b.homing || b.owner !== 'player') continue;
      steerHomingBullet(b, B.enemies, dt, fw);
    }

    // --- Spawns (slightly denser so AI has something to think about) ---
    // Same wave rules as the player's field (interval, 1–2 per wave, kind mix, wave boss every 22s)
    // so COM gets the same number of kill → item-drop chances.
    runWaveScript(B, B.time || 0, B.enemies, fw, fh); // same script / clock rules as the player field
    B.spawnAcc = (B.spawnAcc || 0) + dt;
    const lateB = (B.time || 0) > 240;
    if (B.spawnAcc >= (lateB ? 2 : 3) && B.enemies.filter((e) => !e.sent && !e._chainOf).length < (lateB ? 6 : 4)) {
      B.spawnAcc = 0;
      B.enemies.push(spawnEnemy(fw, fh, Math.random() < 0.5 ? 'wave_basic' : 'wave_swarm'));
    }

    for (const e of B.enemies) {
      if (tickWarp(e, dt)) continue; // warp-in: scripted glide / hold, no fire
      if (e.frozenT > 0) continue; // フリーズ: no movement / no fire while frozen
      if (e._chainT != null) continue; // doomed by a core chain: holds its place until its turn to pop
      tickCoreExtras(e, dt);
      tickRearGuard(e, dt, shipX, B.y * fh, B.bullets, fw, fh); // same rule as the player field
      if (tickEscort(e, dt, fh)) continue; // formation escort: follows its core unit, no guns
      if (e._entryX != null) { if (e.x > e._entryX) e.x -= 120 * dt; else e._entryX = null; } // core boss + pack fly in together
      e.phase += dt * 2;
      e.surgePhase = (e.surgePhase || 0) + dt * (e.surgeFreq || 1.4);
      if (e.appearT > 0) e.appearT = Math.max(0, e.appearT - dt);
      if (e.lingerT > 0) e.lingerT = Math.max(0, e.lingerT - dt);
      const surge = Math.sin(e.surgePhase) * (e.surgeAmp || 32);
      // Sent: linger on the right (bob/weave OK) until lingerT expires, then advance left
      if (moveScripted(e, dt, fw, fh, B.y * fh, shipX)) { /* scripted STO path */ } else if (e.sent && e.lingerT > 0) {
        if (e.holdX == null) e.holdX = fw * (0.72 + Math.random() * 0.14);
        if (e.holdY == null) e.holdY = e.y;
        if (e.x > e.holdX + (e.surgeAmp || 32) + 8) {
          e.x -= Math.max(60, e.speed) * dt;
        } else {
          const targetX = e.holdX + surge * 0.85;
          e.x += (targetX - e.x) * Math.min(1, 5 * dt);
          e.y = e.holdY + Math.sin(e.phase) * ((() => { const t = resolveEnemyTier(e.kind); return (t === 'swarm' || t === 'drone') ? 28 : 18; })());
        }
      } else {
        const advance = e.speed + Math.cos(e.surgePhase) * (e.speed * 0.55);
        e.x -= advance * dt;
        e.y += Math.sin(e.phase) * 12 * dt;
        if (LARGE_ENEMY_TIERS.has(resolveEnemyTier(e.kind))) {
          e.x += Math.sin(e.surgePhase * 0.7) * 22 * dt;
        }
      }
      if (!e.mv) e.y = Math.max(20, Math.min(fh - 20, e.y));
      const parked = (e.sent && e.lingerT > 0) ? e.x <= (e.holdX || fw) + 8 : true;
      if (!fireScripted(e, B.bullets, shipX, B.y * fh, dt, e.x < fw - 10 && !e.noFire)) tickEnemyLaserFire(e, B.bullets, shipX, B.y * fh, dt, parked && !e.noFire, () => {
        const tier = resolveEnemyTier(e.kind);
        return e.sent
          ? ((['elite', 'boss', 'mech', 'tank'].includes(tier)) ? 1.1 : 1.55)
          : ((['elite', 'boss', 'mech', 'tank', 'golem'].includes(tier)) ? 1.7 : 2.25);
      });
    }
    const botPy = B.y * fh;
    const spawnedBB = [];
    for (const b of B.bullets) {
      if (b.homing && b.owner === 'enemy' && !b.laser) {
        steerEnemyHoming(b, shipX, botPy, dt);
      }
      if (b.k && b.owner === 'enemy') updateEnemyBullet(b, dt, spawnedBB);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      pushHomingTrail(b);
    }
    for (const b of spawnedBB) B.bullets.push(b);
    // COM 直接攻撃: outgoing shot left the top of the COM pane → enters our field from the bottom
    for (const b of B.bullets) {
      if (b.dvis && b.life > 0 && b.y < -12) {
        b.life = 0;
        if (!this.ended) this.pushIncomingDirectShot(b.x);
      }
    }

    // Bot bullets hit enemies + item drops into bot inventory
    for (const b of B.bullets) {
      if (b.owner !== 'player' || b.dir || b.dvis) continue; // direct shots only hit the COM ship
      for (const e of B.enemies) {
        if (warping(e) || e.passShots) continue; // shots pass through warping units / striker chain
        if (hasCore(e)) {
          const r = applyCoreAwareHit(e, b.dmg || 1, b.x, b.y, B.fx);
          if (r.hit === 'none') continue;
          if (r.hit === 'core') this.onCoreBreak(e, B.fx, false, B.enemies);
          else if (r.hit === 'corehit') this.fieldFlash(B, 'hit');
          if (!b.pierce) b.life = 0;
          break;
        }
        if (Math.abs(b.x - e.x) < e.w * 0.45 && Math.abs(b.y - e.y) < e.h * 0.45) {
          e.hp -= b.dmg;
          if (!b.pierce) b.life = 0;
          B.fx.push(spawnHitSpark(b.x, b.y));
        }
      }
    }
    const kept = [];
    for (const e of B.enemies) {
      if (tickChain(e, dt)) B.fx.push(spawnChainBoom(e));
      if (hasCore(e) && !e._coreBreak && e.hp < 1) e.hp = 1;
      if (e.hp <= 0) {
        if (e._chainT != null && !e._chainKill) { e._chainKill = true; B.fx.push(spawnChainBoom(e)); }
        if (!e._chainKill) B.fx.push(spawnKillBoom(e.x, e.y, resolveEnemyTier(e.kind) === 'boss'));
        B.fx.push(spawnCoin(e.x, e.y, this.coinGold(e)));
        // Same as the player: drops are orbs that the COM ship must fly into (8s life)
        if (e._coreBreak) {
          if (Math.random() < HEAL_GUARANTEE_P) B.orbs.push(spawnItemWithId(e.x, e.y, bigCoreKind(e.kind) ? 'heal_big' : 'heal'));
          B.orbs.push(spawnItem(e.x + 26, e.y));
        } else if (isLargeEnemy(e) && !(e._chainOf || e._lead || e._chainT != null)) { // core-attached units: no guaranteed heal
          const healId = resolveEnemyTier(e.kind) === 'boss' ? 'heal_big' : 'heal';
          if (Math.random() < HEAL_GUARANTEE_P) B.orbs.push(spawnItemWithId(e.x, e.y, healId));
        } else if (!e.noDrop && Math.random() < (resolveEnemyTier(e.kind) === 'boss' ? 1 : ITEM_DROP_CHANCE * (e.dropMul ?? 1))) {
          B.orbs.push(spawnItem(e.x, e.y));
        }
      } else if (e.x > -40) {
        kept.push(e);
      }
    }
    B.enemies = kept;

    // Item orbs float + pickup (same motion / radius / lifetime / heal rule as the player)
    {
      const byP = B.y * fh;
      const left = [];
      for (const it of B.orbs) {
        it.life -= dt;
        if (!magnetStep(it, shipX, byP, dt)) { // same magnet rule as the player
          it.y += Math.sin(B.time * 3 + it.x) * 10 * dt;
          it.x -= 30 * dt;
          it.y = Math.max(24, Math.min(fh - 24, it.y));
        }
        if (Math.abs(it.x - shipX) < 32 && Math.abs(it.y - byP) < 32) {
          if (it.id === 'heal' || it.id === 'heal_big') {
            B.hp = Math.min(B.maxHp || PLAYER_MAX_HP, B.hp + (it.id === 'heal_big' ? 50 : 25));
            B.fx.unshift(spawnHealFx(shipX + 8, byP, it.id === 'heal_big'));
          } else if (B.items.length < MAX_ITEM_SLOTS) {
            if (!B.items.length) B._heldT = B.time;
            B.items.push(it.id);
            B._gotT = B.time;
            if (it.id === 'direct' && B._directHeldSince == null) B._directHeldSince = B.time;
          } // full: orb is wasted (same as the player)
        } else if (it.life > 0 && it.x > -20) left.push(it);
      }
      B.orbs = left;
    }

    // Hits on bot — fair hurtbox (gets hit, not glass)
    // v1.5.70: COM barrier blocks the same way as the player
    const botBarrier = hasBarrierFx(B.fx);
    // Player's 直接攻撃 shots vs COM ship — real collision each frame, explosion per hit
    for (const b of B.bullets) {
      if (!b.dir || b.life <= 0) continue;
      if (!directShotHits(b, shipX, B.y * fh, 16, 16)) continue; // same hurtbox as the player ship
      b.life = 0;
      if (botBarrier) {
        const bar = B.fx.find((f) => f.kind === 'barrier' && f.life > 0);
        if (bar) bar._hit = 0.14;
        continue;
      }
      this.onDirectHitBot(b);
    }
    for (const b of B.bullets) {
      if (b.owner !== 'enemy' || b.life <= 0) continue;
      const hb = b.hb || 0;
      const bx = b.k === 'bolt' ? Math.max(b.x, Math.min(b.x + 44, shipX)) : b.x;
      if (Math.abs(bx - shipX) < 16 + hb && Math.abs(b.y - B.y * fh) < 16 + hb) { // same hurtbox as the player
        if (botBarrier) {
          b.life = 0;
          const bar = B.fx.find((f) => f.kind === 'barrier' && f.life > 0);
          if (bar) bar._hit = 0.14;
          continue;
        }
        if (B.invuln <= 0) {
          // Same rule as the player: homing 3 / others 5 (× 攻撃力), 0.75s invulnerability
          B.hp = Math.max(0, B.hp - scaledHitDmg(b.homing ? 3 : 5, b));
          B.invuln = 0.75;
          b.life = 0;
          B.fx.push(spawnHitSpark(shipX, B.y * fh));
        }
      }
    }
    // Enemy body -> COM ship: same rule as the player (box +12, 8 dmg, 0.9s invuln, scrape 1)
    for (const e of B.enemies) {
      if (warping(e)) continue;
      if (Math.abs(e.x - shipX) < e.w * 0.4 + 12 && (Math.abs(e.y - B.y * fh) < e.h * 0.4 + 12 || (e._edge && (B.y * fh - e.y) * e._edge > 0))) { // same edge rule as the player
        if (botBarrier) {
          const bar = B.fx.find((f) => f.kind === 'barrier' && f.life > 0);
          if (bar) bar._hit = 0.14;
          e.hp -= 1;
          continue;
        }
        if (B.invuln <= 0) {
          B.hp = Math.max(0, B.hp - 8);
          B.invuln = 0.9;
          e.hp -= 1;
          B.fx.push(spawnExplosion(shipX, B.y * fh, true));
        }
      }
    }

    B.bullets = B.bullets.filter((b) => b.life > 0 && b.x > -40 && b.x < fw + 80 && b.y > -40 && b.y < fh + 40);
    if (B.enemies.length > 36) B.enemies.length = 36;
    if (B.bullets.length > 100) B.bullets.length = 100;
    trimFx(B.fx, 120); // keep newest (hit sparks), never coins
    B.coinPt = (B.coinPt || 0) + tickCoins(B.fx, shipX, B.y * fh, dt);
    for (const f of B.fx) f.life -= dt;
    B.fx = B.fx.filter((f) => f.life > 0);

    // --- Smart item / power usage ---
    const playerHp = this.state.player.hp;
    const pickBestItem = () => {
      if (!B.items.length) return null;
      // Priority rules
      if (B.hp <= 35) {
        const h = B.items.findIndex((id) => id === 'heal_big' || id === 'heal');
        if (h >= 0) return h;
      }
      if (B.hp <= 50) {
        const h = B.items.findIndex((id) => id === 'heal_big');
        if (h >= 0) return h;
      }
      // Prefer barrier when under fire and not already shielded
      if ((B.hp <= 55 || enemyPressure >= 3) && !hasBarrierFx(B.fx)) {
        const bar = B.items.findIndex((id) => id === 'barrier');
        if (bar >= 0) return bar;
      }
      if (enemyPressure >= 4 && !B.activePower) {
        const l = B.items.findIndex((id) => id === 'laser' || id === 'homing' || id === 'bomb' || id === 'shock' || id === 'spread' || id === 'rapid' || isExAttackItem(id));
        if (l >= 0) return l;
      }
      // Prefer direct often so player sees purple incoming beam in CPU matches
      if (playerHp >= 30) {
        const d = B.items.findIndex((id) => id === 'direct');
        if (d >= 0 && Math.random() < 0.8) return d;
      }
      if (playerHp > 55) {
        // direct first among heavies (before send/meteor)
        const heavy = B.items.findIndex((id) => id === 'direct' || id === 'send_mech' || id === 'send_golem' || id === 'send_tank' || id === 'send_drone' || id === 'send' || id === 'meteor');
        if (heavy >= 0) return heavy;
      }
      // default: first offensive (direct allowed — shown as incoming purple beam, not own upward)
      const off = B.items.findIndex((id) => id !== 'heal' && id !== 'heal_big');
      return off >= 0 ? off : -1;
    };

    // Apply item idx (same effects as the player's items). No cooldown rule — WHEN to use is AI.
    const tryUse = () => {
      const idx = B._forceIdx != null ? B._forceIdx : pickBestItem();
      B._forceIdx = null;
      if (idx == null || idx < 0) return;
      const id = B.items[idx];
      // Player rule: timed powers can't stack on each other
      if (B.activeTimer > 0 && (id === 'homing' || id === 'laser' || id === 'rapid' || id === 'direct')) return;
      B.items.splice(idx, 1);

      if (id === 'homing') {
        B.activePower = 'homing';
        B.activeTimer = 6;
      } else if (id === 'laser') {
        B.activePower = 'laser';
        B.activeTimer = 4;
      } else if (id === 'heal' || id === 'heal_big') {
        B.hp = Math.min(B.maxHp || PLAYER_MAX_HP, B.hp + (id === 'heal_big' ? 50 : 25));
        B.fx.unshift(spawnHealFx(B.x || 48, B.y * fh, id === 'heal_big'));
      } else if (id === 'direct') {
        // Incoming purple beam only on player pane (never set player.activePower).
        // Set COM activePower so opponent-pane facing (snap.ap === 'direct') is reliable;
        // updateBot only special-fires for homing/laser/rapid, so normal shots continue.
        B.activePower = 'direct';
        B.activeTimer = DIRECT_DURATION;
        B.directBeam = DIRECT_DURATION;
        B._directHeldSince = null;
        // HUD countdown only; the shots themselves come from the COM fire loop (dodgeable)
        this.state.incomingDirect = DIRECT_DURATION;
        this.setStatus('COMの直接攻撃！ 下から来る弾をよけろ');
        setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1600);
      } else if (id === 'spread') {
        const by = B.y * fh;
        for (let i = -3; i <= 3; i++) {
          const ang = i * 0.18;
          const spd = 480;
          B.bullets.push(spawnBullet(shipX + 18, by, Math.cos(ang) * spd, Math.sin(ang) * spd, 'player', false, 2));
        }
        B.fx.push(spawnExplosion(shipX + 30, by, false));
      } else if (id === 'bomb') {
        const targets = [];
        for (const e of B.enemies) {
          if (warping(e)) continue;
          if (hasCore(e)) applyCoreAwareArea(e, 28, null, null, null); else
          e.hp -= 28;
          B.fx.push(spawnExplosion(e.x, e.y, true));
          targets.push([e.x, e.y]);
        }
        B.bullets = B.bullets.filter((b) => b.owner === 'player');
        B.fx.unshift(spawnBombFx(B.x || 48, B.y * fh, fw, fh, targets));
      } else if (id === 'shock') {
        const by = B.y * fh;
        const cx = B.x || 48; // centre on COM ship's actual position (it moves horizontally)
        const targets = [];
        for (const e of B.enemies) {
          if (warping(e)) continue;
          const dx = e.x - cx;
          const dy = e.y - by;
          if (dx * dx + dy * dy < SHOCK_RADIUS * SHOCK_RADIUS) {
            if (hasCore(e)) applyCoreAwareArea(e, 18, null, null, null); else
            e.hp -= 18;
            B.fx.push(spawnExplosion(e.x, e.y, false));
            targets.push([e.x, e.y]);
          }
        }
        B.fx.unshift(spawnShockFx(cx, by, SHOCK_RADIUS, targets));
      } else if (id === 'rapid') {
        B.activePower = 'rapid';
        B.activeTimer = 5.5;
      } else if (id === 'meteor') {
        this.applyPlayerDamage(14, 'direct');
        if (!this.state.meteors) this.state.meteors = [];
        this.rainMeteors(this.state.meteors, fw, fh, this.state.player.y, 5, this.state.player.x);
      } else if (id === 'send' || id === 'send_mech' || id === 'send_golem' || id === 'send_tank' || id === 'send_drone') {
        const kinds = this.kindsFromDeck(id, true);
        const fw = this.L.own.w, fh = this.L.own.h;
        for (const kind of kinds) {
          this.state.enemies.push(this.markSentEnemy(spawnEnemy(fw, fh, kind), fw, fh, this.state.enemies));
        }
        this.setStatus(this.sendLabelForKinds(kinds, 'COM敵送信'));
        setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1400);
      } else if (isExAttackItem(id)) {
        useExItem(id, this.botExField());
      }
    };

    // --- Item timing (AI only): think every AI.think s, react AI.itemReact s after a pickup ---
    B.thinkAcc = (B.thinkAcc || 0) - dt;
    if (B.items.length && B.thinkAcc <= 0 && (B.time - (B._gotT ?? -99)) >= (AI.itemReact ?? 1)) {
      B.thinkAcc = AI.think || 0.4;
      const isSend = (id) => id === 'send' || id === 'send_mech' || id === 'send_golem' || id === 'send_tank' || id === 'send_drone';
      const timed = (id) => id === 'homing' || id === 'laser' || id === 'rapid' || id === 'direct';
      const clearers = (id) => id === 'bomb' || id === 'shock' || id === 'cluster' || id === 'blackhole' || id === 'freeze';
      const nThreat = threats.length;
      const full = B.items.length >= MAX_ITEM_SLOTS;
      const oppMax = this.state.player.maxHp || PLAYER_MAX_HP;
      const oppBusy = this.state.enemies.filter((e) => !(e.warpT > 0)).length >= 4 || playerHp < oppMax * 0.5;
      const oppLow = playerHp < oppMax * 0.35;
      // Don't sit on items: after holdMax s of holding, use the best offensive one
      const heldLong = AI.holdMax && B._heldT != null && B.time - B._heldT > AI.holdMax;
      let pick = -1;
      if (AI.smart || Math.random() < (AI.smartP ?? 0)) {
        const want = (id) => {
          if (timed(id) && B.activeTimer > 0) return -1;
          if (isSend(id)) return oppBusy || oppLow ? 6 : 5; // send promptly (pile on when they're busy / low)
          if (id === 'barrier') return (curDanger > 3 || nThreat >= 6) && !hasBarrierFx(B.fx) ? 6 : (full ? 1 : -1);
          if (id === 'reflect') return nThreat >= 6 ? 4.5 : (full ? 1 : -1);
          if (clearers(id)) return enemyPressure >= 4 ? 4 + enemyPressure * 0.1 : (full ? 1.5 : -1);
          if (id === 'direct') return oppBusy || oppLow || (B._directHeldSince != null && B.time - B._directHeldSince > 4) ? 5.5 : (full || heldLong ? 1.2 : -1);
          if (id === 'meteor') return oppLow ? 5.5 : 3;
          if (id === 'laser' || id === 'homing' || id === 'rapid' || id === 'spread' || id === 'pbeam' || id === 'option') {
            return focus && (enemyPressure >= 2 || isLargeEnemy(focus)) ? 3.2 : (full ? 1.3 : -1);
          }
          return full || heldLong ? 1 : 2;
        };
        // held too long: anything but a heal (unless hurt) is better used than hoarded
        const wantH = (id) => { const v = want(id); if (v >= 0 || !heldLong) return v; if ((id === 'heal' || id === 'heal_big') && B.hp > (B.maxHp || PLAYER_MAX_HP) * 0.6) return -1; if (timed(id) && B.activeTimer > 0) return -1; return 0.5; };
        let bv = 0;
        B.items.forEach((id, i) => { const v = wantH(id); if (v > bv) { bv = v; pick = i; } });
      } else {
        // 普通: less judgment — mostly first usable item, sometimes waits too long / uses it early
        const i0 = B.items.findIndex((id) => !(timed(id) && B.activeTimer > 0));
        // sends / direct when the opponent is busy or low; otherwise mostly first usable item
        // (lazySend: 普通 doesn't jump on sends — it tends to hold them until full / held long / they're low)
        const iAgg = (AI.lazySend ? oppLow : (oppBusy || oppLow)) ? B.items.findIndex((id) => isSend(id) || id === 'direct' || id === 'meteor') : -1;
        if (iAgg >= 0 && !(timed(B.items[iAgg]) && B.activeTimer > 0)) pick = iAgg;
        else if (i0 >= 0 && (full || heldLong || enemyPressure >= 2 || (!AI.lazySend && isSend(B.items[i0])) || Math.random() < (AI.idleUse ?? 0.35))) pick = i0;
      }
      // Human slip (fewer at higher level): now and then grab the wrong item or hesitate instead
      if (B.items.length && AI.itemErr && Math.random() < AI.itemErr) {
        pick = Math.random() < 0.5 ? -1 : Math.floor(Math.random() * B.items.length);
        if (pick >= 0 && timed(B.items[pick]) && B.activeTimer > 0) pick = -1;
      }
      if (pick >= 0) { B._forceIdx = pick; tryUse(); B._heldT = B.items.length ? B.time : null; }
    }

    if (!B.meteors) B.meteors = [];
    for (const m of B.meteors) {
      m.vx = 0;
      m.vy += 260 * dt;
      m.y += m.vy * dt;
      m.rot = (m.rot || 0) + (m.spin || 0) * dt;
      m.life -= dt;
      if (!m.hit && m.y >= (m.targetY != null ? m.targetY : fh * 0.55)) {
        m.hit = true;
        m.life = Math.min(m.life, 0.2);
        B.fx.push(spawnExplosion(m.x, m.y, true));
      }
    }
    B.meteors = B.meteors.filter((m) => m.life > 0 && m.y < fh + 60);

    this.state.botHp = B.hp;
    this.state.botSnap = {
      scroll: B.scroll,
      enemies: B.enemies,
      bullets: B.bullets,
      fx: B.fx,
      ff: B.ff,
      meteors: B.meteors,
      worldItems: B.orbs,
      directBeam: (B.directBeam || 0) > 0,
      ap: B.activePower || null,
      px: B.x || shipX,
      py: B.y,
      php: B.hp,
      alive: B.hp > 0,
      _sx: this.L.opp.w / fw,
      _sy: this.L.opp.h / fh,
    };

    if (B.hp <= 0) this.finish(true);
    if (this.state.player.hp <= 0) this.finish(false);
  }

  finish(won, info = null) {
    if (this.ended) return;
    this.ended = true;
    this._endInfo = info;
    this.renderMatchTimer(true);
    this.state.alive = won ? this.state.alive : false;
    const msg = won ? 'あなたの勝ちです' : 'あなたの負けです';
    if (won) sfx.win(); else sfx.lose();
    // Result text (「あなたの勝ちです／負けです」) is shown after the finish sequence, with the result screen
    void msg;
    this.setStatus('');

    // COM win-rate record → enemy level (COM matches only; online / room PvP never counted)
    this._comRankChange = null;
    if (this.useBot && !this.isOnline() && !this._tutorialMatch) {
      try { this._comRankChange = recordComResult(this.comDifficulty, !!won); } catch (_) { this._comRankChange = null; }
    }

    // PT only on COM (CPU) victory: remaining HP scaled to 0–100 → PT
    this._ptReward = null;
    // Human-vs-human (online room / matchmaking) never grants PT — any end reason (KO, time-up,
    // 延長戦, disconnect / opponent left). COM matches only.
    if (won && this.useBot && !this.isOnline()) {
      const rawHp = Math.max(0, this.state.player?.hp ?? 0);
      const maxHp = this.state.player?.maxHp || PLAYER_MAX_HP;
      const hp = Math.max(0, Math.floor((rawHp / maxHp) * 100)); // keep PT on 0–100 scale
      try {
        const prof = this.comProfile();
        const result = grantComVictoryPt(loadMeta(), hp, { mult: prof.ptMult });
        // 10-04b: coins collected this match (silver 1 / gold 30), win only, never level-scaled
        const coin = grantCoinPt(result.meta, this.state.coinPt || 0);
        this._ptReward = {
          gain: result.gain + coin.gain,
          coin: coin.gain,
          total: coin.total,
          remainingHp: hp,
          mult: result.mult || prof.ptMult,
          label: prof.label,
          base: result.base != null ? result.base : hp,
        };
      } catch (e) {
        console.warn('PT grant failed', e);
        this._ptReward = { gain: hp, total: hp, remainingHp: hp, mult: 1, label: '普通', base: hp };
      }
    }

    // Result is locked here (ended=true, PT granted once, net 'over' sent once).
    // The result overlay appears only after the KO / TIME UP slow-motion sequence.
    if (this.net && !this.useBot) {
      this.net.send({ type: 'over', youWin: !won });
    }
    this.startKoSequence(won, info);
  }

  /* ------------------------------------------------------------------
   * KO slow-motion finish (visual only — outcome already locked by finish()).
   *  KO (life hit 0): 3.0s. The loser's life bar drains from its last shown value to exactly 0
   *   over 0–1.0s (bar flashes, small explosions), big explosions at 0 / 0.5 / 1.0s, screen shake,
   *   「K.O.」 slams in at 0.85s. Game visuals run at 0.22× until 2.1s, then ease back to 1×.
   *  TIME UP: 1.8s slow-down, yellow flash, 「TIME UP / 時間切れ」 (no drain, no explosions, real HP).
   *  延長戦: 2.6s slow-down, explosions + shake on the loser, 「決着！」 (no drain, real HP).
   *  The result overlay + status line appear only after the sequence (finishKoSequence).
   * ------------------------------------------------------------------ */
  startKoSequence(won, info) {
    const reason = info && info.reason;
    const timeUp = reason === 'time';
    // TIME UP / 延長戦: no life drain (bars keep real HP). Only a KO (life hit 0) drains the loser to 0.
    const cfg = timeUp
      ? { drain: false, dur: 1.8, d0: 0, d1: 0, textAt: 0, big: [], shakeAt: 0 }
      : reason === 'sudden'
        ? { drain: false, dur: 2.6, d0: 0, d1: 0, textAt: 0, big: [0, 0.35, 0.8], shakeAt: 0 }
        : { drain: true, dur: 3.0, d0: 0, d1: 1.0, textAt: 0.85, big: [0, 0.5, 1.0], shakeAt: 0 };
    // Life values shown at the moment of the decision (loser drains from here to 0)
    const P = this.state.player;
    const maxHp = P.maxHp || PLAYER_MAX_HP;
    const selfNow = Math.max(0, P.hp);
    const selfShown = Math.max(selfNow, Number.isFinite(this.state.hpDisplay) ? this.state.hpDisplay : selfNow);
    const oppNowRaw = this.oppHpNow();
    const oppNow = Number.isFinite(oppNowRaw) ? Math.max(0, oppNowRaw)
      : (info && Number.isFinite(Number(info.oppHp)) ? Math.max(0, Number(info.oppHp)) : maxHp);
    const oppPrev = Number.isFinite(this._oppShown) ? Math.max(0, this._oppShown) : oppNow;
    const oppShown = Math.max(oppNow, oppPrev);
    this._ko = {
      t: 0, won, timeUp, reason, syncAcc: 0, ...cfg,
      big: cfg.big.slice(), nextSmall: cfg.drain ? cfg.d0 + 0.05 : Infinity, textShown: false, shaken: false,
      from: won ? oppShown : selfShown,
      selfWin: selfNow, oppWin: oppNow,
    };
    this.applyKoHp();
    this.clearKoFx();
    const host = typeof document !== 'undefined' ? document.getElementById('ui-overlay') : null;
    const cv = this.ctx && this.ctx.canvas;
    if (!host || !cv) return; // tickKo still runs the timeline
    const fx = document.createElement('div');
    fx.className = 'ko-fx' + (won ? ' ko-win' : ' ko-lose') + (timeUp ? ' ko-time' : '');
    fx.innerHTML = '<div class="ko-flash"></div>';
    host.appendChild(fx);
    this._koEl = fx;
  }

  /** Display-only life override while/after the finish sequence (loser drains to exactly 0). */
  applyKoHp() {
    const K = this._ko;
    if (!K) return;
    if (!K.drain) {
      this.state.koHp = { self: K.selfWin, opp: K.oppWin, flashSelf: false, flashOpp: false };
      return;
    }
    const u = Math.max(0, Math.min(1, (K.t - K.d0) / Math.max(0.01, K.d1 - K.d0)));
    const e = 1 - (1 - u) * (1 - u); // ease-out
    const lose = u >= 1 ? 0 : Math.max(0, K.from * (1 - e));
    const draining = K.t >= K.d0 - 0.05 && u < 1;
    this.state.koHp = {
      self: K.won ? K.selfWin : lose,
      opp: K.won ? lose : K.oppWin,
      flashSelf: !K.won && draining,
      flashOpp: K.won && draining,
      zeroSelf: !K.won && u >= 1,
      zeroOpp: K.won && u >= 1,
    };
  }

  /** Screen (CSS px, relative to the canvas) position of the defeated ship. */
  koTargetPos(won) {
    const cv = this.ctx && this.ctx.canvas;
    if (!cv || !this.L) return null;
    const k = cv.clientWidth ? cv.clientWidth / cv.width : 1;
    if (!won) {
      const P = this.state.player;
      return { x: (this.L.own.x + P.x) * k, y: (this.L.own.y + P.y * this.L.own.h) * k };
    }
    let px, py, fw;
    if (this.useBot && this._bot) { px = this._bot.x || 48; py = this._bot.y; fw = this.L.own.w; }
    else if (this.remoteSnap) { px = this.remoteSnap.px; py = this.remoteSnap.py; fw = this.remoteSnap._fw || this.L.own.w; }
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    return { x: (this.L.opp.x + px * (this.L.opp.w / fw)) * k, y: (this.L.opp.y + py * this.L.opp.h) * k };
  }

  /** DOM fireball on the defeated ship (small = drain sparks). */
  koDomBurst(won, small) {
    const el = this._koEl;
    if (!el) return;
    const pos = this.koTargetPos(won);
    if (!pos) return;
    const j = small ? 26 : 0;
    const b = document.createElement('div');
    b.className = 'ko-burst' + (small ? ' small' : '');
    b.style.left = `${pos.x + (Math.random() - 0.5) * j}px`;
    b.style.top = `${pos.y + (Math.random() - 0.5) * j}px`;
    el.appendChild(b);
    setTimeout(() => b.remove(), 1800);
  }

  /** Per-frame KO tick: slow-motion visuals only (no damage / collisions / results). */
  tickKo(dt) {
    const K = this._ko;
    if (!K) return;
    K.t += dt;
    const slowEnd = K.dur - 0.9;
    const scale = K.t < slowEnd ? 0.22 : 0.22 + 0.78 * Math.min(1, (K.t - slowEnd) / 0.9);
    const sdt = dt * scale;
    this.applyKoHp();
    // Small explosions on the loser while its life drains
    while (K.t >= K.nextSmall && K.nextSmall < K.d1) {
      K.nextSmall += 0.17;
      this.koExplode(K.won, false);
      this.koDomBurst(K.won, true);
    }
    // Big explosion waves on the defeated ship
    while (K.big.length && K.t >= K.big[0]) {
      K.big.shift();
      this.koExplode(K.won, true);
      this.koDomBurst(K.won, false);
    }
    if (!K.shaken && K.t >= K.shakeAt && !K.timeUp) {
      K.shaken = true;
      const cv = this.ctx && this.ctx.canvas;
      if (cv) { cv.classList.remove('ko-shake'); void cv.offsetWidth; cv.classList.add('ko-shake'); }
    }
    if (!K.textShown && K.t >= K.textAt) {
      K.textShown = true;
      if (this._koEl) {
        const text = K.timeUp ? 'TIME UP' : (K.reason === 'sudden' ? '決着！' : 'K.O.');
        const sub = K.timeUp ? '時間切れ' : (K.won ? '撃破！' : '被撃破…');
        const t = document.createElement('div');
        t.className = 'ko-text';
        t.style.animationDuration = `${Math.max(0.8, K.dur - K.textAt).toFixed(2)}s`;
        t.innerHTML = `<span class="ko-main">${text}</span><span class="ko-sub">${sub}</span>`;
        this._koEl.appendChild(t);
      }
    }
    const slowField = (F) => {
      if (!F) return;
      F.scroll = (F.scroll || 0) + 20 * sdt;
      for (const b of F.bullets || []) { b.x += (b.vx || 0) * sdt; b.y += (b.vy || 0) * sdt; }
      for (const e of F.enemies || []) e.x -= (e.speed || 40) * 0.5 * sdt;
      for (const f of F.fx || []) f.life -= sdt;
      if (F.fx) { const keep = F.fx.filter((f) => f.life > 0); F.fx.length = 0; F.fx.push(...keep); }
    };
    slowField(this.state);
    if (this.useBot && this._bot) {
      slowField(this._bot);
      if (this.state.botSnap) { this.state.botSnap.fx = this._bot.fx; this.state.botSnap.bullets = this._bot.bullets; this.state.botSnap.enemies = this._bot.enemies; this.state.botSnap.scroll = this._bot.scroll; }
    }
    // Online: keep streaming our field so the opponent sees our explosion too
    K.syncAcc += dt;
    if (K.syncAcc > 0.05) { K.syncAcc = 0; this.syncOut(); }
    if (K.t >= K.dur) this.finishKoSequence();
  }

  koExplode(won, big = true) {
    const jitter = () => (Math.random() - 0.5) * (big ? 36 : 30);
    if (!won) {
      const P = this.state.player;
      const fh = this.L.own.h;
      this.state.fx.push(spawnExplosion(P.x + jitter(), P.y * fh + jitter(), big));
      if (big) sfx.explode();
    } else if (this.useBot && this._bot) {
      const B = this._bot;
      const fh = this.L.own.h;
      B.fx.push(spawnExplosion((B.x || 48) + jitter(), B.y * fh + jitter(), big));
      if (big) sfx.explode();
    }
  }

  finishKoSequence() {
    const K = this._ko;
    if (K) { K.t = Math.max(K.t, K.d1); this.applyKoHp(); if (this.state.koHp) { this.state.koHp.flashSelf = false; this.state.koHp.flashOpp = false; } }
    this._ko = null;
    this.clearKoFx();
    if (K) {
      this.setStatus(K.won ? 'あなたの勝ちです' : 'あなたの負けです');
      this.showEndCelebration(K.won);
    }
  }

  clearKoFx() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.ko-fx').forEach((el) => el.remove());
    this._koEl = null;
    const cv = this.ctx && this.ctx.canvas;
    if (cv) cv.classList.remove('ko-shake');
  }

  /**
   * Victory / defeat end overlay.
   * Victory: big 勝利 banner, particles, flash.
   * COM win also animates 「残りライフ N → +N PT」 count-up then total PT.
   */
  /** Gold coin (30 PT) for big enemies / cores / bosses; silver (1 PT) otherwise. Level never scales it. */
  coinGold(e) {
    if (e._coreBreak || hasCore(e)) return true;
    if (e._chainOf || e._lead || e._chainT != null) return false; // attached units: silver
    return isLargeEnemy(e) || resolveEnemyTier(e.kind) === 'boss';
  }

  showEndCelebration(won) {
    const ov = this.ui.endOverlay;
    const msgEl = this.ui.endMessage;
    if (!ov || !msgEl) return;

    // Clear prior celebration nodes
    ov.querySelectorAll('.vic-fx, .pt-reward, .vic-banner, .end-reason, .com-rank').forEach((el) => el.remove());
    // Time-limit / sudden-death reason line (above the menu button)
    const info = this._endInfo;
    if (info && (info.reason === 'time' || info.reason === 'sudden')) {
      const r = document.createElement('div');
      r.className = 'end-reason';
      const hpLine = (info.selfHp != null && info.oppHp != null && Number.isFinite(Number(info.oppHp)))
        ? `<div class="end-reason-hp">残りライフ　自分 ${Math.round(info.selfHp)} ／ 相手 ${Math.round(info.oppHp)}</div>` : '';
      r.innerHTML = info.reason === 'time'
        ? `<div class="end-reason-main">時間切れ！残りライフ判定で${won ? '勝利' : '敗北'}</div>${hpLine}`
        : `<div class="end-reason-main">延長戦で決着（先にダメージを受けた方の負け）</div>`;
      const btn0 = ov.querySelector('#btn-again');
      if (btn0) ov.insertBefore(r, btn0); else ov.appendChild(r);
    }
    ov.querySelectorAll('.pt-none').forEach((el) => el.remove());
    // COM only: win rate + enemy level change (PvP result shows nothing about this)
    const rc = this.useBot && !this.isOnline() ? this._comRankChange : null;
    if (rc && rc.after) {
      const a = rc.after, b = rc.before || a;
      const diffLabel = this.comDifficulty === 'normal' ? '普通' : '強い';
      const arrow = a.level > b.level ? 'up' : a.level < b.level ? 'down' : 'same';
      const r = document.createElement('div');
      r.className = 'com-rank';
      r.innerHTML = `<div class="cr-line">${diffLabel}　勝率 <b>${a.pct}%</b>（${a.w}勝${a.l}敗）</div>`
        + `<div class="cr-line cr-lv cr-${arrow}">敵Lv ${b.level} → <b>${a.level}</b>${arrow === 'up' ? ' ▲' : arrow === 'down' ? ' ▼' : ''}</div>`;
      const btn1 = ov.querySelector('#btn-again');
      if (btn1) ov.insertBefore(r, btn1); else ov.appendChild(r);
    }
    ov.classList.remove('victory', 'defeat', 'pt-show', 'hidden');
    ov.classList.add(won ? 'victory' : 'defeat');

    if (won) {
      msgEl.innerHTML = '';
      const banner = document.createElement('div');
      banner.className = 'vic-banner';
      banner.innerHTML = '<span class="vic-jp">勝利</span><span class="vic-en">YOU WIN</span>';
      ov.insertBefore(banner, msgEl);

      const fx = document.createElement('div');
      fx.className = 'vic-fx';
      fx.setAttribute('aria-hidden', 'true');
      // Spark particles
      for (let i = 0; i < 28; i++) {
        const p = document.createElement('span');
        p.className = 'vic-particle';
        const ang = (i / 28) * Math.PI * 2;
        const dist = 40 + (i % 7) * 18;
        p.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
        p.style.setProperty('--dy', `${Math.sin(ang) * dist - 30}px`);
        p.style.setProperty('--delay', `${(i % 10) * 0.05}s`);
        p.style.setProperty('--hue', `${(i * 23) % 360}`);
        fx.appendChild(p);
      }
      const flash = document.createElement('div');
      flash.className = 'vic-flash';
      fx.appendChild(flash);
      ov.insertBefore(fx, banner);

      msgEl.textContent = 'あなたの勝ちです';

      if (this._ptReward) {
        ov.classList.add('pt-show');
        const box = document.createElement('div');
        box.className = 'pt-reward';
        const hp = this._ptReward.remainingHp;
        const gain = this._ptReward.gain;
        const total = this._ptReward.total;
        const mult = this._ptReward.mult || 1;
        const diffLabel = this._ptReward.label || '';
        box.innerHTML = `
          <div class="pt-line pt-diff">${diffLabel}（ライフのPT ×${mult}）</div>
          <div class="pt-line pt-coin">コインで　+${this._ptReward.coin || 0} PT</div>
          <div class="pt-line pt-hp">残りライフで　+${Math.max(0, gain - (this._ptReward.coin || 0))} PT<span class="pt-hp-sub">（ライフ <strong class="pt-hp-n">0</strong>）</span></div>
          <div class="pt-line pt-gain">もらえるPT 合計　+<strong class="pt-gain-n">0</strong></div>
          <div class="pt-line pt-total">いまの持ちPT　<strong class="pt-total-n">0</strong></div>
        `;
        // Insert before the menu button
        const btn = ov.querySelector('#btn-again') || ov.querySelector('.menu-btn');
        if (btn) ov.insertBefore(box, btn);
        else ov.appendChild(box);

        // Count-up animation
        const hpEl = box.querySelector('.pt-hp-n');
        const gainEl = box.querySelector('.pt-gain-n');
        const totalEl = box.querySelector('.pt-total-n');
        const prevTotal = Math.max(0, total - gain);
        const dur = 1100;
        const t0 = performance.now();
        const step = (now) => {
          const u = Math.min(1, (now - t0) / dur);
          const ease = 1 - Math.pow(1 - u, 3);
          if (hpEl) hpEl.textContent = String(Math.round(hp * Math.min(1, ease / 0.45)));
          if (u > 0.35 && gainEl) {
            const gU = Math.min(1, (u - 0.35) / 0.4);
            gainEl.textContent = String(Math.round(gain * gU));
          }
          if (u > 0.55 && totalEl) {
            const tU = Math.min(1, (u - 0.55) / 0.45);
            totalEl.textContent = String(Math.round(prevTotal + gain * tU));
          }
          if (u < 1) requestAnimationFrame(step);
          else {
            if (hpEl) hpEl.textContent = String(hp);
            if (gainEl) gainEl.textContent = String(gain);
            if (totalEl) totalEl.textContent = String(total);
            // Notify title PT display if callback provided
            try {
              window.dispatchEvent(new CustomEvent('shooting-meta-updated', { detail: loadMeta() }));
            } catch (_) {}
          }
        };
        requestAnimationFrame(step);
      }
    } else {
      msgEl.textContent = 'あなたの負けです';
      if (this.useBot && !this.isOnline() && !ov.querySelector('.pt-lose')) {
        const box = document.createElement('div');
        box.className = 'pt-reward pt-lose';
        box.innerHTML = '<div class="pt-line">負けたのでPTは入りません</div>';
        const btn = ov.querySelector('#btn-again') || ov.querySelector('.menu-btn');
        if (btn) ov.insertBefore(box, btn); else ov.appendChild(box);
      }
    }
  }
}

