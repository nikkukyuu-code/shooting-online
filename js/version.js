/** Visible build id: Asia/Tokyo publish datetime (YYYY-MM-DD HH:mm:ss). */
export const VERSION_LABEL = '2026-10-04 11:06:22';
/** Epoch ms of this publish (also drives the 「最新」 badge window). */
export const BUILD_TIME = 1791079582214;
export const BUILD_NOTE = '対戦開始・最初の撃破で固まる問題を修正（爆発画像を事前に少しずつ作成・文字計測を軽く）';

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
