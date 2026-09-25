import { builtInSticker, STICKER_URLS, phoneIcon, virtualMap } from './phone-assets.js';
import { PHONE_CSS } from './phone-style.js';
import { PROSE_CSS } from './prose.js';
import { compileThemeCss } from './theme-css.js';
import { renderRegexProse } from './preset-regex.js';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { PHONE_TYPES, parsePhone } from './phone-format.js';
import { parsePhone, resolveMessageStickers } from './phone-format.js';
export function safeImage(value) {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password || /^data:image\/(png|jpeg|gif|webp);base64,/i.test(value) ? value : ''; } catch { return ''; }
}
function phoneHtml(messages, characterName) {
  const clock = messages.find(m => m.time)?.time?.match(/\d{1,2}:\d{2}/)?.[0] || '09:41';
  return `<div class="phone"><div class="phone-screen"><div class="phone-status"><span>${escapeHtml(clock)}</span><span class="phone-island" aria-hidden="true"></span><span class="phone-battery" aria-hidden="true"><i></i></span></div><div class="phone-header" style="display:grid!important;grid-template-columns:24px minmax(0,1fr) 24px!important;column-gap:8px!important;padding-inline:17px!important;direction:ltr!important"><span class="phone-back" aria-hidden="true" style="grid-column:1!important;grid-row:1!important;text-align:left!important">‹</span><div class="phone-contact" style="grid-column:2!important;grid-row:1!important;text-align:center!important;min-width:0!important;width:100%!important;margin-inline:0!important;position:static!important;transform:none!important" title="${escapeHtml(characterName)}">${escapeHtml(characterName)}</div></div><div class="messages" tabindex="0" role="region" aria-label="手机消息，可在屏幕内滚动">${messages.map(m => {
    const body = escapeHtml(m.text);
    let inner = body;
    if (m.type === 'voice') inner = `<details class="voice"><summary class="voice-bar"><span class="voice-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>${escapeHtml(m.duration || '语音')}</span><span class="voice-hint"><span class="voice-closed">转文字</span><span class="voice-open">收起</span></span></summary><div class="voice-transcript">${body || '暂无转写文字'}</div></details>`;
    if (m.type === 'transfer') inner = `<div class="transfer-card"><div class="transfer-main">${phoneIcon('transfer')}<div><strong>${escapeHtml(/^[¥￥$€£]/.test(m.amount) ? m.amount : '￥' + m.amount)}</strong><span>${escapeHtml(m.status || '待收款')}</span></div></div>${body ? `<p class="transfer-note">${body}</p>` : ''}<div class="transfer-foot">转账</div></div>`;
    if (m.type === 'image') {
      const src = safeImage(m.url);
      inner = src ? `<img class="message-image" src="${escapeHtml(src)}" alt="${body || '图片'}" loading="lazy" referrerpolicy="no-referrer">` : `<div class="image-description">${phoneIcon('image')}<span>${body || '一张图片'}</span></div>`;
    }
    if (m.type === 'sticker') {
      const key = m.sticker || m.text, src = safeImage(m.url || STICKER_URLS[key]);
      inner = src ? `<img class="sticker-image" src="${escapeHtml(src)}" alt="${body || '表情包'}" loading="lazy" referrerpolicy="no-referrer">` : `<div class="sticker-built-in" role="img" aria-label="${escapeHtml(m.text || key || '表情包')}">${builtInSticker(key) || `<span class="sticker-fallback">${body || escapeHtml(key) || '表情包'}</span>`}</div>`;
    }
    if (m.type === 'location') inner = `<div class="location-card"><div class="location-caption"><strong>${escapeHtml(m.title || m.text || '虚拟定位')}</strong><small>${escapeHtml(m.address || '虚拟地点')}</small></div>${virtualMap()}</div>`;
    if (m.type === 'share') {
      const thumb = safeImage(m.thumbnail);
      inner = `<div class="share-card"><strong>${escapeHtml(m.title || '网页分享')}</strong><div class="share-description"><span>${escapeHtml(m.description || m.text)}</span>${thumb ? `<img src="${escapeHtml(thumb)}" alt="分享缩略图" loading="lazy" referrerpolicy="no-referrer">` : `<span class="share-thumbnail">${phoneIcon('share')}</span>`}</div><div class="share-source">${phoneIcon('share')}<span>${escapeHtml(m.source || '网页分享')}</span></div></div>`;
    }
    if (['call', 'video'].includes(m.type)) inner = `<span class="call-record">${phoneIcon(m.type)}<span>${escapeHtml(m.status && m.status !== '发起' ? m.status : '发起')}${m.type === 'call' ? '语音' : '视频'}通话${m.duration ? ' · ' + escapeHtml(m.duration) : ''}</span></span>`;
    if (m.type === 'retract') inner = `<div class="retracted-message"><span class="retract-notice">${m.sender === 'user' ? '你' : '对方'}撤回了一条消息</span><span class="retract-original">${body}</span></div>`;
    return `<div class="message ${m.sender === 'user' ? 'own' : ''}" data-type="${m.type}"><span class="message-avatar" role="img" aria-label="${m.sender === 'user' ? '我方头像' : '对方头像'}"></span><div class="message-content"><div class="bubble">${inner}</div>${m.time ? `<time class="message-time">${escapeHtml(m.time)}</time>` : ''}</div></div>`;
  }).join('')}</div><div class="phone-footer" aria-hidden="true"><span class="phone-input"></span>${phoneIcon('plus')}</div><div class="phone-home" aria-hidden="true"></div></div></div>`;
}
export function renderReader(story, theme, chapterIndex = null, themeForChapter = null, onWarnings = null) {
  const chapters = chapterIndex === null ? story.chapters : [story.chapters[chapterIndex]].filter(Boolean);
  const phoneOnly = chapterIndex !== null && (chapters[0]?.mode || story.mode) === 'phone';
  const firstProse = chapters.findIndex(chapter => (chapter.mode || story.mode) !== 'phone');
  const body = chapters.map((chapter, index) => {
    const n = chapterIndex === null ? index + 1 : chapterIndex + 1;
    const mode = chapter.mode || story.mode, selectedTheme = chapter.readingTheme || themeForChapter?.(chapter) || theme, t = selectedTheme.tokens || {};
    const compiled = compileThemeCss(selectedTheme.css || '', t.fontFamily, n);
    const vars = `--reader-bg:${t.background || '#F9F8F6'};--reader-ink:${t.color || '#1C1C1C'};--reader-font:${compiled.fontFamily};--reader-size:${t.fontSize || '17px'};--reader-leading:${t.lineHeight || '1.9'};--bubble:${t.bubble || '#fff'};--own-bubble:${t.ownBubble || '#E3E1DB'}`;
    let content;
    if (mode === 'phone') {
      try {
        const messages = resolveMessageStickers(parsePhone(chapter.content, { character: story.snapshot?.character?.name, persona: story.snapshot?.persona?.name }), chapter.stickerSnapshot);
        if (!messages.length) throw new Error('没有可显示的有效消息，原文已保留，可打开编辑修正。');
        content = phoneHtml(messages, story.snapshot?.character?.name || '角色');
      }
      catch (error) { content = `<p class="diagnostic">${escapeHtml(error.message)}</p>`; }
    } else {
      const rendered = renderRegexProse(chapter.content, chapter.readingRegex, story.snapshot || {}, n);
      content = rendered.html;
      if (rendered.warnings.length) {
        onWarnings?.(rendered.warnings);
        content += rendered.warnings.map(w => `<p class="diagnostic">${escapeHtml(w)}</p>`).join('');
      }
    }
    const heading = mode === 'phone' ? '' : index === firstProse ? `<h1 class="prose-title">${escapeHtml(story.title)}</h1>` : '';
    return `<section class="chapter ${mode === 'phone' ? 'phone-chapter' : 'prose-chapter'}" data-chapter="${n}" style="${escapeHtml(vars)}"><style>${compiled.fonts}\n@scope ([data-chapter="${n}"]) { ${compiled.css} ${mode === 'prose' ? '.prose-chapter,.paragraph{font-size:14px!important}.prose-title{font-size:26px!important}' : ''} }</style>${heading}${content}</section>`;
  }).join('');
  // The same inert document is used in sandboxed previews and standalone category exports.
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: http: data:; font-src https: http: data:; base-uri 'none'; form-action 'none'"><title>${escapeHtml(story.title)}</title><style>
*{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:#aaa69c55 transparent}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:#aaa69c66;border-radius:8px}body{margin:0;padding:20px;background:transparent;color:${theme.tokens?.color || '#282724'};font:17px/1.9 system-ui,sans-serif;overflow-wrap:anywhere}main{max-width:720px;margin:auto}h2{font-family:"Songti SC",SimSun,Georgia,serif;font-weight:400}h1{font-family:inherit;font-weight:400;font-size:1.6em;margin:0 0 20px}h2{font-size:1em;opacity:.65;margin:0 0 18px}.chapter{padding:24px;background:var(--reader-bg);color:var(--reader-ink);font-family:var(--reader-font);font-size:var(--reader-size);line-height:var(--reader-leading)}.paragraph{white-space:pre-wrap;margin:0 0 1em}.chapter+.chapter{border-top:1px solid #8883;margin-top:30px}pre{white-space:pre-wrap;font:inherit}.phone{width:min(320px,100%);height:600px;background:color-mix(in srgb,var(--reader-bg) 85%,#999);border:2px solid #aaa5;border-radius:43px;padding:7px;position:relative;margin:auto;box-shadow:inset 0 0 0 3px #fff6,0 8px 24px #0000000a}.phone:before,.phone:after{content:'';position:absolute;top:110px;width:3px;height:40px;background:#a9a9a9;border-radius:2px}.phone:before{left:-5px;box-shadow:0 49px 0 #a9a9a9}.phone:after{right:-5px;top:145px;height:54px}.phone-screen{height:100%;border-radius:34px;overflow:hidden;background:var(--reader-bg);display:flex;flex-direction:column;min-height:0}.phone-status{flex-shrink:0;height:48px;padding:14px 18px 0;display:flex;justify-content:space-between;align-items:flex-start;font:600 11px/1.5 system-ui;position:relative}.phone-island{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:80px;height:24px;background:#111;border-radius:20px}.phone-island:after{content:'';position:absolute;right:8px;top:7px;width:10px;height:10px;background:#202025;border-radius:50%}.phone-signals{display:flex;align-items:center;gap:5px;letter-spacing:1px}.phone-signals i{display:block;width:17px;height:9px;border:1px solid currentColor;border-radius:2px;position:relative}.phone-signals i:before{content:'';position:absolute;inset:1px 3px 1px 1px;background:currentColor}.phone-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 17px 12px;border-bottom:1px solid #8883;font:500 14px/1.5 system-ui;text-align:center;flex-shrink:0}.phone-header small{display:block;font-size:9px;opacity:.45;font-weight:400}.phone-back{font:24px/1 system-ui}.messages{min-height:0;flex:1;overflow-y:auto;overscroll-behavior:contain;padding:10px 13px 22px;outline-offset:-3px}.message{display:flex;flex-direction:column;align-items:flex-start;margin:14px 0}.own{align-items:flex-end}.bubble{background:var(--bubble);padding:9px 12px;max-width:88%;border:1px solid #8882;border-radius:13px 13px 13px 3px;color:inherit;white-space:pre-wrap;font-size:14px;line-height:1.65}.own .bubble{background:var(--own-bubble);border-radius:13px 13px 3px 13px}.message small{font-size:10px;margin:0 0 5px;opacity:.6}.message-label{display:block;font-size:10px;margin-bottom:6px;opacity:.6}.bubble p{margin:8px 0 0}.bubble img{display:block;max-width:100%;height:auto}.timestamp{text-align:center;font-size:10px;opacity:.5}.phone-footer{height:44px;display:flex;align-items:center;gap:10px;padding:6px 16px;border-top:1px solid #8882;flex-shrink:0}.phone-input{height:27px;border:1px solid #8883;background:var(--bubble);border-radius:16px;flex:1}.phone-home{width:94px;height:4px;border-radius:8px;background:currentColor;opacity:.3;margin:6px auto 9px;flex-shrink:0}summary{cursor:pointer}summary:focus-visible{outline:2px solid currentColor}details p{white-space:pre-wrap}.diagnostic{border:1px solid currentColor;padding:12px;font-size:13px}.phone-reader{padding:14px;overflow:hidden}.phone-reader main>h1{display:none}.phone-reader .chapter{padding:0;background:transparent}.phone-reader .chapter>h2{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden}.phone-reader .phone{height:calc(100dvh - 28px);max-height:620px}.phone-reader .diagnostic,.phone-reader pre{position:relative;overflow:auto;max-height:85vh}.phone-chapter{padding-left:10px;padding-right:10px}@media(max-width:400px){body{padding:14px}.chapter{padding:14px}.phone-reader .chapter{padding:0}}
${PHONE_CSS}
${PROSE_CSS}
.preset-markup{max-width:100%;overflow-wrap:anywhere}.preset-markup img{max-width:100%;height:auto}
</style></head><body class="${phoneOnly ? 'phone-reader' : ''}"><main>${body || '<p>尚无内容</p>'}</main></body></html>`;
}
