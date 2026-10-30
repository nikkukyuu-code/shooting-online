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
import { spawnBullet, resolveEnemyTier } from './entities.js?v=20261030211733';
import { attackCtx } from './attacks.js?v=20261030211733';
import { unitAttackLoadout } from './catalog.js?v=20261030211733';

const PI = Math.PI, TAU = PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SMALL = new Set(['swarm', 'basic', 'drone', 'elite']);

/* ------------------------------------------------------------------ table */
// cd: seconds between signature attacks (cheap units slower / weaker, expensive faster / stronger)
export const PERSONA = {
  // ---- starters / commons (simple: 1 clear move + 1 slow signature) ----
  basic:            { mv: 'patrol', m: { spd: 46 }, sp: 'snipe', s: { cd: 6.5, tell: 0.85, spd: 330 }, ja: '上下に見回りをする見張りロボ。体が赤く光ったら1発ねらい撃ち。' },
  swarm:            { mv: 'flock', m: { spd: 70 }, sp: 'ring', s: { cd: 8.5, tell: 0.6, n: 5, spd: 100 }, ja: '群れでふわふわ近づき、ピンクに光ったら小さな輪の弾。' },
  drone:            { mv: 'zigzag', m: { spd: 95 }, sp: 'mines', s: { cd: 7, n: 2 }, ja: 'ジグザグに飛び回り、通ったあとに機雷を置いていく。' },
  elite:            { mv: 'charge', m: { spd: 430, wait: 2.6 }, sp: null, s: {}, ja: '止まって体が赤く光ったら、まっすぐ横に突っこんでくる。' },
  tank:             { mv: 'press', m: { spd: 26 }, sp: 'shield', s: { cd: 6.5, dur: 2.6 }, ja: '前に盾を出してじりじり押してくる。盾は前からの弾をふせぐ。' },
  scout_drone:      { mv: 'hop', m: { rest: 2.0, hops: 3 }, sp: 'homing', s: { cd: 6.5, tell: 0.55, n: 1, home: 0.5 }, ja: 'ピョンピョンと短いワープを3回くり返し、止まると小さな追尾ミサイルを1発。' },
  gunship_alpha:    { mv: 'stopgo', m: { dist: 70, stop: 0.8 }, sp: 'fan', s: { cd: 4.2, tell: 0.6, n: 7, a: 0.22, spd: 150 }, ja: 'カクカクと直線で動いては止まり、扇の形に7発ばらまく砲艇。' },
  fighter_mk2:      { mv: 'lunge', m: { hold: 1.8, spd: 300 }, sp: 'shotgun', s: { cd: 6, tell: 0.55, n: 6 }, ja: 'すばやく前へ飛びこみ、近くで散弾をぶっぱなす。遠くなら届かない。' },
  gunship_alpha_b:  { mv: 'strafe', m: { step: 0.9, off: 46 }, sp: 'snake', s: { cd: 7, tell: 0.6, n: 5, amp: 26 }, ja: '自機の上下へサッと横すべりし、くねくね動くへび弾を撃つ。' },
  combat_walker:    { mv: 'walker', m: { step: 38 }, sp: 'rear', s: { cd: 6, n: 2 }, ja: '歩いて止まり、うしろへ投げたブーメランが戻ってくる。' },
  // ---- uncommon ----
  assault_transport:{ mv: 'hover', m: { stop: 2.4 }, sp: 'drones', s: { cd: 6.5, n: 2 }, ja: '止まっては小さな兵士メカを2機出す。メカは光ってから飛んでくる。' },
  scout_frigate:    { mv: 'circle8', m: { per: 7 }, sp: 'homing', s: { cd: 7.5, tell: 0.6, n: 2 }, ja: '8の字に走り回り、少しだけ追いかけてくるミサイルを2発。' },
  mech:             { mv: 'wallhug', m: { spd: 70 }, sp: 'shield', s: { cd: 6, dur: 2.8 }, ja: '画面の上はし・下はしをなぞって動き、盾を出してかたくなる。' },
  heavy_sentinel_ship: { mv: 'guard', m: {}, sp: 'sweep', s: { cd: 6.5, tell: 0.8, n: 4 }, ja: '仲間の前に立ちはだかり、上下に動きながらレーザーを4連続で撃つ。' },
  sea_patrol:       { mv: 'weave', m: { amp: 0.32, per: 4.5 }, sp: 'snake', s: { cd: 9.5, tell: 0.6, n: 4, amp: 34, freq: 4 }, ja: '波のように大きくゆれ、海へびのように長くうねる弾を出す。' },
  gorgon_mech:      { mv: 'orbit', m: { r: 46, w: 1.1 }, sp: 'beam', s: { cd: 6.5, tell: 1.0 }, ja: 'ぐるぐる回り、目が光ったら止まって太いビーム。' },
  destroyer_class:  { mv: 'swoop', m: { dur: 2.4 }, sp: 'rain', s: { cd: 7.5, n: 4 }, ja: '大きく弧をえがいて飛び、体から打ち上げた火の玉が上からふってくる。' },
  cruiser_class:    { mv: 'pendulum', m: { per: 4.2, amp: 0.55 }, sp: 'gate', s: { cd: 11, n: 3 }, ja: 'ふりこのように大きくゆれ、体から3本の横レーザーをならべて撃つ。' },
  drone_swarm_node_variant: { mv: 'flock', m: { spd: 55 }, sp: 'drones', s: { cd: 6, n: 3 }, ja: '群れで近づき、小さな虫メカを3匹はき出す。' },
  tracking_sentry:  { mv: 'track', m: { lag: 2.2 }, sp: 'snipe', s: { cd: 5, tell: 1.05, spd: 470 }, ja: 'しつこく高さを合わせ、長く光ってから高速弾。' },
  // ---- rare ----
  missile_destroyer:{ mv: 'hover', m: { stop: 2.2 }, sp: 'homing', s: { cd: 7, tell: 0.65, n: 4, home: 0.6 }, ja: '止まっては追いかけるミサイルを4発まとめて発射。' },
  siege_mech:       { mv: 'walker', m: { step: 30 }, sp: 'rain', s: { cd: 7.5, n: 5 }, ja: 'ずしんずしん歩き、止まると砲弾を空へ打ち上げてふらせる。' },
  cruiser_gun:      { mv: 'strafe', m: { step: 1.7, off: 46 }, sp: 'beam', s: { cd: 7, tell: 0.95 }, ja: '自機の少し上・下へサッと横すべりし、大砲をためて太いビーム。' },
  fleet_carrier:    { mv: 'circle8', m: { per: 9 }, sp: 'drones', s: { cd: 6, n: 2 }, ja: 'ゆっくり8の字に回り、小型機を出す空母。' },
  light_destroyer:  { mv: 'swoop', m: { dur: 2.2 }, sp: 'boomf', s: { cd: 5.5, tell: 0.6, n: 3 }, ja: '弧をえがいて飛びこみ、行って戻るブーメランを3枚投げる。' },
  battlecruiser_b:  { mv: 'press', m: { spd: 24 }, sp: 'sweep', s: { cd: 4.5, tell: 0.8, n: 8 }, ja: '前へ押し出し、上下に動きながらレーザーを連続で撃つ（掃射）。' },
  light_cruiser:    { mv: 'bounce', m: { spd: 80 }, sp: 'bounce', s: { cd: 7.5, tell: 0.6, n: 4 }, ja: 'ビリヤードの玉のようにかべではね回り、かべではね返る弾を撃つ。' },
  rapid_fire_mech:  { mv: 'walker', m: { step: 34 }, sp: 'snipe', s: { cd: 5, tell: 0.7, burst: 5, spd: 330 }, ja: '歩いて止まり、ねらった方向へ5連射。' },
  dreadnought_c1:   { mv: 'anchor', m: {}, sp: 'gate', s: { cd: 7, n: 5 }, ja: 'その場にどっしり陣取り、体から5本の横レーザーのかべ。' },
  heavy_gunner:     { mv: 'stopgo', m: { dist: 60, stop: 1.1 }, sp: 'rain', s: { cd: 5.5, n: 5 }, ja: 'カクカク動いて止まり、空へ撃ち上げた弾が雨のようにふる。' },
  battlecruiser:    { mv: 'retreat', m: {}, sp: 'beam', s: { cd: 5.5, tell: 0.9 }, ja: 'きょりをとって、遠くから太いビーム。' },
  bio_cruiser:      { mv: 'weave', m: { amp: 0.26, per: 5.5 }, sp: 'spiral', s: { cd: 5.5, tell: 0.7, n: 12, arms: 2, spd: 105 }, ja: 'うねうね泳ぎ、回転しながら胞子をうず巻きにまく。' },
  stealth_corvette: { mv: 'cloak', m: {}, sp: 'snipe', s: { cd: 4.5, tell: 0.55, n: 3, a: 0.2 }, ja: '姿を消して移動し、現れたらすぐ3方向ねらい撃ち。消えている間は弾が当たらない。' },
  heavy_mech:       { mv: 'hover', m: { stop: 3 }, sp: 'ring', s: { cd: 5.5, tell: 0.7, n: 12, spd: 115 }, ja: '止まって全身から輪の弾を出す重装メカ。' },
  artillery_platform:{ mv: 'anchor', m: {}, sp: 'bomb', s: { cd: 7, n: 8 }, ja: '陣取って時々ゆっくり移る砲台。自機のいる所へ砲弾を撃ちこみ、そこで弾ける。' },
  orbital_defense:  { mv: 'orbit', m: { r: 40, w: 0.9 }, sp: 'satellite', s: { cd: 6, tell: 0.6, n: 4 }, ja: '回りながら、体のまわりを回る衛星弾を出し、まとめて飛ばす。' },
  plasma_bomber:    { mv: 'swoop', m: { dur: 2.6 }, sp: 'cluster', s: { cd: 6.5, tell: 0.6, n: 3 }, ja: '急降下しながら、とちゅうで3つに分かれる分裂弾を落とす。' },
  shield_frigate:   { mv: 'guard', m: {}, sp: 'shield', s: { cd: 5.5, dur: 3 }, ja: '仲間の前に入り、盾でかばう。盾のあいだは撃たない。' },
  golem:            { mv: 'pendulum', m: { per: 6, amp: 0.4 }, sp: 'fan', s: { cd: 5.5, tell: 0.7, n: 9, a: 0.16, spd: 140 }, ja: 'ふりこのように重くゆれ、止まると大きな扇の形に9発の弾幕。' },
  railgun_tank:     { mv: 'retreat', m: {}, sp: 'snipe', s: { cd: 5, tell: 1.15, spd: 620, rail: 1 }, ja: '遠くへにげながら、長く光ってから超高速のレールガン。' },
  drone_carrier:    { mv: 'wallhug', m: { spd: 50 }, sp: 'drones', s: { cd: 3.4, n: 4 }, ja: '画面のはしをなぞって動き、小型ドローンを次々に出す母艦。' },
  // ---- epic ----
  orbital_cannon:   { mv: 'anchor', m: {}, sp: 'beam', s: { cd: 6, tell: 1.0, wide: 1 }, ja: 'ほぼ動かずに力をため、3本まとめた太いビーム。時々ゆっくり場所を変える。' },
  super_battle_mech:{ mv: 'charge', m: { spd: 300, wait: 3.6 }, sp: 'ring', s: { cd: 7.5, tell: 0.7, n: 12, spd: 110 }, ja: '巨体で突進してくる戦闘メカ。突進前は体が赤く光る。待つ間は輪の弾。' },
  siege_destroyer:  { mv: 'lunge', m: { hold: 2.6, spd: 200 }, sp: 'bomb', s: { cd: 6.5, n: 8 }, ja: 'ぐっと前に出ては下がり、自機の所で弾ける大きな砲弾を撃つ。' },
  fleet_support_ship:{ mv: 'circle8', m: { per: 8 }, sp: 'heal', s: { cd: 5.5, p: 0.3 }, ja: '8の字に動き、緑の光で仲間を回復する支援艦。先にねらおう。' },
  command_carrier:  { mv: 'pendulum', m: { per: 5.5, amp: 0.45 }, sp: 'drones', s: { cd: 5, n: 3 }, ja: 'ふりこのようにゆれながら、小型機に命令して飛ばす。' },
  planetary_defense_array: { mv: 'orbit', m: { r: 30, w: 0.7 }, sp: 'gate', s: { cd: 5, n: 5 }, ja: 'ゆっくり回り、体から5本の横レーザーのかべを作る。' },
  mobile_fortress:  { mv: 'press', m: { spd: 20 }, sp: 'flak', s: { cd: 5.5, tell: 0.7, n: 3, k: 5 }, ja: '動く要塞。押し出しながら花火弾を撃ち、空中で止まって自機へはじける。' },
  dreadnought_c3:   { mv: 'blink', m: { stay: 3.2 }, sp: 'beam', s: { cd: 4, tell: 0.95 }, ja: 'ワープで現れ、太いビームを撃つ弩級艦。' },
  heavy_dreadnought:{ mv: 'anchor', m: {}, sp: 'rain', s: { cd: 4.8, n: 6 }, ja: 'どっしり構えて、体から打ち上げた弾を雨のようにふらせる。' },
  carrier_hive:     { mv: 'spiralin', m: { per: 7 }, sp: 'drones', s: { cd: 5.8, n: 4 }, ja: 'うず巻きをえがいて動き、虫メカを4匹はき出す女王艦。' },
  // ---- legendary ----
  titan_mech:       { mv: 'walker', m: { step: 26 }, sp: 'ring', s: { cd: 5.5, tell: 0.75, n: 12, spd: 115, waves: 2 }, ja: '大地をふみしめ、2重の輪の弾を出す巨神。' },
  orbital_blaster:  { mv: 'wallhug', m: { spd: 45 }, sp: 'sweep', s: { cd: 4.5, tell: 0.9, n: 9 }, ja: '画面のはしをなぞって動き、はしから内側へ体をすべらせながらレーザーを掃射。' },
  central_core_defender: { mv: 'hop', m: { rest: 2.4, hops: 2 }, sp: 'satellite', s: { cd: 7.5, tell: 0.7, n: 5 }, ja: '小さなワープをくり返し、5つの衛星弾を体のまわりに回してから放つ守護神。' },
  megamech_alpha:   { mv: 'chase', m: { spd: 80 }, sp: 'fan', s: { cd: 4.5, tell: 0.7, n: 11, a: 0.15, spd: 150, waves: 2 }, ja: '自機を追いかけては下がり、2回続けて大きな扇弾幕。' },
  siege_fortress:   { mv: 'press', m: { spd: 18 }, sp: 'rain', s: { cd: 4.5, n: 6 }, ja: 'ゆっくり進む攻城要塞。体から砲弾を打ち上げてふらせる。' },
  planetary_siege_engine: { mv: 'patrol', m: { spd: 22 }, sp: 'cluster', s: { cd: 4.5, tell: 0.7, n: 4 }, ja: '上下に動き、4つの分裂弾を撃つ。弾はとちゅうで3つに分かれる。' },
  colony_ship:      { mv: 'hover', m: { stop: 3.4 }, sp: 'heal', s: { cd: 5, p: 0.3, self: 1 }, ja: '止まって緑の光で仲間や自分を回復する方舟。' },
  super_carrier:    { mv: 'press', m: { spd: 18 }, sp: 'drones', s: { cd: 4.5, n: 4 }, ja: '前に出ながら小型機を4機ずつ出す超空母。' },
  boss:             { mv: 'track', m: { lag: 0.8 }, sp: 'beam', s: { cd: 4.5, tell: 1.0, wide: 1 }, ja: 'ゆっくり自機の高さに合わせ、止まって極太ビーム。' },
  ai_core:          { mv: 'spiralin', m: { per: 5 }, sp: 'snipe', s: { cd: 3.8, tell: 0.85, n: 3, a: 0.3 }, ja: 'うず巻きのように回りながら、3方向へねらい撃つ超知性。' },
  planet_eater:     { mv: 'spiralin', m: { per: 9 }, sp: 'spiral', s: { cd: 4.5, tell: 0.8, n: 16, arms: 3, spd: 100 }, ja: 'すいこむようにうず巻きで動き、3本のうず巻き弾をまき散らす。' },
  titan_fortress:   { mv: 'anchor', m: {}, sp: 'ring', s: { cd: 4.5, tell: 0.75, n: 14, spd: 115, waves: 2 }, ja: 'どっしり陣取る巨大要塞。2重の輪の弾を放つ。' },
  titan_carrier:    { mv: 'retreat', m: {}, sp: 'drones', s: { cd: 4.5, n: 4 }, ja: 'きょりをとりながら小型機を4機ずつ出す。' },
  supreme_command_center: { mv: 'anchor', m: {}, sp: 'heal', s: { cd: 4.5, p: 0.3, self: 1 }, ja: 'どっしり陣取り、仲間と自分を回復する司令艦。' },
  hyper_dreadnought:{ mv: 'patrol', m: { spd: 22 }, sp: 'sweep', s: { cd: 4.5, tell: 0.8, n: 8 }, ja: '上下に動き、体をふりながらレーザーを8連続で掃射。' },
  mobile_planet_killer: { mv: 'track', m: { lag: 0.9 }, sp: 'bomb', s: { cd: 5, n: 8 }, ja: '自機の高さへ動き、自機の所で弾ける巨大砲弾。' },
  colossal_hive_ship: { mv: 'flock', m: { spd: 22 }, sp: 'mines', s: { cd: 4.2, n: 5 }, ja: '群れのようにゆらぎながら、虫の卵（機雷）をばらまく巨大艦。' },
  super_dreadnought:{ mv: 'retreat', m: {}, sp: 'rain', s: { cd: 4.2, n: 6 }, ja: 'きょりをとって、体から打ち上げた弾を雨のようにふらせる最強艦。' },
};

/** Short Japanese role name per movement / attack (deck & shop chips). */
export const MOVE_JA = {
  patrol: '上下見回り', flock: '群れ', zigzag: 'ジグザグ', charge: '突進', walker: '歩行', track: '高さ合わせ', blink: 'ワープ',
  press: '前進', hover: '止まって攻撃', circle8: '8の字', weave: '波ゆれ', orbit: '旋回', swoop: '急降下', guard: '盾役',
  anchor: '陣取り', retreat: 'にげ撃ち', cloak: 'ステルス',
  pendulum: 'ふりこ', spiralin: 'うず巻き', wallhug: 'はしなぞり', stopgo: 'カクカク', chase: '追いかけ', lunge: '飛びこみ',
  hop: '小ワープ', strafe: '横すべり', bounce: 'はね回り',
};
export const SPECIAL_JA = {
  snipe: 'ねらい撃ち', ring: '輪の弾', mines: '機雷', bomb: '砲弾', rear: 'うしろブーメラン', shield: '盾', drones: '小型機',
  beam: '太いビーム', rain: '弾の雨', gate: 'レーザーのかべ', heal: '回復', dash: '体当たり',
  spiral: 'うず巻き弾', fan: '扇弾幕', homing: '追尾ミサイル', bounce: 'はね返り弾', cluster: '分裂弾', snake: 'へび弾',
  shotgun: '散弾', sweep: 'レーザー掃射', boomf: 'ブーメラン', flak: '花火弾', satellite: '衛星弾',
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
  charge(e, pm, M, X) { // hold → body glow tell → dash across → brake → glide back
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
  anchor(e, pm, M, X) { // plants at a spot (tiny bob); every few seconds lumbers to a nearby new spot and plants again
    const B = bounds(e, X.fw, X.fh);
    pm.t = (pm.t || 0) + X.dt;
    if (pm.ax == null) { pm.ax = clamp(e.x, X.fw * 0.66, B.x1); pm.ay = clamp(e.y, B.y0, B.y1); pm.mv = 0; }
    if (pm.mv > 0) {
      pm.mv -= X.dt;
      if (goTo(e, pm.ax, pm.ay, 40 * sizeSpd(e) + 10, X.dt) || pm.mv <= 0) { pm.mv = 0; pm.t = 0; e._shake = 0.06; }
      return;
    }
    ease(e, pm.ax, pm.ay + Math.sin(pm.t * 1.3) * 5, 2.5, X.dt);
    if (pm.t > 5.5 && !pm.hold) {
      pm.ax = clamp(pm.ax + rnd(-50, 50), X.fw * 0.62, B.x1);
      pm.ay = clamp(pm.ay + (Math.random() < 0.5 ? -1 : 1) * rnd(40, 80), B.y0, B.y1);
      pm.mv = 3;
    }
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
  // ---- 10-18: more movement patterns ----
  pendulum(e, pm, M, X) { // swings on a long arc hanging from a pivot above the pane
    const B = bounds(e, X.fw, X.fh);
    const xl = Math.max(X.fw * 0.5, B.x0);
    if (pm.a == null) { pm.a = Math.random() * TAU; pm.cx = (xl + B.x1) / 2; }
    if (!pm.hold) pm.a += (TAU / (M.per || 4.5)) * X.dt;
    const L = (B.y1 - B.y0) * 1.05, th = Math.sin(pm.a) * (M.amp || 0.5);
    const py = B.y0 - L * 0.25;
    ease(e, clamp(pm.cx + Math.sin(th) * L * 0.9, xl, B.x1), clamp(py + Math.cos(th) * L * 0.95 - Math.abs(Math.sin(th)) * L * 0.25, B.y0, B.y1), 5, X.dt);
  },
  spiralin(e, pm, M, X) { // spirals in toward the middle of its area, then back out (radius breathes)
    const B = bounds(e, X.fw, X.fh);
    const xl = Math.max(X.fw * 0.5, B.x0);
    if (pm.a == null) { pm.a = Math.random() * TAU; pm.b = 0; }
    if (!pm.hold) { pm.a += (TAU / (M.per || 6)) * 2.2 * X.dt; pm.b += (TAU / (M.per || 6)) * 0.5 * X.dt; }
    const cx = (xl + B.x1) / 2, cy = (B.y0 + B.y1) / 2, ax = Math.max(4, (B.x1 - xl) / 2), ay = Math.max(4, (B.y1 - B.y0) / 2);
    const r = 0.2 + 0.8 * Math.abs(Math.cos(pm.b));
    ease(e, cx + Math.cos(pm.a) * ax * r, cy + Math.sin(pm.a) * ay * r, 4, X.dt);
  },
  wallhug(e, pm, M, X) { // runs along the top edge, crosses down, runs along the bottom edge …
    const B = bounds(e, X.fw, X.fh);
    const xl = Math.max(X.fw * 0.5, B.x0);
    if (!pm.st) { pm.st = 'run'; pm.wall = e.y < X.fh / 2 ? 0 : 1; pm.dir = -1; }
    if (pm.hold) return;
    const wy = pm.wall ? B.y1 : B.y0, spd = (M.spd || 60) * (0.6 + 0.4 * sizeSpd(e));
    if (pm.st === 'run') {
      e.x += pm.dir * spd * X.dt; ease(e, e.x, wy, 6, X.dt);
      if (e.x < xl) { e.x = xl; pm.dir = 1; } else if (e.x > B.x1) { e.x = B.x1; pm.st = 'cross'; pm.wall = 1 - pm.wall; pm.dir = -1; }
    } else {
      pm.fire = false;
      if (goTo(e, B.x1, pm.wall ? B.y1 : B.y0, spd * 2.6, X.dt)) pm.st = 'run';
    }
  },
  stopgo(e, pm, M, X) { // short straight dashes in 8 directions, hard stop, fire, repeat
    const B = bounds(e, X.fw, X.fh);
    const xl = Math.max(X.fw * 0.5, B.x0);
    pm.t = (pm.t || 0) + X.dt;
    if (!pm.st) { pm.st = 'stop'; pm.t = 0; }
    if (pm.st === 'go') {
      pm.fire = false;
      if (goTo(e, pm.gx, pm.gy, 230 * sizeSpd(e), X.dt) || pm.t > 1) { pm.st = 'stop'; pm.t = 0; e._shake = 0.04; }
    } else if (pm.t > (M.stop || 0.8) && !pm.hold) {
      const d = M.dist || 70;
      for (let k = 0; k < 6; k++) {
        const a = Math.floor(Math.random() * 8) * (PI / 4);
        const gx = e.x + Math.cos(a) * d, gy = e.y + Math.sin(a) * d * 0.8;
        if (gx >= xl && gx <= B.x1 && gy >= B.y0 && gy <= B.y1) { pm.gx = gx; pm.gy = gy; break; }
        pm.gx = clamp(gx, xl, B.x1); pm.gy = clamp(gy, B.y0, B.y1);
      }
      pm.st = 'go'; pm.t = 0;
    }
  },
  chase(e, pm, M, X) { // closes in on the ship for a while, then drifts back to the right
    const B = bounds(e, X.fw, X.fh);
    pm.t = (pm.t || 0) + X.dt;
    if (!pm.st) { pm.st = 'chase'; pm.t = 0; }
    if (pm.hold) return;
    if (pm.st === 'chase') {
      goTo(e, clamp(X.tx + X.fw * 0.3, Math.max(X.fw * 0.46, B.x0), B.x1), clamp(X.ty, B.y0, B.y1), (M.spd || 80) * sizeSpd(e) * 1.3, X.dt);
      if (pm.t > 2.4) { pm.st = 'drift'; pm.t = 0; pm.gy = rnd(B.y0, B.y1); }
    } else {
      ease(e, B.x1, pm.gy, 0.9, X.dt);
      if (pm.t > 1.8) { pm.st = 'chase'; pm.t = 0; }
    }
  },
  lunge(e, pm, M, X) { // waits on the right, darts forward to mid-field, slowly backs off
    const B = bounds(e, X.fw, X.fh);
    pm.t = (pm.t || 0) + X.dt;
    if (!pm.st) { pm.st = 'hold'; pm.t = rnd(0, 0.8); pm.hy = e.y; }
    if (pm.st === 'hold') {
      ease(e, clamp(X.fw * 0.82, B.x0, B.x1), pm.hy + Math.sin(pm.t * 3) * 10, 3, X.dt);
      if (pm.t > (M.hold || 2) && !pm.hold) { pm.st = 'go'; pm.t = 0; pm.gx = Math.max(X.fw * 0.47, B.x0 - X.fw * 0.05); pm.gy = clamp(e.y + (X.ty - e.y) * 0.7, B.y0, B.y1); }
    } else if (pm.st === 'go') {
      pm.fire = false;
      if (goTo(e, pm.gx, pm.gy, (M.spd || 300) * sizeSpd(e), X.dt) || pm.t > 1.2) { pm.st = 'near'; pm.t = 0; e._shake = 0.05; pm.spNow = true; }
    } else if (pm.st === 'near') {
      if (pm.t > 1.0 && !pm.hold) { pm.st = 'back'; pm.t = 0; }
    } else {
      if (goTo(e, clamp(X.fw * 0.82, B.x0, B.x1), e.y, 70 * sizeSpd(e), X.dt)) { pm.st = 'hold'; pm.t = 0; pm.hy = e.y; }
    }
  },
  hop(e, pm, M, X) { // rest, then 2–3 short blink hops in a row (intangible for a moment each)
    const B = bounds(e, X.fw, X.fh);
    const xl = Math.max(X.fw * 0.5, B.x0);
    pm.t = (pm.t || 0) + X.dt;
    if (!pm.st) { pm.st = 'rest'; pm.t = 0; }
    if (pm.st === 'rest') {
      if (pm.t > (M.rest || 2) && !pm.hold) { pm.st = 'out'; pm.t = 0; pm.left = M.hops || 3; }
    } else if (pm.st === 'out') {
      pm.fire = false; e.za = 1 - 0.8 * Math.min(1, pm.t / 0.18);
      if (pm.t > 0.18) {
        const a = rnd(0, TAU), d = rnd(45, 75);
        e.x = clamp(e.x + Math.cos(a) * d, xl, B.x1); e.y = clamp(e.y + Math.sin(a) * d, B.y0, B.y1);
        pm.st = 'in'; pm.t = 0; e.zk = 'blinkin'; e.zu = 0;
      }
    } else {
      pm.fire = false; e.za = Math.min(1, 0.2 + pm.t / 0.2); e.zu = Math.min(1, pm.t / 0.3);
      if (pm.t > 0.3) {
        e.za = undefined; if (e.zk === 'blinkin') { e.zk = undefined; e.zu = undefined; }
        pm.left--; pm.t = 0; pm.st = pm.left > 0 ? 'out' : 'rest';
        if (pm.st === 'rest') pm.spNow = pm.spCd < 1.5;
      }
    }
    pm.ghost = (pm.st === 'out' && pm.t > 0.1) || (pm.st === 'in' && pm.t < 0.08);
  },
  strafe(e, pm, M, X) { // holds its column and side-steps quickly to just above / below the ship's row
    const B = bounds(e, X.fw, X.fh);
    pm.t = (pm.t || 0) + X.dt;
    if (pm.cx == null) { pm.cx = clamp(e.x, X.fw * 0.66, B.x1); pm.gy = e.y; pm.side = 1; }
    if (pm.t > (M.step || 1) && !pm.hold) {
      pm.t = 0; pm.side = -pm.side;
      pm.gy = clamp(X.ty + pm.side * (M.off != null ? M.off : 40) * (0.7 + Math.random() * 0.6), B.y0, B.y1);
    }
    if (pm.hold) return;
    const k = Math.abs(e.y - pm.gy) > 6 ? 9 : 4;
    if (Math.abs(e.y - pm.gy) > 12) pm.fire = false;
    ease(e, pm.cx, pm.gy, k, X.dt);
  },
  bounce(e, pm, M, X) { // billiard ball: straight lines, bounces off every edge of its area
    const B = bounds(e, X.fw, X.fh);
    const xl = Math.max(X.fw * 0.48, B.x0);
    if (pm.vx == null) { const a = rnd(0.5, 1.1) * (Math.random() < 0.5 ? 1 : -1) + PI; const s = (M.spd || 80); pm.vx = Math.cos(a) * s; pm.vy = Math.sin(a) * s; }
    if (pm.hold) return;
    e.x += pm.vx * X.dt; e.y += pm.vy * X.dt;
    if (e.x < xl) { e.x = xl; pm.vx = Math.abs(pm.vx); e._shake = 0.03; } else if (e.x > B.x1) { e.x = B.x1; pm.vx = -Math.abs(pm.vx); e._shake = 0.03; }
    if (e.y < B.y0) { e.y = B.y0; pm.vy = Math.abs(pm.vy); e._shake = 0.03; } else if (e.y > B.y1) { e.y = B.y1; pm.vy = -Math.abs(pm.vy); e._shake = 0.03; }
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
    tell: () => 0.5,
    tick(e) { e.zk = 'hatch'; },
    fire(e, sp, S, X, c) {
      for (let i = 0; i < (S.n || 2); i++) {
        const b = c.orb(rnd(0, TAU), rnd(25, 55), { k: 'mine', r: 5, hb: 3, life: 6.5 });
        if (b) { b.x = e.x + rnd(-6, 6); b.y = e.y + (i - ((S.n || 2) - 1) / 2) * 14; }
      }
    },
  },
  bomb: {
    tell: () => 0.6,
    tick(e) { e.zk = 'bomb'; },
    start(e, sp, S, X) { sp.tx = X.tx + rnd(-10, 10); sp.ty = X.ty + rnd(-10, 10); },
    fire(e, sp, S, X, c) { // shell flies to the marked spot and bursts into a ring there
      const spd = 150, d = Math.hypot(sp.tx - c.ox, sp.ty - c.oy);
      const b = c.orb(Math.atan2(sp.ty - c.oy, sp.tx - c.ox), spd, { k: 'split', r: 6, hb: 2, life: 6 });
      if (!b) return;
      b.st = d / spd; b.sn = Math.max(6, S.n || 8); b.ss = 115; // 10-18: no target marker (no pre-warning away from the unit)
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
    start(e, sp, S, X) { // landing columns around the ship (one safe lane between each) — NOT drawn anywhere
      const n = S.n || 4, gap = 44, x0 = clamp(X.tx - ((n - 1) / 2) * gap + rnd(-gap / 2, gap / 2), 12, X.fw * 0.75);
      sp.cols = []; for (let i = 0; i < n; i++) sp.cols.push(Math.round(x0 + i * gap));
    },
    tick(e) { e.zk = 'rain'; },
    fire(e, sp, S, X, c) { // 10-18: every shell visibly leaves the TOP of the unit, rises, then falls (gravity)
      const G = 520;
      sp.cols.forEach((x, i) => c.later(i * 0.07, (c2) => {
        const x0 = e.x + rnd(-4, 4), y0 = e.y - (e.h || 40) * 0.45;
        const rise = clamp(y0 - 6, 30, 150), vy = -Math.sqrt(2 * G * rise);
        const ty = clamp(X.ty, y0 - rise + 20, X.fh);
        const t = (-vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * (ty - y0)))) / G;
        const b = spawnBullet(x0, y0, (x - x0) / Math.max(0.4, t), vy, 'enemy', false, 2, { life: 4 });
        b.k = 'rain'; b.gv = G; c2.emit(b);
      }));
      e._rf = 0.45; e._rfc = undefined; // recoil flash + smoke on the unit (render only)
    },
  },
  gate: {
    hold: true,
    tell: () => 0.9,
    tick(e) { e.zk = 'gate'; },
    fire(e, sp, S, X, c) { // 10-18: n parallel lasers stacked over the unit's own height (launch right at the body)
      const n = S.n || 4, half = Math.max(16, (e.h || 30) * 0.6);
      for (let i = 0; i < n; i++) c.laser(620, n > 1 ? -half + (2 * half * i) / (n - 1) : 0);
    },
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
  },  // ---- 10-18: more attack patterns (all launch from the unit; the unit glows first) ----
  spiral: {
    hold: true,
    tell: (S) => S.tell || 0.7,
    tick(e) { e.zk = 'spiral'; },
    fire(e, sp, S, X, c) { // rotating arms of petals from the body centre
      const n = S.n || 12, arms = S.arms || 2, spd = S.spd || 110, dir = Math.random() < 0.5 ? 1 : -1;
      let a0 = Math.random() * TAU;
      for (let i = 0; i < n; i++) c.later(i * 0.07, (c2) => {
        a0 += dir * 0.38;
        for (let k = 0; k < arms; k++) { const b = c2.orb(a0 + (k * TAU) / arms, spd, { k: 'petal', life: 3.6 }); if (b) { b.x = e.x; b.y = e.y; } }
      });
    },
  },
  fan: {
    hold: true,
    tell: (S) => S.tell || 0.6,
    tick(e) { e.zk = 'fan'; },
    fire(e, sp, S, X, c) { // wide fan toward the ship side (optionally twice, offset)
      const n = S.n || 7, a = S.a || 0.18, spd = S.spd || 150;
      const one = (c2, off) => { const base = PI + (c2.aim - PI) * 0.4 + off; for (let i = 0; i < n; i++) c2.orb(base + (i - (n - 1) / 2) * a, spd, { k: 'fan' }); };
      one(c, 0);
      if ((S.waves || 1) > 1) c.later(0.35, (c2) => one(c2, a / 2));
    },
  },
  homing: {
    hold: true,
    tell: (S) => S.tell || 0.6,
    tick(e) { e.zk = 'homing'; },
    fire(e, sp, S, X, c) { // short-homing missiles fanned out of the launch bay
      const n = S.n || 2;
      for (let i = 0; i < n; i++) c.later(i * 0.08, (c2) => c2.missile(PI + (n > 1 ? (i / (n - 1) - 0.5) * 1.4 : 0), S.home || 0.55, 210));
    },
  },
  bounce: {
    hold: true,
    tell: (S) => S.tell || 0.6,
    tick(e) { e.zk = 'bounce'; },
    fire(e, sp, S, X, c) { // steep shots that bounce off the top / bottom edges
      const n = S.n || 4;
      for (let i = 0; i < n; i++) {
        const up = i % 2 === 0 ? -1 : 1, a = PI + up * (0.55 + 0.18 * Math.floor(i / 2));
        const b = c.orb(a, 175, { k: 'bnc', r: 4, hb: 1, life: 4.2 });
        if (b) { b.bnc = 3; b.fh = X.fh; }
      }
    },
  },
  cluster: {
    hold: true,
    tell: (S) => S.tell || 0.6,
    tick(e) { e.zk = 'cluster'; },
    fire(e, sp, S, X, c) { // shells that split into 3 forward shards mid-flight
      const n = S.n || 3;
      for (let i = 0; i < n; i++) {
        const b = c.orb(PI + (c.aim - PI) * 0.5 + (i - (n - 1) / 2) * 0.35, 150, { k: 'split', r: 5.5, hb: 2, life: 4 });
        if (b) { b.st = 0.55 + i * 0.12; b.sn = 3; b.ss = 150; }
      }
    },
  },
  snake: {
    hold: true,
    tell: (S) => S.tell || 0.6,
    tick(e) { e.zk = 'snake'; },
    fire(e, sp, S, X, c) { // a chain of wave bullets with the same phase = one wriggling snake
      const n = S.n || 5, ang = PI + (c.aim - PI) * 0.5;
      for (let i = 0; i < n; i++) c.later(i * 0.07, (c2) => {
        const b = c2.orb(ang, 150, { k: 'wave', r: 3.5, life: 3.8 });
        if (b) { b.wa = S.amp || 26; b.wf = S.freq || 5; b.wp = 0; b.wt = -i * 0.07; b.wo = Math.sin(b.wt * b.wf) * b.wa; }
      });
    },
  },
  shotgun: {
    hold: true,
    tell: (S) => S.tell || 0.55,
    tick(e) { e.zk = 'shotgun'; },
    fire(e, sp, S, X, c) { // dense short-range pellets (vanish after ~1 s — only dangerous up close)
      const n = S.n || 6;
      for (let i = 0; i < n; i++) c.orb(c.aim + (i - (n - 1) / 2) * 0.13 + rnd(-0.04, 0.04), rnd(230, 280), { k: 'pellet', r: 3, life: rnd(0.9, 1.15) });
    },
  },
  sweep: {
    hold: true,
    tell: (S) => S.tell || 0.8,
    tick(e) { e.zk = 'sweep'; },
    fire(e, sp, S, X, c) { // the unit itself slides up/down while firing a laser each step (all from the muzzle)
      const n = S.n || 6, pm = e._pm;
      pm.sweepT = n * 0.09 + 0.05; pm.sweepV = (e.y < X.fh / 2 ? 1 : -1) * 150;
      for (let i = 0; i < n; i++) c.later(i * 0.09, (c2) => c2.laser(560, 0));
    },
  },
  boomf: {
    hold: true,
    tell: (S) => S.tell || 0.6,
    tick(e) { e.zk = 'boomf'; },
    fire(e, sp, S, X, c) { // boomerangs thrown at the ship that slow down and fly back
      const n = S.n || 2;
      for (let i = 0; i < n; i++) { const b = c.orb(c.aim + (i - (n - 1) / 2) * 0.35, 300, { k: 'boom', r: 5, hb: 2, life: 3.6 }); if (b) b.ax = 360; }
    },
  },
  flak: {
    hold: true,
    tell: (S) => S.tell || 0.7,
    tick(e) { e.zk = 'flak'; },
    fire(e, sp, S, X, c) { // slow shells that stop in mid-air, flash, then burst into darts aimed at the ship
      const n = S.n || 3;
      for (let i = 0; i < n; i++) {
        const b = c.orb(PI + (i - (n - 1) / 2) * 0.5, 130, { k: 'flak', r: 5, hb: 2, life: 4 });
        if (b) { b.ft = 0.75 + i * 0.12; b.fk = S.k || 4; }
      }
    },
  },
  satellite: {
    hold: true,
    tell: (S) => S.tell || 0.6,
    tick(e) { e.zk = 'sat'; },
    fire(e, sp, S, X, c) { // orbs circle the unit for a moment, then fly at the ship one by one
      const n = S.n || 4, R = Math.max(e.w || 40, e.h || 30) * 0.65;
      e._pm.satT = 2.2;
      for (let i = 0; i < n; i++) {
        const b = c.orb(0, 0, { k: 'sat', r: 4.5, hb: 2, life: 5 });
        if (b) { b.oa = (i * TAU) / n; b.or = R; b.ou = e._uid; b.ot = 1.1 + i * 0.12; b.ocx = e.x; b.ocy = e.y; b.x = e.x + Math.cos(b.oa) * R; b.y = e.y + Math.sin(b.oa) * R; b.vx = 0; b.vy = 0; }
      }
    },
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
  if (e._rf > 0) { e._rf -= X.dt; if (e._rf <= 0) { e._rf = 0; e._rfc = undefined; } }
  if (e._ff > 0) { e._ff -= X.dt; if (e._ff <= 0) { e._ff = 0; e._fk = undefined; e._ffr = undefined; } }
  pm.fire = true;
  if (e._healFx > 0) e._healFx -= X.dt;
  if (pm.satT > 0) { // 衛星弾 keep circling this unit while it moves
    pm.satT -= X.dt;
    for (const b of X.bullets || []) if (b.ou === e._uid && b.ot > 0) { b.ocx = e.x; b.ocy = e.y; }
  }
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
  if (pm.sweepT > 0) { // レーザー掃射: the body slides while the lasers stream out of it
    pm.sweepT -= X.dt; e.y += pm.sweepV * X.dt;
    const hh = (e.h || 30) * 0.5 + 6; if (e.y < hh || e.y > X.fh - hh) pm.sweepV = -pm.sweepV;
    pm.fire = false;
  } else MOVERS[P.mv](e, pm, P.m || {}, X);
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
        if (P.sp !== 'shield') { e._ff = 0.3; e._fk = P.sp; } // muzzle / firing flash (render only)
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
