/** App version — player-visible label is Asia/Tokyo publish datetime to the second. */
export const VERSION = '20260926001515';
export const VERSION_LABEL = '2026-09-26 00:15:15';
export const BUILD_NOTE = 'バージョン表示を日時（秒まで）に統一';
/** Publish time (epoch ms). Within 5 min of this, menu shows 「最新」 badge. Update on every bump. */
export const BUILD_TIME = 1790349315218;

/** Format any epoch ms as Asia/Tokyo YYYY-MM-DD HH:mm:ss */
export function formatVersionTime(ms = BUILD_TIME) {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).format(new Date(ms)).replace('T', ' ');
  } catch (_) {
    return VERSION_LABEL;
  }
}
