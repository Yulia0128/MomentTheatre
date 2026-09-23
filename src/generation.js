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
export async function generateChapter({ host, settings, snapshot, story, prompt, mode, instruction = '', signal, onChunk, onPhase, onWarnings, summary }) {
  if (mode === 'html') {
    if (story?.chapters?.length) throw new Error('HTML 作品不支持续写。');
    const messages = buildMessages({ snapshot, prompt, mode, maxInputChars: 1000000 });
    onWarnings?.(messages.warnings || []);
    checkInput(messages); signal?.throwIfAborted(); onPhase?.('正在生成完整 HTML…');
    const content = cleanHtml(await host.generate({ messages, settings, snapshot, signal, onChunk }));
    signal?.throwIfAborted();
    if (!content) throw Object.assign(new Error('HTML 回复为空。'), { code: 'EMPTY_RESPONSE' });
    const issue = htmlIssue(content); onChunk?.(content);
    return { content, complete: !issue, htmlIssue: issue, actual: content.length, unit: '字符', rounds: 0, short: false };
  }
  const target = mode === 'phone' ? settings.targetMessages || 20 : settings.words;
  const unit = mode === 'phone' ? '条' : '字';
  const messages = buildMessages({ snapshot, prompt, mode, instruction, chapters: story?.chapters || [], words: settings.words, targetMessages: target, summary, maxInputChars: 1000000 });
  onWarnings?.(messages.warnings || []);
  let content = '', rawPart = '', rounds = 0;
  for (; rounds <= 3; rounds++) {
    signal?.throwIfAborted(); checkInput(messages);
    if (settings.stream === false) onPhase?.(rounds ? '正在等待补写的完整回复…' : '正在等待完整回复…');
    const prior = content;
    rawPart = await host.generate({ messages, settings, snapshot, signal, onChunk: part => {
      if (mode === 'prose') onChunk?.(prior ? `${prior}\n\n${part}` : part);
      else if (!prior) onChunk?.(part);
      else onPhase?.(`正在补充手机消息（第 ${rounds} 轮）…`);
    } });
    if (mode === 'phone') {
      const next = parsePhone(rawPart);
      content = JSON.stringify({ messages: [...(prior ? parsePhone(prior) : []), ...next] }, null, 2);
    } else content = prior ? `${prior}\n\n${rawPart.trim()}` : rawPart.trim();
    onChunk?.(content);
    const size = contentLength(content, mode);
    const metrics = mode === 'phone' ? { messageCount: size, targetMessages: target } : { wordCount: size, targetWords: target };
    if (size >= target) return { content, ...metrics, actual: size, target, unit, rounds, short: false };
    if (rounds === 3) return { content, ...metrics, actual: size, target, unit, rounds, short: true };
    onPhase?.(`已生成 ${size}/${target}${unit}，正在自动补写（${rounds + 1}/3）…`);
    // Keep the original request and current accumulated chapter only; do not duplicate previous supplements.
    const supplement = mode === 'phone' ? '仅输出新的消息，格式仍为 {"messages":[...]}，不要重复已有消息。' : '仅输出衔接在后面的正文，不重复上文，不输出标题或解释。';
    if (rounds > 0) messages.splice(-2);
    messages.push({ role: 'assistant', content }, { role: 'user', content: `本节目前 ${size}${unit}，未达到 ${target}${unit}。请自然补充至少 ${target - size + (mode === 'phone' ? 0 : 30)} ${unit}${mode === 'phone' ? '消息（每条一个 type，时间写入 time 字段，不单独输出时间记录）' : '，延展事件与细节'}。${supplement}` });
  }
}
