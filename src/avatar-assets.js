import { sha256 } from './sync-integrity.js';

// Storage/transport boundary only. Readers and legacy checksums still see the
// original complete appearance, so old chapter snapshots never change style.
const hashes = new Map();
export function avatarHash(url) {
  if (!hashes.has(url)) {
    if (hashes.size >= 8) hashes.delete(hashes.keys().next().value);
    hashes.set(url, sha256(url));
  }
  return hashes.get(url);
}
function visit(value, transform, appearance = false) {
  if (Array.isArray(value)) return value.map(item => visit(item, transform));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    appearance && ['userAvatar', 'charAvatar'].includes(key) ? transform(item) : visit(item, transform, key === 'phoneAppearance')]));
}
export function packAvatars(value) {
  const assets = new Map(), seen = new Map();
  const data = visit(value, url => {
    if (typeof url !== 'string' || !url.startsWith('data:image/')) return url;
    const hash = seen.get(url) || avatarHash(url); seen.set(url, hash); assets.set(hash, url); return { avatar: hash };
  });
  return { data, assets };
}
export function avatarReferences(value) {
  const refs = new Set();
  visit(value, item => {
    if (item && typeof item === 'object') {
      if (Object.keys(item).length !== 1 || !/^[a-f0-9]{64}$/.test(item.avatar)) throw new Error('头像引用损坏，原资料未覆盖。');
      refs.add(item.avatar);
    }
    return item;
  });
  return refs;
}
export function unpackAvatars(value, assets) {
  const verified = new Set();
  return visit(value, item => {
    if (!item || typeof item !== 'object') return item;
    const url = assets.get(item.avatar);
    if (typeof url !== 'string' || (!verified.has(item.avatar) && avatarHash(url) !== item.avatar)) throw new Error('头像文件缺失或校验失败，原资料未覆盖。');
    verified.add(item.avatar);
    return url;
  });
}
