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

export function initStory({ show, goMenu, canOpen }) {
  const scr = document.getElementById('screen-story');
  if (!scr) return;
  const v = document.getElementById('story-video');
  const sub = document.getElementById('story-sub');
  const playBtn = document.getElementById('story-play');
  const skipBtn = document.getElementById('story-skip');
  const end = document.getElementById('story-end');
  const subWrap = document.getElementById('story-sub-wrap');
  let lang = uiLang();
  let cur = -2;
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
  /** 言語が変わったら字幕を即差し替え（ページ再読込なしで呼べる / 再読込時も位置を復元） */
  const stage = scr.querySelector('.story-stage');
  /** 字幕欄の高さ＝その言語の長い方の行に合わせる（動画はその分だけ縮む → 字幕が見切れない） */
  function fitSubH() {
    if (scr.classList.contains('ended')) { stage.style.setProperty('--sub-h', '0px'); return; }
    if (subWrap.hidden || !sub.clientWidth) { stage.style.setProperty('--sub-h', subWrap.hidden ? '0px' : ''); return; }
    const keep = sub.textContent, on = sub.classList.contains('on'); let h = 0;
    for (const t of (SUBS[lang] || [])) { sub.textContent = t; h = Math.max(h, sub.offsetHeight); }
    sub.textContent = keep; sub.classList.toggle('on', on);
    stage.style.setProperty('--sub-h', Math.ceil(h) + 'px');
  }
  /** 見出し: 左端の「◀ 戻る」と重ならない幅にタイトル（＋左隣の言語ボタン）を収める */
  const head = scr.querySelector('.story-title-box'), back = scr.querySelector('.sub-back');
  function fitHead() { const m = (back.offsetWidth || 64) + 6; head.style.marginLeft = m + 'px'; head.style.marginRight = m + 'px'; }
  window.addEventListener('resize', () => { if (window.__stbScreen === 'story') { fitHead(); fitSubH(); } });
  function applyLang(l) { lang = l || uiLang(); cur = -2; subWrap.hidden = (lang === 'ja' || !SUBS[lang]); tick(); requestAnimationFrame(fitSubH); }
  let raf = 0;
  function loop() { tick(); raf = v.paused || v.ended ? 0 : requestAnimationFrame(loop); }
  v.addEventListener('timeupdate', tick);
  v.addEventListener('seeked', tick);
  v.addEventListener('play', () => { if (scr.classList.contains('ended')) { scr.classList.remove('ended'); fitSubH(); } scr.classList.add('playing'); playBtn.hidden = true; end.hidden = true; if (!raf) raf = requestAnimationFrame(loop); });
  v.addEventListener('pause', () => { if (!v.ended) playBtn.hidden = false; });
  v.addEventListener('ended', finish);
  function finish() {
    try { v.pause(); } catch (_) {}
    setSub(-1);
    scr.classList.remove('playing');
    playBtn.hidden = true;
    end.hidden = false;
    scr.classList.add('ended'); stage.style.setProperty('--sub-h', '0px');
  }
  function play() { const p = v.play(); if (p && p.catch) p.catch(() => { playBtn.hidden = false; }); }
  playBtn.addEventListener('click', () => { if (v.ended) v.currentTime = 0; play(); });
  v.addEventListener('click', () => { if (v.paused) play(); else v.pause(); });
  skipBtn.addEventListener('click', () => { try { v.currentTime = v.duration || 31.7; } catch (_) {} finish(); });
  document.getElementById('story-replay').addEventListener('click', () => { end.hidden = true; v.currentTime = 0; play(); });
  document.getElementById('btn-story-back').addEventListener('click', () => { stop(); goMenu(); });
  function stop() { try { v.pause(); } catch (_) {} try { sessionStorage.removeItem(RESUME_KEY); } catch (_) {} }
  function open(at, autoplay) {
    if (canOpen && !canOpen()) return;
    end.hidden = true; playBtn.hidden = false; scr.classList.remove('playing', 'ended');
    applyLang();
    show('story');
    fitHead();
    fitSubH(); setTimeout(fitSubH, 300);
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    try { v.currentTime = at || 0; } catch (_) {}
    if (autoplay !== false) play();
  }
  document.getElementById('btn-story')?.addEventListener('click', () => open(0, true));
  // 言語ピッカーはページを再読込するので、ストーリー画面なら再生位置を保存して復元する
  const cfg = window.NK_I18N_CFG || {};
  const prevHook = cfg.onBeforeReload;
  cfg.onBeforeReload = function () {
    if (prevHook) try { prevHook(); } catch (_) {}
    if (window.__stbScreen === 'story') {
      try { sessionStorage.setItem(RESUME_KEY, JSON.stringify({ t: v.currentTime || 0, p: !v.paused && !v.ended, e: !end.hidden })); } catch (_) {}
    }
  };
  window.__stbStoryLang = applyLang;
  let r = null;
  try { r = JSON.parse(sessionStorage.getItem(RESUME_KEY) || 'null'); sessionStorage.removeItem(RESUME_KEY); } catch (_) {}
  if (r) { // 起動処理（load 時のメニュー表示）が終わってから復元
    const go = () => setTimeout(() => { open(r.t, !!r.p); if (r.e) finish(); }, 0);
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  }
  // 他の画面へ移ったら動画を止める
  new MutationObserver(() => { if (!scr.classList.contains('active') && !v.paused) try { v.pause(); } catch (_) {} }).observe(scr, { attributes: true, attributeFilter: ['class'] });
}
