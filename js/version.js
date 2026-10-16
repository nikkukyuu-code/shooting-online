/** Visible build id: Asia/Tokyo publish datetime (YYYY-MM-DD HH:mm:ss). */
export const VERSION_LABEL = '2026-10-16 10:32:32';
/** Epoch ms of this publish (also drives the 「最新」 badge window). */
export const BUILD_TIME = 1792114352000;
export const BUILD_NOTE = '検索エンジン向けの情報（説明文・構造化データ・サイトマップ）を整備';

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
