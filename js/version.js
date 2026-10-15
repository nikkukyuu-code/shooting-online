/** Visible build id: Asia/Tokyo publish datetime (YYYY-MM-DD HH:mm:ss). */
export const VERSION_LABEL = '2026-10-16 02:49:40';
/** Epoch ms of this publish (also drives the 「最新」 badge window). */
export const BUILD_TIME = 1792086580000;
export const BUILD_NOTE = 'メダルを豪華に: 期間ごとに形が変わり（日=円・週=リボン・月=星+月桂樹+宝石・年=王冠+月桂冠+光線）、順位の数字と期間札で一目で区別';

export function formatVersionTime(ms = BUILD_TIME) {
  try {
    const d = new Date(ms);
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const g = (t) => (p.find((x) => x.type === t) || {}).value || '00';
    return g('year') + '-' + g('month') + '-' + g('day') + ' ' + g('hour') + ':' + g('minute') + ':' + g('second');
  } catch (_) {
    return VERSION_LABEL;
  }
}
