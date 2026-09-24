import { VERSION_LABEL } from './version.js?v=1.5.49';
import { Net } from './net.js?v=1.5.49';
import { Game } from './game.js?v=1.5.49';
import { CATALOG, CATALOG_BY_ID } from './catalog.js?v=1.5.49';
import { loadMeta, saveMeta, buyUnit, setDeckSlot, DECK_SIZE } from './meta.js?v=1.5.49';
import { registerEnemyKinds } from './render.js?v=1.5.49';
import { ALL_KIND_IDS } from './catalog.js?v=1.5.49';
import { setKindTier } from './entities.js?v=1.5.49';

registerEnemyKinds(ALL_KIND_IDS);
setKindTier(Object.fromEntries(ALL_KIND_IDS.map((id) => [id, (CATALOG_BY_ID[id] && CATALOG_BY_ID[id].tier) || id])));

const $ = (sel) => document.querySelector(sel);

const screens = {
  menu: $('#screen-menu'),
  game: $('#screen-game'),
  deck: $('#screen-deck'),
  shop: $('#screen-shop'),
};

const els = {
  btnCpu: $('#btn-cpu'),
  btnFind: $('#btn-find'),
  btnCreate: $('#btn-create'),
  btnStart: $('#btn-start'),
  btnDeck: $('#btn-deck'),
  btnShop: $('#btn-shop'),
  btnDeckBack: $('#btn-deck-back'),
  btnShopBack: $('#btn-shop-back'),
  fieldFind: $('#field-find-status'),
  fieldCode: $('#field-room-code'),
  inputRoom: $('#input-room-name'),
  btnStop: $('#btn-stop'),
  statusBar: $('#status-bar'),
  endOverlay: $('#end-overlay'),
  endMessage: $('#end-message'),
  btnAgain: $('#btn-again'),
  canvas: $('#game'),
  menuPt: $('#menu-pt'),
  shopPt: $('#shop-pt'),
  deckSlots: $('#deck-slots'),
  deckOwned: $('#deck-owned'),
  deckHint: $('#deck-hint'),
  shopList: $('#shop-list'),
};

let net = null;
let game = null;
let busy = false;
let selectedDeckSlot = 0;

function show(screen) {
  Object.values(screens).forEach((s) => s && s.classList.remove('active'));
  if (screens[screen]) screens[screen].classList.add('active');
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
  if (els.btnDeck) els.btnDeck.disabled = v;
  if (els.btnShop) els.btnShop.disabled = v;
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

function refreshPtDisplay(meta) {
  const m = meta || loadMeta();
  const label = `PT: ${m.pt.toLocaleString('ja-JP')}`;
  if (els.menuPt) els.menuPt.textContent = label;
  if (els.shopPt) els.shopPt.textContent = label;
}

function spriteUrl(id) {
  return `assets/enemies/${id}/0.png?v=1.5.49`;
}

function unitName(id) {
  return (CATALOG_BY_ID[id] && CATALOG_BY_ID[id].name) || id;
}

function renderDeckScreen() {
  const meta = loadMeta();
  refreshPtDisplay(meta);
  if (!els.deckSlots || !els.deckOwned) return;

  els.deckSlots.innerHTML = '';
  for (let i = 0; i < DECK_SIZE; i++) {
    const id = meta.deck[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'deck-slot' + (i === selectedDeckSlot ? ' selected' : '');
    btn.dataset.slot = String(i);
    btn.innerHTML = `
      <span class="slot-n">#${i + 1}</span>
      <img src="${spriteUrl(id)}" alt="" width="52" height="52" loading="lazy" />
      <span class="slot-name">${unitName(id)}</span>
    `;
    btn.addEventListener('click', () => {
      selectedDeckSlot = i;
      renderDeckScreen();
      if (els.deckHint) els.deckHint.textContent = `スロット ${i + 1} を選択中 — 下の所持ユニットをタップで入れ替え`;
    });
    els.deckSlots.appendChild(btn);
  }

  els.deckOwned.innerHTML = '';
  const ownedUnits = CATALOG.filter((u) => meta.owned.includes(u.id));
  for (const u of ownedUnits) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'unit-card' + (meta.deck.includes(u.id) ? ' in-deck' : '');
    btn.innerHTML = `
      <img src="${spriteUrl(u.id)}" alt="" width="52" height="52" loading="lazy" />
      <span class="unit-name">${u.name}</span>
      <span class="rarity ${u.rarity}">${u.rarity}</span>
    `;
    btn.addEventListener('click', () => {
      const res = setDeckSlot(loadMeta(), selectedDeckSlot, u.id);
      if (res.ok) {
        if (els.deckHint) els.deckHint.textContent = `スロット ${selectedDeckSlot + 1} を ${u.name} に変更`;
        renderDeckScreen();
        refreshPtDisplay(res.meta);
      }
    });
    els.deckOwned.appendChild(btn);
  }
}

function renderShopScreen() {
  const meta = loadMeta();
  refreshPtDisplay(meta);
  if (!els.shopList) return;
  els.shopList.innerHTML = '';

  // Sort: unowned by price asc, then owned
  const list = [...CATALOG].sort((a, b) => {
    const ao = meta.owned.includes(a.id) ? 1 : 0;
    const bo = meta.owned.includes(b.id) ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return a.price - b.price;
  });

  for (const u of list) {
    const owned = meta.owned.includes(u.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'unit-card' + (owned ? ' owned' : '');
    btn.disabled = owned;
    const priceLabel = owned ? '所持済' : (u.price <= 0 ? '無料' : `${u.price} PT`);
    btn.innerHTML = `
      ${owned ? '<span class="unit-badge">OWN</span>' : ''}
      <img src="${spriteUrl(u.id)}" alt="" width="64" height="64" loading="lazy" />
      <span class="unit-name">${u.name}</span>
      <span class="rarity ${u.rarity}">${u.rarity}</span>
      <span class="unit-price">${priceLabel}</span>
    `;
    if (!owned) {
      btn.addEventListener('click', () => {
        const cur = loadMeta();
        if (cur.pt < u.price) {
          alert(`PTが足りません（必要 ${u.price} / 所持 ${cur.pt}）`);
          return;
        }
        const res = buyUnit(cur, u.id);
        if (res.ok) {
          refreshPtDisplay(res.meta);
          renderShopScreen();
        } else if (res.reason === 'pt') {
          alert('PTが足りません');
        }
      });
    }
    els.shopList.appendChild(btn);
  }
}

function goMenu() {
  cleanupGame();
  setBusy(false);
  els.fieldFind.value = '';
  els.fieldCode.value = '';
  restoreStartButton();
  refreshPtDisplay();
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
    show('menu');
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

els.btnDeck?.addEventListener('click', () => {
  if (busy) return;
  selectedDeckSlot = 0;
  renderDeckScreen();
  show('deck');
});

els.btnShop?.addEventListener('click', () => {
  if (busy) return;
  renderShopScreen();
  show('shop');
});

els.btnDeckBack?.addEventListener('click', () => {
  refreshPtDisplay();
  show('menu');
});

els.btnShopBack?.addEventListener('click', () => {
  refreshPtDisplay();
  show('menu');
});

window.addEventListener('shooting-meta-updated', (ev) => {
  refreshPtDisplay(ev.detail || loadMeta());
});

document.addEventListener('touchmove', (e) => {
  if (screens.game.classList.contains('active')) e.preventDefault();
}, { passive: false });

window.addEventListener('load', () => {
  // Ensure starters persisted
  saveMeta(loadMeta());
  refreshPtDisplay();
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
