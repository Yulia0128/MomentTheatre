import { MarkdownIt } from './reading-vendor.js';

const markdown = new MarkdownIt('zero', { html: false }).enable(['emphasis', 'strikethrough', 'escape', 'backticks', 'newline']);
const escape = markdown.utils.escapeHtml;
const pairs = new Map([['“', '”'], ['「', '」'], ['『', '』'], ['‘', '’'], ['"', '"']]);
const tags = new Map([['strong', 'strong'], ['em', 'em'], ['s', 'del']]);

// Match speech before rendering individual text tokens so emphasis inside a quote
// can never create crossed HTML tags. Only complete pairs get a speech style.
function quoteRanges(text) {
  const stack = [], ranges = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i], top = stack.at(-1);
    if (top?.end === char) {
      stack.pop();
      ranges.push([top.start, i + 1]);
    } else if (pairs.has(char)) stack.push({ start: i, end: pairs.get(char) });
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range);
  }
  return merged;
}

export function renderProseInline(source) {
  const tokens = markdown.parseInline(String(source), {})[0]?.children || [];
  const plain = tokens.map(t => t.type === 'text' ? t.content : t.type === 'softbreak' || t.type === 'hardbreak' ? '\n' : t.type === 'code_inline' ? ' ' : '').join('');
  const ranges = quoteRanges(plain);
  let offset = 0, rangeIndex = 0;
  return tokens.map(token => {
    if (token.type === 'text') {
      const start = offset, end = start + token.content.length;
      offset = end;
      let at = start, html = '';
      while (rangeIndex < ranges.length && ranges[rangeIndex][1] <= start) rangeIndex++;
      for (let i = rangeIndex; i < ranges.length && ranges[i][0] < end; i++) {
        const left = Math.max(at, ranges[i][0]), right = Math.min(end, ranges[i][1]);
        html += escape(token.content.slice(at - start, left - start));
        html += `<q class="prose-quote">${escape(token.content.slice(left - start, right - start))}</q>`;
        at = right;
      }
      return html + escape(token.content.slice(at - start));
    }
    if (token.type === 'softbreak' || token.type === 'hardbreak') { offset++; return '\n'; }
    if (token.type === 'code_inline') { offset++; return `<code>${escape(token.content)}</code>`; }
    const tag = tags.get(token.tag);
    return tag ? token.nesting === 1 ? `<${tag}>` : `</${tag}>` : escape(token.content);
  }).join('');
}

export const PROSE_CSS = `.paragraph q{quotes:none;color:var(--prose-quote-color,color-mix(in srgb,var(--reader-ink) 76%,#b57746))}.paragraph q::before,.paragraph q::after{content:none}.paragraph strong{font-weight:700;color:var(--prose-strong-color,inherit)}.paragraph em{font-style:italic;color:var(--prose-em-color,color-mix(in srgb,var(--reader-ink) 78%,#85939e))}.paragraph del{text-decoration:line-through;color:var(--prose-del-color,color-mix(in srgb,var(--reader-ink) 65%,#999))}.paragraph code{font-family:monospace;background:#8881;border-radius:3px;padding:0 .2em}`;
