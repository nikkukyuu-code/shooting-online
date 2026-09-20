import {
  POWERUPS, powerupMeta, pickPowerupId, createPlayer, spawnEnemy, spawnBullet, spawnItem, spawnExplosion, serializeField,
} from './entities.js?v=1.5.13';
import { resizeCanvas, renderFrame, layout, OPP_RATIO, OWN_RATIO, CTRL_RATIO, itemSlotRects, hitItemSlot, MAX_ITEM_SLOTS } from './render.js?v=1.5.13';
import { sfx } from './audio.js?v=1.5.13';

const HINT = '敵を倒してアイテムを取得してください';
const WAIT = '対戦相手を待っています';

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
  }

  resetLocal() {
    const p = createPlayer('self');
    this.state = {
      player: p,
      enemies: [],
      bullets: [],
      items: [],
      fx: [],
      scroll: 0,
      alive: true,
      statusText: WAIT,
      time: 0,
      botHp: 100,
      botSnap: null,
    };
    this.ended = false;
    this.waiting = true;
    this.remoteSnap = null;
    this.pointerY = 0.5;
    this.pointerX = 0.14;
    this.ctrlTouch = { active: false, x: 0.5, y: 0.5 };
    this.draggingShip = false;
    this.shipPointerId = null;
    this.ui.endOverlay.classList.add('hidden');
    this.setStatus(WAIT);
  }

  setStatus(text) {
    this.state.statusText = text;
    this.ui.statusBar.textContent = text;
  }

  start({ net, bot = false }) {
    this.stopLoop();
    this.net = net;
    this.useBot = bot;
    this.resetLocal();
    this.L = resizeCanvas(this.canvas);
    window.addEventListener('resize', this._onResize);
    this.bindInput();

    if (bot) {
      this.waiting = false;
      this.setStatus(HINT);
      this._initBot();
    } else if (net) {
      net.on('data', (msg) => this.onNet(msg));
      net.on('disconnected', () => {
        if (!this.ended) this.setStatus('接続が切れました');
      });
      // Host starts when guest ready; guest waits for start
      if (net.ready && !bot) {
        // both sides: if already connected, begin after handshake
      }
    }

    this.running = true;
    this._lastTs = performance.now();
    this._raf = requestAnimationFrame((t) => this.frame(t));

    // Handshake
    if (net && !bot) {
      net.send({ type: 'hello', role: net.role });
      // If peer already connected, leave waiting when we get hello/start
      if (net.ready) {
        // stay in waiting until mutual hello — also allow local start after short delay if host
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
  }

  _initBot() {
    this._bot = {
      y: 0.5,
      hp: 100,
      fireCd: 0,
      spawnAcc: 0,
      enemies: [],
      bullets: [],
      fx: [],
      scroll: 0,
      items: [],
      time: 0,
      powerCd: 2.5,
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
    };
    this.state.botHp = 100;
  }

  stopLoop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.unbindInput();
  }

  destroy() {
    this.stopLoop();
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

    const ownBot = () => OPP_RATIO + OWN_RATIO;

    const tryGrabOrMoveShip = (pid, relX, relY, isDown) => {
      if (relY < ownBot()) return false;
      const localY = (relY - ownBot()) / CTRL_RATIO;
      const localX = relX;
      const hitR = 0.16;
      const dx = localX - this.pointerX;
      const dy = localY - this.pointerY;
      const onShip = (dx * dx + dy * dy) <= hitR * hitR;

      if (isDown) {
        if (!onShip) return false;
        this.draggingShip = true;
        this.shipPointerId = pid;
      } else if (!this.draggingShip || this.shipPointerId !== pid) {
        return false;
      }

      this.pointerY = Math.max(0.06, Math.min(0.94, localY));
      this.pointerX = Math.max(0.06, Math.min(0.88, localX));
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

    // Pointer events (mouse / pen / one finger with pointer events)
    this._onPointerDown = (e) => {
      e.preventDefault();
      const p = mapPoint(e.clientX, e.clientY);
      // Item slot: one use only (debounce inside tryUsePower)
      {
        const slot = slotIndexAt(p.canvasX, p.canvasY);
        if (slot >= 0) {
          this._itemPointerHandled = true;
          this.tryUsePower(slot);
          return;
        }
      }
      if (p.relY < OPP_RATIO) return;
      tryGrabOrMoveShip(e.pointerId, p.relX, p.relY, true);
    };
    this._onPointerMove = (e) => {
      if (!this.draggingShip || this.shipPointerId !== e.pointerId) return;
      e.preventDefault();
      const p = mapPoint(e.clientX, e.clientY);
      // Keep dragging even if finger slides over the item button
      tryGrabOrMoveShip(e.pointerId, p.relX, p.relY, false);
    };
    this._onPointerUp = (e) => {
      releaseShipPointer(e.pointerId);
    };

    // Multi-touch: ship finger + item finger at once
    this._onTouchStart = (e) => {
      e.preventDefault();
      // If pointer events already handled the item tap, skip duplicate touch fire
      if (this._itemPointerHandled) {
        this._itemPointerHandled = false;
        // Still allow other fingers to grab the ship
      }
      for (const touch of e.changedTouches) {
        const p = mapPoint(touch.clientX, touch.clientY);
        const slot = slotIndexAt(p.canvasX, p.canvasY);
        if (slot >= 0) {
          // Only use via touch when this is a pure-touch path (no recent pointer item)
          if (!this._itemUseAt || performance.now() - this._itemUseAt > 280) {
            this.tryUsePower(slot);
          }
          continue;
        }
        if (p.relY < OPP_RATIO) continue;
        tryGrabOrMoveShip(touch.identifier, p.relX, p.relY, true);
      }
    };
    this._onTouchMove = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (!this.draggingShip || this.shipPointerId !== t.identifier) continue;
        const p = mapPoint(t.clientX, t.clientY);
        tryGrabOrMoveShip(t.identifier, p.relX, p.relY, false);
      }
    };
    this._onTouchEnd = (e) => {
      for (const t of e.changedTouches) {
        releaseShipPointer(t.identifier);
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
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','W','s','S','a','A','d','D',' ','Enter'].includes(e.key)) e.preventDefault();
      if (e.key === ' ' || e.key === 'Enter') this.tryUsePower();
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

  tryUsePower(index = 0) {
    if (this.waiting || this.ended || !this.state.alive) return;
    const p = this.state.player;
    // Prevent double-fire from pointerdown + touchstart (and accidental multi-use)
    const now = performance.now();
    if (this._itemUseAt && now - this._itemUseAt < 280) return;
    if (p.activeTimer > 0) return;
    if (!p.items.length) {
      this.setStatus(HINT);
      return;
    }
    const i = index | 0;
    // Only the tapped slot — never fall back to another item
    if (i < 0 || i >= p.items.length) return;
    const id = p.items.splice(i, 1)[0];
    this._itemUseAt = now;
    this.activatePower(id);
  }



  /** Sent enemies park on the right side and fight from there. */
  markSentEnemy(e, fw, fh) {
    e.sent = true;
    e.holdX = fw * (0.72 + Math.random() * 0.14);
    e.holdY = Math.max(28, Math.min(fh - 28, e.y));
    e.x = fw + 24 + Math.random() * 50;
    e.y = e.holdY;
    // Fight a bit more often once parked
    e.fireCd = Math.min(e.fireCd || 1, 0.6 + Math.random() * 0.5);
    return e;
  }

  /** Push sent enemies into bot field or net. kinds: string | string[] */
  sendToOpponent(kinds, statusLabel) {
    const list = Array.isArray(kinds) ? kinds : [kinds];
    const fw = this.L.own.w, fh = this.L.own.h;
    if (this.useBot) {
      for (const kind of list) {
        const e = this.markSentEnemy(spawnEnemy(fw, fh, kind), fw, fh);
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
    } else if (id === 'send') {
      this.sendToOpponent(['swarm', 'swarm', 'elite'], meta?.label);
    } else if (id === 'send_mech') {
      this.sendToOpponent('mech', meta?.label);
    } else if (id === 'send_golem') {
      this.sendToOpponent('golem', meta?.label);
    } else if (id === 'send_tank') {
      this.sendToOpponent('tank', meta?.label);
    } else if (id === 'send_drone') {
      this.sendToOpponent(['drone', 'drone', 'drone', 'drone'], meta?.label);
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
      for (const e of this.state.enemies) {
        e.hp -= 28;
        this.state.fx.push(spawnExplosion(e.x, e.y, e.kind === 'boss'));
        hits++;
      }
      this.state.bullets = this.state.bullets.filter((b) => b.owner === 'player');
      this.state.fx.push(spawnExplosion(this.L.own.w * 0.55, p.y * this.L.own.h, true));
      this.showItemBanner(meta, `（敵${hits}体）`);
      p.activePower = null;
      p.activeTimer = 0;
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1200);
    } else if (id === 'shock') {
      // Lightning: damage nearby enemies
      const py = p.y * this.L.own.h;
      let hits = 0;
      for (const e of this.state.enemies) {
        const dx = e.x - p.x;
        const dy = e.y - py;
        if (dx * dx + dy * dy < 160 * 160) {
          e.hp -= 18;
          this.state.fx.push(spawnExplosion(e.x, e.y, false));
          hits++;
        }
      }
      this.state.fx.push(spawnExplosion(p.x + 40, py, true));
      this.showItemBanner(meta, `（命中${hits}）`);
      p.activePower = null;
      p.activeTimer = 0;
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1200);
    } else if (id === 'rapid') {
      p.activePower = 'rapid';
      p.activeTimer = 5.5;
    } else if (id === 'meteor') {
      // Meteor strike on opponent HP + visual
      const dmg = 14;
      if (this.useBot) {
        this._bot.hp = Math.max(0, this._bot.hp - dmg);
        this.state.botHp = this._bot.hp;
        for (let i = 0; i < 3; i++) {
          this._bot.fx.push(spawnExplosion(
            this.L.own.w * (0.35 + Math.random() * 0.4),
            this._bot.y * this.L.own.h + (Math.random() - 0.5) * 40,
            true,
          ));
        }
      } else if (this.net) {
        this.net.send({ type: 'directHit', dmg });
      }
      this.state.fx.push(spawnExplosion(this.L.own.w * 0.7, p.y * this.L.own.h, true));
      p.activePower = null;
      p.activeTimer = 0;
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1400);
    } else if (id === 'heal') {
      const before = p.hp;
      p.hp = Math.min(p.maxHp || 100, p.hp + 25);
      this.state.hpGhost = p.hp;
      this.state.hpDisplay = p.hp;
      this.showItemBanner(meta, `（+${p.hp - before}）`);
      p.activePower = null;
      p.activeTimer = 0;
      this.state.fx.push(spawnExplosion(p.x + 8, p.y * this.L.own.h, false));
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1200);
    } else if (id === 'heal_big') {
      const before = p.hp;
      p.hp = Math.min(p.maxHp || 100, p.hp + 50);
      this.state.hpGhost = p.hp;
      this.state.hpDisplay = p.hp;
      this.showItemBanner(meta, `（+${p.hp - before}）`);
      p.activePower = null;
      p.activeTimer = 0;
      this.state.fx.push(spawnExplosion(p.x + 8, p.y * this.L.own.h, true));
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1200);
    } else if (id === 'direct') {
      // Direct attack opponent HP
      const dmg = 8;
      if (this.useBot) {
        this._bot.hp = Math.max(0, this._bot.hp - dmg);
        this.state.botHp = this._bot.hp;
        this._bot.fx.push(spawnExplosion(this.L.own.w * 0.3, this._bot.y * this.L.own.h, true));
      } else if (this.net) {
        this.net.send({ type: 'directHit', dmg });
      }
      this.state.fx.push(spawnExplosion(this.L.own.w * 0.7, this.state.player.y * this.L.own.h, true));
      p.activePower = null;
      p.activeTimer = 0;
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1600);
    }
  }

  onNet(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'hello' || msg.type === 'start') {
      this.beginMatch();
      return;
    }
    if (msg.type === 'state') {
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
          this.state.enemies.push(this.markSentEnemy(spawnEnemy(fw, fh, kind), fw, fh));
        }
      } else {
        const n = msg.count || 3;
        for (let i = 0; i < n; i++) {
          const e = spawnEnemy(fw, fh, i === n - 1 ? 'elite' : 'swarm');
          this.state.enemies.push(this.markSentEnemy(e, fw, fh));
        }
      }
      this.setStatus('対戦相手から敵が送られてきた！');
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1400);
      return;
    }
    if (msg.type === 'directHit') {
      const dmg = msg.dmg || 8;
      this.applyPlayerDamage(dmg, 'direct');
      this.state.player.invuln = 0.6;
      this.state.fx.push(spawnExplosion(this.state.player.x + 10, this.state.player.y * this.L.own.h, true));
      this.setStatus('対戦相手を直接攻撃');
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1400);
      if (this.state.player.hp <= 0) this.finish(false);
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
    const dt = Math.min(0.05, (ts - this._lastTs) / 1000) || 0.016;
    this._lastTs = ts;

    if (!this.waiting && !this.ended) {
      this.update(dt);
      if (this.useBot) this.updateBot(dt);
      this._syncAcc += dt;
      if (this._syncAcc > 0.05) {
        this._syncAcc = 0;
        this.syncOut();
      }
    } else {
      this.state.scroll += 20 * dt;
    }

    this.state.ctrlTouch = this.ctrlTouch;
    const ni = this.state.player.items[0];
    if (ni) {
      const m = powerupMeta(ni);
      this.state.nextItemLabel = `${m.icon} ${m.label}：${m.effect}`;
    } else this.state.nextItemLabel = "";
    renderFrame(this.ctx, this.L, this.state, this.remoteSnap, this.waiting);
    this._raf = requestAnimationFrame((t) => this.frame(t));
  }

  syncOut() {
    if (!this.net || this.useBot || !this.net.ready) return;
    const snap = serializeField(this.state);
    snap.worldItems = this.state.items.map((it) => ({ x: it.x, y: it.y, id: it.id }));
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
      if (this._keys.has('ArrowUp') || this._keys.has('w') || this._keys.has('W')) this.pointerY = Math.max(0.06, this.pointerY - 1.2 * dt);
      if (this._keys.has('ArrowDown') || this._keys.has('s') || this._keys.has('S')) this.pointerY = Math.min(0.94, this.pointerY + 1.2 * dt);
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
      : 0.28;
    if (P.fireCd <= 0 && S.alive) {
      P.fireCd = fireRate;
      const by = P.y * fh;
      if (P.activePower === 'homing') {
        S.bullets.push(spawnBullet(P.x + 16, by, 320, 0, 'player', true, 4));
        sfx.shot();
      } else if (P.activePower === 'rapid') {
        S.bullets.push(spawnBullet(P.x + 16, by, 520, 0, 'player', false, 3));
        S.bullets.push(spawnBullet(P.x + 16, by - 6, 500, -30, 'player', false, 2));
        S.bullets.push(spawnBullet(P.x + 16, by + 6, 500, 30, 'player', false, 2));
        sfx.shot();
      } else {
        S.bullets.push(spawnBullet(P.x + 16, by, 420, 0, 'player', false, 3));
        sfx.shot();
      }
    }

    // Laser damage
    if (P.activePower === 'laser' && P.activeTimer > 0) {
      P.laserCd = (P.laserCd || 0) - dt;
      if (P.laserCd <= 0) {
        P.laserCd = 0.05;
        const ly = P.y * fh;
        for (const e of S.enemies) {
          if (Math.abs(e.y - ly) < e.h * 0.55 + 8 && e.x > P.x) {
            e.hp -= 0.75;
          }
        }
      }
    }

    // Spawn enemies
    this._spawnAcc += dt;
    const spawnEvery = Math.max(0.35, 0.85 - S.time * 0.01);
    if (this._spawnAcc >= spawnEvery) {
      this._spawnAcc = 0;
      const n = 1 + (Math.random() > 0.65 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const roll = Math.random();
        const kind = roll > 0.85 ? 'elite' : roll > 0.5 ? 'swarm' : 'basic';
        S.enemies.push(spawnEnemy(fw, fh, kind));
      }
    }
    this._bossAcc += dt;
    if (this._bossAcc > 22 && !S.enemies.some((e) => e.kind === 'boss')) {
      this._bossAcc = 0;
      S.enemies.push(spawnEnemy(fw, fh, 'boss'));
    }

    // Update enemies
    for (const e of S.enemies) {
      e.phase += dt * 2;
      if (e.sent) {
        if (e.holdX == null) e.holdX = fw * (0.72 + Math.random() * 0.14);
        if (e.holdY == null) e.holdY = e.y;
        // Approach right-side hold point, then park and weave
        if (e.x > e.holdX + 2) {
          e.x -= Math.max(60, e.speed) * dt;
        } else {
          e.x += (e.holdX - e.x) * Math.min(1, 8 * dt);
          e.y = e.holdY + Math.sin(e.phase) * (e.kind === 'swarm' || e.kind === 'drone' ? 28 : 18);
        }
      } else {
        e.x -= e.speed * dt;
        if (e.kind !== 'boss' && e.kind !== 'mech' && e.kind !== 'golem' && e.kind !== 'tank') {
          e.y += Math.sin(e.phase) * 18 * dt;
        }
      }
      e.y = Math.max(16, Math.min(fh - 16, e.y));
      e.fireCd -= dt;
      const onScreen = e.x < fw + 10;
      const parked = e.sent ? e.x <= (e.holdX || fw) + 8 : true;
      if (e.fireCd <= 0 && onScreen && parked) {
        e.fireCd = e.sent
          ? ((e.kind === 'boss' || e.kind === 'tank' || e.kind === 'mech') ? 0.85
            : (e.kind === 'golem' || e.kind === 'elite') ? 1.1
            : 1.5 + Math.random() * 0.4)
          : ((e.kind === 'boss' || e.kind === 'tank') ? 1.0
            : (e.kind === 'mech' || e.kind === 'golem') ? 1.3 + Math.random() * 0.4
            : e.kind === 'elite' ? 1.6 + Math.random() * 0.5
            : 2.2 + Math.random() * 0.8);
        S.bullets.push(spawnBullet(e.x - e.w * 0.4, e.y, -160 - Math.random() * 30, (Math.random() - 0.5) * 24, 'enemy', false, 2));
        if (e.kind === 'boss' || e.kind === 'tank' || e.kind === 'mech' || (e.sent && (e.kind === 'golem' || e.kind === 'elite'))) {
          S.bullets.push(spawnBullet(e.x - e.w * 0.4, e.y - 12, -160, -30, 'enemy', false, 1));
          S.bullets.push(spawnBullet(e.x - e.w * 0.4, e.y + 12, -160, 30, 'enemy', false, 1));
        }
      }
    }

    // Bullets
    for (const b of S.bullets) {
      if (b.homing && b.owner === 'player') {
        let best = null;
        let bestD = 1e9;
        for (const e of S.enemies) {
          const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) {
          const ang = Math.atan2(best.y - b.y, best.x - b.x);
          const spd = 380;
          b.vx = Math.cos(ang) * spd;
          b.vy = Math.sin(ang) * spd;
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }

    // Items float
    for (const it of S.items) {
      it.y += Math.sin(S.time * 3 + it.x) * 10 * dt;
      it.x -= 30 * dt;
      it.life -= dt;
    }

    // FX
    for (const f of S.fx) f.life -= dt;

    // Collisions player bullets -> enemies
    for (const b of S.bullets) {
      if (b.owner !== 'player') continue;
      for (const e of S.enemies) {
        if (Math.abs(b.x - e.x) < e.w * 0.45 + 4 && Math.abs(b.y - e.y) < e.h * 0.45 + 4) {
          e.hp -= b.dmg;
          b.life = 0;
          S.fx.push(spawnExplosion(e.x, e.y, false));
          break;
        }
      }
    }

    // Enemy death -> items
    const remain = [];
    for (const e of S.enemies) {
      if (e.hp <= 0) {
        S.fx.push(spawnExplosion(e.x, e.y, e.kind === 'boss'));
        sfx.explode();
        P.score += e.score;
        if (Math.random() < (e.kind === 'boss' ? 1 : 0.35)) {
          S.items.push(spawnItem(e.x, e.y));
        }
        // Damage bot passively a bit when scoring? No — only via powers / race.
      } else if (e.x > -40) {
        remain.push(e);
      }
    }
    S.enemies = remain;

    // Enemy bullets -> player
    for (const b of S.bullets) {
      if (b.owner !== 'enemy') continue;
      const py = P.y * fh;
      if (P.invuln <= 0 && Math.abs(b.x - P.x) < 14 && Math.abs(b.y - py) < 12) {
        this.applyPlayerDamage(6, 'bullet');
        P.invuln = 0.75;
        b.life = 0;
        S.fx.push(spawnExplosion(P.x, py, false));
        sfx.hit();
      }
    }

    // Enemy body -> player
    for (const e of S.enemies) {
      const py = P.y * fh;
      if (P.invuln <= 0 && Math.abs(e.x - P.x) < e.w * 0.4 + 10 && Math.abs(e.y - py) < e.h * 0.4 + 8) {
        this.applyPlayerDamage(10, 'ram');
        P.invuln = 0.9;
        e.hp -= 1;
        S.fx.push(spawnExplosion(P.x, py, true));
      }
    }

    // Collect items — heal applies instantly on pickup
    const leftItems = [];
    for (const it of S.items) {
      const py = P.y * fh;
      if (Math.abs(it.x - P.x) < 20 && Math.abs(it.y - py) < 20) {
        sfx.pickup();
        if (it.id === 'heal' || it.id === 'heal_big') {
          this.activatePower(it.id);
        } else {
          if (P.items.length < MAX_ITEM_SLOTS) P.items.push(it.id);
          const meta = powerupMeta(it.id);
          if (meta) this.setStatus(`入手 ${meta.icon} ${meta.label}（${meta.effect}）`);
        }
      } else if (it.life > 0 && it.x > -20) {
        leftItems.push(it);
      }
    }
    S.items = leftItems;

    // Cleanup
    S.bullets = S.bullets.filter((b) => b.life > 0 && b.x > -30 && b.x < fw + 80 && b.y > -30 && b.y < fh + 30);
    S.fx = S.fx.filter((f) => f.life > 0);

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
    const B = this._bot;
    const fw = this.L.own.w;
    const fh = this.L.own.h;
    const shipX = 48;
    B.time += dt;
    B.scroll += 55 * dt;
    if (B.invuln == null) B.invuln = 0;
    if (B.invuln > 0) B.invuln -= dt;
    if (B.activeTimer > 0) {
      B.activeTimer -= dt;
      if (B.activeTimer <= 0) B.activePower = null;
    }

    // --- Balanced human-like COM (capable but not perfect) ---
    if (B.reactDelay == null) B.reactDelay = 0;
    if (B.dodgeDir == null) B.dodgeDir = 0;
    if (B.aimNoise == null) B.aimNoise = 0;
    if (B.humanPanic == null) B.humanPanic = 0;
    if (B.moveVel == null) B.moveVel = 0;
    if (B.preferredY == null) B.preferredY = 0.5;

    // Urgent threat: react a bit earlier than "weak" AI, still not machine-perfect
    let urgent = null;
    let urgentScore = 0;
    for (const b of B.bullets) {
      if (b.owner !== 'enemy' || b.vx >= 0) continue;
      const dist = b.x - shipX;
      if (dist < 0 || dist > fw * 0.62) continue;
      const eta = dist / Math.max(50, -b.vx);
      if (eta > 0.7) continue;
      const yN = b.y / fh;
      const lane = Math.abs(yN - B.y);
      if (lane > 0.15) continue;
      const score = (1 - eta / 0.7) * (1 - lane / 0.15) + (eta < 0.28 ? 0.55 : 0);
      if (score > urgentScore) {
        urgentScore = score;
        urgent = { yN, eta };
      }
    }
    for (const e of B.enemies) {
      if (e.x > shipX + 110) continue;
      const yN = e.y / fh;
      if (Math.abs(yN - B.y) > 0.13) continue;
      const eta = (e.x - shipX) / Math.max(40, e.speed || 80);
      const score = 0.85 + (1 - Math.min(1, eta)) * 0.9;
      if (score > urgentScore) {
        urgentScore = score;
        urgent = { yN, eta };
      }
    }

    if (urgent && urgentScore > 0.4) B.reactDelay += dt;
    else B.reactDelay = Math.max(0, B.reactDelay - dt * 2.2);
    const reacted = B.reactDelay > 0.14; // ~140ms — skilled human

    // Rare wrong-way panic (keeps it human, not a wall)
    if (reacted && urgent && B.humanPanic <= 0 && Math.random() < 0.006) {
      B.humanPanic = 0.18 + Math.random() * 0.15;
      B.dodgeDir = urgent.yN >= B.y ? -1 : 1;
    }
    if (B.humanPanic > 0) B.humanPanic -= dt;

    let wantY = B.preferredY;
    let dodging = false;
    if (reacted && urgent && B.humanPanic <= 0) {
      dodging = true;
      const upSpace = urgent.yN;
      const downSpace = 1 - urgent.yN;
      let dir = upSpace >= downSpace ? -1 : 1;
      if (Math.random() < 0.008) dir *= -1;
      B.dodgeDir = dir;
      wantY = Math.max(0.08, Math.min(0.92, urgent.yN + dir * (0.18 + Math.random() * 0.06)));
    } else if (B.humanPanic > 0) {
      dodging = true;
      wantY = Math.max(0.08, Math.min(0.92, B.y + B.dodgeDir * 0.18));
    }

    let focus = null;
    let focusVal = -1e9;
    for (const e of B.enemies) {
      if (e.x < shipX - 10) continue;
      const kindW = ({ boss: 5, mech: 4, golem: 4, tank: 4, elite: 3, drone: 2, basic: 1.5, swarm: 1 })[e.kind] || 1;
      const dist = Math.max(20, e.x - shipX);
      const align = 1 - Math.min(1, Math.abs(e.y / fh - B.y) / 0.28);
      let val = kindW * 16 / Math.sqrt(dist) + align * 5 + (e.x < 160 ? 1.8 : 0);
      if (dodging) val -= Math.abs(e.y / fh - wantY) * 4;
      if (val > focusVal) { focusVal = val; focus = e; }
    }

    if (!dodging && focus) {
      B.preferredY += ((focus.y / fh) - B.preferredY) * Math.min(1, 2.2 * dt);
      wantY = B.preferredY + Math.sin(B.time * 1.2) * 0.025;
    } else if (!dodging && !focus) {
      wantY = 0.5 + Math.sin(B.time * 1.0) * 0.14;
      B.preferredY = wantY;
    }

    wantY = Math.max(0.07, Math.min(0.93, wantY));

    // Snappy enough to feel skilled, not teleporty
    const maxSpeed = dodging ? 2.1 : 1.15;
    const accel = dodging ? 11 : 4.5;
    const desiredVel = Math.max(-maxSpeed, Math.min(maxSpeed, (wantY - B.y) * (dodging ? 7.5 : 3.8)));
    B.moveVel += (desiredVel - B.moveVel) * Math.min(1, accel * dt);
    B.moveVel += (Math.random() - 0.5) * 0.015;
    B.y += B.moveVel * dt;
    B.y = Math.max(0.07, Math.min(0.93, B.y));

    B.aimNoise += ((Math.random() - 0.5) * 0.06 - B.aimNoise) * Math.min(1, 2.2 * dt);

    // --- Fire control: lead aim, burst when aligned, powers ---
    B.fireCd -= dt;
    const aligned = focus && Math.abs(focus.y / fh - (B.y + (B.aimNoise || 0))) < (dodging ? 0.1 : 0.12);
    const fireRate = B.activePower === 'homing' ? 0.12 : B.activePower === 'rapid' ? 0.09 : (aligned ? 0.14 : 0.2);
    if (B.fireCd <= 0) {
      B.fireCd = fireRate;
      const by = B.y * fh;
      if (B.activePower === 'homing') {
        B.bullets.push(spawnBullet(shipX + 16, by, 360, 0, 'player', true, 4));
      } else if (B.activePower === 'rapid') {
        B.bullets.push(spawnBullet(shipX + 16, by, 520, 0, 'player', false, 3));
        B.bullets.push(spawnBullet(shipX + 16, by - 6, 500, -30, 'player', false, 2));
        B.bullets.push(spawnBullet(shipX + 16, by + 6, 500, 30, 'player', false, 2));
      } else {
        // slight lead on vertical velocity of focus
        let vy = 0;
        if (focus && aligned) {
          const lead = Math.sin(focus.phase || 0) * 4;
          vy = lead;
        }
        B.bullets.push(spawnBullet(shipX + 16, by, 430, vy, 'player', false, aligned ? 3 : 2));
        if (aligned && focus && (focus.kind === 'boss' || focus.kind === 'mech' || focus.kind === 'tank' || focus.kind === 'golem')) {
          B.bullets.push(spawnBullet(shipX + 16, by - 7, 400, -8, 'player', false, 1));
          B.bullets.push(spawnBullet(shipX + 16, by + 7, 400, 8, 'player', false, 1));
        }
      }
    }

    // Laser beam while active
    if (B.activePower === 'laser' && B.activeTimer > 0) {
      B.laserCd = (B.laserCd || 0) - dt;
      if (B.laserCd <= 0) {
        B.laserCd = 0.05;
        const by = B.y * fh;
        for (const e of B.enemies) {
          if (e.x > shipX && Math.abs(e.y - by) < 16) {
            e.hp -= 2.2;
            if (Math.random() < 0.08) B.fx.push(spawnExplosion(e.x, e.y));
          }
        }
      }
    }

    // Homing bullet steering (bot field)
    for (const b of B.bullets) {
      if (!b.homing || b.owner !== 'player') continue;
      let best = null; let bd = 1e9;
      for (const e of B.enemies) {
        const d = (e.x - b.x) * (e.x - b.x) + (e.y - b.y) * (e.y - b.y);
        if (d < bd && e.x > b.x - 10) { bd = d; best = e; }
      }
      if (best) {
        const ang = Math.atan2(best.y - b.y, best.x - b.x);
        const spd = Math.hypot(b.vx, b.vy) || 360;
        b.vx = Math.cos(ang) * spd;
        b.vy = Math.sin(ang) * spd;
      }
    }

    // --- Spawns (slightly denser so AI has something to think about) ---
    B.spawnAcc += dt;
    if (B.spawnAcc > 0.85) {
      B.spawnAcc = 0;
      const r = Math.random();
      const kind = r > 0.88 ? 'elite' : r > 0.55 ? 'swarm' : 'basic';
      B.enemies.push(spawnEnemy(fw, fh, kind));
    }

    for (const e of B.enemies) {
      e.phase += dt * 2;
      if (e.sent) {
        if (e.holdX == null) e.holdX = fw * (0.72 + Math.random() * 0.14);
        if (e.holdY == null) e.holdY = e.y;
        if (e.x > e.holdX + 2) {
          e.x -= Math.max(60, e.speed) * dt;
        } else {
          e.x += (e.holdX - e.x) * Math.min(1, 8 * dt);
          e.y = e.holdY + Math.sin(e.phase) * (e.kind === 'swarm' || e.kind === 'drone' ? 28 : 18);
        }
      } else {
        e.x -= e.speed * dt;
        e.y += Math.sin(e.phase) * 12 * dt;
      }
      e.y = Math.max(20, Math.min(fh - 20, e.y));
      e.fireCd -= dt;
      const parked = e.sent ? e.x <= (e.holdX || fw) + 8 : true;
      if (e.fireCd <= 0 && parked) {
        e.fireCd = e.sent
          ? ((e.kind === 'elite' || e.kind === 'boss' || e.kind === 'mech' || e.kind === 'tank') ? 1.0 : 1.5)
          : ((e.kind === 'elite' || e.kind === 'boss') ? 1.6 : 2.2);
        B.bullets.push(spawnBullet(e.x, e.y, -170, (Math.random() - 0.5) * 20, 'enemy', false, 2));
        if (e.kind === 'elite' || e.kind === 'boss' || (e.sent && (e.kind === 'mech' || e.kind === 'tank' || e.kind === 'golem'))) {
          B.bullets.push(spawnBullet(e.x, e.y - 10, -160, -28, 'enemy', false, 1));
          B.bullets.push(spawnBullet(e.x, e.y + 10, -160, 28, 'enemy', false, 1));
        }
      }
    }
    for (const b of B.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }

    // Bot bullets hit enemies + item drops into bot inventory
    for (const b of B.bullets) {
      if (b.owner !== 'player') continue;
      for (const e of B.enemies) {
        if (Math.abs(b.x - e.x) < e.w * 0.45 && Math.abs(b.y - e.y) < e.h * 0.45) {
          e.hp -= b.dmg;
          b.life = 0;
          B.fx.push(spawnExplosion(e.x, e.y));
        }
      }
    }
    const kept = [];
    for (const e of B.enemies) {
      if (e.hp <= 0) {
        B.fx.push(spawnExplosion(e.x, e.y, e.kind === 'boss'));
        if (B.items.length < MAX_ITEM_SLOTS && Math.random() < (e.kind === 'boss' ? 1 : 0.4)) {
          const dropId = pickPowerupId();
          if (dropId === 'heal' || dropId === 'heal_big') {
            B.hp = Math.min(100, B.hp + (dropId === 'heal_big' ? 50 : 25));
            B.fx.push(spawnExplosion(48, B.y * fh, dropId === 'heal_big'));
          } else {
            B.items.push(dropId);
          }
        }
      } else if (e.x > -40) {
        kept.push(e);
      }
    }
    B.enemies = kept;

    // Hits on bot — fair hurtbox (gets hit, not glass)
    for (const b of B.bullets) {
      if (b.owner !== 'enemy') continue;
      if (B.invuln <= 0 && Math.abs(b.x - shipX) < 13 && Math.abs(b.y - B.y * fh) < 12) {
        B.hp = Math.max(0, B.hp - 7);
        B.invuln = 0.38;
        b.life = 0;
        B.fx.push(spawnExplosion(shipX, B.y * fh, false));
      }
    }
    for (const e of B.enemies) {
      if (B.invuln <= 0 && Math.abs(e.x - shipX) < e.w * 0.4 + 8 && Math.abs(e.y - B.y * fh) < e.h * 0.4 + 8) {
        B.hp = Math.max(0, B.hp - 10);
        B.invuln = 0.45;
        e.hp = 0;
        B.fx.push(spawnExplosion(shipX, B.y * fh, true));
      }
    }

    B.bullets = B.bullets.filter((b) => b.life > 0 && b.x > -40 && b.x < fw + 80);
    for (const f of B.fx) f.life -= dt;
    B.fx = B.fx.filter((f) => f.life > 0);

    // --- Smart item / power usage ---
    B.powerCd -= dt;
    const playerHp = this.state.player.hp;
    const enemyPressure = B.enemies.filter((e) => e.x < fw * 0.7).length;
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
      if (enemyPressure >= 4 && !B.activePower) {
        const l = B.items.findIndex((id) => id === 'laser' || id === 'homing' || id === 'bomb' || id === 'shock' || id === 'spread' || id === 'rapid');
        if (l >= 0) return l;
      }
      if (playerHp > 55) {
        const heavy = B.items.findIndex((id) => id === 'send_mech' || id === 'send_golem' || id === 'send_tank' || id === 'send_drone' || id === 'send' || id === 'direct' || id === 'meteor');
        if (heavy >= 0) return heavy;
      }
      // default: first offensive
      const off = B.items.findIndex((id) => id !== 'heal' && id !== 'heal_big');
      return off >= 0 ? off : 0;
    };

    const tryUse = (force = false) => {
      if (B.powerCd > 0 && !force) return;
      // Seed inventory so COM always has something to think with
      if (!B.items.length) {
        const pool = ['homing', 'laser', 'spread', 'bomb', 'shock', 'rapid', 'meteor', 'send', 'direct', 'send_mech', 'send_golem', 'send_tank', 'send_drone', 'heal'];
        B.items.push(pool[(Math.random() * pool.length) | 0]);
        if (Math.random() < 0.5) B.items.push(pool[(Math.random() * pool.length) | 0]);
      }
      const idx = pickBestItem();
      if (idx == null || idx < 0) return;
      const id = B.items.splice(idx, 1)[0];
      B.powerCd = 3.2 + Math.random() * 1.8;

      if (id === 'homing') {
        B.activePower = 'homing';
        B.activeTimer = 6;
      } else if (id === 'laser') {
        B.activePower = 'laser';
        B.activeTimer = 4;
      } else if (id === 'heal' || id === 'heal_big') {
        B.hp = Math.min(100, B.hp + (id === 'heal_big' ? 50 : 25));
      } else if (id === 'direct') {
        this.applyPlayerDamage(8, 'direct');
        this.state.fx.push(spawnExplosion(this.state.player.x, this.state.player.y * fh, false));
      } else if (id === 'spread') {
        const by = B.y * fh;
        for (let i = -3; i <= 3; i++) {
          const ang = i * 0.18;
          const spd = 480;
          B.bullets.push(spawnBullet(48 + 18, by, Math.cos(ang) * spd, Math.sin(ang) * spd, 'player', false, 2));
        }
        B.fx.push(spawnExplosion(48 + 30, by, false));
      } else if (id === 'bomb') {
        for (const e of B.enemies) {
          e.hp -= 28;
          B.fx.push(spawnExplosion(e.x, e.y, true));
        }
        B.bullets = B.bullets.filter((b) => b.owner === 'player');
      } else if (id === 'shock') {
        const by = B.y * fh;
        for (const e of B.enemies) {
          const dx = e.x - 48;
          const dy = e.y - by;
          if (dx * dx + dy * dy < 160 * 160) {
            e.hp -= 18;
            B.fx.push(spawnExplosion(e.x, e.y, false));
          }
        }
      } else if (id === 'rapid') {
        B.activePower = 'rapid';
        B.activeTimer = 5.5;
      } else if (id === 'meteor') {
        this.applyPlayerDamage(14, 'direct');
        this.state.fx.push(spawnExplosion(this.state.player.x, this.state.player.y * fh, true));
        this.state.fx.push(spawnExplosion(this.state.player.x + 20, this.state.player.y * fh - 20, false));
      } else if (id === 'send' || id === 'send_mech' || id === 'send_golem' || id === 'send_tank' || id === 'send_drone') {
        const map = {
          send: ['swarm', 'swarm', 'elite'],
          send_mech: ['mech'],
          send_golem: ['golem'],
          send_tank: ['tank'],
          send_drone: ['drone', 'drone', 'drone', 'drone'],
        };
        const labels = {
          send: 'COM敵送信', send_mech: 'COM戦艦', send_golem: 'COM要塞',
          send_tank: 'COMガンシップ', send_drone: 'COM無人機',
        };
        const fw = this.L.own.w, fh = this.L.own.h;
        for (const kind of map[id]) {
          this.state.enemies.push(this.markSentEnemy(spawnEnemy(fw, fh, kind), fw, fh));
        }
        this.setStatus(labels[id]);
        setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1400);
      }
    };

    // Use when: cooldown ready AND (low HP heal / many enemies / mid-fight pressure)
    if (B.powerCd <= 0) {
      const wantHeal = B.hp <= 38 && B.items.some((id) => id === 'heal' || id === 'heal_big');
      const wantClear = enemyPressure >= 3;
      const wantPressure = playerHp >= 40 && B.time > 4;
      if (wantHeal || wantClear || wantPressure || B.items.length >= 3) tryUse();
    }
    // Emergency heal even if cooldown almost ready
    if (B.hp <= 22 && B.powerCd < 1.0 && B.items.some((id) => id === 'heal' || id === 'heal_big')) {
      B.powerCd = 0;
      tryUse(true);
    }

    this.state.botHp = B.hp;
    this.state.botSnap = {
      scroll: B.scroll,
      enemies: B.enemies,
      bullets: B.bullets,
      fx: B.fx,
      px: shipX,
      py: B.y,
      php: B.hp,
      alive: B.hp > 0,
      _sx: this.L.opp.w / fw,
      _sy: this.L.opp.h / fh,
    };

    if (B.hp <= 0) this.finish(true);
    if (this.state.player.hp <= 0) this.finish(false);
  }

  finish(won) {
    if (this.ended) return;
    this.ended = true;
    this.state.alive = won ? this.state.alive : false;
    const msg = won ? 'あなたの勝ちです' : 'あなたの負けです';
    if (won) sfx.win(); else sfx.lose();
    this.setStatus(msg);
    this.ui.endMessage.textContent = msg;
    this.ui.endOverlay.classList.remove('hidden');
    if (this.net && !this.useBot) {
      this.net.send({ type: 'over', youWin: !won });
    }
  }
}
