// Message data stays separate from HTML. No model/user input is evaluated as code.
export const PHONE_TYPES = ['text', 'voice', 'transfer', 'image', 'sticker', 'location', 'share', 'call', 'video', 'retract'];
const labels = { text: '文字', voice: '语音', transfer: '转账', image: '图片', sticker: '表情', location: '定位', share: '分享', call: '语音通话', video: '视频通话', retract: '撤回' };
const fields = { text: ['text'], voice: ['duration', 'text'], transfer: ['amount', 'status', 'text'], image: ['text', 'url'], sticker: ['sticker', 'url', 'text'], location: ['title', 'address'], share: ['title', 'description', 'source', 'thumbnail', 'url'], call: ['status', 'duration'], video: ['status', 'duration'], retract: ['text'] };
const scalar = v => typeof v === 'string' ? v.slice(0, 20000) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
const amountPattern = /^(?:[¥￥$€£]\s*)?\d[\d,]*(?:\.\d+)?(?:\s*(?:元|人民币|CNY|RMB|USD))?$/i;
const durationPattern = /^\d{1,3}:\d{2}(?::\d{2})?$|^\d+(?:[″"秒]|分钟|分)$/;
const callLabels = { 发起语音: ['call', '发起'], 接受语音: ['call', '已接受'], 拒绝语音: ['call', '已拒绝'], 结束语音: ['call', '已结束'], 发起视频: ['video', '发起'], 接受视频: ['video', '已接受'], 拒绝视频: ['video', '已拒绝'], 结束视频: ['video', '已结束'] };
const lookup = (map, key) => Object.hasOwn(map, key) ? map[key] : '';
const typeOf = v => PHONE_TYPES.includes(v) ? v : Object.keys(labels).find(k => labels[k] === v) || lookup({ 表情包: 'sticker', recall: 'retract', withdrawn: 'retract' }, v);
const senderOf = (v, names = {}) => lookup({ user: 'user', char: 'char', assistant: 'char', system: 'system', 我: 'user', 用户: 'user', 角色: 'char' }, v) || (v && v === names.persona ? 'user' : v && v === names.character ? 'char' : '');
export function safeStickerUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export function normalizeStickers(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 500).map(row => ({ name: scalar(row?.name).slice(0, 120), url: scalar(row?.url).slice(0, 4000), description: scalar(row?.description).slice(0, 1000) }));
}
export function activeStickers(rows) {
  const seen = new Set();
  return normalizeStickers(rows).filter(row => {
    const name = row.name.trim(); if (!name || !safeStickerUrl(row.url) || seen.has(name)) return false;
    row.name = name; row.url = safeStickerUrl(row.url); seen.add(name); return true;
  });
}
export function spokenText(text) {
  // Explicit stage directions only; never guess at unmarked spoken sentences.
  return scalar(text).replace(/\*[^*\n]+\*/g, '').replace(/（[^）]*）|\([^)]*\)|【[^】]*】/g, '').trim();
}
const statusMap = { pending: '待收款', accepted: '已接受', received: '已收款', rejected: '已拒绝', declined: '已拒绝', initiated: '发起', calling: '发起', ended: '已结束', missed: '未接听', cancelled: '已取消', canceled: '已取消', refunded: '已退还' };
export const phoneStatus = value => lookup(statusMap, scalar(value).trim().toLowerCase()) || scalar(value).trim();
function normalizeMessage(raw, names) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const type = typeOf(raw.type || 'text'), sender = senderOf(raw.sender, names);
  if (!type || !sender) return null;
  const item = { type, sender };
  for (const key of ['time', 'text', 'duration', 'amount', 'status', 'url', 'title', 'description', 'source', 'thumbnail', 'address', 'sticker']) {
    const value = scalar(raw[key]); if (value) item[key] = value;
  }
  if (item.status) item.status = phoneStatus(item.status);
  if (type === 'transfer') {
    // Status tokens may arrive in the amount slot. Do not invent an amount.
    const amount = scalar(raw.amount).trim();
    if (!amountPattern.test(amount)) return null;
    item.status ||= '待收款';
    if (item.status === '已接受') item.status = '已收款';
  }
  if (['call', 'video'].includes(type)) {
    if (durationPattern.test(item.status || '')) { item.duration ||= item.status; item.status = '已结束'; }
    item.status ||= item.duration ? '已结束' : '发起';
  }
  if (type === 'voice') item.text = spokenText(item.text);
  if (type === 'retract') item.text = scalar(raw.originalText || raw.text);
  if (['text', 'voice', 'retract'].includes(type) && !item.text?.trim()) return null;
  return item;
}
function splitFields(line) {
  const parts = ['']; let escaped = false;
  for (const c of line) {
    if (escaped) { parts[parts.length - 1] += c === 'n' ? '\n' : ['|', '[', ']', '\\'].includes(c) ? c : '\\' + c; escaped = false; }
    else if (c === '\\') escaped = true;
    else if (c === '|' || c === '｜') parts.push('');
    else parts[parts.length - 1] += c;
  }
  if (escaped) parts[parts.length - 1] += '\\';
  return parts;
}
function lineMessage(line, names) {
  const match = line.trim().match(/^[\[［]([\s\S]*)[\]］]$/); if (!match) return null;
  const parts = splitFields(match[1]), sender = senderOf(parts[0]?.trim(), names);
  if (!sender || parts.length < 3) return null;
  const token = parts[2]?.trim();
  // Four fields with a numeric third field are a transfer; three fields remain speech.
  if (parts.length === 4 && amountPattern.test(token)) return { sender, time: parts[1].trim(), type: 'transfer', amount: token, text: parts[3] };
  const call = lookup(callLabels, token);
  if (call) return { sender, time: parts[1].trim(), type: call[0], status: call[1], duration: parts.slice(3).filter(v => v.trim()).join('').trim() };
  const explicitType = (parts.length > 3 || ['call', 'video'].includes(typeOf(token))) && typeOf(token);
  const type = explicitType || 'text';
  const values = parts.slice(explicitType ? 3 : 2), keys = fields[type];
  const item = { sender, type, time: parts[1].trim() };
  if (['call', 'video'].includes(type)) {
    const present = values.map(v => v.trim()).filter(Boolean);
    const duration = present.find(v => durationPattern.test(v));
    const status = present.find(v => !durationPattern.test(v));
    return { ...item, status: phoneStatus(status) || (duration ? '已结束' : '发起'), ...(duration ? { duration } : {}) };
  }
  if (type === 'transfer' && values.length <= 2) return { ...item, amount: values[0], text: values[1] || '' };
  if (type === 'voice' && values.length === 1) values.unshift('');
  keys.forEach((key, i) => { if (values[i]) item[key] = values[i]; });
  // A bare | in ordinary speech is still speech.
  if (values.length > keys.length) item[keys.at(-1)] = values.slice(keys.length - 1).join('|');
  return item;
}
function looseJson(text) {
  try { return JSON.parse(text); } catch { /* Repair trailing commas outside quoted strings only. */ }
  let fixed = '', quoted = false, escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { fixed += c; if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') quoted = false; }
    else if (c === '"') { quoted = true; fixed += c; }
    else if (c !== ',' || !/^\s*[}\]]/.test(text.slice(i + 1))) fixed += c;
  }
  try { return JSON.parse(fixed); } catch { return null; }
}
function jsonMessages(text) {
  const whole = looseJson(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (Array.isArray(whole)) return { rows: whole, recovered: false };
  if (Array.isArray(whole?.messages)) return { rows: whole.messages, recovered: false };
  // A valid messages array with preset text around it is ordinary input, not an error.
  const marker = /"messages"\s*:\s*\[/.exec(text);
  const arrayStart = marker ? marker.index + marker[0].lastIndexOf('[') : text.indexOf('[');
  if (arrayStart >= 0) {
    let depth = 0, quoted = false, escaped = false;
    for (let i = arrayStart; i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
      if (c === '"') quoted = true;
      else if (c === '[') depth++;
      else if (c === ']' && --depth === 0) {
        const rows = looseJson(text.slice(arrayStart, i + 1));
        if (Array.isArray(rows)) return { rows, recovered: false };
        break;
      }
    }
  }
  // Recover complete message objects even if the envelope or one sibling is broken.
  // Reset at each line outside strings so an unfinished object doesn't swallow later rows.
  const rows = []; let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '\n') { quoted = false; start = -1; depth = 0; escaped = false; }
      else if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"' && start >= 0) quoted = true;
    if (c === '{') { if (depth === 0 || /^\{\s*"(?:type|sender)"\s*:/.test(text.slice(i))) { start = i; depth = 0; } depth++; }
    if (c === '}' && depth > 0 && --depth === 0) {
      const value = looseJson(text.slice(start, i + 1));
      if (value?.sender) rows.push(value); else if (Array.isArray(value?.messages)) rows.push(...value.messages);
      start = -1;
    }
  }
  return { rows, recovered: true };
}
function outsideXml(text) {
  let out = '', depth = 0, quote = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!depth && ch === '<') {
      const tag = text.slice(i).match(/^<([\p{L}_][\p{L}\p{N}_:-]*)(?=[\s/>])[^>]*>/u);
      if (tag) {
        const close = new RegExp(`<\\/${tag[1]}\\s*>`, 'iu').exec(text.slice(i + tag[0].length));
        if (!close) break;
        i += tag[0].length + close.index + close[0].length - 1; continue;
      }
    }
    out += ch;
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (depth && ch === '"') { quote = !quote; continue; }
    if (quote) continue;
    if (ch === '[' || ch === '{' || ch === '［') depth++;
    if (ch === ']' || ch === '}' || ch === '］') depth = Math.max(0, depth - 1);
  }
  return out;
}
function phoneBodies(content) {
  const text = String(content ?? '');
  // Extract the independent phone block before inspecting any surrounding tags.
  const openings = [...text.matchAll(/<小手机\s*>/g)];
  if (openings.length) return openings.map((m, index) => {
    const rest = text.slice(m.index + m[0].length, openings[index + 1]?.index);
    return outsideXml(rest.split(/<\/小手机\s*>/)[0].replace(/<(think|thinking|cot)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').split(/<(?:think|thinking|cot)\b[^>]*>/i)[0]);
  });
  // Legacy replies without the wrapper still work. Thought blocks aren't messages.
  const legacy = text.replace(/<(think|thinking|cot)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<(?:think|thinking|cot)\b[^>]*>[\s\S]*$/i, '').replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  return [outsideXml(legacy)];
}
export const phoneBody = content => phoneBodies(content).join('\n');
// Give legacy response chunks an explicit boundary when a later request adds
// a wrapped reply. Keep all original characters in the editable text.
export const phoneSourceBlock = content => /<小手机\s*>/.test(content) || !phoneBody(content).trim() ? content : `<小手机>\n${content}\n</小手机>`;
function messageRecords(text) {
  const records = []; let start = -1, depth = 0, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (start < 0) { if (c === '[' || c === '［') { start = i; depth = 1; } continue; }
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '\n' || c === '\r') { records.push(text.slice(start, i)); start = -1; depth = 0; continue; }
    if (c === '[' || c === '［') depth++;
    if ((c === ']' || c === '］') && --depth === 0) { records.push(text.slice(start, i + 1)); start = -1; }
  }
  if (start >= 0) records.push(text.slice(start));
  return records;
}
export function parsePhoneReport(content, names = {}) {
  const reports = phoneBodies(content).map(text => parsePhoneBody(text, names));
  const messages = reports.flatMap(report => report.messages);
  if (messages.length > 2000) throw new Error('小手机每节最多 2000 条消息。');
  return { messages, warnings: [...new Set(reports.flatMap(report => report.warnings))], recognized: reports.some(report => report.recognized) };
}
function parsePhoneBody(text, names) {
  const lines = messageRecords(text);
  const lineRows = lines.map(line => lineMessage(line, names)).filter(Boolean);
  const source = lineRows.length ? { rows: lineRows, recovered: false } : jsonMessages(text);
  if (source.rows.length > 2000) throw new Error('小手机每节最多 2000 条消息。');
  const messages = []; let time = '', rejected = 0;
  for (const raw of source.rows) {
    if (raw?.type === 'time') { time = scalar(raw.text); continue; }
    const item = normalizeMessage(raw, names);
    if (!item) { rejected++; continue; }
    if (!item.time && time) item.time = time;
    messages.push(item);
  }
  if (lineRows.length) rejected += lines.filter(line => /^\s*[\[［]/.test(line) && !lineMessage(line, names)).length;
  const warnings = source.recovered || rejected ? ['已尽量恢复可识别的小手机消息；未识别部分保留在原始回复中，可打开编辑查看。'] : [];
  return { messages, warnings, recognized: source.rows.length > 0 || !source.recovered };
}
export function parsePhone(content, names) {
  const result = parsePhoneReport(content, names);
  if (!result.recognized) throw new Error('未识别到手机消息。请使用 [char|23:48|内容]，也兼容旧 messages JSON；原文已保留。');
  return result.messages;
}
// The editor owns the complete text; parsing is a derived reading view only.
// Older generated chapters stored that text separately from their message view.
export const editablePhoneText = chapter => chapter.sourceContent || chapter.content;
export function savePhoneEdit(chapter, content, library = [], names = {}) {
  const parsed = parsePhoneReport(content, names);
  const previous = parsePhoneReport(chapter.content, names).messages;
  const embedded = previous.filter(m => m.type === 'sticker' && safeStickerUrl(m.url)).map(m => ({ name: m.sticker || m.text, url: m.url, description: m.text }));
  const catalog = new Map([...activeStickers(library), ...activeStickers(chapter.stickerSnapshot), ...embedded].map(item => [item.name, item]));
  const stickerNames = new Set(parsed.messages.filter(m => m.type === 'sticker').map(m => m.sticker || m.text));
  chapter.stickerSnapshot = [...catalog.values()].filter(item => stickerNames.has(item.name));
  chapter.content = content;
  chapter.sourceContent = '';
  return parsed;
}
const encode = value => scalar(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/\r?\n/g, '\\n');
export function serializePhone(messages) {
  return messages.map(m => {
    if (m.type === 'transfer' && (!m.status || ['pending', '待收款'].includes(m.status))) return '[' + [m.sender, m.time || '', m.amount, m.text || ''].map(encode).join('|') + ']';
    if (['call', 'video'].includes(m.type)) {
      const action = Object.keys(callLabels).find(k => callLabels[k][0] === m.type && callLabels[k][1] === (m.status || (m.duration ? '已结束' : '发起')));
      if (action) return '[' + [m.sender, m.time || '', action, ...(m.duration ? [m.duration] : [])].map(encode).join('|') + ']';
    }
    const values = fields[m.type].map(key => m[key] || ''); while (values.length > 1 && !values.at(-1)) values.pop();
    return '[' + [m.sender, m.time || '', ...(m.type === 'text' ? [] : [labels[m.type]]), ...values].map(encode).join('|') + ']';
  }).join('\n');
}
export function resolveMessageStickers(messages, library) {
  const map = new Map(activeStickers(library).map(row => [row.name, row]));
  return messages.map(m => {
    const sticker = m.type === 'sticker' && map.get(m.sticker || m.text);
    return sticker && !safeStickerUrl(m.url) ? { ...m, url: sticker.url, text: m.text || sticker.description || sticker.name } : m;
  });
}
export function phonePrompt(library = []) {
  return `【小手机消息】只在 <小手机> 和 </小手机> 之间输出消息，不写作品标题，不加代码围栏。每行一条，sender 是 char（角色）或 user（我方）；system 只用于双方通话结束等系统记录。
框架会把以下短格式自动显示成消息组件。你需要根据剧情实际输出发起、接受、拒绝、撤回等事件；这些不是用户点击按钮触发的操作。格式如下：
<小手机>
[char|23:48|普通文字]
[char|23:49|语音|12″|只写实际说出口的话，禁止动作、神态、旁白、括号或星号动作]
[char|23:49|52.00|明天的咖啡]
[user|23:50|表情|表情包名字]
[char|23:50|图片|图片描述|可选真实图片URL]
[char|23:51|定位|地点|地址]
[user|23:51|分享|标题|简介|来源|可选缩略图URL]
[char|23:52|发起语音]
[user|23:52|拒绝语音]
[char|23:53|发起视频]
[user|23:53|接受视频]
[system|23:56|结束视频|03:12]
[char|23:57|撤回|撤回前的原消息]
</小手机>
转账固定四段：发送人、时间、纯数字金额、备注；不写转账类型、￥符号或待收款，插件自动补齐。备注可以留空。
通话固定用发起语音／接受语音／拒绝语音／结束语音或对应的视频词。发起和响应分开输出，拒绝或接受由响应者发送；结束时才添加可选时长，不写空的状态字段或多余竖线。
撤回行本身就包含原文与撤回提示，不再重复输出一条原消息。撤回和通话回应适用于全部手机主题。
内容中的竖线、方括号、反斜杠分别用 \\|、\\[、\\]、\\\\，内容换行用 \\n。每条只用一种类型，时间不单独成消息。禁止虚构图床URL。
可选内置表情：happy、hug、blush、goodnight。下面是用户的表情包库，按名字与描述自行选择，仅输出名字，图片由插件匹配：
${JSON.stringify(activeStickers(library).map(({ name, description }) => ({ name, description })))}`;
}
