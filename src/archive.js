import { renderReader } from './reader.js';
import { resolveChapterTheme } from './themes.js';

const encoder = new TextEncoder();
const crcTable = new Uint32Array(256).map((_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function concat(parts) { const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0; for (const p of parts) { result.set(p, offset); offset += p.length; } return result; }
function header(size) { const bytes = new Uint8Array(size); return [bytes, new DataView(bytes.buffer)]; }
// ZIP STORE: UTF-8 filenames and CRC32; no CDN, native binary ZIP readable by standard unzip tools.
export function makeZip(files) {
  if (files.length > 65000) throw new Error('导出文件过多，请分批选择分类。');
  const local = [], central = []; let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.path), data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = crc32(data);
    if (name.length > 65535 || offset + data.length > 0xffffffff) throw new Error('导出超过 ZIP 基础格式容量，请分批导出。');
    const [lh, l] = header(30); l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint16(12, 33, true);
    l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, name.length, true);
    local.push(lh, name, data);
    const [ch, c] = header(46); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 33, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(ch, name); offset += lh.length + name.length + data.length;
  }
  const directory = concat(central), [end, e] = header(22); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, directory.length, true); e.setUint32(16, offset, true);
  return concat([...local, directory, end]);
}
export function safeName(value) {
  let result = String(value).normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 80).replace(/[. ]+$/g, '');
  if (!result || /^\.+$/.test(result)) result = '未命名';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(result)) result = `_${result}`;
  return result;
}
function distinctName(value, used) {
  const base = safeName(value); let result = base, index = 2;
  while (used.has(result.toLocaleLowerCase())) result = `${base} (${index++})`;
  used.add(result.toLocaleLowerCase()); return result;
}
export function categoryFiles(state, selected = null) {
  const categories = [...state.categories, { id: 'uncategorized', name: '未分类' }].filter(c => selected === null || selected.includes(c.id));
  const directories = new Set(), files = [];
  for (const category of categories) {
    const folder = distinctName(category.name, directories), names = new Set();
    const stories = state.stories.filter(s => s.saved && (category.id === 'uncategorized' ? !s.categoryIds.length : s.categoryIds.includes(category.id)));
    if (!stories.length) files.push({ path: `瞬息番外导出/${folder}/`, content: '' });
    for (const story of stories) files.push({ path: `瞬息番外导出/${folder}/${distinctName(story.title, names)}.html`, content: story.mode === 'html' ? story.chapters[0]?.content || '' : renderReader(story, resolveChapterTheme(state, story, story.chapters[0] || {}), null, ch => resolveChapterTheme(state, story, ch)) });
  }
  return files;
}
export function download(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
