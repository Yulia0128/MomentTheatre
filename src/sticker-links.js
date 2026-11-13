import {safeStickerUrl} from './phone-format.js';
import {checkStickerImage} from './sticker-files.js';

export function stickerLinks(text, limit = 9) {
  if (typeof text !== 'string' || text.length > 1000000) throw Error('粘贴内容过长，请仅保留本批图片链接。');
  // Markdown captions can repeat the destination. Use the actual destination once.
  const plain = text.replace(/\[[^\]]*\]\(\s*(https?:\/\/(?:[^()\s]|\([^()\s]*\))+)(?:\s+["'][^\n]*?["'])?\s*\)/gi, (_all, url) => ' ' + url + ' ');
  const result = [], seen = new Set();
  for (const match of plain.matchAll(/https?:\/\/[^\s<>"'`|]+/gi)) {
    let candidate = match[0].replace(/[，。；、]+$/u, '');
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      while (candidate.endsWith(close) && candidate.split(close).length > candidate.split(open).length) candidate = candidate.slice(0, -1);
    }
    const url = safeStickerUrl(candidate);
    if (!url || url.length > 4000) throw Error('发现无效或过长的图片链接，请检查粘贴文本。');
    if (!seen.has(url)) { seen.add(url); result.push(url); }
  }
  if (!result.length) throw Error('未识别到 HTTP(S) 图片链接，请粘贴图片直链。');
  if (result.length > limit) throw Error(limit === 1 ? '修改表情包时只能替换一张图片，请只保留一个链接。' : '每批最多 9 张，已识别到 ' + result.length + ' 个不同链接，请删减后重试。');
  return result;
}
export async function readStickerLinks(text, limit = 9, validateImage = checkStickerImage) {
  const links = stickerLinks(text, limit);
  const checks = await Promise.allSettled(links.map(url => validateImage(url)));
  const failed = links.filter((_url, i) => checks[i].status === 'rejected');
  if (failed.length) throw Error('以下图片在当前网络下无法预览，请修改或删掉后重试：\n' + failed.join('\n'));
  return links.map(url => ({name:'', url, description:''}));
}
