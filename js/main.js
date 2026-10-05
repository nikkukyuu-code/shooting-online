import { VERSION_LABEL, BUILD_NOTE, BUILD_TIME, formatVersionTime } from './version.js?v=20261005172401';
import { Net } from './net.js?v=20261005172401';
import { Game } from './game.js?v=20261005172401';
import { CATALOG, CATALOG_BY_ID, unitIntro, RARITY_JA, unitStats, sentUnitHp } from './catalog.js?v=20261005172401';
import { loadMeta, saveMeta, buyUnit, setDeckSlot, DECK_SIZE, loadNewUnits, clearUnitNew, comRankInfo, COM_LEVEL_MAX, shopPrice } from './meta.js?v=20261005172401';
import { loadBattleCount } from './stats.js?v=20261005172401';
import { registerEnemyKinds, prepareMatchAssets, isMatchPrepDone } from './render.js?v=20261005172401';
import { ALL_KIND_IDS } from './catalog.js?v=20261005172401';
import { setKindTier, POWERUPS, WAVE_KIND_TIERS } from './entities.js?v=20261005172401';

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
  btnCpuNormal: $('#btn-cpu-normal'),
  btnCpuStrong: $('#btn-cpu-strong'),
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
  window.__stbScreen = screen;
  if (screen === 'menu' && window.__stbCheckUpdate) setTimeout(() => { if (window.__stbScreen === 'menu') window.__stbCheckUpdate(); }, 1500);
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
  if (els.btnCpuNormal) els.btnCpuNormal.disabled = v;
  if (els.btnCpuStrong) els.btnCpuStrong.disabled = v;
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
  const label = `いまの持ちPT ${m.pt.toLocaleString('ja-JP')}`;
  if (els.menuPt) els.menuPt.textContent = label;
  if (els.shopPt) els.shopPt.textContent = label;
  refreshComRank();
}

/** Title: COM win rate + enemy level per difficulty (COM matches only). */
function refreshComRank() {
  try {
    for (const d of ['normal', 'strong']) {
      const r = comRankInfo(d);
      const row = document.getElementById(`cr-${d}`);
      if (row) {
        row.querySelector('.cr-rate').textContent = r.n ? `勝率 ${r.pct}%` : '勝率 ―';
        row.querySelector('.cr-rec').textContent = `（${r.w}勝${r.l}敗）`;
        row.querySelector('.cr-lv-n').textContent = String(r.level);
      }
      const tag = document.getElementById(`cpu-lv-${d}`);
      if (tag) tag.textContent = `敵Lv${r.level}`;
    }
    const mx = document.getElementById('cr-max');
    if (mx) mx.textContent = String(COM_LEVEL_MAX);
  } catch (_) { /* ignore */ }
}

function spriteUrl(id) {
  return `assets/enemies/${id}/0.png?v=20261005172401`;
}

function unitName(id) {
  return (CATALOG_BY_ID[id] && CATALOG_BY_ID[id].name) || id;
}

function rarityLabel(r) {
  return RARITY_JA[r] || r || '';
}

/** 攻撃力 / 防御力 / ライフ (sent HP) chips. compact = short labels for the narrow deck slots. */
function statsHtml(id, compact = false) {
  const st = unitStats(id);
  if (!st) return '';
  const hp = sentUnitHp(id); // actual HP when this unit is sent (same for player / COM / online)
  if (compact) {
    return `<span class="unit-stats compact"><span class="st st-atk">攻${st.atk}</span><span class="st st-def">防${st.def}</span><span class="st st-hp" title="ライフ">♥${hp}</span></span>`;
  }
  return `<span class="unit-stats"><span class="st st-atk">攻撃力 ${st.atk}</span><span class="st st-def">防御力 ${st.def}</span><span class="st st-hp">ライフ ${hp}</span></span>`;
}

const NEW_BADGE = '<span class="unit-new-badge" aria-label="新しく購入">NEW</span>';

/** Show a small NEW dot on the デッキ menu button while any purchased unit is still unseen. */
function refreshDeckNewDot() {
  if (!els.btnDeck) return;
  const n = loadNewUnits().size;
  els.btnDeck.classList.toggle('has-new', n > 0);
}

function renderUnitDetail(container, unitId, opts = {}) {
  if (!container) return;
  if (!unitId) {
    container.innerHTML = `<p class="detail-empty">${opts.empty || 'ユニットを選択すると攻撃パターンを表示します'}</p>`;
    return;
  }
  const intro = unitIntro(unitId);
  const price = opts.showPrice && CATALOG_BY_ID[unitId]
    ? `<span class="detail-price">${CATALOG_BY_ID[unitId].price <= 0 ? '無料' : `${shopPrice(CATALOG_BY_ID[unitId])} PT`}</span>`
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
      <div class="detail-stats">${detailStatsHtml(unitId)}</div>
      <div class="detail-attack"><span class="detail-label">攻撃</span>${intro.attack}</div>
      <p class="detail-blurb">${intro.blurb}</p>
    </div>
  `;
}

function detailStatsHtml(id) {
  const st = unitStats(id);
  if (!st) return '';
  const bar = (v) => Math.max(6, Math.min(100, Math.round(v / 150 * 100)));
  return `
    <div class="stat-row st-atk"><span class="stat-name">攻撃力</span><span class="stat-bar"><i style="width:${bar(st.atk)}%"></i></span><b>${st.atk}</b></div>
    <div class="stat-row st-def"><span class="stat-name">防御力</span><span class="stat-bar"><i style="width:${bar(st.def)}%"></i></span><b>${st.def}</b></div>
    <div class="stat-row st-hp"><span class="stat-name">ライフ</span><span class="stat-bar"><i style="width:${Math.max(6, Math.min(100, Math.round((sentUnitHp(id) || 0) / 160 * 100)))}%"></i></span><b>${sentUnitHp(id)}</b></div>
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
      ${statsHtml(id, true)}
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
  const newSet = loadNewUnits();
  // Freshly purchased (NEW) units first so they are easy to find
  const ownedUnits = CATALOG.filter((u) => meta.owned.includes(u.id))
    .sort((a, b) => (newSet.has(b.id) ? 1 : 0) - (newSet.has(a.id) ? 1 : 0));
  for (const u of ownedUnits) {
    const isNew = newSet.has(u.id) && !meta.deck.includes(u.id);
    const inDeck = meta.deck.includes(u.id);
    const deckSlot = meta.deck.indexOf(u.id);
    const intro = unitIntro(u.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'unit-card' + (inDeck ? ' in-deck' : '') + (isNew ? ' is-new' : '');
    if (u.rarity) btn.dataset.rarity = u.rarity;
    btn.innerHTML = `
      ${inDeck ? `<span class="unit-badge equipped">装備中<span class="unit-badge-slot">スロット${deckSlot + 1}</span></span>` : ''}
      ${isNew ? NEW_BADGE : ''}
      <div class="unit-art"><img src="${spriteUrl(u.id)}" alt="" width="64" height="64" loading="lazy" /></div>
      <span class="unit-name">${u.name}</span>
      <span class="unit-attack-chip">${intro.attack.split('／')[0]}</span>
      ${statsHtml(u.id)}
      <span class="rarity ${u.rarity}">${rarityLabel(u.rarity)}</span>
    `;
    btn.addEventListener('click', () => {
      // NEW rule: tapping the card in the deck screen (= equip / view) clears its NEW mark
      clearUnitNew(u.id);
      refreshDeckNewDot();
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
      } else {
        renderDeckScreen();
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

function showShopMsg(text, ok = false) {
  if (!els.shopMsg) return;
  els.shopMsg.classList.toggle('ok', !!ok);
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
  btn.textContent = u.price <= 0 ? '入手（無料）' : `購入（${shopPrice(u)} PT）`;
}

function buySelectedShopUnit() {
  const u = selectedShopId ? CATALOG_BY_ID[selectedShopId] : null;
  if (!u) return;
  const cur = loadMeta();
  if (cur.owned.includes(u.id)) return;
  if (cur.pt < shopPrice(u)) {
    showShopMsg(`ポイントが足りません（あと ${shopPrice(u) - cur.pt} PT）`);
    return;
  }
  const res = buyUnit(cur, u.id);
  clearShopMsg();
  if (res.ok) {
    refreshPtDisplay(res.meta);
    refreshDeckNewDot();
    showShopMsg(`${u.name} を購入しました！ デッキ編集で「NEW」表示されます`, true);
  }
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

  const newSet = loadNewUnits();
  for (const u of list) {
    const owned = meta.owned.includes(u.id);
    const isNew = owned && newSet.has(u.id);
    const intro = unitIntro(u.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'unit-card' + (owned ? ' owned' : '') + (isNew ? ' is-new' : '') + (selectedShopId === u.id ? ' selected-card' : '');
    if (u.rarity) btn.dataset.rarity = u.rarity;
    const priceLabel = owned ? '所持済' : (u.price <= 0 ? '無料' : `${shopPrice(u)} PT`);
    btn.innerHTML = `
      ${owned ? '<span class="unit-badge">所持</span>' : ''}
      ${isNew ? NEW_BADGE : ''}
      <div class="unit-art"><img src="${spriteUrl(u.id)}" alt="" width="72" height="72" loading="lazy" /></div>
      <span class="unit-name">${u.name}</span>
      <span class="unit-attack-chip">${intro.attack.split('／')[0]}</span>
      ${statsHtml(u.id)}
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
        ${statsHtml(u.id)}
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
  refreshDeckNewDot();
  loadBattleCount(document.getElementById('app-battles'));
  show('menu');
}

function startGameSession({ bot = false, comDifficulty = 'strong' } = {}) {
  show('game');
  els.endOverlay.classList.add('hidden');
  game = new Game(els.canvas, {
    statusBar: els.statusBar,
    endOverlay: els.endOverlay,
    endMessage: els.endMessage,
  });
  game.start({ net, bot, comDifficulty });
}

/**
 * 10-04k: loading screen while match assets are prepared. Shown only if prep takes > 150 ms.
 * 「準備中… N%」 + gauge + spinning pixel coin; work is split across frames so it never looks frozen.
 */
let _prepOv = null;
function prepOverlay() {
  if (_prepOv) return _prepOv;
  const ov = document.createElement('div');
  ov.id = 'prep-overlay';
  ov.setAttribute('role', 'status');
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(6,6,16,0.92);color:#ffe27a;font:bold 18px sans-serif;';
  ov.innerHTML = `<canvas width="12" height="12" style="width:48px;height:48px;image-rendering:pixelated;animation:prepSpin 0.8s linear infinite"></canvas>
    <div class="prep-txt">準備中… 0%</div>
    <div style="width:min(70vw,320px);height:12px;border:2px solid #ffe27a;border-radius:3px;background:#221a08;overflow:hidden"><div class="prep-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#f8b42c,#fff4a8)"></div></div>`;
  const st = document.createElement('style');
  st.textContent = '@keyframes prepSpin{0%{transform:scaleX(1)}50%{transform:scaleX(0.08)}100%{transform:scaleX(1)}}';
  document.head.appendChild(st);
  const g = ov.querySelector('canvas').getContext('2d');
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const d = Math.hypot(x - 5.5, y - 5.5) / 6; if (d > 1) continue;
    g.fillStyle = d > 0.8 ? '#8a5a00' : (d > 0.58 && d < 0.72) ? '#c89000' : (x < 5 && y < 5 && d < 0.5) ? '#fff8b0' : '#f8d828';
    g.fillRect(x, y, 1, 1);
  }
  document.body.appendChild(ov);
  _prepOv = ov;
  return ov;
}
let _lastStartMs = 0; // how long the previous match start blocked (decides whether to show the screen)
async function withMatchPrep(run) {
  const ov = prepOverlay();
  const txt = ov.querySelector('.prep-txt'), bar = ov.querySelector('.prep-bar');
  const t0 = performance.now();
  let shown = false;
  const show = () => { if (!shown) { shown = true; ov.style.display = 'flex'; } };
  const showT = setTimeout(show, 150);
  if (!isMatchPrepDone()) {
    try {
      await prepareMatchAssets((u) => { const n = Math.round(u * 100); txt.textContent = `準備中… ${n}%`; bar.style.width = `${n}%`; });
    } catch (e) { console.warn('prep failed', e); }
  }
  clearTimeout(showT);
  // The match start itself (canvas set-up + first frames) can block ~0.1–0.5 s on phones:
  // keep the loading screen (the coin spin runs on the compositor) up through it when it is slow.
  if (shown || _lastStartMs > 150 || performance.now() - t0 > 150) {
    show(); txt.textContent = '準備中… 100%'; bar.style.width = '100%';
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
  const s0 = performance.now();
  run();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  _lastStartMs = performance.now() - s0;
  ov.style.display = 'none';
}

function startCpuMatch(comDifficulty) {
  if (busy) return;
  withMatchPrep(() => startCpuMatchNow(comDifficulty));
}
function startCpuMatchNow(comDifficulty) {
  if (busy) return;
  setBusy(true);
  cleanupGame();
  net = new Net();
  net.usingBot = true;
  const label = comDifficulty === 'normal' ? 'CPU対戦（普通・PT×1）' : 'CPU対戦（強い・PT×3）';
  els.fieldFind.value = label;
  try {
    startGameSession({ bot: true, comDifficulty });
    game.beginMatch();
  } catch (e) {
    console.error(e);
    els.fieldFind.value = '開始失敗';
    cleanupGame();
    show('menu');
  } finally {
    setBusy(false);
  }
}

els.btnCpuNormal?.addEventListener('click', () => startCpuMatch('normal'));
els.btnCpuStrong?.addEventListener('click', () => startCpuMatch('strong'));


els.btnTutorial?.addEventListener('click', () => {
  try { localStorage.removeItem('shootingOnline_tutorialDone'); } catch (_) {}
  if (busy) return;
  setBusy(true);
  cleanupGame();
  net = new Net();
  net.usingBot = true;
  els.fieldFind.value = 'チュートリアル（CPU）';
  try {
    startGameSession({ bot: true, comDifficulty: 'normal' });
    if (game) {
      game._forceTutorial = true;
      // Tutorial: easiest COM, not counted in the win-rate record
      game._tutorialMatch = true;
      game.comLevel = 1;
      game._comProf = null;
      game.setStatus(game.comDeckStatusText());
    }
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
  refreshDeckNewDot();
  show('menu');
});

els.btnShopBuy?.addEventListener('click', () => {
  buySelectedShopUnit();
});

els.btnShopBack?.addEventListener('click', () => {
  clearShopMsg();
  refreshPtDisplay();
  refreshDeckNewDot();
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
  refreshDeckNewDot();
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
loadBattleCount(document.getElementById('app-battles'));

// 10-04k: warm up match assets in the background on the title screen
setTimeout(() => { prepareMatchAssets().catch(() => {}); }, 300);
