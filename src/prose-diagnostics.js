// Only lengths and rule positions leave this module. Never include story text,
// titles, names, expressions, replacement templates, URLs or credentials.
import { stripDefaultFilters } from './preset-regex.js';
import { extractTitle } from './story-title.js';
export const originalProse = chapter => chapter.sourceContent || chapter.content || '';
export function emptyProseIssue(chapter, rendered) {
  // Be deliberately conservative: non-text HTML can render through CSS,
  // pseudo-elements or background images. Never infer failure from its text alone.
  if (!originalProse(chapter).trim() || rendered.cards || rendered.html !== '') return null;
  const trace = rendered.trace;
  let stage, message;
  const sourceBody = chapter.sourceContent && chapter.sourceContent !== chapter.content
    ? extractTitle(stripDefaultFilters(chapter.sourceContent), 'prose').content.trim() : '';
  if (trace.body === 0 && sourceBody) {
    stage = '章节正文与独立原文不一致';
    message = '阅读内容为空，另存的原文仍有正文。';
  } else if (extractTitle(stripDefaultFilters(chapter.content), 'prose').content.trim() &&
    trace.rules.some(s => s.before > 0 && s.after === 0)) {
    stage = '章节正则';
    message = '正文已被本节规则隐藏，原文已保留。';
  } else return null; // Expected thought/comment/title handling is not a fault.
  return { code: 'EMPTY_PROSE_VIEW', stage, message, originalChars: originalProse(chapter).length,
    contentChars: String(chapter.content || '').length, ...trace };
}
export function proseDiagnosticText(issue, version) {
  return JSON.stringify({ app: 'MomentTheatre', version, diagnostic: issue }, null, 2);
}
