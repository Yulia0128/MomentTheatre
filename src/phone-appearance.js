export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export function avatarUrl(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 100) return '';
  if (/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/]+=*$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && value.length <= 8000 ? url.href : '';
  } catch { return ''; }
}
export function phoneAppearance(value) {
  return { remark: typeof value?.remark === 'string' ? value.remark.trim().slice(0, 120) : '', userAvatar: avatarUrl(value?.userAvatar), charAvatar: avatarUrl(value?.charAvatar) };
}

export async function avatarFile(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPG、GIF 或 WebP 图片。');
  if (file.size > MAX_AVATAR_BYTES) throw new Error('头像图片请小于 2 MB。');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve; image.onerror = () => reject(new Error('图片读取失败，请重新选择。')); image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('图片尺寸过大，请先缩小后上传。');
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法处理头像图片，请换一张图片重试。');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Animated uploads become a small static avatar; transparent backgrounds stay transparent.
    const compressed = canvas.toDataURL('image/webp', 0.94);
    if (!avatarUrl(compressed)) throw new Error('头像压缩失败，请换一张图片重试。');
    return compressed;
  } finally { URL.revokeObjectURL(url); }
}

export function checkAvatarImage(url) {
  if (!url) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const image = new Image(); image.referrerPolicy = 'no-referrer';
    const finish = error => { clearTimeout(timer); image.onload = image.onerror = null; if (error) { image.src = ''; reject(error); } else resolve(); };
    const timer = setTimeout(() => finish(new Error('头像加载超时，请检查图片直链或重新上传。')), 15000);
    image.onload = () => image.naturalWidth ? finish() : finish(new Error('图片没有可显示的内容。'));
    image.onerror = () => finish(new Error('头像无法加载，请使用可直接访问的图片链接或本地图片。'));
    image.src = url;
  });
}
