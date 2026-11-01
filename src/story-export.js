import { safeName } from './archive.js';
import { cleanHtml } from './html-work.js';
import { renderReader } from './reader.js';
import { resolveChapterTheme } from './themes.js';

export const canExportText = story => story.mode !== 'html' && story.chapters.length > 0 &&
  story.chapters.every(ch => (ch.mode || story.mode) === 'prose');

export function storyHtmlFile(state, story) {
  if (!story.chapters.length) throw new Error('这篇番外还没有可导出的章节。');
  const content = story.mode === 'html'
    ? cleanHtml(story.chapters[0].content, story.chapters[0].readingRegex, story.snapshot)
    : renderReader(story, resolveChapterTheme(state, story, story.chapters[0]), null, ch => resolveChapterTheme(state, story, ch));
  if (!content.trim()) throw new Error('这篇作品没有可导出的 HTML 内容。');
  return { name: safeName(story.title) + '.html', content, type: 'text/html;charset=utf-8' };
}

// A separate, script-disabled document applies the frozen chapter CSS and uses
// innerText to omit display:none content. It never reads or reloads the live reader.
export function visibleChapterText(html, doc = globalThis.document) {
  return new Promise((resolve, reject) => {
    const frame = doc.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed!important;left:-100000px!important;top:0!important;width:860px!important;height:900px!important;opacity:0!important;pointer-events:none!important;border:0!important';
    let timer;
    const finish = (error, value) => { clearTimeout(timer); frame.onload = frame.onerror = null; frame.remove(); error ? reject(error) : resolve(value); };
    frame.onload = () => {
      try {
        const document = frame.contentDocument;
        if (!document?.querySelector('main')) throw new Error('读取导出正文失败，请重试。');
        // Framework headings/diagnostics are not story paragraphs. Any warnings
        // and known empty sections have already been rejected before this step.
        for (const node of document.querySelectorAll('.prose-title,script,template')) node.remove();
        const texts = [...document.querySelectorAll('section.prose-chapter')].map(section => {
          for (let node = section; node; node = node.parentElement) {
            const style = frame.contentWindow.getComputedStyle(node);
            if (style.display === 'none' || Number(style.opacity) === 0 || style.contentVisibility === 'hidden') return '';
          }
          const transparent = [...section.querySelectorAll('*')].filter(node => {
            const style = frame.contentWindow.getComputedStyle(node);
            return Number(style.opacity) === 0 || style.contentVisibility === 'hidden';
          });
          for (const node of transparent) node.remove();
          return section.innerText.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\n[\t ]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        });
        finish(null, texts);
      } catch (error) { finish(error); }
    };
    frame.onerror = () => finish(new Error('读取导出正文失败，请重试。'));
    timer = setTimeout(() => finish(new Error('读取导出正文超时，请重试。')), 15000);
    // No scripts, fonts, frames, image requests, forms or other network access.
    frame.srcdoc = html.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/,
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">');
    doc.body.append(frame);
  });
}

export async function storyTextFile(state, story, readText = visibleChapterText) {
  if (!canExportText(story)) throw new Error('TXT 仅支持全篇都是正文的番外；含小手机的作品请导出 HTML。');
  const issues = [], warnings = [];
  const html = renderReader(story, resolveChapterTheme(state, story, story.chapters[0]), null,
    ch => resolveChapterTheme(state, story, ch), list => warnings.push(...list), { onEmpty: (_issue, chapter) => issues.push(chapter) });
  if (issues.length) throw new Error(`第 ${issues[0]} 节没有可导出的正文，请先检查阅读内容。`);
  if (warnings.length) throw new Error('正文规则存在错误，请先检查阅读内容后再导出 TXT。');
  if (/<iframe\b[^>]*data-regex-card=/i.test(html)) throw new Error('这篇正文含动态脚本美化，请导出 HTML 以保留完整内容。');
  const texts = await readText(html);
  const empty = texts.findIndex(text => !text.trim());
  if (empty !== -1 || texts.length !== story.chapters.length) throw new Error(`第 ${empty === -1 ? 1 : empty + 1} 节没有可导出的正文，请先检查阅读内容。`);
  return { name: safeName(story.title) + '.txt', content: [story.title, ...texts].join('\n\n'), type: 'text/plain;charset=utf-8' };
}
