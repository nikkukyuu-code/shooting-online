import { VERSION_LABEL } from './version.js?v=1.5.39';
import { Net } from './net.js?v=1.5.39';
import { Game } from './game.js?v=1.5.39';

const $ = (sel) => document.querySelector(sel);

const screens = {
  menu: $('#screen-menu'),
  game: $('#screen-game'),
};

const els = {
  btnCpu: $('#btn-cpu'),
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

function isHostingWaiting() {
  return !!(net && net.role === 'host' && !game);
}

function restoreStartButton() {
  els.btnStart.textContent = '入室';
  els.btnStart.disabled = false;
}

function setHostingWaitingUI(on) {
  if (on) {
    els.btnStart.textContent = '入室（相手用）';
    els.btnStart.disabled = true;
  } else {
    restoreStartButton();
  }
}

function setBusy(v) {
  busy = v;
  if (els.btnCpu) els.btnCpu.disabled = v;
  els.btnFind.disabled = v;
  els.btnCreate.disabled = v;
  // Keep Start disabled while host is waiting for a guest
  els.btnStart.disabled = v || isHostingWaiting();
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
  restoreStartButton();
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


els.btnCpu?.addEventListener('click', () => {
  if (busy) return;
  setBusy(true);
  cleanupGame();
  net = new Net();
  net.usingBot = true;
  els.fieldFind.value = 'CPU対戦';
  try {
    startGameSession({ bot: true });
    game.beginMatch();
  } catch (e) {
    console.error(e);
    els.fieldFind.value = '開始失敗';
    cleanupGame();
    show('menu');
  } finally {
    setBusy(false);
  }
});

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
      waitMs: 15000,
      onTick: (left) => {
        els.fieldFind.value = `待機中 ${Math.ceil(left / 1000)}秒`;
      },
    });
    els.fieldFind.value = result.mode === 'bot' ? 'CPU対戦' : 'マッチ成立';
    if (result.mode === 'peer') {
      // Register BEFORE startGameSession so hello/beginMatch race is avoided
      net.on('connected', () => {
        if (game && game.waiting) game.beginMatch();
      });
      startGameSession({ bot: false });
      if (net.ready) game.beginMatch();
    } else {
      startGameSession({ bot: true });
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
    els.fieldFind.value = '部屋コード表示中・相手待ち';
    setHostingWaitingUI(true);
    show('menu'); // stay on menu so host can read/share the room code
    // Only enter battle when a guest actually connects
    net.on('connected', () => {
      if (game) {
        if (game.waiting) game.beginMatch();
        return;
      }
      els.fieldFind.value = '相手が入室しました';
      startGameSession({ bot: false });
      if (net.ready) game.beginMatch();
    });
    if (net.ready) {
      // Guest already connected during create (rare)
      els.fieldFind.value = '相手が入室しました';
      startGameSession({ bot: false });
      game.beginMatch();
    }
  } catch (e) {
    console.error(e);
    els.fieldCode.value = '';
    alert('部屋を作成できませんでした。別の部屋名を試すか、しばらくしてから再度お試しください。');
    cleanupGame();
    restoreStartButton();
    show('menu');
  } finally {
    setBusy(false);
  }
});

els.btnStart.addEventListener('click', async () => {
  if (busy) return;
  // Host waiting for guest: do NOT destroy peer / self-join as guest
  if (net && net.role === 'host' && !game) {
    els.fieldFind.value = 'すでにホスト中・相手待ち（部屋コードを相手に伝えてください）';
    return;
  }
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
    net.on('connected', () => {
      if (game && game.waiting) game.beginMatch();
    });
    startGameSession({ bot: false });
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
