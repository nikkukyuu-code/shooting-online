/**
 * PeerJS networking for room create / join / quick-match.
 * Falls back to local bot if no peer within timeout.
 */

const PREFIX = 'shooting-online-v1-';

function roomPeerId(name) {
  const clean = String(name || '').trim().toLowerCase().replace(/[^a-z0-9\-_\u3040-\u30ff\u4e00-\u9fff]/g, '').slice(0, 12);
  return PREFIX + (clean || 'lobby') + '-' + hash(clean || 'lobby');
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function randomRoomName() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return String(n);
}

export class Net {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.role = null; // 'host' | 'guest'
    this.roomName = '';
    this.handlers = {};
    this.ready = false;
    this.usingBot = false;
  }

  on(ev, fn) {
    this.handlers[ev] = fn;
  }

  emit(ev, data) {
    if (this.handlers[ev]) this.handlers[ev](data);
  }

  destroy() {
    try { if (this.conn) this.conn.close(); } catch (_) {}
    try { if (this.peer) this.peer.destroy(); } catch (_) {}
    this.conn = null;
    this.peer = null;
    this.ready = false;
    this.usingBot = false;
  }

  _ensurePeerLib() {
    if (typeof Peer === 'undefined') {
      throw new Error('PeerJS が読み込まれていません');
    }
  }

  async createRoom(preferredName) {
    this.destroy();
    this._ensurePeerLib();
    this.role = 'host';
    this.roomName = (preferredName && preferredName.trim()) || randomRoomName();
    const id = roomPeerId(this.roomName);
    this.peer = new Peer(id, { debug: 0 });
    await this._waitOpen(this.peer);
    this.emit('status', { room: this.roomName, role: 'host', msg: '部屋を作成しました: ' + this.roomName });
    this.peer.on('connection', (c) => this._bindConn(c));
    this.peer.on('error', (e) => this.emit('error', e));
    return this.roomName;
  }

  async joinRoom(name) {
    this.destroy();
    this._ensurePeerLib();
    if (!name || !String(name).trim()) throw new Error('部屋名を入力してください');
    this.role = 'guest';
    this.roomName = String(name).trim();
    const id = roomPeerId(this.roomName);
    this.peer = new Peer(undefined, { debug: 0 });
    await this._waitOpen(this.peer);
    const c = this.peer.connect(id, { reliable: true });
    await this._waitConnOpen(c);
    this._bindConn(c);
    this.emit('status', { room: this.roomName, role: 'guest', msg: '入室しました: ' + this.roomName });
    return this.roomName;
  }

  /** Quick match: try shared lobby host, else become host and wait, then bot. */
  async findOpponent({ waitMs = 12000, onTick } = {}) {
    this.destroy();
    this._ensurePeerLib();
    const lobby = 'quick';
    // Try join first
    try {
      this.role = 'guest';
      this.roomName = lobby;
      this.peer = new Peer(undefined, { debug: 0 });
      await this._waitOpen(this.peer);
      const c = this.peer.connect(roomPeerId(lobby), { reliable: true });
      const opened = await Promise.race([
        this._waitConnOpen(c).then(() => true),
        sleep(2500).then(() => false),
      ]);
      if (opened) {
        this._bindConn(c);
        this.emit('status', { room: lobby, role: 'guest', msg: '対戦相手が見つかりました' });
        return { mode: 'peer', room: lobby };
      }
      try { c.close(); } catch (_) {}
      try { this.peer.destroy(); } catch (_) {}
    } catch (_) {
      try { this.peer && this.peer.destroy(); } catch (_) {}
    }

    // Become lobby host and wait
    this.role = 'host';
    this.roomName = lobby;
    try {
      this.peer = new Peer(roomPeerId(lobby), { debug: 0 });
      await this._waitOpen(this.peer);
    } catch (e) {
      // Lobby taken — try join again briefly
      this.peer = new Peer(undefined, { debug: 0 });
      await this._waitOpen(this.peer);
      const c = this.peer.connect(roomPeerId(lobby), { reliable: true });
      await this._waitConnOpen(c);
      this._bindConn(c);
      this.role = 'guest';
      return { mode: 'peer', room: lobby };
    }

    this.emit('status', { room: lobby, role: 'host', msg: '対戦相手を探しています…' });
    let connected = false;
    this.peer.on('connection', (c) => {
      this._bindConn(c);
      connected = true;
    });
    this.peer.on('error', (e) => this.emit('error', e));

    const start = Date.now();
    while (Date.now() - start < waitMs) {
      if (onTick) onTick(Math.max(0, waitMs - (Date.now() - start)));
      if (connected && this.ready) {
        this.emit('status', { room: lobby, role: 'host', msg: '対戦相手が見つかりました' });
        return { mode: 'peer', room: lobby };
      }
      await sleep(200);
    }

    // Bot fallback
    this.usingBot = true;
    this.emit('status', { room: lobby, role: 'host', msg: 'CPU対戦を開始します' });
    this.emit('connected', { bot: true });
    this.ready = true;
    return { mode: 'bot', room: lobby };
  }

  send(msg) {
    if (this.usingBot) return;
    if (this.conn && this.conn.open) {
      try { this.conn.send(msg); } catch (_) {}
    }
  }

  _bindConn(c) {
    if (this.conn && this.conn !== c) {
      try { this.conn.close(); } catch (_) {}
    }
    this.conn = c;
    c.on('open', () => {
      this.ready = true;
      this.emit('connected', { bot: false });
    });
    c.on('data', (data) => this.emit('data', data));
    c.on('close', () => {
      this.ready = false;
      this.emit('disconnected');
    });
    c.on('error', (e) => this.emit('error', e));
    if (c.open) {
      this.ready = true;
      this.emit('connected', { bot: false });
    }
  }

  _waitOpen(peer) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Peer 接続タイムアウト')), 12000);
      peer.on('open', (id) => { clearTimeout(t); resolve(id); });
      peer.on('error', (e) => { clearTimeout(t); reject(e); });
    });
  }

  _waitConnOpen(conn) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('相手への接続タイムアウト')), 10000);
      conn.on('open', () => { clearTimeout(t); resolve(); });
      conn.on('error', (e) => { clearTimeout(t); reject(e); });
    });
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export { randomRoomName };
