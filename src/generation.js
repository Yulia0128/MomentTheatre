import { extractTitle } from './story-title.js';
import { cleanHtml, htmlIssue } from './html-work.js';
import { parsePhone } from './reader.js';
import { buildMessages } from './prompt.js';

export const countWords = text => Array.from(String(text).replace(/[^\p{L}\p{N}]/gu, '')).length;
export function readableText(content, mode) {
  if (mode !== 'phone') return content;
  return parsePhone(content).map(m => [m.type, m.text, m.title, m.description, m.address, m.source, m.sticker, m.amount, m.status].filter(Boolean).join(' ')).join('\n');
}
export const contentLength = (content, mode) => mode === 'html' ? content.length : mode === 'phone' ? parsePhone(content).length : countWords(content);
const checkInput = messages => {
  const size = messages.reduce((n,m) => n + m.content.length, 0);
  if (size > 1000000) throw new Error('请求输入超过一百万字符的保护上限。');
};
export async function ensureSummaries({ story, host, settings, signal, onPhase, onSave }) {
  if (story.mode === 'html') return null;
  story.summaries ||= [];
  const target = Math.floor(story.chapters.length / 10) * 10;
  for (let through = 10; through <= target; through += 10) {
    if (story.summaries.some(s => s.through === through)) continue;
    const block = story.chapters.slice(through - 10, through);
    if (block.some(ch => !ch.complete)) throw new Error('待总结的章节包含未完成内容。');
    const previous = story.summaries.find(s => s.through === through - 10);
    const source = [previous ? `此前剧情总结：${previous.content}` : '', ...block.map((ch,i) => `第 ${through - 9 + i} 节：\n${readableText(ch.content, ch.mode || story.mode)}`)].filter(Boolean).join('\n\n');
    const messages = [{ role: 'system', content: '你是剧情记录员。把提供的剧情压缩为 200—300 字的连贯叙述。保留重要事件、关系变化、未解决的线索和当前情境。包含此前总结中的必要事实，不添加事件。不分点、不加标题、不写创作说明，只输出一段叙述。' }, { role: 'user', content: source }];
    onPhase?.(`正在总结第 ${through - 9}—${through} 节…`);
    let result;
    for (let attempt = 0; attempt < 2; attempt++) {
      checkInput(messages);
      result = (await host.generate({ messages, settings: { ...settings, maxTokens: 1200 }, snapshot: null, signal })).trim();
      const size = countWords(result);
      if (size >= 200 && size <= 300 && !/\n\s*\n|^\s*[-*#]/m.test(result)) break;
      if (attempt === 1) throw new Error(`剧情总结未达到 200—300 字连贯叙述要求（收到 ${size} 字）。章节已保留。`);
      messages.push({ role: 'assistant', content: result }, { role: 'user', content: `刚才是 ${size} 字。请改写为 200—300 字的一段连贯叙述，只输出总结。` });
    }
    signal?.throwIfAborted();
    story.summaries.push({ through, content: result });
    await onSave?.();
  }
  return story.summaries.filter(s => s.through <= target).sort((a,b) => b.through - a.through)[0] || null;
}
export async function generateChapter({ host, settings, snapshot, story, prompt, mode, instruction = '', signal, onChunk, onPhase, onWarnings, onTitle, summary, initialContent = '' }) {
  if (mode === 'html') {
    if (story?.chapters?.length) throw new Error('HTML 作品不支持续写。');
    const messages = buildMessages({ snapshot, prompt, mode, maxInputChars: 1000000 });
    checkInput(messages); signal?.throwIfAborted(); onPhase?.('正在生成完整 HTML…');
    const content = cleanHtml(await host.generate({ messages, settings, snapshot, signal, onChunk }));
    signal?.throwIfAborted();
    if (!content) throw Object.assign(new Error('HTML 回复为空。'), { code: 'EMPTY_RESPONSE' });
    const issue = htmlIssue(content); onChunk?.(content);
    return { content, title: extractTitle(content, 'html').title, complete: !issue, htmlIssue: issue, actual: content.length, unit: '字符', rounds: 0, short: false };
  }
  const target = mode === 'phone' ? settings.targetMessages || 20 : settings.words;
  const unit = mode === 'phone' ? '条' : '字';
  const base = buildMessages({ snapshot, prompt, mode, instruction, chapters: story?.chapters || [], words: settings.words, targetMessages: target, summary, maxInputChars: 1000000 });
  onWarnings?.(base.warnings || []);
  let content = initialContent, title = '', rounds = 0, failures = 0, stagnant = 0, lastPart = '';
  const metrics = () => { const size = contentLength(content, mode); return { content, title, complete: true, ...(mode === 'phone' ? { messageCount: size, targetMessages: target } : { wordCount: size, targetWords: target }), actual: size, target, unit, rounds, short: false }; };
  for (let attempt = 0; attempt < 50; attempt++) {
    signal?.throwIfAborted();
    const prior = content, size = prior ? contentLength(prior, mode) : 0;
    if (size >= target) return metrics();
    const messages = [...base];
    if (prior) {
      rounds++;
      onPhase?.('已生成 ' + size + '/' + target + unit + '，正在自动补写（' + rounds + '）…');
      messages.push({ role: 'assistant', content: prior }, { role: 'user', content: '本节目前 ' + size + unit + '，未达到 ' + target + unit + '。请自然补充至少 ' + (target - size + (mode === 'phone' ? 0 : 50)) + ' ' + unit + (mode === 'phone' ? '消息。仅输出新的消息 JSON，格式仍为 {"messages":[...]}，不重复已有消息。' : '，延展情节或细节。只输出接在末尾的新正文，不重复上文，不输出标题、说明或结束语。') });
    } else onPhase?.(settings.stream === false ? '正在等待完整回复…' : '正在生成…');
    checkInput(messages);
    let streamed = '', rawPart;
    const acceptTitle = parsed => { if (!story?.chapters?.length && !title && parsed.title) { title = parsed.title; onTitle?.(title); } return parsed.content; };
    try {
      rawPart = await host.generate({ messages, settings, snapshot, signal, onChunk: part => {
        streamed = part;
        const body = acceptTitle(extractTitle(part, mode));
        if (mode === 'prose') onChunk?.(prior ? prior + '\n\n' + body : body);
        else if (!prior) onChunk?.(part);
      } });
      if (!String(rawPart || '').trim() || /^\s*<none>\s*$/i.test(rawPart)) throw Object.assign(new Error('API 返回空内容。'), { code: 'EMPTY_RESPONSE' });
      failures = 0;
    } catch (error) {
      signal?.throwIfAborted();
      const retryable = error?.code === 'EMPTY_RESPONSE' || /<none>|fetch|network|502|503|504|stream|terminated/i.test(String(error?.message || error));
      if (!retryable || ++failures > 2) throw error;
      // Keep a partial streamed prose response before asking for the missing tail.
      if (mode === 'prose' && streamed.trim() && !/^\s*<none>\s*$/i.test(streamed)) {
        const part = acceptTitle(extractTitle(streamed, mode)).trim();
        if (part) { content = prior ? prior + '\n\n' + part : part; onChunk?.(content); }
      }
      onPhase?.('回复中断或为空，已保留内容，正在重新请求…');
      continue;
    }
    const body = acceptTitle(extractTitle(rawPart, mode)).trim();
    if (mode === 'phone') {
      const next = parsePhone(body);
      content = JSON.stringify({ messages: [...(prior ? parsePhone(prior) : []), ...next] }, null, 2);
    } else {
      // A model repeating its last whole answer does not satisfy the missing word count.
      const part = prior && body === lastPart ? '' : prior && body.startsWith(prior) ? body.slice(prior.length).trim() : body;
      content = part ? (prior ? prior + '\n\n' + part : part) : prior;
    }
    lastPart = body;
    onChunk?.(content);
    stagnant = contentLength(content, mode) <= size ? stagnant + 1 : 0;
    if (contentLength(content, mode) >= target) return metrics();
    if (stagnant >= 2) throw Object.assign(new Error('模型连续未增加新内容，尚未达到目标。内容已保留，可点击继续补足。'), { code: 'NO_PROGRESS' });
  }
  throw Object.assign(new Error('本次多轮补写仍未达到目标，已保留全部内容，可点击继续补足。'), { code: 'TARGET_UNMET' });
}
