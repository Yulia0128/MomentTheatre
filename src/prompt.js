import { HTML_PROMPT } from './html-work.js';

const string = value => typeof value === 'string' ? value : '';
const SUPPORTED_MARKERS = new Set(['charDescription', 'charPersonality', 'scenario', 'personaDescription', 'dialogueExamples', 'worldInfoBefore', 'worldInfoAfter', 'chatHistory']);

export function expand(text, snapshot) {
  const c = snapshot.character || {}, u = snapshot.persona || {};
  const macros = { char: c.name || '角色', user: u.name || '我', description: c.description || '', personality: c.personality || '', scenario: c.scenario || '', persona: u.description || '', mesExamples: c.mes_example || '', original: '' };
  let result = string(text);
  for (let i = 0; i < 3; i++) result = result.replace(/\{\{(char|user|description|personality|scenario|persona|mesExamples|original)\}\}/g, (_, key) => macros[key]);
  if (/<%|\{\{/.test(result)) throw new Error('所选资料包含基础版未适配的宏或脚本。请使用仅含人物基础宏的预设／世界书，避免误用正文变量。');
  return result;
}
function matchesKey(key, corpus, sensitive = false, whole = false) {
  if (!key) return false;
  if (/^\/.+\/[a-z]*$/.test(key)) {
    const last = key.lastIndexOf('/');
    try { return new RegExp(key.slice(1, last), key.slice(last + 1).replace(/[gy]/g, '')).test(corpus); }
    catch { throw new Error(`世界书关键词正则无效：${key.slice(0, 80)}`); }
  }
  const needle = sensitive ? key : key.toLocaleLowerCase();
  const haystack = sensitive ? corpus : corpus.toLocaleLowerCase();
  if (!whole) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'u').test(haystack);
}
export function selectWorldEntries(books, corpus, snapshot) {
  const selected = [];
  for (const book of books || []) for (const entry of Object.values(book.entries || {})) {
    if (entry.disable) continue;
    const name = entry.comment || `条目 ${entry.uid}`;
    if (entry.sticky || entry.cooldown || entry.delay || entry.group || entry.vectorized || entry.useProbability && Number(entry.probability) < 100 || entry.scanDepth != null || entry.matchCharacterDescription || entry.matchPersonaDescription || entry.triggers?.length) {
      throw new Error(`世界书「${book.name}」的「${name}」使用了基础版未适配的高级触发条件。请为番外选择简化世界书。`);
    }
    if (![0, 1, 4].includes(Number(entry.position ?? 0))) throw new Error(`世界书「${name}」使用了未适配的插入位置。基础版支持角色前、角色后和聊天深度。`);
    if (entry.role != null && ![0, 1, 2].includes(Number(entry.role))) throw new Error(`世界书「${name}」的角色类型不受支持。`);
    let active = entry.constant === true;
    if (!active) {
      const keys = Array.isArray(entry.key) ? entry.key : [];
      active = keys.some(key => matchesKey(expand(key, snapshot), corpus, entry.caseSensitive === true, entry.matchWholeWords === true));
      const secondary = Array.isArray(entry.keysecondary) ? entry.keysecondary : [];
      if (active && entry.selective && secondary.length) {
        const checks = secondary.map(key => matchesKey(expand(key, snapshot), corpus, entry.caseSensitive === true, entry.matchWholeWords === true));
        const logic = Number(entry.selectiveLogic || 0);
        active = logic === 0 ? checks.some(Boolean) : logic === 1 ? !checks.every(Boolean) : logic === 2 ? !checks.some(Boolean) : logic === 3 ? checks.every(Boolean) : false;
      }
    }
    if (active) selected.push({ content: expand(entry.content, snapshot), position: Number(entry.position || 0), order: Number(entry.order || 0), depth: Number(entry.depth ?? 4), role: ['system', 'user', 'assistant'][Number(entry.role || 0)] });
  }
  return selected.sort((a, b) => b.order - a.order);
}
export function buildMessages({ snapshot, prompt, mode, chapters = [], instruction = '', words = 2000, targetMessages = 20, summary = null, maxInputChars = 60000 }) {
  if (!snapshot) throw new Error('这篇番外缺少人物资料，请重新选择资料后创建。');
  const c = snapshot.character || {}, u = snapshot.persona || {};
  const reference = chapters.slice(summary?.through || 0);
  if (reference.length > 10) throw new Error('前文尚未完成剧情总结。');
  const initial = expand(prompt, snapshot);
  const continuation = expand(instruction, snapshot);
  const originalContext = Array.isArray(snapshot.context) ? snapshot.context : [];
  const corpus = [initial, summary?.content || '', ...originalContext.map(m => m.content), ...reference.map(ch => ch.content), continuation].join('\n');
  const entries = selectWorldEntries(snapshot.books, corpus, snapshot);
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
    charDescription: expand(c.description, snapshot), charPersonality: expand(c.personality, snapshot), scenario: expand(c.scenario, snapshot),
    personaDescription: expand(u.description, snapshot), dialogueExamples: expand(c.mes_example, snapshot), worldInfoBefore: before, worldInfoAfter: after,
  };
  const messages = [{ role: 'system', content: `你正在创作独立番外。角色为 ${c.name || '角色'}，用户人物为 ${u.name || '我'}。这篇番外不改变正文。采用用户要求的平行设定，保持人物核心特征。` }];
  const preset = snapshot.preset;
  let historyAdded = false;
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
      if (p.injection_position || p.injection_trigger?.length) throw new Error('所选预设包含深度或条件注入；基础版请使用按顺序排列的提示词预设。');
      if (p.marker) {
        if (!SUPPORTED_MARKERS.has(p.identifier)) throw new Error(`未适配的预设占位项：${p.identifier}`);
        if (p.identifier === 'chatHistory') { messages.push(...history); historyAdded = true; }
        else if (blocks[p.identifier]) messages.push({ role: 'system', content: blocks[p.identifier] });
      } else if (p.content) messages.push({ role: ['system', 'user', 'assistant'].includes(p.role) ? p.role : 'system', content: expand(p.content, snapshot) });
    }
  } else {
    for (const key of ['worldInfoBefore', 'charDescription', 'charPersonality', 'scenario', 'personaDescription', 'dialogueExamples', 'worldInfoAfter']) {
      if (blocks[key]) messages.push({ role: 'system', content: blocks[key] });
    }
    if (c.system_prompt) messages.push({ role: 'system', content: expand(c.system_prompt, snapshot) });
  }
  if (!historyAdded) messages.push(...history);
  for (const e of entries.filter(e => e.position === 4)) messages.splice(Math.max(1, messages.length - Math.max(0, e.depth)), 0, { role: e.role, content: e.content });
  if (mode === 'html' && chapters.length) throw new Error('HTML 作品不支持续写。');
  const format = mode === 'html' ? HTML_PROMPT : mode === 'phone'
    ? '输出纯 JSON，统一结构为 {"messages":[{"type":"text","sender":"char","time":"23:48","text":"内容"}]}。messages 每个对象是一条消息，必须有且只有一个 type；sender 为 user、char 或 system。时间写在消息的 time 字段，不单独输出 type:time，不输出 name。type 为 text（纯文字）、voice（语音，text 转写、duration 时长）、transfer（amount 金额、status 状态、text 备注）、image（url 图床地址或 text 图片描述）、sticker（url 图床或 sticker 内置标识 happy/hug/blush/goodnight）、call（发起语音通话）、video（发起视频通话）、location（title 虚拟地点、address 虚拟地址）、share（title 原帖标题、description 简介、source 来源、thumbnail 可选缩略图）。不虚构图床 URL，无素材使用描述或内置表情。不得输出代码围栏或说明。'
    : '输出可直接阅读的正文，用自然段落，不输出章节编号、创作说明或 HTML。发言使用成对引号；按文意可使用 **加粗**、*斜体*、~~删除线~~，无需刻意凑齐格式。';
  const target = mode === 'phone' ? `至少 ${targetMessages} 条消息（按 messages 中的消息对象计数，每条一个 type，不按字数）` : `至少 ${words} 字`;
  messages.push({ role: 'user', content: mode === 'html' ? format : chapters.length
    ? `根据以上番外续写第 ${chapters.length + 1} 节，不重复上文。本节${target}。${continuation ? `本次要求：${continuation}` : '请自然接续。'}\n${format}`
    : `现在生成第一节，${target}。\n${format}` });
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  if (chars > maxInputChars) throw new Error(`本次输入约 ${chars} 字符，超过设置的 ${maxInputChars} 字符上限。`);
  return messages;
}
