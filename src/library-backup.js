import { normalizeState } from './model.js';
import { makeZip, crc32 } from './archive.js';
import { packBundle, unpackBundle, BUNDLE_LIMIT, partName } from './data-bundle.js';
import { canonical } from './sync-integrity.js';

export function libraryBackup(state) {
  const { manifest, blocks } = packBundle(normalizeState(state), 'backup');
  return makeZip([{ path: 'momenttheatre-backup.json', content: JSON.stringify(manifest) },
    ...[...blocks].map(([hash, value]) => ({ path: partName(hash), content: JSON.stringify(value) }))], { blob: true });
}
const invalid = () => { throw new Error('备份文件不完整或校验失败，当前资料未覆盖。请选择瞬息的完整备份。'); };
// Read only our ZIP STORE format, one bounded entry at a time. No extraction to
// filesystem, external paths, compression bombs, or monolithic archive buffer.
async function zipEntries(file) {
  if (file.size < 22 || file.size > BUNDLE_LIMIT * 2) invalid();
  const end = new DataView(await file.slice(-22).arrayBuffer());
  if (end.getUint32(0, true) !== 0x06054b50 || end.getUint16(4, true) || end.getUint16(6, true) || end.getUint16(20, true)) invalid();
  const count = end.getUint16(10, true), size = end.getUint32(12, true), offset = end.getUint32(16, true);
  if (!count || count > 10001 || count !== end.getUint16(8, true) || size > 4000000 || offset + size !== file.size - 22) invalid();
  const raw = new Uint8Array(await file.slice(offset, offset + size).arrayBuffer()), view = new DataView(raw.buffer), decoder = new TextDecoder('utf-8', { fatal: true });
  const entries = new Map(); let pos = 0, total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > size || view.getUint32(pos, true) !== 0x02014b50) invalid();
    const flags = view.getUint16(pos + 8, true), method = view.getUint16(pos + 10, true), length = view.getUint32(pos + 24, true);
    const nameLength = view.getUint16(pos + 28, true), extra = view.getUint16(pos + 30, true), comment = view.getUint16(pos + 32, true);
    if (flags !== 0x800 || method !== 0 || length !== view.getUint32(pos + 20, true) || length > 4000000 || pos + 46 + nameLength + extra + comment > size || view.getUint16(pos + 34, true)) invalid();
    const name = decoder.decode(raw.subarray(pos + 46, pos + 46 + nameLength)), start = view.getUint32(pos + 42, true);
    if (!(name === 'momenttheatre-backup.json' || /^momenttheatre-part-[a-f0-9]{64}\.json$/.test(name)) || entries.has(name) || start + 30 + nameLength + length > offset) invalid();
    total += length; if (total > BUNDLE_LIMIT * 2) invalid();
    entries.set(name, { start, length, crc: view.getUint32(pos + 16, true), nameLength }); pos += 46 + nameLength + extra + comment;
  }
  if (pos !== size) invalid();
  return async name => {
    const entry = entries.get(name); if (!entry) invalid();
    const local = new DataView(await file.slice(entry.start, entry.start + 30).arrayBuffer());
    if (local.getUint32(0, true) !== 0x04034b50 || local.getUint16(6, true) !== 0x800 || local.getUint16(8, true) || local.getUint32(14, true) !== entry.crc || local.getUint32(18, true) !== entry.length || local.getUint32(22, true) !== entry.length || local.getUint16(26, true) !== entry.nameLength || local.getUint16(28, true)) invalid();
    const filename = decoder.decode(await file.slice(entry.start + 30, entry.start + 30 + entry.nameLength).arrayBuffer());
    if (filename !== name) invalid();
    const start = entry.start + 30 + entry.nameLength, content = new Uint8Array(await file.slice(start, start + entry.length).arrayBuffer());
    if (crc32(content) !== entry.crc) invalid();
    try { return JSON.parse(decoder.decode(content)); } catch { invalid(); }
  };
}
export async function restoreLibraryBackup(file) {
  if (!file || file.size > BUNDLE_LIMIT * 2) throw new Error('备份文件过大，请分批整理资料后重试。');
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (signature[0] === 0x50 && signature[1] === 0x4b) {
    const read = await zipEntries(file);
    const data = await unpackBundle(await read('momenttheatre-backup.json'), 'backup', hash => read(partName(hash))), clean = normalizeState(data);
    if (canonical(data) !== canonical(clean)) invalid();
    return clean;
  }
  // Legacy JSON remains importable, including libraries above the old 50 MB cap.
  if (file.size > BUNDLE_LIMIT) throw new Error('JSON 备份超过 512 MB，请分批整理资料后重试。');
  return normalizeState(JSON.parse(await file.text()));
}
