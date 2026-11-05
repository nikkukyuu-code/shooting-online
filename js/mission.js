/**
 * ミッションモード (Mission mode).
 * - Mission list (designed for ~10; only #1 playable now — others are 「準備中」 placeholders).
 * - Clear record + one-time reward PT: localStorage 'shootingOnline_missions' (new key; never rename).
 * - MissionRun: in-match tutorial guide (DOM HUD over the info pane / control pane — never labels on enemies),
 *   core-kill counting, clear on N core kills regardless of the match result.
 */
import { loadMeta, saveMeta } from './meta.js?v=20261106011433';
import { sfx } from './audio.js?v=20261106011433';
import { hasCore, coreWorld, coreShutState, isLargeEnemy } from './entities.js?v=20261106011433';
import { OPP_RATIO, OWN_RATIO, CTRL_RATIO } from './render.js?v=20261106011433';

export const MISSION_KEY = 'shootingOnline_missions';
export const MISSION_SLOTS = 10;
export const MISSIONS = [
  { id: 1, name: '初陣', goal: 'コア敵キャラを2体倒せ', need: 2, reward: 3000, comLevel: 15, comDifficulty: 'normal', type: 'core', tutorial: 'core', art: ['wave_core_boss'],
    chip: 'コア敵', fail: 'コア敵を2体倒すとクリア。もう一度挑戦しよう！',
    howto: 'コア敵の赤く光るコアをねらって撃とう。コアを壊すとまわりの敵も連鎖で倒せる',
    text: { intro: ['ミッション開始！', 'コア敵を2体倒すと報酬 {0} PT（初回クリアのみ）'], introAgain: ['ミッション開始！', 'コア敵を2体倒そう（報酬は受け取り済み）'] } },
  // 「デカキャラ」 = isLargeEnemy(): tiers boss / golem / tank / mech, catalog.large, w≥150 / h≥100 or maxHp≥40 —
  // plus every core enemy broken by the player (core break = 1). Core-chain pops / escorts / snake body links don't count.
  // COM deck biased to large send units so plenty of big enemies arrive.
  { id: 2, name: 'デカキャラ討伐', goal: 'デカキャラを6体倒せ', need: 6, reward: 5000, comLevel: 15, comDifficulty: 'normal', type: 'big', art: ['golem', 'mech'],
    comDeck: ['mech', 'golem', 'missile_destroyer', 'siege_mech', 'cruiser_gun'],
    chip: 'デカキャラ', fail: 'デカキャラを6体倒すとクリア。もう一度挑戦しよう！',
    howto: 'コア敵や大きな敵キャラ（戦艦級・要塞級など）を倒すとカウント。コア敵はコアをねらおう',
    text: { intro: ['ミッション開始！', 'デカキャラを6体倒すと報酬 {0} PT（初回クリアのみ）'], introAgain: ['ミッション開始！', 'デカキャラを6体倒そう（報酬は受け取り済み）'],
      wait: ['デカキャラをねらえ！', '大きな敵キャラやコア敵を倒そう。コア敵はコアを撃つと倒せる'], boom: ['デカキャラ撃破！', 'あと {1} 体'] } },
  // フラワースネイク (蛇の頭): wave_snake_head (wave script: 1 snake at 1:00, 2 at 2:30, 3 at 4:00 → 6 per match). One credit per snake:
  // only when its core (orange ball) is broken by the player (head kills don't count).
  { id: 3, name: 'フラワースネイク退治', goal: 'フラワースネイクを2体倒せ', need: 2, reward: 10000, comLevel: 15, comDifficulty: 'normal', type: 'snake', art: ['snake_head_art', 'snake_seg', 'snake_seg', 'snake_redball', 'snake_seg', 'snake_seg'],
    chip: 'フラワースネイク', fail: 'フラワースネイクを2体倒すとクリア。もう一度挑戦しよう！',
    howto: 'フラワースネイクが現れたらオレンジの玉（コア）を壊して倒そう',
    text: { intro: ['ミッション開始！', 'フラワースネイクを2体倒すと報酬 {0} PT（初回クリアのみ）'], introAgain: ['ミッション開始！', 'フラワースネイクを2体倒そう（報酬は受け取り済み）'],
      wait: ['フラワースネイクを待とう', 'フラワースネイクが来るまで、ふつうの敵を倒して待とう'], spot: ['フラワースネイクが来た！', 'オレンジの玉（コア）をねらって撃とう'],
      boom: ['フラワースネイク撃破！', 'あと {1} 体'], next: ['次のフラワースネイク！', 'オレンジの玉（コア）をねらって撃とう'] } },
  // 4–6: goal = winning the match (no heal assist). 4: no weapon items for the player (WEAPON_ITEM_IDS).
  // 5/6: player life ≥ minHpPct % at the moment of victory (judged at victory; can recover with heals).
  { id: 4, name: 'ノーマル武器で勝利を目指せ', goal: '発射アイテムなしで勝利せよ', need: 1, reward: 20000, comLevel: 20, comDifficulty: 'normal', type: 'win', noWeapons: true,
    art: ['__ship'], chip: '勝利', fail: 'ノーマル武器で勝つとクリア。もう一度挑戦しよう！',
    howto: '発射アイテム（ミサイル・レーザー・ボムなど）は出ない。通常弾で戦い、回復・バリア・送信・直接攻撃のアイテムは使える',
    text: { intro: ['ミッション開始！', '発射アイテムなしで勝つと報酬 {0} PT（初回クリアのみ）'], introAgain: ['ミッション開始！', '発射アイテムなしで勝とう（報酬は受け取り済み）'],
      wait: ['ノーマル武器で勝て！', '発射アイテムは出ない。通常弾と回復・送信・直接攻撃で勝とう'] } },
  { id: 5, name: 'ライフ80%で勝利', goal: 'ライフ80%以上で勝利せよ', need: 1, reward: 30000, comLevel: 40, comDifficulty: 'normal', type: 'win', minHpPct: 80,
    art: ['__ship', '__heart'], chip: 'ライフ', fail: 'ライフ80%以上で勝つとクリア。もう一度挑戦しよう！',
    howto: '勝った瞬間の自分のライフが80%以上なら達成。下回っても回復アイテムで戻せば間に合う',
    text: { intro: ['ミッション開始！', 'ライフ80%以上で勝つと報酬 {0} PT（初回クリアのみ）'], introAgain: ['ミッション開始！', 'ライフ80%以上で勝とう（報酬は受け取り済み）'],
      wait: ['ライフ80%以上をキープ！', '勝った瞬間のライフが80%以上なら達成'], low: ['ライフが80%を下回った！', 'このまま勝っても達成できない。回復して80%以上に戻そう'] } },
  { id: 6, name: 'ライフ90%で勝利', goal: 'ライフ90%以上で勝利せよ', need: 1, reward: 100000, comLevel: 60, comDifficulty: 'normal', type: 'win', minHpPct: 90,
    art: ['__ship', '__heart'], chip: 'ライフ', fail: 'ライフ90%以上で勝つとクリア。もう一度挑戦しよう！',
    howto: '勝った瞬間の自分のライフが90%以上なら達成。下回っても回復アイテムで戻せば間に合う',
    text: { intro: ['ミッション開始！', 'ライフ90%以上で勝つと報酬 {0} PT（初回クリアのみ）'], introAgain: ['ミッション開始！', 'ライフ90%以上で勝とう（報酬は受け取り済み）'],
      wait: ['ライフ90%以上をキープ！', '勝った瞬間のライフが90%以上なら達成'], low: ['ライフが90%を下回った！', 'このまま勝っても達成できない。回復して90%以上に戻そう'] } },
];
/** Shown on the detail screen for every mission (win missions: none). */
export const MISSION_ASSIST_NOTE = 'ミッション達成までは、敵のライフが半分を切ると敵が回復します。達成後はふつうの対戦になります';
export const MISSION_WIN_NOTE = 'このミッションでは敵は回復しません。勝った瞬間に達成が判定されます';
export function missionById(id) { return MISSIONS.find((m) => m.id === Number(id)) || null; }

export function loadMissionState() {
  try {
    const o = JSON.parse(localStorage.getItem(MISSION_KEY) || '{}');
    if (o && typeof o === 'object') { if (!o.cleared || typeof o.cleared !== 'object') o.cleared = {}; return o; }
  } catch (_) { /* ignore */ }
  return { cleared: {} };
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
    this._setStep(isMissionCleared(def.id) ? 'introAgain' : 'intro');
  }

  _mount() {
    const host = document.getElementById('ui-overlay') || document.body;
    host.querySelectorAll('.mission-hud, .mission-chip, .mission-fx').forEach((n) => n.remove());
    const chip = document.createElement('div');
    chip.className = 'mission-chip';
    chip.setAttribute('aria-live', 'polite');
    chip.innerHTML = '<span class="mc-ico" aria-hidden="true">🎯</span><span class="mc-lbl"></span><b class="mc-n">0/2</b>';
    chip.querySelector('.mc-lbl').textContent = this.def.chip || 'コア敵';
    const hud = document.createElement('div');
    hud.className = 'mission-hud';
    hud.setAttribute('role', 'status');
    hud.innerHTML = '<div class="mh-arrow" aria-hidden="true"></div><div class="mh-txt"><div class="mh-title"></div><div class="mh-body"></div></div>';
    host.appendChild(chip);
    host.appendChild(hud);
    this.chip = chip; this.hud = hud;
    this._render();
  }

  destroy() { this.chip?.remove(); this.hud?.remove(); this.fx?.remove(); this.chip = this.hud = this.fx = null; }

  _setStep(s, extra) {
    if (this.step !== s) this.log.push(s);
    else if (!this.log.length) this.log.push(s);
    this.step = s; this.stepT = 0; this._extra = extra;
    this._text();
  }

  _text() {
    if (!this.hud) return;
    const [t, b] = (this.def.text && this.def.text[this.step]) || STEP_TEXT[this.step] || ['', ''];
    const tt = this.hud.querySelector('.mh-title'), bb = this.hud.querySelector('.mh-body');
    const body = b.replace('{0}', String(this.def.reward)).replace('{1}', String(Math.max(0, this.def.need - this.kills)));
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
    const s = this.def.minHpPct ? `${this._hpPct()}% / ${this.def.minHpPct}%` : `${Math.min(this.kills, this.def.need)}/${this.def.need}`;
    if (n.textContent !== s) n.textContent = s;
    this.chip.classList.toggle('done', this.cleared);
    this.chip.classList.toggle('warn', !!(this.def.minHpPct && this._hpPct() < this.def.minHpPct));
  }

  /** Core enemy currently alive in the player's field (nearest to the ship, on screen). */
  _target() {
    const g = this.game, S = g.state, L = g.L;
    if (!S || !L) return null;
    const fw = L.own.w;
    let best = null, bd = 1e9;
    for (const e of S.enemies || []) {
      if (this.def.type === 'big' || this.def.type === 'win') return null; // big-enemy mission: no single target to point at
      if (this.def.type === 'snake' && e.kind !== 'wave_snake_head') continue;
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
      case 'intro': case 'introAgain': this._arrow('🎯'); if (this.stepT > 3.2) this._setStep(e ? 'spot' : 'wait'); break;
      case 'wait': case 'low':
        if (this.def.type === 'win') {
          const lowNow = this.def.minHpPct && this._hpPct() < this.def.minHpPct;
          if (lowNow && this.step !== 'low') this._setStep('low'); else if (!lowNow && this.step === 'low') this._setStep('wait');
          this._arrow(lowNow ? '⚠' : '🎯'); this._render(); break;
        }
        if (this.step === 'low') break;
        if (this.def.type === 'big') { this._arrow('🎯'); break; } if (e) this._setStep('spot'); this._arrow('▶'); break;
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
      case 'boom': this._arrow('💥'); if (this.stepT > (this.def.type === 'big' ? 3 : 4.5)) this._setStep(this.def.type === 'big' ? 'wait' : e ? 'next' : 'idle'); break;
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
    if (['intro', 'introAgain', 'wait', 'spot', 'align', 'shoot', 'shut', 'block'].includes(this.step) && this.kills === 0) this._setStep('hit');
  }

  /** Player broke a core (snake: e = its head). */
  onCoreBreak(e) {
    if (!e) return;
    if (this.def.type === 'snake' && e.kind !== 'wave_snake_head') return;
    if (this.def.type === 'win') return;
    this._credit(e);
  }

  /** Normal kill in the player's field (big-enemy mission). Core owners / chain pops / attached parts excluded. */
  onKill(e) {
    if (this.def.type !== 'big' || !e) return;
    if (e._coreBreak || hasCore(e) || e._chainT != null || e._chainKill || e._chainOf || e._lead || e._coreBall) return;
    if (!isLargeEnemy(e)) return;
    this._credit(e);
  }

  /** Snake head shot down by the player (normal kill of the head). */
  onSnakeHead(_e) { /* 11-03: head kills no longer count — core break only */ }

  _credit(e) {
    if (!e || this.seen.has(e)) return;
    this.seen.add(e);
    (this.credits = this.credits || []).push(e.kind);
    this.kills += 1;
    this._render();
    if (this.kills >= this.def.need && !this.cleared) {
      this.cleared = true;
      this.reward = grantMissionClear(this.def);
      this._render();
      this._setStep(this.reward.first ? 'done' : 'doneAgain');
      this._celebrate();
      return;
    }
    if (this.kills === 1) this._setStep('boom');
    else if (!this.cleared) this._setStep('boom');
  }

  /** 「ミッション達成！」 burst — once per run, at the moment the goal is reached (non-blocking, ~2.2s). */
  _celebrate(onTop = false) {
    if (this.fxShown) return;
    this.fxShown = true;
    this.fxCount = (this.fxCount || 0) + 1;
    try { sfx.missionClear(); } catch (_) { /* ignore */ }
    const g = this.game, cv = g.canvas;
    let host = document.getElementById('ui-overlay') || document.body;
    const eo = document.getElementById('end-overlay');
    if (onTop && eo && eo.parentElement) host = eo.parentElement; // win missions: over the result overlay
    if (!cv) return;
    const r = cv.getBoundingClientRect(), pr = (host === document.body ? document.body : host).getBoundingClientRect();
    const H = r.height, W = r.width;
    const oppH = Math.floor(H * OPP_RATIO), ownH = Math.floor(H * OWN_RATIO);
    const fx = document.createElement('div');
    fx.className = 'mission-fx';
    Object.assign(fx.style, { left: `${r.left - pr.left}px`, top: `${r.top - pr.top + oppH}px`, width: `${W}px`, height: `${ownH}px` });
    const raw = 'ミッション達成！';
    const txt = (window.NKI18N && window.NKI18N.t) ? window.NKI18N.t(raw) : raw;
    fx.innerHTML = '<div class="mfx-flash"></div><div class="mfx-ring"></div><div class="mfx-burst"></div><div class="mfx-banner"><div class="mfx-text"></div></div>';
    fx.querySelector('.mfx-text').textContent = txt;
    // first clear only: 「+3000 PT 獲得！」 gain burst (actual reward value; not on replays)
    const rw = this.reward && this.reward.first ? Number(this.reward.gain || this.def.reward || 0) : 0;
    let gain = null;
    if (rw > 0) {
      gain = document.createElement('div');
      gain.className = 'mfx-gain';
      const getRaw = '獲得！';
      gain.innerHTML = '<span class="mfx-coin" aria-hidden="true"></span><span class="mfx-pt">+0 PT</span><span class="mfx-get"></span><span class="mfx-once"></span>';
      gain.querySelector('.mfx-get').textContent = (window.NKI18N && window.NKI18N.t) ? window.NKI18N.t(getRaw) : getRaw;
      const onceRaw = '（初回クリアのみ）';
      gain.querySelector('.mfx-once').textContent = (window.NKI18N && window.NKI18N.t) ? window.NKI18N.t(onceRaw) : onceRaw;
      fx.querySelector('.mfx-banner').after(gain);
      const coins = document.createElement('div'); coins.className = 'mfx-coins';
      for (let i = 0; i < 14; i++) {
        const c = document.createElement('i'); c.className = 'mfx-c';
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, d = Math.min(W, ownH * 1.4) * (0.22 + Math.random() * 0.25);
        c.style.setProperty('--dx', `${Math.cos(a) * d}px`); c.style.setProperty('--dy', `${Math.sin(a) * d * 0.7}px`);
        c.style.animationDelay = `${0.55 + Math.random() * 0.35}s`;
        coins.appendChild(c);
      }
      gain.appendChild(coins);
      const ptEl = gain.querySelector('.mfx-pt'), t0 = performance.now() + 550, dur = 700;
      setTimeout(() => { try { sfx.coinGain(); } catch (_) { /* ignore */ } }, 550);
      const step = (now) => {
        if (!gain.isConnected) return;
        const k = Math.max(0, Math.min(1, (now - t0) / dur)), v = Math.round(rw * (1 - Math.pow(1 - k, 3)));
        ptEl.textContent = `+${v} PT`;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    const burst = fx.querySelector('.mfx-burst');
    const cols = ['#ffe27a', '#7cffb5', '#7ad7ff', '#ff8ad8', '#ffffff', '#ffb347'];
    for (let i = 0; i < 34; i++) {
      const d = document.createElement('i');
      const a = (i / 34) * Math.PI * 2 + Math.random() * 0.3, dist = Math.min(W, ownH * 1.6) * (0.28 + Math.random() * 0.3);
      d.className = i % 3 === 0 ? 'mfx-star' : 'mfx-bit';
      if (i % 3 === 0) d.textContent = '★';
      d.style.setProperty('--dx', `${Math.cos(a) * dist}px`);
      d.style.setProperty('--dy', `${Math.sin(a) * dist * 0.75}px`);
      d.style.setProperty('--rot', `${Math.round(Math.random() * 720 - 360)}deg`);
      d.style.color = d.style.background = cols[i % cols.length];
      if (i % 3 === 0) d.style.background = 'none';
      d.style.animationDelay = `${0.12 + Math.random() * 0.12}s`;
      burst.appendChild(d);
    }
    if (onTop) { fx.style.zIndex = '60'; fx.classList.add('mfx-top'); }
    host.appendChild(fx);
    this.fx = fx;
    // fit the banner text into the field width (long translations / small phones)
    const tx = fx.querySelector('.mfx-text');
    const fit = () => {
      let fs = Math.max(20, Math.min(46, W * 0.11, ownH * 0.2));
      for (let i = 0; i < 30; i++) {
        tx.style.fontSize = fs + 'px';
        if (tx.scrollWidth <= tx.clientWidth + 0.5 && tx.scrollWidth <= W * 0.82 && tx.scrollHeight <= ownH * 0.6) break;
        fs = Math.max(12, fs * 0.93);
      }
    };
    fit(); requestAnimationFrame(fit);
    if (gain) {
      const gp = gain.querySelector('.mfx-pt'), gg = gain.querySelector('.mfx-get');
      const gfit = () => {
        const save = gp.textContent; gp.textContent = `+${rw} PT`;
        let fs = Math.max(16, Math.min(34, W * 0.085, ownH * 0.15));
        for (let i = 0; i < 30; i++) {
          gp.style.fontSize = fs + 'px'; gg.style.fontSize = (fs * 0.62) + 'px'; gain.querySelector('.mfx-once').style.fontSize = Math.max(10, Math.min(14, fs * 0.42)) + 'px';
          const rowW = gp.getBoundingClientRect().width + gg.getBoundingClientRect().width + fs * 1.4; if (rowW <= W * 0.86 && gain.scrollWidth <= gain.clientWidth + 0.5) break;
          fs = Math.max(10, fs * 0.93);
        }
        gp.style.minWidth = gp.getBoundingClientRect().width + 'px';
        gp.textContent = save;
      };
      gfit(); requestAnimationFrame(gfit);
    }
    setTimeout(() => { fx.remove(); if (this.fx === fx) this.fx = null; }, gain ? 2900 : 2300);
  }

  _hpPct() {
    const P = this.game.state && this.game.state.player;
    if (!P) return 100;
    return Math.max(0, Math.round((P.hp / (P.maxHp || 150)) * 100));
  }

  result(won) {
    if (this.def.type === 'win' && !this.cleared) {
      this.hpAtEnd = this._hpPct();
      if (won && (!this.def.minHpPct || this.hpAtEnd >= this.def.minHpPct)) {
        this.cleared = true; this.kills = 1;
        this.reward = grantMissionClear(this.def);
        this._pendingFx = true; // shown with the result overlay (Game.showEndCelebration)
      }
    }
    return { def: this.def, won: !!won, hpAtEnd: this.hpAtEnd, kills: this.kills, need: this.def.need, cleared: this.cleared, reward: this.reward, total: loadMeta().pt };
  }
}

/** Result-screen box (inserted by Game.showEndCelebration). */
export function missionResultBox(res) {
  const box = document.createElement('div');
  box.className = 'mission-result ' + (res.cleared ? 'mr-clear' : 'mr-fail');
  const k = Math.min(res.kills, res.need);
  const rw = res.cleared
    ? (res.reward && res.reward.first ? `<div class="mr-line mr-reward">クリア報酬 <b>+${res.def.reward} PT</b></div>` : '<div class="mr-line mr-reward">報酬は受け取り済み</div>')
    : `<div class="mr-line mr-sub">${res.def.fail || ''}</div>`;
  box.innerHTML = `<div class="mr-head">${res.cleared ? 'ミッションクリア！' : 'ミッション失敗…'}</div>`
    + `<div class="mr-line mr-name">ミッション${res.def.id}「${res.def.name}」</div>`
    + `<div class="mr-line mr-goal">${res.def.goal}</div>`
    + (res.def.minHpPct ? `<div class="mr-line mr-count">ライフ <b>${res.hpAtEnd ?? 0}%</b><span>（必要 ${res.def.minHpPct}%以上）</span></div>` : res.def.type === 'win' ? '' : `<div class="mr-line mr-count">${res.def.chip || 'コア敵'} <b>${k}/${res.need}</b></div>`)
    + `<div class="mr-line mr-battle">対戦PT <b>+${res.battlePt || 0} PT</b></div>`
    + rw
    + `<div class="mr-line mr-total">いまの持ちPT　<b>${res.total}</b></div>`
    + '<div class="mr-btns"><button type="button" class="menu-btn mr-retry">もう一度挑戦</button><button type="button" class="menu-btn mr-select">ミッション選択へ</button></div>';
  box.querySelector('.mr-retry').addEventListener('click', () => { try { window.__stbMissionRetry && window.__stbMissionRetry(res.def.id); } catch (_) { /* ignore */ } });
  box.querySelector('.mr-select').addEventListener('click', () => { try { window.__stbMissionSelect && window.__stbMissionSelect(); } catch (_) { /* ignore */ } });
  return box;
}
