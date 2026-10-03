import { canonical, sha256 } from './sync-integrity.js';
import { packAvatars, unpackAvatars, avatarReferences, avatarHash } from './avatar-assets.js';

export const BUNDLE_LIMIT = 512 * 1024 * 1024;
export const PART_CHARS = 512 * 1024;
const hashPattern = /^[a-f0-9]{64}$/;
export const partName = hash => `momenttheatre-part-${hash}.json`;
const fail = () => { throw new Error('备份或同步分块缺失、过大或校验失败，原资料未覆盖。'); };
const bytes = text => new TextEncoder().encode(text).length;

// Bounded requests, reusable content-addressed blocks, and one copy per avatar.
// The hydrated document retains the legacy application schema/checksum semantics.
export function packBundle(value, kind) {
  const { data, assets } = packAvatars(value), blocks = new Map(); let total = 0;
  const split = text => {
    total += bytes(text); if (total > BUNDLE_LIMIT) throw new Error('本次资料超过 512 MB，请先按分类分批导出并整理资料。');
    const parts = [];
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + PART_CHARS, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      const content = text.slice(start, end), hash = sha256(content);
      parts.push(hash); blocks.set(hash, { format: 'momenttheatre-part', version: 1, content }); start = end;
    }
    return parts;
  };
  const document = split(JSON.stringify(data));
  const images = Object.fromEntries([...assets].map(([hash, url]) => [hash, split(url)]));
  const manifest = { format: 'momenttheatre-bundle', version: 2, kind, document, images, bytes: total };
  manifest.checksum = sha256(canonical(manifest));
  validateBundle(manifest, kind);
  return { manifest, blocks };
}
export function validateBundle(manifest, kind) {
  if (!manifest || typeof manifest !== 'object') fail();
  const { checksum, ...body } = manifest;
  if (manifest.format !== 'momenttheatre-bundle' || manifest.version !== 2 || manifest.kind !== kind || sha256(canonical(body)) !== checksum ||
      !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > BUNDLE_LIMIT ||
      !manifest.images || typeof manifest.images !== 'object' || Array.isArray(manifest.images) || Object.keys(manifest.images).length > 10000) fail();
  const lists = [manifest.document, ...Object.entries(manifest.images).map(([hash, list]) => { if (!hashPattern.test(hash)) fail(); return list; })];
  let count = 0;
  for (const list of lists) {
    if (!Array.isArray(list) || !list.length || !list.every(hash => typeof hash === 'string' && hashPattern.test(hash))) fail();
    count += list.length; if (count > 10000) fail();
  }
  return [...new Set(lists.flat())];
}
export function validatePart(part, hash) {
  if (part?.format !== 'momenttheatre-part' || part.version !== 1 || typeof part.content !== 'string' || part.content.length > PART_CHARS || sha256(part.content) !== hash) fail();
  return part.content;
}
export async function unpackBundle(manifest, kind, readPart) {
  const hashes = validateBundle(manifest, kind), blocks = new Map(); let actual = 0;
  let loaded = 0;
  for (const hash of hashes) {
    const part = validatePart(await readPart(hash), hash); loaded += bytes(part);
    if (loaded > manifest.bytes) fail(); blocks.set(hash, part);
  }
  const join = list => {
    const parts = list.map(hash => {
      const part = blocks.get(hash); actual += bytes(part);
      if (actual > manifest.bytes || actual > BUNDLE_LIMIT) fail(); return part;
    });
    return parts.join('');
  };
  let data;
  try { data = JSON.parse(join(manifest.document)); } catch { fail(); }
  const refs = avatarReferences(data), assets = new Map();
  if (refs.size !== Object.keys(manifest.images).length) fail();
  for (const [hash, list] of Object.entries(manifest.images)) {
    const url = join(list); if (!refs.has(hash) || avatarHash(url) !== hash) fail(); assets.set(hash, url);
  }
  if (actual !== manifest.bytes) fail();
  return unpackAvatars(data, assets);
}
