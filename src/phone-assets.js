// Phone UI icons; the original placeholder cat stickers have been removed.
export const STICKER_URLS = Object.freeze({});
export function builtInSticker() { return ''; }
const paths = {
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  transfer: '<circle cx="12" cy="12" r="10"/><path d="M6 8h11m-3-3 3 3-3 3M18 16H7m3-3-3 3 3 3"/>',
  call: '<path d="M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4c0 2-2 3-4 2C8 19 4 15 2 7 1 5 3 3 5 3Z"/>',
  video: '<rect x="2" y="5" width="13" height="14" rx="3"/><path d="m15 10 7-4v12l-7-4"/>',
  image: '<rect x="2" y="3" width="20" height="18" rx="3"/><circle cx="8" cy="9" r="2"/><path d="m3 18 6-5 4 3 4-5 5 5"/>',
  share: '<rect x="4" y="2" width="16" height="20" rx="3"/><path d="M8 7h8M8 12h8M8 17h5"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6.5 9 5.5 5.5L17.5 9"/>',
  doubleDown: '<path d="m6.5 6 5.5 5.5L17.5 6M6.5 12.5 12 18l5.5-5.5"/>',
};
export function phoneIcon(name) {
  return `<svg class="phone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.image}</svg>`;
}
export function virtualMap() {
  return '<svg class="virtual-map" viewBox="0 0 260 112" role="img" aria-label="虚拟地图与定位标志"><rect width="260" height="112" fill="#e8e9e3"/><path d="M0 72Q55 42 110 91T260 69" stroke="#c5d9dd" stroke-width="24" fill="none"/><path d="M12 8h49v32H12zM167 4h64v27h-64zM154 76h43v27h-43z" fill="#d1dbc9"/><path d="M84-10 110 124M-10 51 280 35M183-10 165 124" stroke="#fff" stroke-width="12"/><path d="M84-10 110 124" stroke="#e9cb91" stroke-width="5"/><path d="M16 95 73 80M214 57 244 95" stroke="#fff" stroke-width="7"/><circle cx="132" cy="58" r="23" fill="#718a721a"/><path d="M132 79s-14-15-14-25a14 14 0 0 1 28 0c0 10-14 25-14 25Z" fill="#668572" stroke="#fff" stroke-width="2"/><circle cx="132" cy="54" r="5" fill="#fff"/></svg>';
}
