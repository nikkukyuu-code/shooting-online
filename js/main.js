import { VERSION_LABEL } from './version.js?v=1.5.6';
import { Net } from './net.js?v=1.5.6';
import { Game } from './game.js?v=1.5.6';

const $ = (sel) => document.querySelector(sel);

const screens = {
  menu: $('#screen-menu'),
  game: $('#screen-game'),
};

const els = {
  btnFind: $('#btn-find'),
  btnCreate: $('#btn-create'),
  btnStart: $('#btn-start'),
  fieldFind: $('#field-find-status'),
  fieldCode: $('#field-room-code'),
  inputRoom: $('#input-room-name'),
  btnStop: $('#btn-stop'),
  statusBar: $('#status-bar'),
  endOverlay: $('#end-overlay'),
  endMessage: $('#end-message'),
  btnAgain: $('#btn-again'),
  canvas: $('#game'),
};

let net = null;
let game = null;
let busy = false;

function show(screen) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[screen].classList.add('active');
}

function setBusy(v) {
  busy = v;
  els.btnFind.disabled = v;
  els.btnCreate.disabled = v;
  els.btnStart.disabled = v;
}

function cleanupGame() {
  if (game) {
    game.destroy();
    game = null;
  }
  if (net) {
    try { net.destroy(); } catch (_) {}
    net = null;
  }
}

function goMenu() {
  cleanupGame();
  setBusy(false);
  els.fieldFind.value = '';
  els.fieldCode.value = '';
  show('menu');
}

function startGameSession({ bot = false } = {}) {
  show('game');
  els.endOverlay.classList.add('hidden');
  game = new Game(els.canvas, {
    statusBar: els.statusBar,
    endOverlay: els.endOverlay,
    endMessage: els.endMessage,
  });
  game.start({ net, bot });
}

els.btnFind.addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  els.fieldFind.value = '検索中…';
  cleanupGame();
  net = new Net();
  net.on('status', (s) => {
    els.fieldFind.value = s.msg || '';
  });
  net.on('error', (e) => {
    els.fieldFind.value = 'エラー: ' + (e?.type || e?.message || '接続失敗');
  });
  try {
    const result = await net.findOpponent({
      waitMs: 3000,
      onTick: (left) => {
        els.fieldFind.value = `待機中 ${Math.ceil(left / 1000)}秒`;
      },
    });
    els.fieldFind.value = result.mode === 'bot' ? 'CPU対戦' : 'マッチ成立';
    startGameSession({ bot: result.mode === 'bot' });
    if (result.mode === 'peer') {
      // begin when connected
      net.on('connected', () => {
        if (game && game.waiting) game.beginMatch();
      });
      if (net.ready) game.beginMatch();
    } else {
      game.beginMatch();
    }
  } catch (e) {
    console.error(e);
    els.fieldFind.value = '失敗したのでCPU対戦';
    net.usingBot = true;
    startGameSession({ bot: true });
    game.beginMatch();
  } finally {
    setBusy(false);
  }
});

els.btnCreate.addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  cleanupGame();
  net = new Net();
  try {
    const preferred = els.inputRoom.value.trim();
    const room = await net.createRoom(preferred);
    els.fieldCode.value = room;
    els.inputRoom.value = room;
    els.fieldFind.value = '参加者待ち';
    startGameSession({ bot: false });
    // Wait for guest — show waiting status
    net.on('connected', () => {
      if (game) game.beginMatch();
    });
    // Optional: after long wait offer bot
    setTimeout(() => {
      if (game && game.waiting && net && !net.ready) {
        // stay waiting — user can stop
      }
    }, 20000);
  } catch (e) {
    console.error(e);
    els.fieldCode.value = '';
    alert('部屋を作成できませんでした。別の部屋名を試すか、しばらくしてから再度お試しください。');
    cleanupGame();
    show('menu');
  } finally {
    setBusy(false);
  }
});

els.btnStart.addEventListener('click', async () => {
  if (busy) return;
  const name = els.inputRoom.value.trim();
  if (!name) {
    els.inputRoom.focus();
    els.fieldFind.value = '部屋名を入力';
    return;
  }
  setBusy(true);
  cleanupGame();
  net = new Net();
  try {
    els.fieldFind.value = '入室中…';
    await net.joinRoom(name);
    els.fieldCode.value = name;
    els.fieldFind.value = '入室OK';
    startGameSession({ bot: false });
    net.on('connected', () => {
      if (game) game.beginMatch();
    });
    if (net.ready) game.beginMatch();
  } catch (e) {
    console.error(e);
    els.fieldFind.value = '入室失敗';
    alert('部屋に入れませんでした。部屋名を確認するか、先に「部屋を作る」側を起動してください。');
    cleanupGame();
    show('menu');
  } finally {
    setBusy(false);
  }
});

els.btnStop.addEventListener('click', () => {
  goMenu();
});

els.btnAgain.addEventListener('click', () => {
  goMenu();
});

// Prevent pull-to-refresh / page scroll on mobile
document.addEventListener('touchmove', (e) => {
  if (screens.game.classList.contains('active')) e.preventDefault();
}, { passive: false });

// Warm PeerJS
window.addEventListener('load', () => {
  show('menu');
});


async function loadVisits() {
  const verEl = document.getElementById('app-version');
  const gameVer = document.getElementById('game-version');
  if (verEl) verEl.textContent = VERSION_LABEL;
  if (gameVer) gameVer.textContent = VERSION_LABEL;
  const el = document.getElementById('app-visits');
  if (!el) return;
  try {
    const r = await fetch('https://abacus.jasoncameron.dev/hit/nikkukyuu/shooting-online', { cache: 'no-store' });
    if (!r.ok) throw new Error('counter ' + r.status);
    const d = await r.json();
    const n = typeof d.value === 'number' ? d.value : Number(d.value);
    el.textContent = 'アクセス ' + (Number.isFinite(n) ? n.toLocaleString('ja-JP') : '—');
  } catch (e) {
    try {
      const key = 'shooting-online-local-visits';
      const n = (Number(localStorage.getItem(key)) || 0) + 1;
      localStorage.setItem(key, String(n));
      el.textContent = 'アクセス(端末) ' + n.toLocaleString('ja-JP');
    } catch (_) {
      el.textContent = 'アクセス —';
    }
  }
}
loadVisits();
