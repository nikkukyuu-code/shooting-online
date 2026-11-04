/* β ストーリーモード: 動画（日本語セリフ・字幕焼き込み）＋ 下に選択中の言語の字幕（日本語時は非表示） */
const SUBS = {
"en": [
"We came to this place 300 years ago, in the Earth calendar year 2326. By then, the colonization of Mars was already well underway, and we secretly made our way beneath the surface of this Moon.",
"Back then, it was widely accepted that aliens could never reach us. But when traces of aliens were discovered on Mars, our organization quietly set this plan in motion."
],
"zh-Hans": [
"我们在300年前、地球历2326年来到这里。那时火星移民早已展开，而我们则秘密地进入了这颗月球的地下。",
"当时人们普遍认为外星人不可能到来，然而火星上发现了外星人的踪迹，于是我们的组织一直在暗中推进这项计划。"
],
"zh-Hant": [
"我們在300年前、地球曆2326年來到這裡。那時火星移民早已展開，而我們則秘密地進入了這顆月球的地底。",
"當時人們普遍認為外星人不可能到來，然而火星上發現了外星人的蹤跡，於是我們的組織一直在暗中推進這項計畫。"
],
"ko": [
"우리는 300년 전, 지구력 2326년에 이곳에 왔습니다. 그 무렵 이미 화성 이주도 진행되고 있었고, 우리는 비밀리에 이 달의 지하로 들어왔습니다.",
"당시에는 외계인이 올 수 없을 것이라는 게 정설이었지만, 화성에서 외계인의 흔적이 발견되었고, 우리 조직은 은밀히 이 계획을 추진해 왔습니다."
],
"es": [
"Llegamos a este lugar hace 300 años, en el año 2326 del calendario terrestre. Para entonces, la colonización de Marte ya estaba muy avanzada, y nosotros nos instalamos en secreto bajo la superficie de esta Luna.",
"En aquella época se daba por hecho que los alienígenas jamás podrían llegar. Pero se hallaron rastros alienígenas en Marte, y nuestra organización ha llevado adelante este plan en secreto."
],
"pt": [
"Chegamos a este lugar há 300 anos, no ano 2326 do calendário terrestre. Naquela época, a colonização de Marte já estava bem avançada, e nós nos instalamos secretamente no subsolo desta Lua.",
"Na época, acreditava-se que alienígenas jamais conseguiriam chegar até nós. Mas vestígios alienígenas foram encontrados em Marte, e nossa organização vem conduzindo este plano em segredo."
],
"fr": [
"Nous sommes arrivés ici il y a 300 ans, en l'an 2326 du calendrier terrestre. À cette époque, la colonisation de Mars était déjà bien engagée, et nous nous sommes secrètement installés sous la surface de cette Lune.",
"On tenait alors pour acquis que les extraterrestres ne pourraient jamais venir. Mais des traces extraterrestres ont été découvertes sur Mars, et notre organisation a mené ce plan dans le plus grand secret."
],
"de": [
"Wir kamen vor 300 Jahren hierher, im Jahr 2326 der Erdzeitrechnung. Damals war die Besiedlung des Mars bereits weit fortgeschritten, und wir zogen uns heimlich unter die Oberfläche dieses Mondes zurück.",
"Damals galt es als ausgemacht, dass Außerirdische uns niemals erreichen könnten. Doch dann wurden auf dem Mars Spuren von Außerirdischen gefunden, und unsere Organisation hat diesen Plan im Verborgenen vorangetrieben."
],
"it": [
"Siamo giunti qui 300 anni fa, nell'anno 2326 del calendario terrestre. A quel tempo la colonizzazione di Marte era già ben avviata, e noi ci trasferimmo in segreto nel sottosuolo di questa Luna.",
"All'epoca si dava per certo che gli alieni non sarebbero mai potuti arrivare. Ma su Marte furono trovate tracce aliene, e la nostra organizzazione ha portato avanti questo piano in segreto."
],
"ru": [
"Мы прибыли сюда 300 лет назад, в 2326 году по земному календарю. К тому времени колонизация Марса уже шла полным ходом, а мы тайно обосновались в недрах этой Луны.",
"Тогда считалось общепризнанным, что пришельцы никогда не смогут до нас добраться. Но на Марсе обнаружили следы пришельцев, и наша организация втайне продвигала этот план."
],
"id": [
"Kami tiba di tempat ini 300 tahun lalu, pada tahun 2326 kalender Bumi. Saat itu kolonisasi Mars sudah berjalan, dan kami diam-diam pindah ke bawah permukaan Bulan ini.",
"Kala itu diyakini bahwa makhluk asing tidak mungkin datang. Namun jejak makhluk asing ditemukan di Mars, dan organisasi kami diam-diam menjalankan rencana ini."
],
"th": [
"พวกเรามาถึงที่นี่เมื่อ 300 ปีก่อน ในปีปฏิทินโลก 2326 ตอนนั้นการอพยพไปดาวอังคารก็ดำเนินไปแล้ว และพวกเราได้ลงมาอยู่ใต้ดินของดวงจันทร์นี้อย่างลับ ๆ",
"ในยุคนั้นเชื่อกันว่ามนุษย์ต่างดาวไม่มีทางมาถึงได้ แต่แล้วก็พบร่องรอยของมนุษย์ต่างดาวบนดาวอังคาร องค์กรของเราจึงเดินหน้าแผนการนี้อย่างลับ ๆ"
],
"vi": [
"Chúng tôi đến nơi này 300 năm trước, vào năm 2326 theo lịch Trái Đất. Khi ấy việc di cư lên Sao Hỏa đã được tiến hành, còn chúng tôi thì bí mật tiến vào lòng đất của Mặt Trăng này.",
"Thời đó, người ta tin chắc rằng người ngoài hành tinh không thể đến được. Nhưng dấu vết của người ngoài hành tinh đã được phát hiện trên Sao Hỏa, và tổ chức của chúng tôi đã âm thầm thúc đẩy kế hoạch này."
],
"tr": [
"Buraya 300 yıl önce, Dünya takvimiyle 2326 yılında geldik. O zamanlar Mars'a göç çoktan başlamıştı ve biz de gizlice bu Ay'ın yeraltına yerleştik.",
"O dönemde uzaylıların asla gelemeyeceği kesin kabul ediliyordu. Ancak Mars'ta uzaylı izleri bulundu ve örgütümüz bu planı gizlice yürüttü."
],
"ar": [
"جئنا إلى هذا المكان قبل 300 عام، في عام 2326 بالتقويم الأرضي. كان استيطان المريخ قد بدأ بالفعل آنذاك، فنزلنا سرًّا إلى باطن هذا القمر.",
"كان السائد آنذاك أن الكائنات الفضائية لن تتمكن أبدًا من الوصول إلينا، لكن آثارًا لكائنات فضائية اكتُشفت على المريخ، فمضت منظمتنا في هذه الخطة سرًّا."
],
"hi": [
"हम 300 साल पहले, पृथ्वी कैलेंडर के वर्ष 2326 में यहाँ आए थे। उस समय तक मंगल पर बसावट शुरू हो चुकी थी, और हम गुप्त रूप से इस चंद्रमा के भूगर्भ में आ बसे।",
"उस दौर में यह माना जाता था कि एलियन कभी यहाँ नहीं पहुँच सकते, लेकिन मंगल पर एलियनों के निशान मिले, और तब से हमारा संगठन चुपचाप इस योजना को आगे बढ़ा रहा है।"
]
};
// s.ass のタイミング（秒）: 1文目 0.30–16.20、2文目 16.70–31.20
const CUES = [[0.3, 16.2, 0], [16.7, 31.2, 1]];
const RESUME_KEY = 'stbStoryResume'; // 新規 sessionStorage キー（既存キーは変更しない）
function uiLang() { return (window.NKI18N && window.NKI18N.lang) || document.documentElement.getAttribute('data-nk-lang') || 'ja'; }

/* ===== オートセーブ（新規 localStorage キー。既存キーは変更しない） =====
 * stbStorySaves = { v:1, slots:[ { id, no, created, updated, chapter, scene, t, dur, done, cleared, state:{} } ] }
 * 「初めから」は必ず新しいスロットを作る（既存スロットは上書き・自動削除しない）。オートセーブは選択中スロットだけに書く。 */
const SAVE_KEY = 'stbStorySaves';
export const STORY_MAX_SLOTS = 10;
/** 章・シーン定義（今後の章はここに追加。進行状況はスロットの chapter/scene/t/state で表す） */
export const STORY_CHAPTERS = [{ id: 'prologue', title: 'プロローグ', scenes: [{ id: 'intro', type: 'video' }] }];
function chapterOf(id) { return STORY_CHAPTERS.find((c) => c.id === id) || STORY_CHAPTERS[0]; }
export function loadStorySaves() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (_) { d = null; }
  if (!d || !Array.isArray(d.slots)) d = { v: 1, slots: [] };
  d.slots = d.slots.filter((x) => x && x.id);
  return d;
}
function storeSaves(d) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); return true; } catch (_) { return false; } }
function T(s) { try { return window.NKI18N && window.NKI18N.lang !== 'ja' && window.NKI18N.t ? window.NKI18N.t(s) : s; } catch (_) { return s; } }
function mmss(x) { x = Math.max(0, Math.floor(x || 0)); return Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0'); }
function fmtTime(ms) {
  const l = uiLang();
  try {
    return new Intl.DateTimeFormat(l === 'ja' ? 'ja-JP' : l, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(ms));
  } catch (_) { return new Date(ms).toLocaleString(); }
}

export function initStory({ show, goMenu, canOpen }) {
  const scr = document.getElementById('screen-story');
  if (!scr) return;
  const v = document.getElementById('story-video');
  const sub = document.getElementById('story-sub');
  const playBtn = document.getElementById('story-play');
  const skipBtn = document.getElementById('story-skip');
  const end = document.getElementById('story-end');
  const subWrap = document.getElementById('story-sub-wrap');
  const homeV = document.getElementById('story-home');
  const listV = document.getElementById('story-listv');
  const list = document.getElementById('story-list');
  const contBtn = document.getElementById('story-cont');
  const scroller = scr.querySelector('.story-scroll');
  let lang = uiLang();
  let cur = -2;
  let view = 'home';
  let activeId = null;
  function setSub(i) {
    if (i === cur) return; cur = i;
    const lines = SUBS[lang];
    const txt = (lines && i >= 0) ? lines[i] : '';
    sub.textContent = txt;
    sub.dir = lang === 'ar' ? 'rtl' : 'auto';
    sub.lang = lang;
    sub.classList.toggle('on', !!txt);
  }
  function tick() {
    const t = v.currentTime || 0;
    let i = -1;
    for (const c of CUES) if (t >= c[0] && t < c[1]) i = c[2];
    setSub(i);
  }
  const stage = scr.querySelector('.story-stage');
  function fitSubH() {
    if (scr.classList.contains('ended')) { stage.style.setProperty('--sub-h', '0px'); return; }
    if (subWrap.hidden || !sub.clientWidth) { stage.style.setProperty('--sub-h', subWrap.hidden ? '0px' : ''); return; }
    const keep = sub.textContent, on = sub.classList.contains('on'); let h = 0;
    for (const t of (SUBS[lang] || [])) { sub.textContent = t; h = Math.max(h, sub.offsetHeight); }
    sub.textContent = keep; sub.classList.toggle('on', on);
    stage.style.setProperty('--sub-h', Math.ceil(h) + 'px');
  }
  const head = scr.querySelector('.story-title-box'), back = scr.querySelector('.sub-back');
  function fitHead() { const m = (back.offsetWidth || 64) + 6; head.style.marginLeft = m + 'px'; head.style.marginRight = m + 'px'; }
  /** 長いリストは下に続きがあるとフェード＋スクロールバーで分かるように */
  function markMore() { scroller.classList.toggle('more', scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 4); }
  scroller.addEventListener('scroll', markMore, { passive: true });
  window.addEventListener('resize', () => { if (window.__stbScreen === 'story') { fitHead(); fitSubH(); markMore(); } });
  function applyLang(l) { lang = l || uiLang(); cur = -2; subWrap.hidden = (lang === 'ja' || !SUBS[lang]); tick(); requestAnimationFrame(fitSubH); }

  /* ---- セーブ ---- */
  let lastT = -1;
  function writeActive(force) {
    if (!activeId || view !== 'play') return;
    const d = loadStorySaves();
    const s = d.slots.find((x) => x.id === activeId);
    if (!s) return;
    const t = v.currentTime || 0;
    const done = !end.hidden;
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : (s.dur || 0);
    if (!force && Math.abs(t - (s.t || 0)) < 0.25 && done === !!s.done && dur === s.dur) return;
    s.t = Math.round(t * 100) / 100; s.dur = dur; s.done = done; if (done) s.cleared = true;
    s.updated = Date.now();
    storeSaves(d); lastT = t;
  }
  setInterval(() => { if (view === 'play' && !v.paused) writeActive(); }, 3000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') writeActive(); });
  window.addEventListener('pagehide', () => writeActive());
  window.addEventListener('beforeunload', () => writeActive());

  function setView(nv) {
    view = nv;
    scr.dataset.view = nv;
    homeV.hidden = nv !== 'home';
    listV.hidden = nv !== 'list';
    stage.hidden = nv !== 'play';
    if (nv !== 'play') { try { v.pause(); } catch (_) {} scr.classList.remove('playing', 'ended'); }
    scroller.scrollTop = 0;
    requestAnimationFrame(markMore);
  }
  function refreshHome() {
    const n = loadStorySaves().slots.length;
    contBtn.disabled = n === 0;
    document.getElementById('story-nosave').hidden = n > 0;
    document.getElementById('story-full').hidden = true;
  }
  function openScreen() {
    if (canOpen && !canOpen()) return false;
    applyLang(); show('story'); fitHead();
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    return true;
  }
  function goHome() { writeActive(true); activeId = null; refreshHome(); setView('home'); }
  function renderList() {
    const d = loadStorySaves();
    const slots = d.slots.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
    list.textContent = '';
    const mk = (tag, cls, txt, raw) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = raw ? txt : T(txt); e.setAttribute('data-nk-noi18n', ''); return e; };
    for (const s of slots) {
      const li = document.createElement('li'); li.className = 'story-slot-li';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'story-slot';
      const top = mk('span', 'ss-top');
      top.append(mk('span', 'ss-no', 'No.' + s.no, true), mk('span', 'ss-ch', chapterOf(s.chapter).title));
      if (s.done) top.append(mk('span', 'ss-prog ss-done', 'クリア済み'));
      else top.append(mk('span', 'ss-prog', mmss(s.t) + ' / ' + mmss(s.dur || 31), true));
      const r1 = mk('span', 'ss-line'); r1.append(mk('span', 'ss-k', '最終セーブ'), mk('span', 'ss-v', fmtTime(s.updated || s.created), true));
      const r2 = mk('span', 'ss-line ss-sub'); r2.append(mk('span', 'ss-k', '開始'), mk('span', 'ss-v', fmtTime(s.created), true));
      b.append(top, r1, r2);
      b.addEventListener('click', () => startSlot(s.id));
      const del = mk('button', 'ss-del', '削除'); del.type = 'button';
      del.addEventListener('click', () => {
        if (!window.confirm(T('このセーブデータを削除しますか？（元に戻せません）') + '\nNo.' + s.no + ' · ' + fmtTime(s.updated || s.created))) return;
        const dd = loadStorySaves(); dd.slots = dd.slots.filter((x) => x.id !== s.id); storeSaves(dd);
        if (!dd.slots.length) goHome(); else renderList();
      });
      li.append(b, del); list.append(li);
    }
    requestAnimationFrame(markMore);
  }
  function showList() { writeActive(true); activeId = null; setView('list'); renderList(); }
  function seekTo(at, cb) {
    const go = () => { try { v.currentTime = at || 0; } catch (_) {} tick(); if (cb) cb(); };
    if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
    try { if (v.readyState < 1) v.load(); } catch (_) {}
  }
  function startSlot(id, at, autoplay) {
    const s = loadStorySaves().slots.find((x) => x.id === id);
    if (!s) { refreshHome(); setView('home'); return; }
    activeId = id;
    setView('play');
    end.hidden = true; playBtn.hidden = false; scr.classList.remove('playing', 'ended');
    applyLang(); fitHead(); fitSubH(); setTimeout(fitSubH, 300);
    if (s.done && at == null) { seekTo(s.dur || 31.7, () => finish()); return; }
    seekTo(at != null ? at : (s.t || 0), () => { if (autoplay !== false) play(); });
  }
  function newGame() {
    const d = loadStorySaves();
    if (d.slots.length >= STORY_MAX_SLOTS) { document.getElementById('story-full').hidden = false; return; }
    const now = Date.now();
    const no = d.slots.reduce((m, x) => Math.max(m, x.no || 0), 0) + 1;
    const id = 's' + now.toString(36) + Math.random().toString(36).slice(2, 6);
    d.slots.push({ id, no, created: now, updated: now, chapter: 'prologue', scene: 'intro', t: 0, dur: 0, done: false, cleared: false, state: {} });
    if (!storeSaves(d)) return;
    startSlot(id, 0, true);
  }
  document.getElementById('story-new').addEventListener('click', newGame);
  contBtn.addEventListener('click', () => { if (!contBtn.disabled) showList(); });

  let raf = 0;
  function loop() { tick(); raf = v.paused || v.ended ? 0 : requestAnimationFrame(loop); }
  v.addEventListener('timeupdate', tick);
  v.addEventListener('seeked', tick);
  v.addEventListener('play', () => { if (scr.classList.contains('ended')) { scr.classList.remove('ended'); fitSubH(); } scr.classList.add('playing'); playBtn.hidden = true; end.hidden = true; if (!raf) raf = requestAnimationFrame(loop); });
  v.addEventListener('pause', () => { if (!v.ended && view === 'play') playBtn.hidden = false; writeActive(); });
  v.addEventListener('ended', finish);
  function finish() {
    try { v.pause(); } catch (_) {}
    setSub(-1);
    scr.classList.remove('playing');
    playBtn.hidden = true;
    end.hidden = false;
    scr.classList.add('ended'); stage.style.setProperty('--sub-h', '0px');
    writeActive(true);
  }
  function play() { const p = v.play(); if (p && p.catch) p.catch(() => { playBtn.hidden = false; }); }
  playBtn.addEventListener('click', () => { if (v.ended) v.currentTime = 0; play(); });
  v.addEventListener('click', () => { if (v.paused) play(); else v.pause(); });
  skipBtn.addEventListener('click', () => { try { v.currentTime = v.duration || 31.7; } catch (_) {} finish(); });
  document.getElementById('story-replay').addEventListener('click', () => { end.hidden = true; v.currentTime = 0; writeActive(true); play(); });
  // 上の「◀ 戻る」: 再生中・一覧 → ストーリーのはじめ画面 / はじめ画面 → メニュー
  document.getElementById('story-hback').addEventListener('click', () => { if (view === 'home') { stop(); goMenu(); } else goHome(); });
  document.getElementById('btn-story-back').addEventListener('click', () => { stop(); goMenu(); });
  function stop() { writeActive(true); try { v.pause(); } catch (_) {} activeId = null; try { sessionStorage.removeItem(RESUME_KEY); } catch (_) {} }
  document.getElementById('btn-story')?.addEventListener('click', () => { if (openScreen()) { activeId = null; refreshHome(); setView('home'); } });
  // 言語ピッカーはページを再読込するので、ストーリー画面なら画面・スロット・再生位置を保存して復元する
  const cfg = window.NK_I18N_CFG || {};
  const prevHook = cfg.onBeforeReload;
  cfg.onBeforeReload = function () {
    if (prevHook) try { prevHook(); } catch (_) {}
    if (window.__stbScreen === 'story') {
      writeActive(true);
      try { sessionStorage.setItem(RESUME_KEY, JSON.stringify({ view, sid: activeId, t: v.currentTime || 0, p: !v.paused && !v.ended, e: !end.hidden })); } catch (_) {}
    }
  };
  window.__stbStoryLang = applyLang;
  let r = null;
  try { r = JSON.parse(sessionStorage.getItem(RESUME_KEY) || 'null'); sessionStorage.removeItem(RESUME_KEY); } catch (_) {}
  if (r) {
    const go = () => setTimeout(() => {
      if (!openScreen()) return;
      if (r.view === 'play' && r.sid && loadStorySaves().slots.some((x) => x.id === r.sid)) {
        if (r.e) startSlot(r.sid); else startSlot(r.sid, r.t, !!r.p);
      } else if (r.view === 'list' && loadStorySaves().slots.length) showList();
      else { refreshHome(); setView('home'); }
    }, 0);
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  }
  new MutationObserver(() => { if (!scr.classList.contains('active')) { writeActive(); if (!v.paused) try { v.pause(); } catch (_) {} } }).observe(scr, { attributes: true, attributeFilter: ['class'] });
  setView('home'); refreshHome();
}
