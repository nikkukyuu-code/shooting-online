import {
  POWERUPS, powerupMeta, createPlayer, spawnEnemy, spawnBullet, spawnItem, spawnExplosion, serializeField,
} from './entities.js?v=1.5.0';
import { resizeCanvas, renderFrame, layout, OPP_RATIO, OWN_RATIO, CTRL_RATIO, itemButtonRect } from './render.js?v=1.5.0';
import { sfx } from './audio.js?v=1.5.0';

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
      powerCd: 8,
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

    const onItemButton = (canvasX, canvasY) => {
      const btn = itemButtonRect(this.L.ctrl);
      return (
        canvasX >= btn.x && canvasX <= btn.x + btn.w &&
        canvasY >= btn.y && canvasY <= btn.y + btn.h
      );
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
      // Item button: fire without releasing ship drag
      if (onItemButton(p.canvasX, p.canvasY)) {
        this.tryUsePower();
        return;
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
      for (const t of e.changedTouches) {
        const p = mapPoint(t.clientX, t.clientY);
        if (onItemButton(p.canvasX, p.canvasY)) {
          this.tryUsePower();
          continue;
        }
        if (p.relY < OPP_RATIO) continue;
        tryGrabOrMoveShip(t.identifier, p.relX, p.relY, true);
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

  tryUsePower() {
    if (this.waiting || this.ended || !this.state.alive) return;
    const p = this.state.player;
    if (p.activeTimer > 0) return;
    if (!p.items.length) {
      this.setStatus(HINT);
      return;
    }
    const id = p.items.shift();
    this.activatePower(id);
  }


  /** Push sent enemies into bot field or net. kinds: string | string[] */
  sendToOpponent(kinds, statusLabel) {
    const list = Array.isArray(kinds) ? kinds : [kinds];
    if (this.useBot) {
      for (const kind of list) {
        const e = spawnEnemy(this.L.own.w, this.L.own.h, kind);
        e.sent = true;
        this._bot.enemies.push({
          ...e,
          x: this.L.own.w + 20,
          y: 40 + Math.random() * (this.L.own.h - 80),
        });
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
      if (kinds && kinds.length) {
        for (const kind of kinds) {
          const e = spawnEnemy(this.L.own.w, this.L.own.h, kind);
          e.sent = true;
          this.state.enemies.push(e);
        }
      } else {
        const n = msg.count || 3;
        for (let i = 0; i < n; i++) {
          const e = spawnEnemy(this.L.own.w, this.L.own.h, i === n - 1 ? 'elite' : 'swarm');
          e.sent = true;
          this.state.enemies.push(e);
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
    const fireRate = P.activePower === 'homing' ? 0.16 : 0.28;
    if (P.fireCd <= 0 && S.alive) {
      P.fireCd = fireRate;
      const by = P.y * fh;
      if (P.activePower === 'homing') {
        S.bullets.push(spawnBullet(P.x + 16, by, 320, 0, 'player', true, 3));
        sfx.shot();
      } else {
        S.bullets.push(spawnBullet(P.x + 16, by, 420, 0, 'player', false, 2));
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
            e.hp -= 0.4;
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
      e.x -= e.speed * dt;
      if (e.kind !== 'boss' && e.kind !== 'mech' && e.kind !== 'golem' && e.kind !== 'tank') e.y += Math.sin(e.phase) * 18 * dt;
      e.y = Math.max(16, Math.min(fh - 16, e.y));
      e.fireCd -= dt;
      if (e.fireCd <= 0 && e.x < fw) {
        e.fireCd = (e.kind === 'boss' || e.kind === 'tank') ? 1.0
          : (e.kind === 'mech' || e.kind === 'golem') ? 1.3 + Math.random() * 0.4
          : e.kind === 'elite' ? 1.6 + Math.random() * 0.5
          : 2.2 + Math.random() * 0.8;
        S.bullets.push(spawnBullet(e.x - e.w * 0.4, e.y, -160 - Math.random() * 30, (Math.random() - 0.5) * 24, 'enemy', false, 2));
        if (e.kind === 'boss' || e.kind === 'tank' || e.kind === 'mech') {
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

    // Collect items
    const leftItems = [];
    for (const it of S.items) {
      const py = P.y * fh;
      if (Math.abs(it.x - P.x) < 20 && Math.abs(it.y - py) < 20) {
        if (P.items.length < 5) P.items.push(it.id);
        sfx.pickup();
        const meta = powerupMeta(it.id);
        if (meta) this.setStatus(`入手 ${meta.icon} ${meta.label}（${meta.effect}）`);
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
    B.time += dt;
    B.scroll += 55 * dt;

    // AI: prioritize dodging incoming bullets, then track enemies
    let nearest = null;
    let nd = 1e9;
    for (const e of B.enemies) {
      const d = e.x - 48;
      if (d > 0 && d < nd) { nd = d; nearest = e; }
    }

    let dodgeY = null;
    let bestThreat = 0;
    for (const b of B.bullets) {
      if (b.owner !== 'enemy') continue;
      if (b.vx >= 0) continue; // not flying left toward COM
      const bx = b.x;
      const byN = b.y / fh;
      // ETA-ish: closer + on lane = higher threat
      if (bx > fw * 0.55 || bx < 20) continue;
      const lane = Math.abs(byN - B.y);
      if (lane > 0.14) continue;
      const threat = (1 - bx / fw) * (1 - lane / 0.14);
      if (threat > bestThreat) {
        bestThreat = threat;
        // Escape to the emptier side of the bullet lane
        const upClear = byN;
        const downClear = 1 - byN;
        dodgeY = upClear >= downClear
          ? Math.max(0.08, byN - 0.22 - Math.random() * 0.06)
          : Math.min(0.92, byN + 0.22 + Math.random() * 0.06);
      }
    }
    // Also dodge enemies about to ram
    for (const e of B.enemies) {
      if (e.x > 110) continue;
      const eyN = e.y / fh;
      if (Math.abs(eyN - B.y) < 0.12) {
        dodgeY = B.y < 0.5
          ? Math.min(0.9, eyN + 0.28)
          : Math.max(0.1, eyN - 0.28);
        bestThreat = Math.max(bestThreat, 0.9);
      }
    }

    let target;
    if (dodgeY != null && bestThreat > 0.15) {
      target = dodgeY;
    } else if (nearest) {
      target = nearest.y / fh + Math.sin(B.time * 2.2) * 0.04;
    } else {
      target = 0.5 + Math.sin(B.time * 1.1) * 0.2;
    }
    target = Math.max(0.08, Math.min(0.92, target));
    // Snap faster when dodging
    const chase = dodgeY != null ? 18 : 10;
    B.y += (target - B.y) * Math.min(1, chase * dt);

    B.fireCd -= dt;
    if (B.fireCd <= 0) {
      B.fireCd = 0.22;
      B.bullets.push(spawnBullet(48 + 16, B.y * fh, 400, 0, 'player', false, 1));
    }

    B.spawnAcc += dt;
    if (B.spawnAcc > 0.9) {
      B.spawnAcc = 0;
      B.enemies.push(spawnEnemy(fw, fh, Math.random() > 0.7 ? 'swarm' : 'basic'));
    }

    for (const e of B.enemies) {
      e.x -= e.speed * dt;
      e.phase += dt * 2;
      e.y += Math.sin(e.phase) * 12 * dt;
      e.fireCd -= dt;
      if (e.fireCd <= 0) {
        e.fireCd = 2.4;
        B.bullets.push(spawnBullet(e.x, e.y, -160, 0, 'enemy', false, 2));
      }
    }
    for (const b of B.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }

    // Bot bullets hit bot's enemies
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
    // Enemy hits bot (smaller hurtbox + i-frames so dodge AI can work)
    if (B.invuln == null) B.invuln = 0;
    if (B.invuln > 0) B.invuln -= dt;
    for (const b of B.bullets) {
      if (b.owner !== 'enemy') continue;
      if (B.invuln <= 0 && Math.abs(b.x - 48) < 10 && Math.abs(b.y - B.y * fh) < 9) {
        B.hp = Math.max(0, B.hp - 5);
        B.invuln = 0.55;
        b.life = 0;
        B.fx.push(spawnExplosion(48, B.y * fh, false));
      }
    }
    for (const e of B.enemies) {
      if (B.invuln <= 0 && Math.abs(e.x - 48) < e.w * 0.35 + 6 && Math.abs(e.y - B.y * fh) < e.h * 0.35 + 6) {
        B.hp = Math.max(0, B.hp - 7);
        B.invuln = 0.7;
        e.hp = 0;
        B.fx.push(spawnExplosion(48, B.y * fh, true));
      }
    }

    B.enemies = B.enemies.filter((e) => e.hp > 0 && e.x > -40);
    B.bullets = B.bullets.filter((b) => b.life > 0 && b.x > -40 && b.x < fw + 80);
    for (const f of B.fx) f.life -= dt;
    B.fx = B.fx.filter((f) => f.life > 0);

    // Bot occasionally uses direct pressure via surviving — also slow HP drain race? Better: bot uses powers
    B.powerCd -= dt;
    if (B.powerCd <= 0) {
      B.powerCd = 10 + Math.random() * 6;
      // send enemies to player
      for (let i = 0; i < 2; i++) {
        const e = spawnEnemy(fw, fh, 'swarm');
        e.sent = true;
        this.state.enemies.push(e);
      }
      // small direct hit
      if (Math.random() > 0.4) {
        this.applyPlayerDamage(8, 'direct');
        this.state.fx.push(spawnExplosion(this.state.player.x, this.state.player.y * fh, false));
      }
    }

    this.state.botHp = B.hp;
    this.state.botSnap = {
      scroll: B.scroll,
      enemies: B.enemies,
      bullets: B.bullets,
      fx: B.fx,
      px: 48,
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
