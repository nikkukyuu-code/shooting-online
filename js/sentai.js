/**
 * 転送キャラの個性 (user 10-07): per-unit MOVEMENT signature + SIGNATURE ATTACK with a visible tell.
 * Data-driven: PERSONA[id] = { mv, m, sp, s, ja }.
 *   mv / m : movement driver + params (MOVERS below)
 *   sp / s : signature attack + params (SPECIALS below), fired every s.cd seconds (telegraph first)
 *   ja     : one-line personality for the shop / deck (easy Japanese)
 * The per-unit volley loadout (catalog.js UNIT_ATTACKS → 攻撃力) is unchanged; a signature attack
 * REPLACES the next volley (fireCd is pushed back), so the unit's damage per second stays close
 * to its price / deck power. Same code for player-sent, COM-sent and online-received units.
 * Render state lives in short fields (zk tell kind, zu 0..1 progress, zx/zy target, zc rows/columns,
 * za alpha, zs shield, zg angle) that go into the online snapshot as-is (entities.js serializeField).
 */
import { spawnBullet, resolveEnemyTier } from './entities.js?v=20261010115712';
import { attackCtx } from './attacks.js?v=20261010115712';
import { unitAttackLoadout } from './catalog.js?v=20261010115712';

const PI = Math.PI, TAU = PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SMALL = new Set(['swarm', 'basic', 'drone', 'elite']);

/* ------------------------------------------------------------------ table */
// cd: seconds between signature attacks (cheap units slower / weaker, expensive faster / stronger)
export const PERSONA = {
  // ---- starters / commons ----
  basic:            { mv: 'patrol', m: { spd: 46 }, sp: 'snipe', s: { cd: 6.5, tell: 0.85, spd: 330 }, ja: '上下に見回りをする見張りロボ。赤い線でねらってから1発うつ。' },
  swarm:            { mv: 'flock', m: { spd: 70 }, sp: 'ring', s: { cd: 8.5, tell: 0.6, n: 5, spd: 100 }, ja: '群れでふわふわ近づき、光ったら小さな輪の弾を出す。' },
  drone:            { mv: 'zigzag', m: { spd: 95 }, sp: 'mines', s: { cd: 7, n: 2 }, ja: 'ジグザグに飛び回り、通ったあとに機雷を置いていく。' },
  elite:            { mv: 'charge', m: { spd: 430, wait: 2.6 }, sp: null, s: {}, ja: '止まって赤く光ったら、まっすぐ横に突っこんでくる。' },
  gunship_alpha:    { mv: 'walker', m: { step: 46 }, sp: 'bomb', s: { cd: 7.5, n: 6 }, ja: 'クモのように歩いては止まり、ねらった場所に爆弾を投げる。' },
  gunship_alpha_b:  { mv: 'zigzag', m: { spd: 80 }, sp: 'snipe', s: { cd: 7.5, tell: 0.75, n: 2, a: 0.14 }, ja: 'ジグザグに動き、止まって2発のねらい撃ち。' },
  fighter_mk2:      { mv: 'charge', m: { spd: 460, wait: 2.4, aim: true }, sp: null, s: {}, ja: 'ななめにねらいを定めて、自機のいた場所へ突っこむ。' },
  scout_drone:      { mv: 'blink', m: { stay: 2.6 }, sp: 'snipe', s: { cd: 5.5, tell: 0.6, spd: 400 }, ja: 'ワープで場所を変える偵察機。現れるとすばやくねらい撃ち。' },
  combat_walker:    { mv: 'walker', m: { step: 38 }, sp: 'rear', s: { cd: 6, n: 2 }, ja: '歩いて止まり、うしろへ投げたブーメランが戻ってくる。' },
  // ---- uncommon ----
  tank:             { mv: 'press', m: { spd: 26 }, sp: 'shield', s: { cd: 6.5, dur: 2.6 }, ja: '前に盾を出してじりじり押してくる。盾は前からの弾をふせぐ。' },
  assault_transport:{ mv: 'hover', m: { stop: 2.4 }, sp: 'drones', s: { cd: 6.5, n: 2 }, ja: '止まっては小さな兵士メカを2機出す。メカは光ってから飛んでくる。' },
  scout_frigate:    { mv: 'circle8', m: { per: 7 }, sp: 'snipe', s: { cd: 7.5, tell: 0.7, n: 3, a: 0.2 }, ja: '8の字に走り回り、3方向にねらい撃ち。' },
  sea_patrol:       { mv: 'weave', m: { amp: 0.32, per: 4.5 }, sp: 'mines', s: { cd: 6, n: 3 }, ja: '波のように上下に大きくゆれ、機雷をまく巡視艇。' },
  gorgon_mech:      { mv: 'orbit', m: { r: 46, w: 1.1 }, sp: 'beam', s: { cd: 6.5, tell: 1.0 }, ja: 'ぐるぐる回り、目が光ったら止まって太いビーム。' },
  destroyer_class:  { mv: 'swoop', m: { dur: 2.4 }, sp: 'rain', s: { cd: 7.5, n: 4 }, ja: '大きく弧をえがいて飛び、上から火の雨をふらせる。' },
  cruiser_class:    { mv: 'hover', m: { stop: 2.8 }, sp: 'gate', s: { cd: 7.5, n: 4 }, ja: '止まって何本もの横レーザーで道をしきる。すき間へにげよう。' },
  mech:             { mv: 'patrol', m: { spd: 30 }, sp: 'shield', s: { cd: 6, dur: 2.8 }, ja: '盾を出しながら上下に動くかたい戦艦。盾のあいだは撃ってこない。' },
  heavy_sentinel_ship: { mv: 'guard', m: {}, sp: 'beam', s: { cd: 6, tell: 0.95 }, ja: '仲間の前に立ちはだかり、太いビームで守る。' },
  missile_destroyer:{ mv: 'hover', m: { stop: 2.2 }, sp: 'bomb', s: { cd: 8, n: 6 }, ja: '止まってはねらった場所にミサイル爆弾を落とす。' },
  siege_mech:       { mv: 'walker', m: { step: 30 }, sp: 'rain', s: { cd: 7.5, n: 5 }, ja: 'ずしんずしん歩き、止まると上から砲弾の雨。' },
  cruiser_gun:      { mv: 'hover', m: { stop: 3 }, sp: 'beam', s: { cd: 5.5, tell: 0.95 }, ja: '止まって大砲をためて、太いビームを撃つ。' },
  fleet_carrier:    { mv: 'circle8', m: { per: 9 }, sp: 'drones', s: { cd: 6, n: 2 }, ja: 'ゆっくり8の字に回り、小型機を出す空母。' },
  drone_swarm_node_variant: { mv: 'flock', m: { spd: 55 }, sp: 'drones', s: { cd: 6, n: 3 }, ja: '群れで近づき、小さな虫メカを3匹はき出す。' },
  tracking_sentry:  { mv: 'track', m: { lag: 2.2 }, sp: 'snipe', s: { cd: 5, tell: 1.05, spd: 470 }, ja: 'しつこく高さを合わせ、長くねらってから高速弾。' },
  // ---- rare ----
  light_destroyer:  { mv: 'swoop', m: { dur: 2.2 }, sp: 'snipe', s: { cd: 5, tell: 0.7, n: 3, a: 0.16 }, ja: '弧をえがいて飛びこみ、3発のねらい撃ち。' },
  battlecruiser_b:  { mv: 'press', m: { spd: 24 }, sp: 'beam', s: { cd: 5.5, tell: 0.95 }, ja: '前へ前へと押し出し、太いビームで焼く。' },
  light_cruiser:    { mv: 'circle8', m: { per: 8 }, sp: 'gate', s: { cd: 6, n: 3 }, ja: '8の字に動き、3本の横レーザーで道をしきる。' },
  rapid_fire_mech:  { mv: 'walker', m: { step: 34 }, sp: 'snipe', s: { cd: 5, tell: 0.7, burst: 5, spd: 330 }, ja: '歩いて止まり、ねらった方向へ5連射。' },
  dreadnought_c1:   { mv: 'anchor', m: {}, sp: 'gate', s: { cd: 7, n: 5 }, ja: 'その場にどっしり陣取り、5本の横レーザーのかべ。' },
  heavy_gunner:     { mv: 'hover', m: { stop: 2.6 }, sp: 'rain', s: { cd: 5.5, n: 5 }, ja: '止まって空へ撃ち上げ、弾の雨をふらせる。' },
  battlecruiser:    { mv: 'retreat', m: {}, sp: 'beam', s: { cd: 5.5, tell: 0.9 }, ja: 'きょりをとって、遠くから太いビーム。' },
  bio_cruiser:      { mv: 'weave', m: { amp: 0.26, per: 5.5 }, sp: 'ring', s: { cd: 5.5, tell: 0.7, n: 12, spd: 100 }, ja: 'うねうね泳ぎ、ふくらんだら胞子の輪をまく。' },
  stealth_corvette: { mv: 'cloak', m: {}, sp: 'snipe', s: { cd: 4.5, tell: 0.55, n: 3, a: 0.2 }, ja: '姿を消して移動し、現れたらすぐねらい撃ち。消えている間は弾が当たらない。' },
  heavy_mech:       { mv: 'hover', m: { stop: 3 }, sp: 'ring', s: { cd: 5.5, tell: 0.7, n: 12, spd: 115 }, ja: '止まって全身から輪の弾を出す重装メカ。' },
  artillery_platform:{ mv: 'anchor', m: {}, sp: 'bomb', s: { cd: 7, n: 8 }, ja: '動かない砲台。ねらった場所へ次々と爆弾を撃ちこむ。' },
  orbital_defense:  { mv: 'orbit', m: { r: 40, w: 0.9 }, sp: 'ring', s: { cd: 5.5, tell: 0.7, n: 12, spd: 110 }, ja: '回りながら全方位に輪の弾を広げる。' },
  plasma_bomber:    { mv: 'swoop', m: { dur: 2.6 }, sp: 'bomb', s: { cd: 6.5, n: 8 }, ja: '急降下しながら爆弾を落とす爆撃機。' },
  shield_frigate:   { mv: 'guard', m: {}, sp: 'shield', s: { cd: 5.5, dur: 3 }, ja: '仲間の前に入り、盾でかばう。盾のあいだは撃たない。' },
  golem:            { mv: 'walker', m: { step: 28 }, sp: 'gate', s: { cd: 5.5, n: 4 }, ja: 'ゆっくり歩き、止まると4本の横レーザー。' },
  railgun_tank:     { mv: 'retreat', m: {}, sp: 'snipe', s: { cd: 5, tell: 1.15, spd: 620, rail: 1 }, ja: '遠くへにげながら、長くねらって超高速のレールガン。' },
  drone_carrier:    { mv: 'anchor', m: {}, sp: 'drones', s: { cd: 5, n: 3 }, ja: '止まって小型ドローンを次々に出す母艦。' },
  // ---- epic ----
  orbital_cannon:   { mv: 'anchor', m: {}, sp: 'beam', s: { cd: 5, tell: 1.0, wide: 1 }, ja: '動かずに力をためて、3本まとめた太いビーム。' },
  super_battle_mech:{ mv: 'charge', m: { spd: 300, wait: 3.6 }, sp: 'ring', s: { cd: 7.5, tell: 0.7, n: 12, spd: 110 }, ja: '巨体で突進してくる戦闘メカ。待つ間は輪の弾。赤い予告の列からにげよう。' },
  siege_destroyer:  { mv: 'press', m: { spd: 24 }, sp: 'bomb', s: { cd: 7.5, n: 8 }, ja: 'じりじり進み、大きな爆弾を投げこむ。' },
  fleet_support_ship:{ mv: 'circle8', m: { per: 8 }, sp: 'heal', s: { cd: 5.5, p: 0.3 }, ja: '8の字に動き、緑の光で仲間を回復する支援艦。先にねらおう。' },
  command_carrier:  { mv: 'patrol', m: { spd: 32 }, sp: 'drones', s: { cd: 5, n: 3 }, ja: '上下に動きながら小型機に命令して飛ばす。' },
  planetary_defense_array: { mv: 'orbit', m: { r: 30, w: 0.7 }, sp: 'gate', s: { cd: 5, n: 5 }, ja: 'ゆっくり回り、5本の横レーザーのかべを作る。' },
  mobile_fortress:  { mv: 'press', m: { spd: 20 }, sp: 'gate', s: { cd: 5, n: 4 }, ja: '動く要塞。押し出しながら横レーザーのかべ。' },
  dreadnought_c3:   { mv: 'blink', m: { stay: 3.2 }, sp: 'beam', s: { cd: 4, tell: 0.95 }, ja: 'ワープで現れ、太いビームを撃つ弩級艦。' },
  heavy_dreadnought:{ mv: 'anchor', m: {}, sp: 'rain', s: { cd: 4.8, n: 6 }, ja: 'どっしり構えて、上から弾の雨をふらせる。' },
  carrier_hive:     { mv: 'weave', m: { amp: 0.2, per: 6 }, sp: 'drones', s: { cd: 4.8, n: 4 }, ja: 'ゆらゆら動き、虫メカを4匹はき出す女王艦。' },
  // ---- legendary ----
  titan_mech:       { mv: 'walker', m: { step: 26 }, sp: 'ring', s: { cd: 5.5, tell: 0.75, n: 12, spd: 115, waves: 2 }, ja: '大地をふみしめ、2重の輪の弾を出す巨神。' },
  orbital_blaster:  { mv: 'patrol', m: { spd: 26 }, sp: 'beam', s: { cd: 4.8, tell: 1.0, wide: 1 }, ja: '上下に動き、止まって3本まとめた太いビーム。' },
  central_core_defender: { mv: 'blink', m: { stay: 3 }, sp: 'ring', s: { cd: 4.8, tell: 0.75, n: 14, spd: 110, waves: 2 }, ja: 'ワープしては光り、2重の輪の弾を放つ守護神。' },
  megamech_alpha:   { mv: 'press', m: { spd: 22 }, sp: 'snipe', s: { cd: 4.5, tell: 0.75, burst: 6, spd: 340 }, ja: '前に出ながら、ねらった方向へ6連射。' },
  siege_fortress:   { mv: 'press', m: { spd: 18 }, sp: 'rain', s: { cd: 4.5, n: 6 }, ja: 'ゆっくり進む攻城要塞。上から砲弾の雨。' },
  planetary_siege_engine: { mv: 'patrol', m: { spd: 22 }, sp: 'bomb', s: { cd: 4.5, n: 10 }, ja: '上下に動き、大きな爆弾を投げこむ攻城機。' },
  colony_ship:      { mv: 'hover', m: { stop: 3.4 }, sp: 'heal', s: { cd: 5, p: 0.3, self: 1 }, ja: '止まって緑の光で仲間や自分を回復する方舟。' },
  super_carrier:    { mv: 'press', m: { spd: 18 }, sp: 'drones', s: { cd: 4.5, n: 4 }, ja: '前に出ながら小型機を4機ずつ出す超空母。' },
  boss:             { mv: 'track', m: { lag: 0.8 }, sp: 'beam', s: { cd: 4.5, tell: 1.0, wide: 1 }, ja: 'ゆっくり自機の高さに合わせ、止まって極太ビーム。' },
  ai_core:          { mv: 'orbit', m: { r: 34, w: 1.3 }, sp: 'snipe', s: { cd: 3.8, tell: 0.85, n: 3, a: 0.3 }, ja: '回りながら3本の線でねらいを定める超知性。' },
  planet_eater:     { mv: 'press', m: { spd: 16 }, sp: 'ring', s: { cd: 4.5, tell: 0.8, n: 16, spd: 105, waves: 2 }, ja: '少しずつ近づき、すいこむように2重の輪の弾。' },
  titan_fortress:   { mv: 'anchor', m: {}, sp: 'ring', s: { cd: 4.5, tell: 0.75, n: 14, spd: 115, waves: 2 }, ja: '動かない巨大要塞。2重の輪の弾を放つ。' },
  titan_carrier:    { mv: 'retreat', m: {}, sp: 'drones', s: { cd: 4.5, n: 4 }, ja: 'きょりをとりながら小型機を4機ずつ出す。' },
  supreme_command_center: { mv: 'anchor', m: {}, sp: 'heal', s: { cd: 4.5, p: 0.3, self: 1 }, ja: '動かずに仲間と自分を回復する司令艦。' },
  hyper_dreadnought:{ mv: 'patrol', m: { spd: 22 }, sp: 'gate', s: { cd: 4.5, n: 5 }, ja: '上下に動き、5本の横レーザーのかべ。' },
  mobile_planet_killer: { mv: 'track', m: { lag: 0.9 }, sp: 'bomb', s: { cd: 5, n: 8 }, ja: '自機の高さへ動き、ねらった場所に巨大爆弾。' },
  colossal_hive_ship: { mv: 'flock', m: { spd: 22 }, sp: 'mines', s: { cd: 4.2, n: 5 }, ja: '群れのようにゆらぎながら、虫の卵（機雷）をばらまく巨大艦。' },
  super_dreadnought:{ mv: 'retreat', m: {}, sp: 'rain', s: { cd: 4.2, n: 6 }, ja: 'きょりをとって、上から弾の雨をふらせる最強艦。' },
};

/** Short Japanese role name per movement / attack (deck & shop chips). */
export const MOVE_JA = {
  patrol: '上下見回り', flock: '群れ', zigzag: 'ジグザグ', charge: '突進', walker: '歩行', track: '高さ合わせ', blink: 'ワープ',
  press: '前進', hover: '止まって攻撃', circle8: '8の字', weave: '波ゆれ', orbit: '旋回', swoop: '急降下', guard: '盾役',
  anchor: '陣取り', retreat: 'にげ撃ち', cloak: 'ステルス',
};
export const SPECIAL_JA = {
  snipe: 'ねらい撃ち', ring: '輪の弾', mines: '機雷', bomb: '爆弾', rear: 'ブーメラン', shield: '盾', drones: '小型機',
  beam: '太いビーム', rain: '弾の雨', gate: 'レーザーのかべ', heal: '回復', dash: '体当たり',
};

export function personaOf(e) {
  return e && e.sent ? PERSONA[e.kind] || null : null;
}

/* ------------------------------------------------------------------ helpers */
function bounds(e, fw, fh) {
  const hw = (e.w || 40) * 0.5, hh = (e.h || 30) * 0.5;
  return { x0: fw * 0.42, x1: fw - hw - 6, y0: hh + 6, y1: fh - hh - 6, hw, hh };
}
function goTo(e, x, y, spd, dt) {
  const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
  if (d <= spd * dt || d < 0.5) { e.x = x; e.y = y; return true; }
  e.x += (dx / d) * spd * dt; e.y += (dy / d) * spd * dt;
  return false;
}
function ease(e, x, y, k, dt) {
  const f = 1 - Math.exp(-k * dt);
  e.x += (x - e.x) * f; e.y += (y - e.y) * f;
}
function sizeSpd(e) {
  const t = resolveEnemyTier(e.kind);
  return SMALL.has(t) ? 1 : (t === 'boss' || t === 'golem') ? 0.55 : 0.7;
}
/** How long the unit fights before it leaves to the left (≈ the old drift-out time). */
function stayTime(e) {
  const t = resolveEnemyTier(e.kind);
  return t === 'swarm' || t === 'basic' || t === 'drone' ? 8 : t === 'elite' ? 11 : t === 'boss' ? 18 : 15;
}

/* ------------------------------------------------------------------ movers */
// mover(e, pm, M, X) — X = { dt, fw, fh, tx, ty, field }. Sets pm.fire (false = hold the volley).
const MOVERS = {
  patrol(e, pm, M, X) { // fixed column, sweeps top ↔ bottom
    const B = bounds(e, X.fw, X.fh);
    if (pm.dir == null) { pm.dir = e.y < X.fh / 2 ? 1 : -1; pm.cx = clamp(e.x, X.fw * 0.62, B.x1); }
    if (!pm.hold) e.y += pm.dir * (M.spd || 40) * X.dt;
    if (e.y > B.y1) { e.y = B.y1; pm.dir = -1; } else if (e.y < B.y0) { e.y = B.y0; pm.dir = 1; }
    ease(e, pm.cx, e.y, 3, X.dt);
  },
  flock(e, pm, M, X) { // loose swarm: wanders toward the ship's row with jitter
    const B = bounds(e, X.fw, X.fh);
    pm.t = (pm.t || 0) + X.dt;
    if (!pm.gx || pm.t > pm.next) { pm.next = pm.t + rnd(0.7, 1.3); pm.gx = rnd(X.fw * 0.48, B.x1); pm.gy = clamp(X.ty + rnd(-70, 70), B.y0, B.y1); }
    const jx = Math.sin(pm.t * 7.3 + (e._uid || 0)) * 10, jy = Math.cos(pm.t * 6.1 + (e._uid || 0) * 1.7) * 12;
    if (!pm.hold) goTo(e, pm.gx, pm.gy, (M.spd || 60), X.dt);
    e.x += jx * X.dt * 3; e.y += jy * X.dt * 3;
  },
  zigzag(e, pm, M, X) { // diagonal bounces off top / bottom, x drifts in and out
    const B = bounds(e, X.fw, X.fh);
    if (pm.vy == null) { pm.vy = (Math.random() < 0.5 ? -1 : 1) * (M.spd || 90); pm.vx = -(M.spd || 90) * 0.45; }
    if (pm.hold) return;
    e.y += pm.vy * X.dt; e.x += pm.vx * X.dt;
    if (e.y < B.y0) { e.y = B.y0; pm.vy = Math.abs(pm.vy); } else if (e.y > B.y1) { e.y = B.y1; pm.vy = -Math.abs(pm.vy); }
    if (e.x < X.fw * 0.45) pm.vx = Math.abs(pm.vx); else if (e.x > B.x1) pm.vx = -Math.abs(pm.vx);
  },
  charge(e, pm, M, X) { // hold → red lane tell → dash across → brake → glide back
    const B = bounds(e, X.fw, X.fh);
    pm.t = (pm.t || 0) + X.dt;
    if (!pm.st) { pm.st = 'hold'; pm.t = rnd(0, 0.6); pm.hy = e.y; }
    if (pm.st === 'hold') {
      ease(e, clamp(e.x, X.fw * 0.66, B.x1), pm.hy + Math.sin(pm.t * 2.2) * 14, 3, X.dt);
      if (pm.t > (M.wait || 2.6) && !pm.hold) {
        pm.st = 'tell'; pm.t = 0;
        // aimed chargers lock the ship position now (no tracking during the tell)
        const ang = M.aim ? Math.atan2(X.ty - e.y, X.tx - e.x) : PI;
        pm.ang = M.aim ? clamp(ang < 0 ? ang + TAU : ang, PI - 0.6, PI + 0.6) : PI;
      }
    } else if (pm.st === 'tell') {
      pm.fire = false;
      e._shake = 0.05;
      e.zk = 'dash'; e.zu = Math.min(1, pm.t / 0.75); e.zg = pm.ang;
      if (pm.t > 0.75) { pm.st = 'dash'; pm.t = 0; e.zk = 'dashing'; }
    } else if (pm.st === 'dash') {
      pm.fire = false;
      const spd = M.spd || 420;
      e.x += Math.cos(pm.ang) * spd * X.dt; e.y += Math.sin(pm.ang) * spd * X.dt;
      e.y = clamp(e.y, B.y0, B.y1);
      if (e.x < X.fw * 0.08 + B.hw * 0.3 || pm.t > 2) { pm.st = 'back'; pm.t = 0; e.zk = undefined; }
    } else { // back: slower glide home (no fire for a beat → punish window)
      pm.fire = pm.t > 0.8;
      if (goTo(e, Math.max(X.fw * 0.72, B.x0), clamp(e.y, B.y0, B.y1), 120 * sizeSpd(e), X.dt)) { pm.st = 'hold'; pm.t = 0; pm.hy = e.y; }
    }
  },
  walker(e, pm, M, X) { // step (move) ↔ plant (fire) rhythm
    const B = bounds(e, X.fw, X.fh);
    pm.t = (pm.t || 0) + X.dt;
    if (!pm.st) { pm.st = 'plant'; pm.t = 0; }
    if (pm.st === 'step') {
      pm.fire = false;
      const u = Math.min(1, pm.t / 0.5);
      e.x = pm.sx + (pm.gx - pm.sx) * u; e.y = pm.sy + (pm.gy - pm.sy) * u - Math.sin(u * PI) * 6;
      if (u >= 1) { pm.st = 'plant'; pm.t = 0; e._shake = 0.06; }
    } else if (pm.t > 0.85 && !pm.hold) {
      pm.st = 'step'; pm.t = 0; pm.sx = e.x; pm.sy = e.y;
      const st = M.step || 40;
      pm.gx = clamp(e.x + rnd(-1, 0.6) * st, X.fw * 0.5, B.x1);
      pm.gy = clamp(e.y + Math.sign(X.ty - e.y || 1) * st * rnd(0.3, 0.9), B.y0, B.y1);
    }
  },
  track(e, pm, M, X) { // follows the ship's height with lag
    const B = bounds(e, X.fw, X.fh);
    if (pm.cx == null) pm.cx = clamp(e.x, X.fw * 0.68, B.x1);
    if (pm.hold) return;
    const k = 1 / (M.lag || 1.4);
    ease(e, pm.cx, clamp(X.ty, B.y0, B.y1), k * 1.6, X.dt);
  },
  blink(e, pm, M, X) { // stays → ring at the next spot → vanishes → reappears there
    const B = bounds(e, X.fw, X.fh);
    pm.t = (pm.t || 0) + X.dt;
    if (!pm.st) { pm.st = 'stay'; pm.t = 0; }
    if (pm.st === 'stay') {
      if (pm.t > (M.stay || 2.8) && !pm.hold) {
        pm.st = 'tell'; pm.t = 0;
        pm.nx = rnd(Math.max(X.fw * 0.5, B.x0), B.x1);
        let ny = rnd(B.y0, B.y1); if (Math.abs(ny - e.y) < 50) ny = clamp(e.y + (ny > e.y ? 80 : -80), B.y0, B.y1);
        pm.ny = ny;
      }
    } else if (pm.st === 'tell') {
      pm.fire = false;
      e.zk = 'blink'; e.zu = Math.min(1, pm.t / 0.6); e.zx = pm.nx; e.zy = pm.ny;
      e.za = 1 - 0.75 * e.zu;
      if (pm.t > 0.6) { e.x = pm.nx; e.y = pm.ny; pm.st = 'in'; pm.t = 0; e.zk = 'blinkin'; e.zx = undefined; e.zy = undefined; }
    } else { // in: fade back (intangible during the first 0.15 s)
      pm.fire = false;
      e.za = Math.min(1, 0.25 + pm.t / 0.35);
      if (pm.t > 0.35) { pm.st = 'stay'; pm.t = 0; e.zk = undefined; e.za = undefined; }
    }
    pm.ghost = pm.st === 'in' && pm.t < 0.15;
  },
  press(e, pm, M, X) { // slow push to mid-field, then backs off and pushes again
    const B = bounds(e, X.fw, X.fh);
    if (pm.dir == null) pm.dir = -1;
    if (pm.hold) return;
    const near = Math.max(X.fw * 0.36 + B.hw * 0.5, B.x0 - X.fw * 0.06), far = B.x1;
    e.x += pm.dir * (M.spd || 24) * X.dt * (pm.dir > 0 ? 2.2 : 1);
    if (e.x < near) { e.x = near; pm.dir = 1; } else if (e.x > far) { e.x = far; pm.dir = -1; }
    ease(e, e.x, clamp(e.y + (X.ty - e.y) * 0.25, B.y0, B.y1), 0.6, X.dt);
  },
  hover(e, pm, M, X) { // glide to a spot, stop, attack, repeat
    const B = bounds(e, X.fw, X.fh);
    pm.t = (pm.t || 0) + X.dt;
    if (!pm.st) { pm.st = 'stop'; pm.t = 0; }
    if (pm.st === 'go') {
      pm.fire = false;
      if (goTo(e, pm.gx, pm.gy, 95 * sizeSpd(e), X.dt) || pm.t > 2.5) { pm.st = 'stop'; pm.t = 0; }
    } else if (pm.t > (M.stop || 2.6) && !pm.hold) {
      pm.st = 'go'; pm.t = 0;
      pm.gx = rnd(Math.max(X.fw * 0.5, B.x0), B.x1);
      pm.gy = clamp(e.y + (Math.random() < 0.5 ? -1 : 1) * rnd(50, 110), B.y0, B.y1);
    }
  },
  circle8(e, pm, M, X) { // figure-8 over the right half
    const B = bounds(e, X.fw, X.fh);
    if (pm.a == null) { pm.a = 0; pm.cx = (Math.max(X.fw * 0.5, B.x0) + B.x1) / 2; pm.cy = X.fh / 2; }
    if (!pm.hold) pm.a += (TAU / (M.per || 8)) * X.dt;
    const ax = Math.max(4, (B.x1 - Math.max(X.fw * 0.5, B.x0)) / 2), ay = Math.max(4, (B.y1 - B.y0) / 2);
    ease(e, pm.cx + Math.sin(pm.a) * ax, pm.cy + Math.sin(pm.a * 2) * ay, 4, X.dt);
  },
  weave(e, pm, M, X) { // big slow vertical wave, gentle in / out
    const B = bounds(e, X.fw, X.fh);
    if (pm.a == null) { pm.a = Math.asin(clamp((e.y - X.fh / 2) / Math.max(1, X.fh * (M.amp || 0.3)), -1, 1)); pm.cx = e.x; }
    if (!pm.hold) pm.a += (TAU / (M.per || 5)) * X.dt;
    const y = clamp(X.fh / 2 + Math.sin(pm.a) * X.fh * (M.amp || 0.3), B.y0, B.y1);
    const x = clamp(X.fw * 0.72 + Math.cos(pm.a * 0.5) * X.fw * 0.12, Math.max(X.fw * 0.5, B.x0), B.x1);
    ease(e, x, y, 2.5, X.dt);
  },
  orbit(e, pm, M, X) { // circles a slowly drifting anchor
    const B = bounds(e, X.fw, X.fh);
    const r = M.r || 40;
    if (pm.a == null) { pm.a = 0; pm.ax = clamp(e.x, Math.max(X.fw * 0.5, B.x0) + r, B.x1 - r * 0.5); pm.ay = clamp(e.y, B.y0 + r * 0.8, B.y1 - r * 0.8); }
    if (!pm.hold) pm.a += (M.w || 1) * X.dt;
    pm.ay += (clamp(X.ty, B.y0 + r, B.y1 - r) - pm.ay) * 0.15 * X.dt;
    ease(e, pm.ax + Math.cos(pm.a) * r, clamp(pm.ay + Math.sin(pm.a) * r * 0.8, B.y0, B.y1), 5, X.dt);
  },
  swoop(e, pm, M, X) { // arcing dive toward mid-field and back up to the other half
    const B = bounds(e, X.fw, X.fh);
    pm.t = (pm.t || 0) + X.dt;
    if (!pm.st) { pm.st = 'rest'; pm.t = 0.6; }
    if (pm.st === 'rest') {
      ease(e, clamp(e.x, X.fw * 0.66, B.x1), e.y, 2, X.dt);
      if (pm.t > 1.4 && !pm.hold) {
        pm.st = 'arc'; pm.t = 0; pm.sx = e.x; pm.sy = e.y;
        pm.ex = rnd(X.fw * 0.7, B.x1); pm.ey = e.y < X.fh / 2 ? rnd(X.fh * 0.62, B.y1) : rnd(B.y0, X.fh * 0.38);
        pm.cx = X.fw * 0.3; pm.cy = clamp(X.ty, B.y0, B.y1);
      }
    } else {
      const u = Math.min(1, pm.t / (M.dur || 2.4)), v = 1 - u;
      e.x = v * v * pm.sx + 2 * v * u * pm.cx + u * u * pm.ex;
      e.y = v * v * pm.sy + 2 * v * u * pm.cy + u * u * pm.ey;
      if (u >= 1) { pm.st = 'rest'; pm.t = 0; }
    }
  },
  guard(e, pm, M, X) { // stands in front of the toughest ally (between it and the ship)
    const B = bounds(e, X.fw, X.fh);
    let best = null;
    for (const o of X.field || []) {
      if (o === e || !o.sent || o.hp <= 0 || o.warpT > 0 || PERSONA[o.kind]?.mv === 'guard') continue;
      if (!best || (o.maxHp || 0) > (best.maxHp || 0)) best = o;
    }
    if (pm.hold) return;
    if (best) ease(e, clamp(best.x - (best.w || 40) * 0.5 - B.hw - 6, Math.max(X.fw * 0.45, B.x0), B.x1), clamp(best.y, B.y0, B.y1), 1.6, X.dt);
    else ease(e, clamp(X.fw * 0.66, B.x0, B.x1), clamp(X.ty, B.y0, B.y1), 0.9, X.dt);
  },
  anchor(e, pm, M, X) { // plants at its spot and holds (tiny bob)
    const B = bounds(e, X.fw, X.fh);
    pm.t = (pm.t || 0) + X.dt;
    if (pm.ax == null) { pm.ax = clamp(e.x, X.fw * 0.66, B.x1); pm.ay = clamp(e.y, B.y0, B.y1); }
    ease(e, pm.ax, pm.ay + Math.sin(pm.t * 1.3) * 5, 2.5, X.dt);
  },
  retreat(e, pm, M, X) { // keeps far right, slides away from the ship's row
    const B = bounds(e, X.fw, X.fh);
    const away = Math.abs(e.y - X.ty) < 70;
    const gy = away ? (X.ty < X.fh / 2 ? B.y1 : B.y0) : e.y;
    if (pm.hold) return;
    ease(e, B.x1, clamp(gy, B.y0, B.y1), away ? 1.2 : 0.4, X.dt);
  },
  cloak(e, pm, M, X) { // visible (fires) → fades → hidden glide (no hits) → shimmer → visible
    const B = bounds(e, X.fw, X.fh);
    pm.t = (pm.t || 0) + X.dt;
    if (!pm.st) { pm.st = 'vis'; pm.t = 0; }
    if (pm.st === 'vis') {
      e.za = undefined; e.zk = e.zk === 'decloak' ? undefined : e.zk;
      if (pm.t > 2.8 && !pm.hold) { pm.st = 'fade'; pm.t = 0; }
    } else if (pm.st === 'fade') {
      pm.fire = false; e.za = 1 - 0.85 * Math.min(1, pm.t / 0.4);
      if (pm.t > 0.4) { pm.st = 'hid'; pm.t = 0; pm.gx = rnd(X.fw * 0.5, B.x1); pm.gy = clamp(X.ty + rnd(-90, 90), B.y0, B.y1); }
    } else if (pm.st === 'hid') {
      pm.fire = false; e.za = 0.15;
      goTo(e, pm.gx, pm.gy, 150, X.dt);
      if (pm.t > 1.6) { pm.st = 'rev'; pm.t = 0; }
    } else {
      pm.fire = false; e.zk = 'decloak'; e.zu = Math.min(1, pm.t / 0.5); e.za = 0.15 + 0.85 * e.zu;
      if (pm.t > 0.5) { pm.st = 'vis'; pm.t = 0; e.zk = undefined; e.za = undefined; pm.spNow = true; }
    }
    pm.ghost = pm.st === 'hid' || (pm.st === 'fade' && pm.t > 0.2);
  },
};

/* ------------------------------------------------------------------ specials */
// start(e, sp, S, X) → tell set-up; tick(e, sp, S, X) during the tell; fire(e, sp, S, X, c) at the end.
const SPECIALS = {
  snipe: {
    hold: true,
    tell: (S) => S.tell || 0.8,
    tick(e, sp, S, X) { // aim line follows the ship for 65 % of the tell, then locks (blinks white)
      if (sp.u < 0.65 || sp.ax == null) { sp.ax = X.tx; sp.ay = X.ty; }
      e.zk = 'snipe'; e.zx = sp.ax; e.zy = sp.ay; e.zg = S.n > 1 ? (S.a || 0.15) * (S.n - 1) / 2 : 0;
    },
    fire(e, sp, S, X, c) {
      const ang = Math.atan2(sp.ay - c.oy, sp.ax - c.ox);
      const n = S.n || 1, spd = S.spd || 340;
      if (S.burst) { for (let i = 0; i < S.burst; i++) c.later(i * 0.09, (c2) => c2.orb(ang, spd, { k: 'needle' })); return; }
      for (let i = 0; i < n; i++) {
        const b = c.orb(ang + (i - (n - 1) / 2) * (S.a || 0.15), spd, { k: 'needle', life: 3 });
        if (b && S.rail) { b.r = 3.5; b.hb = 1; }
      }
    },
  },
  ring: {
    hold: true,
    tell: (S) => S.tell || 0.7,
    tick(e, sp, S) { e.zk = 'ring'; },
    fire(e, sp, S, X, c) {
      const n = S.n || 10, spd = S.spd || 110;
      const fire1 = (c2, off) => {
        const gap = Math.random() * TAU; // a 2-bullet gap somewhere in the ring
        for (let i = 0; i < n; i++) {
          const a = off + (i * TAU) / n;
          let d = Math.abs(((a - gap + PI) % TAU + TAU) % TAU - PI);
          if (d < (TAU / n) * 0.9) continue;
          c2.orb(a, spd, { k: 'petal', life: 3.8 });
        }
      };
      fire1(c, Math.random() * TAU);
      if ((S.waves || 1) > 1) c.later(0.4, (c2) => fire1(c2, PI / n + Math.random() * 0.2));
    },
  },
  mines: {
    tell: () => 0.35,
    tick(e) { e.zk = 'hatch'; },
    fire(e, sp, S, X, c) {
      for (let i = 0; i < (S.n || 2); i++) {
        const b = c.orb(rnd(0, TAU), rnd(25, 55), { k: 'mine', r: 5, hb: 3, life: 6.5 });
        if (b) { b.x = e.x + rnd(-6, 6); b.y = e.y + (i - ((S.n || 2) - 1) / 2) * 14; }
      }
    },
  },
  bomb: {
    tell: () => 0.0001,
    start(e, sp, S, X) { sp.tx = X.tx + rnd(-10, 10); sp.ty = X.ty + rnd(-10, 10); },
    fire(e, sp, S, X, c) { // shell flies to the marked spot and bursts into a ring there
      const spd = 150, d = Math.hypot(sp.tx - c.ox, sp.ty - c.oy);
      const b = c.orb(Math.atan2(sp.ty - c.oy, sp.tx - c.ox), spd, { k: 'split', r: 6, hb: 2, life: 6 });
      if (!b) return;
      b.st = d / spd; b.sn = Math.max(6, S.n || 8); b.ss = 115;
      b.tgx = sp.tx; b.tgy = sp.ty; b.tg0 = b.st; // target marker (render) until the burst
    },
  },
  rear: {
    hold: true,
    tell: () => 0.45,
    tick(e) { e.zk = 'rear'; },
    fire(e, sp, S, X, c) {
      for (let i = 0; i < (S.n || 2); i++) {
        const b = c.orb((i - ((S.n || 2) - 1) / 2) * 0.55, 210, { k: 'boom', r: 5, hb: 2, life: 4.2 });
        if (b) { b.x = e.x + (e.w || 40) * 0.4; b.ax = -430; }
      }
    },
  },
  shield: {
    tell: () => 0.4,
    tick(e, sp) { e.zk = 'shield'; e.zs = sp.u; },
    fire(e, sp, S) { e._pm.shieldT = S.dur || 2.6; },
  },
  drones: {
    hold: true,
    tell: () => 0.55,
    tick(e) { e.zk = 'hatch'; },
    fire(e, sp, S, X, c) {
      const n = S.n || 2;
      for (let i = 0; i < n; i++) {
        const a = PI + (n > 1 ? (i / (n - 1) - 0.5) * 1.6 : 0);
        const b = c.orb(a, 130, { k: 'mini', r: 6.5, hb: 3, life: 5 });
        if (b) { b.mt = 0; b.mh = 0.55; b.mw = 0.7 + i * 0.12; }
      }
    },
  },
  beam: {
    hold: true,
    tell: (S) => S.tell || 0.95,
    tick(e, sp, S) { e.zk = S.wide ? 'beamw' : 'beam'; },
    fire(e, sp, S, X, c) {
      c.laser(700, 0, 'beam');
      if (S.wide) { c.laser(700, -11, 'beam'); c.laser(700, 11, 'beam'); }
    },
  },
  rain: {
    tell: () => 0.85,
    start(e, sp, S, X) { // columns around the ship (one safe lane between each)
      const n = S.n || 4, gap = 44, x0 = clamp(X.tx - ((n - 1) / 2) * gap + rnd(-gap / 2, gap / 2), 12, X.fw * 0.75);
      sp.cols = []; for (let i = 0; i < n; i++) sp.cols.push(Math.round(x0 + i * gap));
    },
    tick(e, sp) { e.zk = 'rain'; e.zc = sp.cols; },
    fire(e, sp, S, X, c) {
      sp.cols.forEach((x, i) => c.later(i * 0.05, (c2) => {
        const b = spawnBullet(x, -14, 0, 235, 'enemy', false, 2, { life: 3 });
        b.k = 'needle'; c2.emit(b);
      }));
    },
  },
  gate: {
    hold: true,
    tell: () => 0.9,
    start(e, sp, S, X) { // n horizontal rows spread over the pane: the gaps between them are safe
      const n = S.n || 4, sp0 = X.fh / (n + 1), j = rnd(-sp0 * 0.3, sp0 * 0.3);
      sp.rows = []; for (let i = 0; i < n; i++) sp.rows.push(Math.round(clamp(sp0 * (i + 1) + j, 8, X.fh - 8)));
    },
    tick(e, sp) { e.zk = 'gate'; e.zc = sp.rows; },
    fire(e, sp, S, X, c) { for (const y of sp.rows) c.laser(620, y - c.oy); },
  },
  heal: {
    hold: true,
    tell: () => 0.9,
    start(e, sp, S, X) {
      let best = null, bf = 0.999;
      for (const o of X.field || []) {
        if (!o.sent || o.hp <= 0 || o.warpT > 0 || (o === e && !S.self)) continue;
        const f = o.hp / (o.maxHp || 1);
        if (f < bf) { bf = f; best = o; }
      }
      sp.tgt = best;
      if (!best) sp.cancel = true;
    },
    tick(e, sp) { if (sp.tgt) { e.zk = 'heal'; e.zx = sp.tgt.x; e.zy = sp.tgt.y; } },
    fire(e, sp, S) { const o = sp.tgt; if (o && o.hp > 0) { o.hp = Math.min(o.maxHp || o.hp, o.hp + (o.maxHp || 1) * (S.p || 0.3)); o._healFx = 0.6; } },
  },
};

/* ------------------------------------------------------------------ driver */
function clearTell(e) { e.zk = undefined; e.zu = undefined; e.zx = undefined; e.zy = undefined; e.zc = undefined; e.zg = undefined; if (!(e._pm && e._pm.shieldT > 0)) e.zs = undefined; }

/**
 * Movement + signature attack for a sent unit after its warp / linger.
 * Returns { fire } — false = hold the normal volley this frame (moving / telegraphing / shielding).
 */
export function tickPersona(e, X) {
  const P = personaOf(e);
  if (!P) return null;
  const pm = e._pm || (e._pm = { age: 0, spCd: rnd(1.0, 2.0) });
  pm.age += X.dt;
  pm.fire = true;
  if (e._healFx > 0) e._healFx -= X.dt;
  // leave after its time on the field (keeps firing on the way out)
  if (!pm.leave && pm.age > stayTime(e) && !e._sp) pm.leave = true;
  if (pm.leave) {
    e.x -= Math.max(50, (e.speed || 40) * 1.4) * X.dt;
    e.za = undefined; pm.ghost = false;
    clearTell(e); e.zs = undefined; pm.shieldT = 0;
    return { fire: true };
  }
  // signature attack
  const S = P.s || {}, SP = P.sp && SPECIALS[P.sp];
  pm.hold = !!(e._sp && SP && SP.hold);
  if (pm.shieldT > 0) { pm.shieldT -= X.dt; e.zs = 1; if (pm.shieldT <= 0) { e.zs = undefined; e.zk = undefined; } }
  MOVERS[P.mv](e, pm, P.m || {}, X);
  e.y = clamp(e.y, (e.h || 30) * 0.5 + 4, X.fh - (e.h || 30) * 0.5 - 4);
  if (SP) {
    const busy = pm.fire === false && !e._sp; // mover is busy (dash / blink / cloak / walking)
    if (!e._sp) {
      pm.spCd -= X.dt;
      if ((pm.spCd <= 0 || pm.spNow) && !busy && !(pm.shieldT > 0)) {
        pm.spNow = false;
        e._sp = { t: 0, max: SP.tell(S), u: 0 };
        if (SP.start) SP.start(e, e._sp, S, X);
        if (e._sp.cancel) { e._sp = null; pm.spCd = 1.5; }
      }
    }
    if (e._sp) {
      const sp = e._sp;
      sp.t += X.dt; sp.u = Math.min(1, sp.t / sp.max);
      e.zu = sp.u;
      if (SP.tick) SP.tick(e, sp, S, X);
      pm.fire = false;
      if (sp.t >= sp.max) {
        const c = attackCtx(e, X.bullets, X.tx, X.ty);
        SP.fire(e, sp, S, X, c);
        e._sp = null; clearTell(e);
        pm.spCd = (S.cd || 6) * rnd(0.9, 1.1);
        // the signature attack replaces the next volley → damage per second stays near the price
        const lo = unitAttackLoadout(e.kind, resolveEnemyTier(e.kind));
        e.fireCd = Math.max(e.fireCd || 0, (lo && lo.iv) || 1.5);
      }
    }
  }
  if (pm.shieldT > 0) pm.fire = false; // shield up = no shooting (fair window after it drops)
  return { fire: pm.fire !== false };
}

/** Shots pass through (cloaked / mid-blink). */
export function personaIntangible(e) {
  return !!(e && e._pm && e._pm.ghost && !e._pm.leave);
}
/** Front shield blocks a normal (non-pierce) player shot arriving from the left. */
export function personaShieldBlocks(e, b) {
  return !!(e && e._pm && e._pm.shieldT > 0 && !b.pierce && b.x < e.x);
}
