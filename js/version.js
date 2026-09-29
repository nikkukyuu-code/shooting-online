/** Visible build id: Asia/Tokyo publish datetime (YYYY-MM-DD HH:mm:ss). */
export const VERSION_LABEL = '2026-09-29 12:50:46';
/** Epoch ms of this publish (also drives the 「最新」 badge window). */
export const BUILD_TIME = 1790653846864;
export const BUILD_NOTE = 'テザー敵の突きを長く（鎖の間隔が伸び縮み）・コア撃破後の連鎖を順番に2倍の爆発で・アプリ追加の表示を削除';

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
