import { parsePhoneReport, serializePhone, resolveMessageStickers, phoneSourceBlock, captureStickerSnapshot } from './phone-format.js';
import { extractTitle } from './story-title.js';
import { cleanHtml, htmlIssue } from './html-work.js';
import { parsePhone } from './reader.js';
import { buildMessages } from './prompt.js';
import { summaryPlan, summaryInstruction, splitSummaryReply, summarySettings, summaryStarted } from './summary-protocol.js';

export const countWords = text => Array.from(String(text).replace(/[^\p{L}\p{N}]/gu, '')).length;
export function readableText(content, mode, names) {
  if (mode !== 'phone') return content;
  return parsePhone(content, names).map(m => [m.group ? `群聊：${m.group}，${m.sender === 'user' ? '我方' : m.speaker || '系统'}` : '', m.type, m.text, m.title, m.description, m.address, m.source, m.sticker, m.amount, m.status].filter(Boolean).join(' ')).join('\n');
}
export const contentLength = (content, mode, names) => !content?.trim() ? 0 : mode === 'html' ? content.length : mode === 'phone' ? parsePhone(content, names).length : countWords(content);
const checkInput = messages => {
  const size = messages.reduce((n,m) => n + m.content.length, 0);
  if (size > 1000000) throw new Error('请求输入超过一百万字符的保护上限。');
};
export async function generateChapter({ host, settings, snapshot, story, prompt, mode, instruction = '', signal, onChunk, onPhase, onWarnings, onTitle, summary, initialContent = '', manualTopUp = false, onSource }) {
  if (mode === 'html') {
    if (story?.chapters?.length) throw new Error('HTML 作品不支持续写。');
    const messages = buildMessages({ snapshot, prompt, mode, maxInputChars: 1000000 });
    checkInput(messages); signal?.throwIfAborted(); onPhase?.('正在生成完整 HTML…');
    const sourceContent = await host.generate({ messages, settings, snapshot, signal, onChunk: raw=>{onSource?.(raw);onChunk?.(cleanHtml(raw));} });
    onSource?.(sourceContent);
    const content = cleanHtml(sourceContent);
    signal?.throwIfAborted();
    if (!sourceContent.trim()) throw Object.assign(new Error('HTML 回复为空。'), { code: 'EMPTY_RESPONSE' });
    const issue = htmlIssue(sourceContent); onChunk?.(content);
    return { content:content||sourceContent, sourceContent, title: extractTitle(content, 'html').title, complete: !issue, htmlIssue: issue, actual: content.length, unit: '字符', rounds: 0, short: false };
  }
  const target = mode === 'phone' ? settings.targetMessages || 50 : settings.words;
  const unit = mode === 'phone' ? '条' : '字';
  const configuredLimit = Number(settings.maxAutoTopUps ?? 2);
  const limit = Number.isFinite(configuredLimit) ? Math.max(1, Math.min(50, Math.floor(configuredLimit))) : 2;
  // Every call after the initial request spends an allowance, including retries.
  const requestLimit = manualTopUp ? 1 : 1 + (settings.autoTopUp !== false ? limit : 0);
  const plan = summaryPlan((story?.chapters.length || 0) + 1, mode);
  const requestSettings = summarySettings(settings, plan);
  const base = buildMessages({ snapshot, prompt, mode, instruction, chapters: story?.chapters || [], words: settings.words, targetMessages: target, stickers: settings.stickers, summary, summaries: story?.summaries || [], summaryPlan: plan, maxInputChars: 1000000 });
  onWarnings?.(base.warnings || []);
  let sourceContent = '';
  let responseSummaries = [];
  const names = { character: snapshot?.character?.name, persona: snapshot?.persona?.name };
  let content = mode === 'phone' && initialContent ? serializePhone(parsePhoneReport(initialContent, names).messages) : initialContent, title = '', rounds = 0, failures = 0, stagnant = 0, lastPart = '';
  const metrics = (complete = true) => { const size = contentLength(content, mode), body = content || splitSummaryReply(sourceContent).body; return { content: body, sourceContent, title, complete: complete && Boolean(body.trim()), summaries: responseSummaries, summaryWarnings: plan ? (plan.century ? ['segment', 'century'] : ['segment']).filter(kind => !responseSummaries.some(s => s.kind === kind)).map(kind => kind === 'segment' ? '本次十节摘要缺失或未完整返回' : '本次百节总结缺失或未完整返回') : [], ...(mode === 'phone' ? { stickerSnapshot: captureStickerSnapshot(content, settings.stickers, names) } : {}), ...(mode === 'phone' ? { messageCount: size, targetMessages: target } : { wordCount: size, targetWords: target }), actual: size, target, unit, rounds, short: size < target }; };
  for (let attempt = 0; attempt < requestLimit; attempt++) {
    signal?.throwIfAborted();
    const prior = content, size = prior ? contentLength(prior, mode) : 0;
    if (size >= target) return metrics();
    const messages = [...base];
    if (prior) {
      rounds++;
      onPhase?.('已生成 ' + size + '/' + target + unit + '，正在自动补写（' + rounds + '）…');
      messages.push({ role: 'assistant', content: prior }, { role: 'user', content: '本节目前 ' + size + unit + '，未达到 ' + target + unit + '。请自然补充至少 ' + (target - size + (mode === 'phone' ? 0 : 50)) + ' ' + unit + (mode === 'phone' ? '消息。保持本节原有会话和发言者身份，先重申 [私聊] 或 [群聊|原群名]；群成员用 成员:原姓名。我方仍用 user。仅输出新增消息及标记，放在 <小手机>...</小手机> 内，不重复已有消息。' : '，延展情节或细节。只输出接在末尾的新正文，不重复上文，不输出标题、说明或结束语。') });
    } else onPhase?.(settings.stream === false ? '正在等待完整回复…' : '正在生成…');
    if (prior) messages.at(-1).content += summaryInstruction(plan);
    checkInput(messages);
    let streamed = '', rawPart;
    const acceptTitle = (parsed, final = false) => { if (!(story?.chapters || []).some(ch => (ch.mode || story.mode) === 'prose') && (!title || final) && parsed.title) { title = parsed.title; onTitle?.(title); } return parsed.content; };
    try {
      responseSummaries = [];
      rawPart = await host.generate({ messages, settings: requestSettings, snapshot, signal, onChunk: part => {
        streamed = part;
        onSource?.(sourceContent + (sourceContent ? '\n\n' : '') + (mode === 'phone' ? phoneSourceBlock(part) : part));
        const body = acceptTitle(extractTitle(splitSummaryReply(part, null, true).body, mode));
        if (mode === 'prose') onChunk?.(prior ? prior + '\n\n' + body : body);
        else if (!prior) onChunk?.(body);
      } });
      if (!String(rawPart || '').trim() || /^\s*<none>\s*$/i.test(rawPart)) throw Object.assign(new Error('API 返回空内容。'), { code: 'EMPTY_RESPONSE' });
      failures = 0;
    } catch (error) {
      if (mode === 'prose' && streamed.trim()) { sourceContent += (sourceContent ? '\n\n' : '') + streamed; onSource?.(sourceContent); }
      // Preserve complete streamed phone rows even on abort, 429, or retry exhaustion.
      if (mode === 'phone' && streamed.trim()) {
        sourceContent += (sourceContent ? '\n\n' : '') + phoneSourceBlock(streamed); onSource?.(sourceContent);
        const old = prior ? parsePhoneReport(prior, names).messages : [];
        const next = resolveMessageStickers(parsePhoneReport(splitSummaryReply(streamed).body, { ...names, group: old.at(-1)?.group }).messages, settings.stickers, { embedLocal: false });
        content = serializePhone([...old, ...next]); onChunk?.(content || splitSummaryReply(streamed).body);
      }
      signal?.throwIfAborted();
      const retryable = error?.code === 'EMPTY_RESPONSE' || /<none>|fetch|network|502|503|504|stream|terminated/i.test(String(error?.message || error));
      if (!retryable) throw error;
      // Keep a partial streamed prose response before asking for the missing tail.
      if (mode === 'prose' && streamed.trim() && !/^\s*<none>\s*$/i.test(streamed)) {
        const part = acceptTitle(extractTitle(splitSummaryReply(streamed).body, mode)).trim();
        if (part) { content = prior ? prior + '\n\n' + part : part; onChunk?.(content); }
      }
      if (plan && summaryStarted(streamed)) { responseSummaries = splitSummaryReply(streamed, plan).summaries; return metrics(); }
      if (++failures > 2) throw error;
      if (attempt + 1 >= requestLimit) {
        if (content.trim() || sourceContent.trim()) return metrics(false);
        throw error;
      }
      onPhase?.('回复中断或为空，已保留内容，正在重新请求…');
      continue;
    }
    const reply = splitSummaryReply(rawPart, plan);
    responseSummaries = reply.summaries;
    const body = acceptTitle(extractTitle(reply.body, mode), true).trim();
    if (mode === 'phone') {
      sourceContent += (sourceContent ? '\n\n' : '') + phoneSourceBlock(rawPart); onSource?.(sourceContent);
      const parsed = parsePhoneReport(body, { ...names, group: prior ? parsePhoneReport(prior, names).messages.at(-1)?.group : '' });
      if (parsed.warnings.length) onWarnings?.(parsed.warnings);
      if (!parsed.recognized) onWarnings?.(['本次回复未识别到消息，原始回复已保留。']);
      const next = resolveMessageStickers(parsed.messages, settings.stickers, { embedLocal: false });
      const old = prior ? parsePhoneReport(prior, names).messages : [];
      let overlap = 0;
      for (let n = Math.min(old.length, next.length); n > 0; n--) {
        if (JSON.stringify(old.slice(-n)) === JSON.stringify(next.slice(0, n))) { overlap = n; break; }
      }
      content = serializePhone([...old, ...next.slice(overlap)]);
    } else {
      sourceContent += (sourceContent ? '\n\n' : '') + rawPart; onSource?.(sourceContent);
      // A model repeating its last whole answer does not satisfy the missing word count.
      const part = prior && body === lastPart ? '' : prior && body.startsWith(prior) ? body.slice(prior.length).trim() : body;
      content = part ? (prior ? prior + '\n\n' + part : part) : prior;
    }
    lastPart = body;
    onChunk?.(content);
    stagnant = contentLength(content, mode) <= size ? stagnant + 1 : 0;
    if (contentLength(content, mode) >= target) return metrics();
    if (stagnant >= 2) return metrics();
  }
  return metrics();
}
