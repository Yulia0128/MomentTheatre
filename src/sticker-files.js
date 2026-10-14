export const MAX_STICKER_BYTES = 5 * 1024 * 1024;
export const MAX_STICKER_BATCH = 9;
export function localStickerUrl(value) {
  return typeof value === 'string' && value.length <= Math.ceil(MAX_STICKER_BYTES / 3) * 4 + 80 &&
    /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(value) ? value : '';
}
function mime(bytes) {
  const text = (a, b) => String.fromCharCode(...bytes.slice(a, b));
  if (bytes[0] === 137 && text(1, 4) === 'PNG' && bytes[4] === 13 && bytes[5] === 10) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(text(0, 6))) return 'image/gif';
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  return '';
}
async function checkImage(url) {
  const image = new Image();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { image.src = ''; reject(new Error('图片读取超时。')); }, 15000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('图片无法读取，请重新选择。')); };
    image.src = url;
  });
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('图片尺寸过大，请先缩小后上传。');
}
export async function readStickerFiles(files, validateImage = checkImage) {
  files = Array.from(files || []);
  if (!files.length || files.length > MAX_STICKER_BATCH) throw new Error('每次请选择 1～9 张表情包。');
  if (files.some(file => !file.size || file.size > MAX_STICKER_BYTES)) throw new Error('每张表情包不能超过 5 MB。');
  const rows = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer()), type = mime(bytes);
    if (!type) throw new Error('请选择 PNG、JPG、GIF 或 WebP 图片。');
    let binary = '';
    for (let start = 0; start < bytes.length; start += 32768) binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
    const url = `data:${type};base64,${btoa(binary)}`;
    await validateImage(url);
    rows.push({ name: '', url, description: '' });
  }
  return rows;
}
