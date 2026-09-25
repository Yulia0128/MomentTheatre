import { phonePrompt, parsePhoneReport, serializePhone } from './phone-format.js';
import { HTML_PROMPT } from './html-work.js';
import { expandPrompt, macroContext } from './prompt-macros.js';
import { shouldTrigger, promptRole, injectHistory } from './prompt-injection.js';

const string = value => typeof value === 'string' ? value : '';

export const expand = expandPrompt;
function matchesKey(key, corpus, sensitive = false, whole = false) {
  key = string(key);
  if (!key) return false;
  if (/^\/.+\/[a-z]*$/.test(key)) {
    const last = key.lastIndexOf('/');
    try { return new RegExp(key.slice(1, last), key.slice(last + 1).replace(/[gy]/g, '')).test(corpus); }
    catch { return false; }
  }
  const needle = sensitive ? key : key.toLocaleLowerCase();
  const haystack = sensitive ? corpus : corpus.toLocaleLowerCase();
  if (!whole) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'u').test(haystack);
}
export function selectWorldEntries(books, corpus, snapshot, macros = macroContext(), generationType = 'normal') {
  const selected = [];
  for (const book of books || []) for (const entry of Object.values(book.entries || {})) {
    if (entry.disable || !shouldTrigger(entry.triggers, generationType)) continue;
    const name = entry.comment || `条目 ${entry.uid}`;
    if (entry.sticky || entry.cooldown || entry.delay || entry.group || entry.vectorized || entry.scanDepth != null || entry.delayUntilRecursion) {
      macros.warnings.add(`世界书「${book.name} / ${name}」使用复杂触发设置；本次按独立番外的常驻／关键词匹配取材，不复用正文的计时、分组、扫描深度或向量状态。`);
    }
    if (entry.useProbability && Number(entry.probability) < 100 && Math.random() * 100 >= Math.max(0, Number(entry.probability))) continue;
    const searchCorpus = [corpus, entry.matchCharacterDescription ? snapshot.character?.description : '', entry.matchCharacterPersonality ? snapshot.character?.personality : '', entry.matchScenario ? snapshot.character?.scenario : '', entry.matchPersonaDescription ? snapshot.persona?.description : ''].filter(Boolean).join('\n');
    let active = entry.constant === true;
    if (!active) {
      const keys = Array.isArray(entry.key) ? entry.key : [];
      active = keys.some(key => matchesKey(expand(key, snapshot, macros), searchCorpus, entry.caseSensitive === true, entry.matchWholeWords === true));
      const secondary = Array.isArray(entry.keysecondary) ? entry.keysecondary : [];
      if (active && entry.selective && secondary.length) {
        const checks = secondary.map(key => matchesKey(expand(key, snapshot, macros), searchCorpus, entry.caseSensitive === true, entry.matchWholeWords === true));
        const logic = Number(entry.selectiveLogic || 0);
        active = logic === 0 ? checks.some(Boolean) : logic === 1 ? !checks.every(Boolean) : logic === 2 ? !checks.some(Boolean) : logic === 3 ? checks.every(Boolean) : false;
      }
    }
    if (active) {
      let position = Number(entry.position || 0);
      if ([2, 3].includes(position)) {
        macros.warnings.add(`世界书「${name}」位于作者注释附近；独立番外没有正文作者注释，已放入番外前文深度位置。`);
        position = 4;
      } else if (![0, 1, 4, 5, 6].includes(position)) {
        macros.warnings.add(`世界书「${name}」的扩展插入位置在番外中按角色后资料提供。`);
        position = 1;
      }
      selected.push({ content: expand(entry.content, snapshot, macros), position, order: Number(entry.order || 0), depth: Number(entry.depth ?? 4), role: ['system', 'user', 'assistant'][Number(entry.role || 0)] || 'system' });
    }
  }
  return selected.sort((a, b) => b.order - a.order);
}
export function buildMessages({ snapshot, prompt, mode, chapters = [], instruction = '', words = 5000, targetMessages = 50, summary = null, stickers = [], allowRetract = false, maxInputChars = 60000 }) {
  if (!snapshot) throw new Error('这篇番外缺少人物资料，请重新选择资料后创建。');
  const macros = macroContext();
  const c = snapshot.character || {}, u = snapshot.persona || {};
  const reference = chapters.slice(summary?.through || 0).map(chapter => chapter.mode === 'phone' ? { ...chapter, content: serializePhone(parsePhoneReport(chapter.content, { character: snapshot.character?.name, persona: snapshot.persona?.name }).messages) } : chapter);
  if (reference.length > 10) throw new Error('前文尚未完成剧情总结。');
  const initial = expand(prompt, snapshot, macros);
  const continuation = expand(instruction, snapshot, macros);
  const originalContext = Array.isArray(snapshot.context) ? snapshot.context : [];
  const corpus = [initial, summary?.content || '', ...originalContext.map(m => m.content), ...reference.map(ch => ch.content), continuation].join('\n');
  const generationType = chapters.length ? 'continue' : 'normal';
  const entries = selectWorldEntries(snapshot.books, corpus, snapshot, macros, generationType);
  const before = entries.filter(e => e.position === 0).map(e => e.content).join('\n\n');
  const after = entries.filter(e => e.position === 1).map(e => e.content).join('\n\n');
  const history = [];
  if (originalContext.length) history.push({ role: 'system', content: `以下是最初建立番外时选取的正文参考，仅供取材：\n${originalContext.map(m => `${m.role}: ${m.content}`).join('\n')}` });
  history.push({ role: 'user', content: `番外要求：\n${initial}` });
  if (summary) history.push({ role: 'system', content: `截至第 ${summary.through} 节的剧情总结：\n${summary.content}` });
  reference.forEach((chapter, i) => {
    if (chapter.instruction) history.push({ role: 'user', content: chapter.instruction });
    history.push({ role: 'assistant', content: chapter.content });
  });
  const blocks = {
    charDescription: expand(c.description, snapshot, macros), charPersonality: expand(c.personality, snapshot, macros), scenario: expand(c.scenario, snapshot, macros),
    personaDescription: expand(u.description, snapshot, macros), dialogueExamples: [entries.filter(e => e.position === 5).map(e => e.content).join('\n'), expand(c.mes_example, snapshot, macros), entries.filter(e => e.position === 6).map(e => e.content).join('\n')].filter(Boolean).join('\n\n'), worldInfoBefore: before, worldInfoAfter: after,
  };
  const messages = [{ role: 'system', content: `你正在创作独立番外。角色为 ${c.name || '角色'}，用户人物为 ${u.name || '我'}。这篇番外不改变正文。采用用户要求的平行设定，保持人物核心特征。` }];
  const preset = snapshot.preset;
  let historyAdded = false;
  const injections = entries.filter(e => e.position === 4);
  const historySlot = { history: true }; 
  if (preset?.prompts?.length) {
    const order = preset.prompt_order?.find(o => String(o.character_id) === String(snapshot.characterIndex))
      || preset.prompt_order?.find(o => Number(o.character_id) === 100001)
      || preset.prompt_order?.find(o => Number(o.character_id) === 100000)
      || preset.prompt_order?.[0];
    const sequence = order?.order || preset.prompts.map(p => ({ identifier: p.identifier, enabled: p.enabled !== false }));
    for (const item of sequence) {
      if (!item.enabled) continue;
      const p = preset.prompts.find(p => p.identifier === item.identifier);
      if (!p) continue;
      if (!shouldTrigger(p.injection_trigger, generationType)) continue;
      if (p.marker && p.identifier === 'chatHistory') {
        if (!historyAdded) { messages.push(historySlot); historyAdded = true; }
        continue;
      }
      let content;
      if (p.marker && Object.hasOwn(blocks, p.identifier)) content = blocks[p.identifier];
      else if (p.content) content = expand(p.content, snapshot, macros);
      else if (p.marker) { macros.warnings.add('预设占位项「' + (p.name || p.identifier) + '」没有可读取的内容，本次略过该空项。'); continue; }
      if (!content?.trim()) continue;
      const role = promptRole(p.role);
      if (Number(p.injection_position) === 1) {
        injections.push({ content, role, depth: p.injection_depth ?? 4, order: p.injection_order ?? 100 });
      } else messages.push({ role, content });
    }
  } else {
    for (const key of ['worldInfoBefore', 'charDescription', 'charPersonality', 'scenario', 'personaDescription', 'dialogueExamples', 'worldInfoAfter']) {
      if (blocks[key]) messages.push({ role: 'system', content: blocks[key] });
    }
    if (c.system_prompt) messages.push({ role: 'system', content: expand(c.system_prompt, snapshot, macros) });
  }
  const injectedHistory = injectHistory(history, injections);
  if (historyAdded) messages.splice(messages.indexOf(historySlot), 1, ...injectedHistory);
  else messages.push(...injectedHistory);
  if (mode === 'html' && chapters.length) throw new Error('HTML 作品不支持续写。');
  const format = mode === 'html' ? HTML_PROMPT : mode === 'phone'
    ? phonePrompt(stickers, allowRetract)
    : '输出可直接阅读的正文，用自然段落，不输出章节编号、创作说明或 HTML。发言使用成对引号；按文意可使用 **加粗**、*斜体*、~~删除线~~，无需刻意凑齐格式。';
  const target = mode === 'phone' ? `至少 ${targetMessages} 条消息（按有效消息行计数，不按字数）` : `至少 ${words} 字`;
  messages.push({ role: 'user', content: mode === 'html' ? format : chapters.length
    ? `根据以上番外续写第 ${chapters.length + 1} 节，不重复上文。本节${target}。${continuation ? `本次要求：${continuation}` : '请自然接续。'}\n${format}`
    : `现在生成第一节，${target}。\n${format}` });
  if (mode !== 'phone' && !chapters.some(ch => (ch.mode || 'prose') === 'prose')) messages.at(-1).content += '\n必须根据故事内容拟定一个独立标题，语气随番外氛围变化：喜剧可跳脱，酸涩或严肃故事用克制的标题。不得把用户指令当标题。' + (mode === 'html' ? '标题放在完整 HTML 的 <title> 中。' : '首行严格写 <shunxi-title>你的标题</shunxi-title>，换行后开始正文，正文不重复标题；标题不计入目标字数。');
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  if (chars > maxInputChars) throw new Error(`本次输入约 ${chars} 字符，超过设置的 ${maxInputChars} 字符上限。`);
  Object.defineProperty(messages, 'warnings', { value: [...macros.warnings] });
  return messages;
}
