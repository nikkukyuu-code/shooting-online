import { VERSION_LABEL, BUILD_NOTE, BUILD_TIME, formatVersionTime } from './version.js?v=20260926014346';
import { Net } from './net.js?v=20260926014346';
import { Game } from './game.js?v=20260926014346';
import { CATALOG, CATALOG_BY_ID, unitIntro, RARITY_JA } from './catalog.js?v=20260926014346';
import { loadMeta, saveMeta, buyUnit, setDeckSlot, DECK_SIZE } from './meta.js?v=20260926014346';
import { registerEnemyKinds } from './render.js?v=20260926014346';
import { ALL_KIND_IDS } from './catalog.js?v=20260926014346';
import { setKindTier, POWERUPS, WAVE_KIND_TIERS } from './entities.js?v=20260926014346';

registerEnemyKinds(ALL_KIND_IDS);
setKindTier({
  ...Object.fromEntries(ALL_KIND_IDS.map((id) => [id, (CATALOG_BY_ID[id] && CATALOG_BY_ID[id].tier) || id])),
  ...WAVE_KIND_TIERS,
});

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
  btnTutorial: $('#btn-tutorial'),
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
  btnShopBuy: $('#btn-shop-buy'),
  shopMsg: $('#shop-msg'),
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
    els.btnStart.textContent = '相手の入室待ち';
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
  return `assets/enemies/${id}/0.png?v=20260926014346`;
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
      <img src="${spriteUrl(unitId)}" alt="" width="72" height="72" />
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
  const note = document.createElement('p');
  note.className = 'items-intro-note';
  note.textContent = '戦闘中の所持は最大3つ。枠が埋まっているときに拾うと、そのアイテムは消えます（回復は即時なので枠を使いません）。';
  container.appendChild(note);
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
    btn.setAttribute('aria-label', `装備中 スロット${i + 1} ${unitName(id)}`);
    btn.innerHTML = `
      <span class="slot-equipped">装備中 · ${i + 1}</span>
      <div class="slot-art"><img src="${spriteUrl(id)}" alt="" width="56" height="56" loading="lazy" /></div>
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
    if (u.rarity) btn.dataset.rarity = u.rarity;
    btn.innerHTML = `
      ${inDeck ? `<span class="unit-badge equipped">装備中<span class="unit-badge-slot">スロット${deckSlot + 1}</span></span>` : ''}
      <div class="unit-art"><img src="${spriteUrl(u.id)}" alt="" width="64" height="64" loading="lazy" /></div>
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

function clearShopMsg() {
  if (!els.shopMsg) return;
  els.shopMsg.textContent = '';
  els.shopMsg.hidden = true;
}

function showShopMsg(text) {
  if (!els.shopMsg) return;
  els.shopMsg.textContent = text;
  els.shopMsg.hidden = false;
}

function updateShopBuyButton(meta) {
  const btn = els.btnShopBuy;
  if (!btn) return;
  const u = selectedShopId ? CATALOG_BY_ID[selectedShopId] : null;
  if (!u) {
    btn.disabled = true;
    btn.textContent = '購入';
    return;
  }
  if (meta.owned.includes(u.id)) {
    btn.disabled = true;
    btn.textContent = '所持済';
    return;
  }
  btn.disabled = false;
  btn.textContent = u.price <= 0 ? '入手（無料）' : `購入（${u.price} PT）`;
}

function buySelectedShopUnit() {
  const u = selectedShopId ? CATALOG_BY_ID[selectedShopId] : null;
  if (!u) return;
  const cur = loadMeta();
  if (cur.owned.includes(u.id)) return;
  if (cur.pt < u.price) {
    showShopMsg(`ポイントが足りません（あと ${u.price - cur.pt} PT）`);
    return;
  }
  const res = buyUnit(cur, u.id);
  clearShopMsg();
  if (res.ok) refreshPtDisplay(res.meta);
  renderShopScreen();
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
  updateShopBuyButton(meta);

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
    if (u.rarity) btn.dataset.rarity = u.rarity;
    const priceLabel = owned ? '所持済' : (u.price <= 0 ? '無料' : `${u.price} PT`);
    btn.innerHTML = `
      ${owned ? '<span class="unit-badge">所持</span>' : ''}
      <div class="unit-art"><img src="${spriteUrl(u.id)}" alt="" width="72" height="72" loading="lazy" /></div>
      <span class="unit-name">${u.name}</span>
      <span class="unit-attack-chip">${intro.attack.split('／')[0]}</span>
      <span class="rarity ${u.rarity}">${rarityLabel(u.rarity)}</span>
      <span class="unit-price">${priceLabel}</span>
    `;
    btn.addEventListener('click', () => {
      // Selecting only shows details — purchase happens via the 購入 button.
      selectedShopId = u.id;
      clearShopMsg();
      renderShopScreen();
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
      if (u.rarity) btn.dataset.rarity = u.rarity;
      btn.innerHTML = `
        <div class="unit-art"><img src="${spriteUrl(u.id)}" alt="" width="72" height="72" loading="lazy" /></div>
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


els.btnTutorial?.addEventListener('click', () => {
  try { localStorage.removeItem('shootingOnline_tutorialDone'); } catch (_) {}
  if (busy) return;
  setBusy(true);
  cleanupGame();
  net = new Net();
  net.usingBot = true;
  els.fieldFind.value = 'チュートリアル（CPU）';
  try {
    startGameSession({ bot: true });
    if (game) game._forceTutorial = true;
    game.beginMatch();
    // bot path already schedules maybeStartTutorial; force flag ensures it shows
    if (game) game.maybeStartTutorial(true);
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
    if (result.mode === 'peer') {
      els.fieldFind.value = 'マッチ成立';
      net.on('connected', () => {
        if (game && game.waiting) game.beginMatch();
      });
      startGameSession({ bot: false });
      if (net.ready) game.beginMatch();
    } else {
      // No human opponent — stay on menu (do not start COM)
      els.fieldFind.value = '今は対戦相手がいません';
      cleanupGame();
      show('menu');
    }
  } catch (e) {
    console.error(e);
    els.fieldFind.value = '対戦相手を見つけられませんでした';
    cleanupGame();
    show('menu');
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
    els.fieldFind.value = '相手の入室待ち';
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
    els.fieldFind.value = '相手の入室待ち（部屋コードを相手に伝えてください）';
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
  clearShopMsg();
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

els.btnShopBuy?.addEventListener('click', () => {
  buySelectedShopUnit();
});

els.btnShopBack?.addEventListener('click', () => {
  clearShopMsg();
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

/** 公開から5分以内は「最新」バッジ付きで目立たせる（30秒ごと／復帰時に再判定）。 */
const LATEST_WINDOW_MS = 5 * 60 * 1000;
let versionBadgeTimer = null;

function isFreshBuild(now = Date.now()) {
  const t = Number(BUILD_TIME);
  return Number.isFinite(t) && t > 0 && now - t >= -60 * 1000 && now - t < LATEST_WINDOW_MS;
}

function renderVersionBadge() {
  const fresh = isFreshBuild();
  const verEl = document.getElementById('app-version');
  const gameVer = document.getElementById('game-version');
  if (verEl) {
    verEl.classList.toggle('ver-latest', fresh);
    if (fresh) {
      verEl.innerHTML = '';
      const label = document.createElement('span');
      label.textContent = formatVersionTime();
      const badge = document.createElement('span');
      badge.className = 'ver-badge';
      badge.textContent = '最新';
      verEl.append(label, badge);
      if (BUILD_NOTE) {
        const note = document.createElement('span');
        note.className = 'ver-note';
        note.textContent = BUILD_NOTE;
        verEl.append(note);
      }
      verEl.title = `${VERSION_LABEL} — 最新版（公開から5分以内）${BUILD_NOTE ? ' / ' + BUILD_NOTE : ''}`;
    } else {
      verEl.textContent = formatVersionTime();
      verEl.title = BUILD_NOTE ? `${VERSION_LABEL} — ${BUILD_NOTE}` : VERSION_LABEL;
    }
  }
  if (gameVer) {
    gameVer.classList.toggle('ver-latest', fresh);
    gameVer.textContent = fresh ? `${formatVersionTime()} · 最新` : formatVersionTime();
  }
  return fresh;
}

function startVersionBadge() {
  const tick = () => {
    const fresh = renderVersionBadge();
    if (!fresh && versionBadgeTimer) {
      clearInterval(versionBadgeTimer);
      versionBadgeTimer = null;
    }
  };
  if (renderVersionBadge() && !versionBadgeTimer) {
    versionBadgeTimer = setInterval(tick, 30 * 1000);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}

async function loadVisits() {
  startVersionBadge();
  const el = document.getElementById('app-visits');
  if (!el) return;
  const LAST_KEY = 'shootingOnline_visitLast';
  const readLast = () => {
    try {
      const n = Number(localStorage.getItem(LAST_KEY));
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    } catch (_) {
      return 0;
    }
  };
  const writeLast = (n) => {
    try {
      const prev = readLast();
      if (n > prev) localStorage.setItem(LAST_KEY, String(n));
    } catch (_) { /* ignore */ }
  };
  const show = (n, suffix = '') => {
    el.textContent = 'アクセス' + suffix + ' ' + n.toLocaleString('ja-JP');
  };
  const last = readLast();
  if (last > 0) show(last); // keep previous visible while fetching
  try {
    const url = 'https://abacus.jasoncameron.dev/hit/nikkukyuu/shooting-online?_=' + Date.now();
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('counter ' + r.status);
    const d = await r.json();
    const n = typeof d.value === 'number' ? d.value : Number(d.value);
    if (!Number.isFinite(n)) throw new Error('bad counter value');
    const best = Math.max(Math.floor(n), last);
    writeLast(best);
    show(best);
  } catch (e) {
    if (last > 0) {
      show(last);
    } else {
      el.textContent = 'アクセス —';
    }
  }
}
loadVisits();
