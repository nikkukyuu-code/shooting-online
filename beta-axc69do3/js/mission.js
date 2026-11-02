/**
 * β版 ミッションモード (Mission mode).
 * - Mission list (designed for ~10; only #1 playable now — others are 「準備中」 placeholders).
 * - Clear record + one-time reward PT: localStorage 'shootingOnline_missions' (new key; never rename).
 * - MissionRun: in-match tutorial guide (DOM HUD over the info pane / control pane — never labels on enemies),
 *   core-kill counting, clear on N core kills regardless of the match result.
 */
import { loadMeta, saveMeta } from './meta.js?v=20261103024127';
import { hasCore, coreWorld, coreShutState } from './entities.js?v=20261103024127';
import { OPP_RATIO, OWN_RATIO, CTRL_RATIO } from './render.js?v=20261103024127';

export const MISSION_KEY = 'shootingOnline_missions';
export const MISSION_SLOTS = 10;
export const MISSIONS = [
  { id: 1, name: '初陣', goal: 'コア敵キャラを2体倒せ', need: 2, reward: 1000, winBonus: 1000, comLevel: 15, comDifficulty: 'normal', tutorial: 'core' },
];
export function missionById(id) { return MISSIONS.find((m) => m.id === Number(id)) || null; }

export function loadMissionState() {
  try {
    const o = JSON.parse(localStorage.getItem(MISSION_KEY) || '{}');
    if (o && typeof o === 'object') { if (!o.cleared || typeof o.cleared !== 'object') o.cleared = {}; return o; }
  } catch (_) { /* ignore */ }
  return { cleared: {} };
}
export function isMissionWinBonusDone(id) { const s = loadMissionState(); return !!(s.winBonus && s.winBonus[String(id)]); }
/** Win bonus (clear + match win): once per mission, independent of the clear reward. Returns { first, gain }. */
export function grantMissionWinBonus(def) {
  const s = loadMissionState();
  if (!s.winBonus || typeof s.winBonus !== 'object') s.winBonus = {};
  const k = String(def.id);
  if (!def.winBonus || s.winBonus[k]) return { first: false, gain: 0 };
  s.winBonus[k] = Date.now();
  saveMissionState(s);
  const m = loadMeta();
  const next = saveMeta({ ...m, pt: m.pt + def.winBonus });
  try { window.dispatchEvent(new CustomEvent('shooting-meta-updated', { detail: next })); } catch (_) { /* ignore */ }
  return { first: true, gain: def.winBonus };
}
export function isMissionCleared(id) { return !!loadMissionState().cleared[String(id)]; }
function saveMissionState(s) { try { localStorage.setItem(MISSION_KEY, JSON.stringify(s)); } catch (_) { /* ignore */ } }

/** Mark cleared; reward PT only on the first clear. Returns { first, gain, total }. */
export function grantMissionClear(def) {
  const s = loadMissionState();
  const k = String(def.id);
  const first = !s.cleared[k];
  let gain = 0;
  let total = loadMeta().pt;
  if (first) {
    s.cleared[k] = Date.now();
    saveMissionState(s);
    const m = loadMeta();
    const next = saveMeta({ ...m, pt: m.pt + def.reward });
    gain = def.reward; total = next.pt;
    try { window.dispatchEvent(new CustomEvent('shooting-meta-updated', { detail: next })); } catch (_) { /* ignore */ }
  }
  return { first, gain, total };
}

const STEP_TEXT = {
  wait: ['コア敵を待とう', 'コア敵が来るまで、ふつうの敵を倒して待とう'],
  spot: ['コア敵が来た！', '体のどこかで赤く光る点が「コア」。コアが弱点だ'],
  align: ['高さを合わせよう', '自機を上下に動かして、コアと同じ高さに合わせよう'],
  shoot: ['コアを撃て！', '弾は自動で出る。その高さのままコアに当てよう（体に当ててもほとんど効かない）'],
  block: ['道をあけよう', 'コアの前の敵がじゃまをしている。先に倒して道をあけよう'],
  shut: ['コアが閉じている', 'コアが閉じている間は弾が効かない。開くまで待って撃とう'],
  hit: ['当たった！', 'コアが光ったら効いている。壊れるまで撃ち続けよう'],
  boom: ['コア撃破！', 'コアを壊すと体ごと大爆発！ まわりの敵も連鎖で倒せる'],
  next: ['次のコア敵！', 'コアの高さに合わせて撃とう'],
  done: ['ミッションクリア！', '報酬 {0} PT'],
  doneAgain: ['ミッションクリア！', '報酬は受け取り済み'],
};

export class MissionRun {
  constructor(def, game) {
    this.def = def;
    this.game = game;
    this.kills = 0;
    this.cleared = false;
    this.reward = null;
    this.step = 'wait';
    this.stepT = 0;
    this.alignT = 0;
    this.everHit = false;
    this.seen = new WeakSet();
    this.log = [];
    this._mount();
    this._setStep('wait');
  }

  _mount() {
    const host = document.getElementById('ui-overlay') || document.body;
    host.querySelectorAll('.mission-hud, .mission-chip').forEach((n) => n.remove());
    const chip = document.createElement('div');
    chip.className = 'mission-chip';
    chip.setAttribute('aria-live', 'polite');
    chip.innerHTML = '<span class="mc-ico" aria-hidden="true">🎯</span><span class="mc-lbl">コア敵</span><b class="mc-n">0/2</b>';
    const hud = document.createElement('div');
    hud.className = 'mission-hud';
    hud.setAttribute('role', 'status');
    hud.innerHTML = '<div class="mh-arrow" aria-hidden="true"></div><div class="mh-txt"><div class="mh-title"></div><div class="mh-body"></div></div>';
    host.appendChild(chip);
    host.appendChild(hud);
    this.chip = chip; this.hud = hud;
    this._render();
  }

  destroy() { this.chip?.remove(); this.hud?.remove(); this.chip = this.hud = null; }

  _setStep(s, extra) {
    if (this.step !== s) this.log.push(s);
    else if (!this.log.length) this.log.push(s);
    this.step = s; this.stepT = 0; this._extra = extra;
    this._text();
  }

  _text() {
    if (!this.hud) return;
    const [t, b] = STEP_TEXT[this.step] || ['', ''];
    const tt = this.hud.querySelector('.mh-title'), bb = this.hud.querySelector('.mh-body');
    const body = b.replace('{0}', String(this.def.reward));
    if (tt.textContent !== t) tt.textContent = t;
    if (bb.textContent !== body) bb.textContent = body;
    this.hud.dataset.step = this.step;
    this._fitSoon();
  }

  /** Shrink the guide text until it fits the card (long translations, small phones). */
  _fitSoon() { if (this._fitT) return; this._fitT = requestAnimationFrame(() => { this._fitT = 0; requestAnimationFrame(() => this._fit()); }); }
  _fit() {
    const h = this.hud;
    if (!h || h.classList.contains('off')) return;
    const tt = h.querySelector('.mh-title'), bb = h.querySelector('.mh-body'), box = h.querySelector('.mh-txt');
    const hh = h.clientHeight;
    let ft = Math.min(16, Math.max(11, hh * 0.24)), fb = Math.min(14, Math.max(10, hh * 0.21));
    for (let i = 0; i < 24; i++) {
      tt.style.fontSize = ft + 'px'; bb.style.fontSize = fb + 'px';
      if (box.scrollHeight <= h.clientHeight - 4 && box.scrollWidth <= box.clientWidth + 1) break;
      ft = Math.max(7, ft * 0.93); fb = Math.max(6.5, fb * 0.93);
    }
  }

  _arrow(a) {
    const el = this.hud && this.hud.querySelector('.mh-arrow');
    if (el && el.textContent !== a) el.textContent = a;
  }

  _render() {
    if (!this.chip) return;
    const n = this.chip.querySelector('.mc-n');
    const s = `${Math.min(this.kills, this.def.need)}/${this.def.need}`;
    if (n.textContent !== s) n.textContent = s;
    this.chip.classList.toggle('done', this.cleared);
  }

  /** Core enemy currently alive in the player's field (nearest to the ship, on screen). */
  _target() {
    const g = this.game, S = g.state, L = g.L;
    if (!S || !L) return null;
    const fw = L.own.w;
    let best = null, bd = 1e9;
    for (const e of S.enemies || []) {
      if (!hasCore(e) || !e.core || e.core.hp <= 0 || e._chainT != null || e._portalOnly) continue;
      const c = coreWorld(e);
      if (!c || c.x > fw - 4 || c.x < 0) continue;
      const d = c.x;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** dy = core − ship in field px (null when no target). */
  _dy(e) {
    const g = this.game, S = g.state, fh = g.L.own.h;
    const c = coreWorld(e);
    return c ? c.y - S.player.y * fh : null;
  }

  tick(dt) {
    const g = this.game;
    if (!g.state || g.ended) { this.hide(); return; }
    this.stepT += dt;
    const e = this._target();
    const fh = g.L.own.h;
    const tol = Math.max(10, fh * 0.045);
    const dy = e ? this._dy(e) : null;
    const aligned = dy != null && Math.abs(dy) <= tol;
    const shut = e ? coreShutState(e) === 2 : false;
    const arrow = dy == null ? '▶' : aligned ? '◎' : dy < 0 ? '⬆' : '⬇';
    switch (this.step) {
      case 'wait': if (e) this._setStep('spot'); this._arrow('▶'); break;
      case 'spot': this._arrow('▶'); if (!e) this._setStep('wait'); else if (this.stepT > 2.6) this._setStep('align'); break;
      case 'align':
        if (!e) { this._setStep('wait'); break; }
        this._arrow(arrow);
        this.alignT = aligned ? this.alignT + dt : 0;
        if (this.alignT >= 0.35) this._setStep('shoot');
        break;
      case 'shoot': case 'shut': case 'block':
        if (!e) { this._setStep('wait'); break; }
        this._arrow(shut ? '⏳' : arrow);
        if (shut && this.step !== 'shut') this._setStep('shut');
        else if (!shut && this.step === 'shut') this._setStep('shoot');
        if (aligned && !shut) this.shootT = (this.shootT || 0) + dt;
        if (this.step === 'shoot' && this.shootT > 5) this._setStep('block');
        break;
      case 'hit':
        if (!e) { this._setStep('wait'); break; }
        this._arrow(shut ? '⏳' : arrow);
        break;
      case 'boom': this._arrow('💥'); if (this.stepT > 4.5) this._setStep(e ? 'next' : 'idle'); break;
      case 'idle': if (e) this._setStep('next'); break;
      case 'next': if (!e) this._setStep('idle'); else this._arrow(shut ? '⏳' : arrow); break;
      case 'done': case 'doneAgain': this._arrow('🏆'); if (this.stepT > 6) this._setStep('over'); break;
      default: break;
    }
    this._place();
  }

  hide() { if (this.hud) this.hud.classList.add('off'); if (this.chip) this.chip.classList.add('off'); }

  _place() {
    const g = this.game, cv = g.canvas;
    if (!cv || !this.hud) return;
    const show = !['idle', 'over'].includes(this.step);
    if (this.hud.classList.contains('off') === show) { this.hud.classList.toggle('off', !show); if (show) this._fitSoon(); }
    this.chip.classList.remove('off');
    const r = cv.getBoundingClientRect(), pr = (this.hud.offsetParent || document.body).getBoundingClientRect();
    const H = r.height, W = r.width;
    const oppH = Math.floor(H * OPP_RATIO), ownH = Math.floor(H * OWN_RATIO), ctrlH = Math.floor(H * CTRL_RATIO);
    const infoY = oppH + ownH + ctrlH, infoH = H - infoY;
    const ox = r.left - pr.left, oy = r.top - pr.top;
    const key = `${W}|${H}|${ox}|${oy}`;
    if (this._pk === key) return;
    this._pk = key;
    // guide card: covers the info pane's message box (status line) — same spot as the normal tutorial card
    Object.assign(this.hud.style, { left: `${ox + W * 0.03}px`, top: `${oy + infoY + infoH * 0.04}px`, width: `${W * 0.94}px`, height: `${infoH * 0.5}px` });
    this._fitSoon();
    // progress chip: top-left of the control pane (left of the 「アイテム 最大3」 header)
    const colW = Math.max(100, Math.min(168, W * 0.38));
    Object.assign(this.chip.style, { left: `${ox + Math.max(6, W * 0.02)}px`, top: `${oy + oppH + ownH + 3}px`, maxWidth: `${W - colW - 24}px` });
  }

  onCoreHit(e) {
    if (this.cleared && this.step !== 'next') return;
    if (!this.everHit) this.everHit = true;
    if (['wait', 'spot', 'align', 'shoot', 'shut', 'block'].includes(this.step) && this.kills === 0) this._setStep('hit');
  }

  onCoreBreak(e) {
    if (!e || this.seen.has(e)) return;
    this.seen.add(e);
    this.kills += 1;
    this._render();
    if (this.kills >= this.def.need && !this.cleared) {
      this.cleared = true;
      this.reward = grantMissionClear(this.def);
      this._render();
      this._setStep(this.reward.first ? 'done' : 'doneAgain');
      return;
    }
    if (this.kills === 1) this._setStep('boom');
    else if (!this.cleared) this._setStep('boom');
  }

  result(won) {
    if (this._res) return this._res;
    const bonus = this.cleared && won ? grantMissionWinBonus(this.def) : null;
    return this._res = {
      bonus, bonusDone: isMissionWinBonusDone(this.def.id), def: this.def, won: !!won, kills: this.kills, need: this.def.need, cleared: this.cleared, reward: this.reward, total: loadMeta().pt };
  }
}

/** Result-screen box (inserted by Game.showEndCelebration). */
export function missionResultBox(res) {
  const box = document.createElement('div');
  box.className = 'mission-result ' + (res.cleared ? 'mr-clear' : 'mr-fail');
  const k = Math.min(res.kills, res.need);
  const rw = res.cleared
    ? (res.reward && res.reward.first ? `<div class="mr-line mr-reward">報酬 <b>+${res.def.reward} PT</b></div>` : '<div class="mr-line mr-reward">報酬は受け取り済み</div>')
    : '<div class="mr-line mr-sub">コア敵を2体倒すとクリア。もう一度挑戦しよう！</div>';
  const wb = res.def.winBonus || 0;
  const bl = !wb ? '' : res.bonus && res.bonus.first ? `<div class="mr-line mr-reward mr-bonus">勝利ボーナス <b>+${wb} PT</b></div>`
    : res.bonusDone ? '<div class="mr-line mr-sub">勝利ボーナスは受け取り済み</div>'
    : `<div class="mr-line mr-sub">勝って2体倒すと勝利ボーナス +${wb} PT</div>`;
  box.innerHTML = `<div class="mr-head">${res.cleared ? 'ミッションクリア！' : 'ミッション失敗…'}</div>`
    + `<div class="mr-line mr-name">ミッション${res.def.id}「${res.def.name}」</div>`
    + `<div class="mr-line mr-goal">${res.def.goal}</div>`
    + `<div class="mr-line mr-count">コア敵 <b>${k}/${res.need}</b></div>`
    + rw
    + bl
    + `<div class="mr-line mr-total">いまの持ちPT　<b>${res.total}</b></div>`
    + '<div class="mr-btns"><button type="button" class="menu-btn mr-retry">もう一度挑戦</button><button type="button" class="menu-btn mr-select">ミッション選択へ</button></div>';
  box.querySelector('.mr-retry').addEventListener('click', () => { try { window.__stbMissionRetry && window.__stbMissionRetry(res.def.id); } catch (_) { /* ignore */ } });
  box.querySelector('.mr-select').addEventListener('click', () => { try { window.__stbMissionSelect && window.__stbMissionSelect(); } catch (_) { /* ignore */ } });
  return box;
}
