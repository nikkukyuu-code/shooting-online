import { VERSION_LABEL } from './version.js?v=1.5.51';
import { Net } from './net.js?v=1.5.51';
import { Game } from './game.js?v=1.5.51';
import { CATALOG, CATALOG_BY_ID, unitIntro, RARITY_JA } from './catalog.js?v=1.5.51';
import { loadMeta, saveMeta, buyUnit, setDeckSlot, DECK_SIZE } from './meta.js?v=1.5.51';
import { registerEnemyKinds } from './render.js?v=1.5.51';
import { ALL_KIND_IDS } from './catalog.js?v=1.5.51';
import { setKindTier, POWERUPS } from './entities.js?v=1.5.51';

registerEnemyKinds(ALL_KIND_IDS);
setKindTier(Object.fromEntries(ALL_KIND_IDS.map((id) => [id, (CATALOG_BY_ID[id] && CATALOG_BY_ID[id].tier) || id])));

const $ = (sel) => document.querySelector(sel);

const screens = {
  menu: $('#screen-menu'),
  game: $('#screen-game'),
  deck: $('#screen-deck'),
  shop: $('#screen-shop'),
  zukan: $('#screen-zukan'),
};

const els = {
  btnCpu: $('#btn-cpu'),
  btnFind: $('#btn-find'),
  btnCreate: $('#btn-create'),
  btnStart: $('#btn-start'),
  btnDeck: $('#btn-deck'),
  btnShop: $('#btn-shop'),
  btnZukan: $('#btn-zukan'),
  btnDeckBack: $('#btn-deck-back'),
  btnShopBack: $('#btn-shop-back'),
  btnZukanBack: $('#btn-zukan-back'),
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
  deckDetail: $('#deck-detail'),
  deckItemsList: $('#deck-items-list'),
  shopList: $('#shop-list'),
  shopDetail: $('#shop-detail'),
  shopItemsList: $('#shop-items-list'),
  zukanUnits: $('#zukan-units'),
  zukanItems: $('#zukan-items'),
  zukanUnitDetail: $('#zukan-unit-detail'),
  zukanTabUnits: $('#zukan-tab-units'),
  zukanTabItems: $('#zukan-tab-items'),
};

let net = null;
let game = null;
let busy = false;
let selectedDeckSlot = 0;
let selectedShopId = null;
let selectedZukanId = null;

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
  if (els.btnZukan) els.btnZukan.disabled = v;
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
  return `assets/enemies/${id}/0.png?v=1.5.51`;
}

function unitName(id) {
  return (CATALOG_BY_ID[id] && CATALOG_BY_ID[id].name) || id;
}

function rarityLabel(r) {
  return RARITY_JA[r] || r || '';
}

function renderUnitDetail(container, unitId, opts = {}) {
  if (!container) return;
  if (!unitId) {
    container.innerHTML = `<p class="detail-empty">${opts.empty || 'ユニットを選択すると攻撃パターンを表示します'}</p>`;
    return;
  }
  const intro = unitIntro(unitId);
  const price = opts.showPrice && CATALOG_BY_ID[unitId]
    ? `<span class="detail-price">${CATALOG_BY_ID[unitId].price <= 0 ? '無料' : `${CATALOG_BY_ID[unitId].price} PT`}</span>`
    : '';
  container.innerHTML = `
    <div class="detail-sprite">
      <img src="${spriteUrl(unitId)}" alt="" width="96" height="96" />
    </div>
    <div class="detail-body">
      <div class="detail-name">${intro.name}</div>
      <div class="detail-meta">
        <span class="rarity ${intro.rarity}">${rarityLabel(intro.rarity)}</span>
        <span class="detail-role">${intro.role}</span>
        ${price}
      </div>
      <div class="detail-attack"><span class="detail-label">攻撃</span>${intro.attack}</div>
      <p class="detail-blurb">${intro.blurb}</p>
    </div>
  `;
}

function renderItemsIntro(container) {
  if (!container) return;
  container.innerHTML = '';
  for (const p of POWERUPS) {
    const row = document.createElement('div');
    row.className = 'item-intro-row';
    row.innerHTML = `
      <span class="item-intro-icon" style="background:${p.color}">${p.icon}</span>
      <div class="item-intro-text">
        <div class="item-intro-name">${p.label}</div>
        <div class="item-intro-effect">${p.effect}</div>
        <p class="item-intro-desc">${p.desc || p.effect}</p>
      </div>
    `;
    container.appendChild(row);
  }
}

function renderDeckScreen() {
  const meta = loadMeta();
  refreshPtDisplay(meta);
  if (!els.deckSlots || !els.deckOwned) return;

  const selectedId = meta.deck[selectedDeckSlot];
  renderUnitDetail(els.deckDetail, selectedId, {
    empty: 'スロットを選ぶと攻撃パターンを表示します',
  });

  els.deckSlots.innerHTML = '';
  for (let i = 0; i < DECK_SIZE; i++) {
    const id = meta.deck[i];
    const intro = unitIntro(id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'deck-slot' + (i === selectedDeckSlot ? ' selected' : '');
    btn.dataset.slot = String(i);
    btn.setAttribute('aria-label', `スロット${i + 1} ${unitName(id)}`);
    btn.innerHTML = `
      <span class="slot-n">スロット ${i + 1}</span>
      <img src="${spriteUrl(id)}" alt="" width="72" height="72" loading="lazy" />
      <span class="slot-name">${unitName(id)}</span>
      <span class="slot-attack">${intro.attack.split('／')[0]}</span>
    `;
    btn.addEventListener('click', () => {
      selectedDeckSlot = i;
      renderDeckScreen();
      if (els.deckHint) {
        els.deckHint.textContent = `スロット ${i + 1} を選択中 — 下の所持ユニットをタップで入れ替え（重複不可）`;
      }
    });
    els.deckSlots.appendChild(btn);
  }

  els.deckOwned.innerHTML = '';
  const ownedUnits = CATALOG.filter((u) => meta.owned.includes(u.id));
  for (const u of ownedUnits) {
    const inDeck = meta.deck.includes(u.id);
    const deckSlot = meta.deck.indexOf(u.id);
    const intro = unitIntro(u.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'unit-card' + (inDeck ? ' in-deck' : '');
    btn.innerHTML = `
      ${inDeck ? `<span class="unit-badge">スロット${deckSlot + 1}</span>` : ''}
      <img src="${spriteUrl(u.id)}" alt="" width="64" height="64" loading="lazy" />
      <span class="unit-name">${u.name}</span>
      <span class="unit-attack-chip">${intro.attack.split('／')[0]}</span>
      <span class="rarity ${u.rarity}">${rarityLabel(u.rarity)}</span>
    `;
    btn.addEventListener('click', () => {
      const res = setDeckSlot(loadMeta(), selectedDeckSlot, u.id);
      if (res.ok) {
        if (els.deckHint) {
          if (res.reason === 'swap') {
            els.deckHint.textContent = `${u.name} はスロット ${(res.swappedFrom ?? 0) + 1} にあったため入れ替えました`;
          } else if (res.reason === 'same') {
            els.deckHint.textContent = `${u.name} はすでにスロット ${selectedDeckSlot + 1} です`;
          } else {
            els.deckHint.textContent = `スロット ${selectedDeckSlot + 1} を ${u.name} に変更`;
          }
        }
        renderDeckScreen();
        refreshPtDisplay(res.meta);
      }
    });
    els.deckOwned.appendChild(btn);
  }

  renderItemsIntro(els.deckItemsList);
}

function renderShopScreen() {
  const meta = loadMeta();
  refreshPtDisplay(meta);
  if (!els.shopList) return;

  if (!selectedShopId) {
    const first = CATALOG.find((u) => !meta.owned.includes(u.id)) || CATALOG[0];
    selectedShopId = first ? first.id : null;
  }
  renderUnitDetail(els.shopDetail, selectedShopId, { showPrice: true });

  els.shopList.innerHTML = '';

  const list = [...CATALOG].sort((a, b) => {
    const ao = meta.owned.includes(a.id) ? 1 : 0;
    const bo = meta.owned.includes(b.id) ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return a.price - b.price;
  });

  for (const u of list) {
    const owned = meta.owned.includes(u.id);
    const intro = unitIntro(u.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'unit-card' + (owned ? ' owned' : '') + (selectedShopId === u.id ? ' selected-card' : '');
    const priceLabel = owned ? '所持済' : (u.price <= 0 ? '無料' : `${u.price} PT`);
    btn.innerHTML = `
      ${owned ? '<span class="unit-badge">所持</span>' : ''}
      <img src="${spriteUrl(u.id)}" alt="" width="72" height="72" loading="lazy" />
      <span class="unit-name">${u.name}</span>
      <span class="unit-attack-chip">${intro.attack.split('／')[0]}</span>
      <span class="rarity ${u.rarity}">${rarityLabel(u.rarity)}</span>
      <span class="unit-price">${priceLabel}</span>
    `;
    btn.addEventListener('click', () => {
      selectedShopId = u.id;
      if (owned) {
        renderShopScreen();
        return;
      }
      const cur = loadMeta();
      if (cur.pt < u.price) {
        alert(`PTが足りません（必要 ${u.price} / 所持 ${cur.pt}）`);
        renderShopScreen();
        return;
      }
      const res = buyUnit(cur, u.id);
      if (res.ok) {
        refreshPtDisplay(res.meta);
        renderShopScreen();
      } else if (res.reason === 'pt') {
        alert('PTが足りません');
        renderShopScreen();
      } else {
        renderShopScreen();
      }
    });
    btn.dataset.id = u.id;
    els.shopList.appendChild(btn);
  }

  renderItemsIntro(els.shopItemsList);
}

function renderZukanScreen() {
  if (!selectedZukanId) selectedZukanId = CATALOG[0]?.id || null;
  renderUnitDetail(els.zukanUnitDetail, selectedZukanId);

  if (els.zukanUnits) {
    els.zukanUnits.innerHTML = '';
    for (const u of CATALOG) {
      const intro = unitIntro(u.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'unit-card' + (selectedZukanId === u.id ? ' selected-card' : '');
      btn.innerHTML = `
        <img src="${spriteUrl(u.id)}" alt="" width="72" height="72" loading="lazy" />
        <span class="unit-name">${u.name}</span>
        <span class="unit-attack-chip">${intro.attack.split('／')[0]}</span>
        <span class="rarity ${u.rarity}">${rarityLabel(u.rarity)}</span>
      `;
      btn.addEventListener('click', () => {
        selectedZukanId = u.id;
        renderZukanScreen();
      });
      els.zukanUnits.appendChild(btn);
    }
  }
  renderItemsIntro(els.zukanItems);
}

function setZukanTab(tab) {
  const units = tab === 'units';
  els.zukanTabUnits?.classList.toggle('active', units);
  els.zukanTabItems?.classList.toggle('active', !units);
  els.zukanUnits?.classList.toggle('hidden', !units);
  els.zukanUnitDetail?.classList.toggle('hidden', !units);
  els.zukanItems?.classList.toggle('hidden', units);
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
  selectedShopId = null;
  renderShopScreen();
  show('shop');
});

els.btnZukan?.addEventListener('click', () => {
  if (busy) return;
  selectedZukanId = CATALOG[0]?.id || null;
  setZukanTab('units');
  renderZukanScreen();
  show('zukan');
});

els.btnDeckBack?.addEventListener('click', () => {
  refreshPtDisplay();
  show('menu');
});

els.btnShopBack?.addEventListener('click', () => {
  refreshPtDisplay();
  show('menu');
});

els.btnZukanBack?.addEventListener('click', () => {
  show('menu');
});

els.zukanTabUnits?.addEventListener('click', () => {
  setZukanTab('units');
});
els.zukanTabItems?.addEventListener('click', () => {
  setZukanTab('items');
});

window.addEventListener('shooting-meta-updated', (ev) => {
  refreshPtDisplay(ev.detail || loadMeta());
});

document.addEventListener('touchmove', (e) => {
  if (screens.game.classList.contains('active')) e.preventDefault();
}, { passive: false });

window.addEventListener('load', () => {
  // Ensure starters persisted + duplicate decks cleaned
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
