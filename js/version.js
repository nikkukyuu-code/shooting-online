/** Visible build id: Asia/Tokyo publish datetime (YYYY-MM-DD HH:mm:ss). */
export const VERSION_LABEL = '2026-11-04 02:09:57';
/** Epoch ms of this publish (also drives the 「最新」 badge window). */
export const BUILD_TIME = 1793725797000;
export const BUILD_NOTE = '対人戦: 部屋は60秒で自動終了（残り時間表示）';

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
