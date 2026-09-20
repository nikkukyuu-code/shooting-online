import {
  POWERUPS, createPlayer, spawnEnemy, spawnBullet, spawnItem, spawnExplosion, serializeField,
} from './entities.js';
import { resizeCanvas, renderFrame, layout } from './render.js';

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
    this.pointerDown = false;
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
    this._onPointer = (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
      const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
      const relY = (clientY - rect.top) / rect.height;
      const relX = (clientX - rect.left) / rect.width;
      // Movement mapped to own field (top 65%)
      if (relY <= 0.65) {
        this.pointerY = Math.max(0.06, Math.min(0.94, relY / 0.65));
        this.pointerDown = true;
      } else {
        // Tap opponent view / bottom → activate next power-up
        if (e.type === 'pointerdown' || e.type === 'touchstart' || e.type === 'mousedown') {
          this.tryUsePower();
        }
      }
      // also allow dragging anywhere in own field
      if (relY <= 0.72) {
        this.pointerY = Math.max(0.06, Math.min(0.94, Math.min(relY, 0.65) / 0.65));
      }
      void relX;
    };
    this._onPointerUp = () => { this.pointerDown = false; };
    c.addEventListener('pointerdown', this._onPointer, { passive: false });
    c.addEventListener('pointermove', this._onPointer, { passive: false });
    c.addEventListener('pointerup', this._onPointerUp);
    c.addEventListener('touchstart', this._onPointer, { passive: false });
    c.addEventListener('touchmove', this._onPointer, { passive: false });
    c.addEventListener('touchend', this._onPointerUp);
    this.bindKeyboard();
  }

  bindKeyboard() {
    this._keys = new Set();
    this._onKeyDown = (e) => {
      this._keys.add(e.key);
      if (['ArrowUp','ArrowDown','w','W','s','S',' ','Enter'].includes(e.key)) e.preventDefault();
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
    if (!this._onPointer) return;
    c.removeEventListener('pointerdown', this._onPointer);
    c.removeEventListener('pointermove', this._onPointer);
    c.removeEventListener('pointerup', this._onPointerUp);
    c.removeEventListener('touchstart', this._onPointer);
    c.removeEventListener('touchmove', this._onPointer);
    c.removeEventListener('touchend', this._onPointerUp);
    this.unbindKeyboard();
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

  activatePower(id) {
    const p = this.state.player;
    const meta = POWERUPS.find((x) => x.id === id);
    if (meta) this.setStatus(meta.label);

    if (id === 'homing') {
      p.activePower = 'homing';
      p.activeTimer = 6;
    } else if (id === 'laser') {
      p.activePower = 'laser';
      p.activeTimer = 4;
    } else if (id === 'send') {
      // Send enemies to opponent
      if (this.useBot) {
        for (let i = 0; i < 3; i++) {
          const e = spawnEnemy(this.L.own.w, this.L.own.h, i === 2 ? 'elite' : 'swarm');
          e.sent = true;
          this._bot.enemies.push({
            ...e,
            x: this.L.own.w + 20,
            y: 40 + Math.random() * (this.L.own.h - 80),
          });
        }
      } else if (this.net) {
        this.net.send({ type: 'sendEnemies', count: 3 });
      }
      p.activePower = null;
      p.activeTimer = 0;
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1600);
    } else if (id === 'direct') {
      // Direct attack opponent HP
      const dmg = 12;
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
      const n = msg.count || 3;
      for (let i = 0; i < n; i++) {
        const e = spawnEnemy(this.L.own.w, this.L.own.h, i === n - 1 ? 'elite' : 'swarm');
        e.sent = true;
        this.state.enemies.push(e);
      }
      this.setStatus('対戦相手へ敵キャラを送信');
      setTimeout(() => { if (!this.ended && !this.waiting) this.setStatus(HINT); }, 1400);
      return;
    }
    if (msg.type === 'directHit') {
      const dmg = msg.dmg || 12;
      this.state.player.hp = Math.max(0, this.state.player.hp - dmg);
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

    renderFrame(this.ctx, this.L, this.state, this.remoteSnap, this.waiting);
    this._raf = requestAnimationFrame((t) => this.frame(t));
  }

  syncOut() {
    if (!this.net || this.useBot || !this.net.ready) return;
    const snap = serializeField(this.state);
    snap.worldItems = this.state.items.map((it) => ({ x: it.x, y: it.y }));
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

    // Keyboard nudge
    if (this._keys) {
      if (this._keys.has('ArrowUp') || this._keys.has('w') || this._keys.has('W')) this.pointerY = Math.max(0.06, this.pointerY - 1.2 * dt);
      if (this._keys.has('ArrowDown') || this._keys.has('s') || this._keys.has('S')) this.pointerY = Math.min(0.94, this.pointerY + 1.2 * dt);
    }
    // Move player toward pointer
    const target = this.pointerY;
    P.y += (target - P.y) * Math.min(1, 12 * dt);
    if (P.invuln > 0) P.invuln -= dt;
    if (P.activeTimer > 0) {
      P.activeTimer -= dt;
      if (P.activeTimer <= 0) {
        P.activePower = null;
        if (!this.ended) this.setStatus(P.items.length ? (POWERUPS.find(x => x.id === P.items[0])?.label || HINT) : HINT);
      }
    }

    // Auto fire
    P.fireCd -= dt;
    const fireRate = P.activePower === 'homing' ? 0.12 : 0.18;
    if (P.fireCd <= 0 && S.alive) {
      P.fireCd = fireRate;
      const by = P.y * fh;
      if (P.activePower === 'homing') {
        S.bullets.push(spawnBullet(P.x + 16, by, 320, 0, 'player', true, 2));
      } else {
        S.bullets.push(spawnBullet(P.x + 16, by, 420, 0, 'player', false, 1));
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
            e.hp -= 0.35;
          }
        }
      }
    }

    // Spawn enemies
    this._spawnAcc += dt;
    const spawnEvery = Math.max(0.45, 1.1 - S.time * 0.01);
    if (this._spawnAcc >= spawnEvery) {
      this._spawnAcc = 0;
      const roll = Math.random();
      const kind = roll > 0.92 ? 'elite' : roll > 0.55 ? 'swarm' : 'basic';
      S.enemies.push(spawnEnemy(fw, fh, kind));
    }
    this._bossAcc += dt;
    if (this._bossAcc > 45 && !S.enemies.some((e) => e.kind === 'boss')) {
      this._bossAcc = 0;
      S.enemies.push(spawnEnemy(fw, fh, 'boss'));
    }

    // Update enemies
    for (const e of S.enemies) {
      e.phase += dt * 2;
      e.x -= e.speed * dt;
      if (e.kind !== 'boss') e.y += Math.sin(e.phase) * 18 * dt;
      e.y = Math.max(16, Math.min(fh - 16, e.y));
      e.fireCd -= dt;
      if (e.fireCd <= 0 && e.x < fw) {
        e.fireCd = e.kind === 'boss' ? 0.55 : 1.4 + Math.random();
        S.bullets.push(spawnBullet(e.x - e.w * 0.4, e.y, -140 - Math.random() * 60, (Math.random() - 0.5) * 40, 'enemy', false, 1));
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
        P.hp = Math.max(0, P.hp - 8);
        P.invuln = 0.8;
        b.life = 0;
        S.fx.push(spawnExplosion(P.x, py, false));
      }
    }

    // Enemy body -> player
    for (const e of S.enemies) {
      const py = P.y * fh;
      if (P.invuln <= 0 && Math.abs(e.x - P.x) < e.w * 0.4 + 10 && Math.abs(e.y - py) < e.h * 0.4 + 8) {
        P.hp = Math.max(0, P.hp - 12);
        P.invuln = 1;
        e.hp -= 2;
        S.fx.push(spawnExplosion(P.x, py, true));
      }
    }

    // Collect items
    const leftItems = [];
    for (const it of S.items) {
      const py = P.y * fh;
      if (Math.abs(it.x - P.x) < 20 && Math.abs(it.y - py) < 20) {
        if (P.items.length < 5) P.items.push(it.id);
        const meta = POWERUPS.find((x) => x.id === it.id);
        if (meta) this.setStatus(meta.label);
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

    // Simple AI: track average enemy height / dodge
    let threatY = B.y;
    let nearest = null;
    let nd = 1e9;
    for (const e of B.enemies) {
      const d = e.x;
      if (d < nd) { nd = d; nearest = e; }
    }
    for (const b of B.bullets) {
      if (b.owner === 'enemy' && b.x < fw * 0.5) {
        if (Math.abs(b.y / fh - B.y) < 0.08) {
          threatY = B.y < 0.5 ? B.y + 0.2 : B.y - 0.2;
        }
      }
    }
    if (nearest) threatY = nearest.y / fh;
    const target = Math.max(0.1, Math.min(0.9, threatY + Math.sin(B.time) * 0.05));
    B.y += (target - B.y) * Math.min(1, 6 * dt);

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
        e.fireCd = 1.6;
        B.bullets.push(spawnBullet(e.x, e.y, -150, 0, 'enemy', false, 1));
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
    // Enemy hits bot
    for (const b of B.bullets) {
      if (b.owner !== 'enemy') continue;
      if (Math.abs(b.x - 48) < 14 && Math.abs(b.y - B.y * fh) < 12) {
        B.hp = Math.max(0, B.hp - 7);
        b.life = 0;
      }
    }
    for (const e of B.enemies) {
      if (Math.abs(e.x - 48) < e.w * 0.4 + 10 && Math.abs(e.y - B.y * fh) < e.h * 0.4 + 8) {
        B.hp = Math.max(0, B.hp - 10);
        e.hp = 0;
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
        this.state.player.hp = Math.max(0, this.state.player.hp - 6);
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
    this.setStatus(msg);
    this.ui.endMessage.textContent = msg;
    this.ui.endOverlay.classList.remove('hidden');
    if (this.net && !this.useBot) {
      this.net.send({ type: 'over', youWin: !won });
    }
  }
}
