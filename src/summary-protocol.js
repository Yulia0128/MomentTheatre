// Reserved output blocks. Raw replies remain separate from the reading content.
const tags = ['shunxi-summary', 'shunxi-century'];
const visible = text => text.replace(/<(think|thinking|cot)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)|<!--[\s\S]*?(?:-->|$)/gi, value => value.replace(/[^\r\n]/g, ' '));
export const summaryStarted = raw => /<shunxi-(?:summary|century)\b/i.test(visible(String(raw || '')));
export function summaryPlan(chapterNumber, mode) {
  if (mode === 'html' || chapterNumber % 10) return null;
  return { through: chapterNumber, from: chapterNumber - 9, century: chapterNumber % 100 === 0 };
}
export function summaryInstruction(plan) {
  if (!plan) return '';
  return `\n【本次同答摘要】先输出本节正文（小手机先完整关闭 </小手机>），再在末尾输出 <shunxi-summary>第 ${plan.from}—${plan.through} 节的独立分段摘要</shunxi-summary>。只总结这十节，保留重要事件、关系变化、关键事实、未决线索及当前情境；200—300 字是目标，允许自然分段，不必为凑字数删事实。${plan.century ? `然后输出 <shunxi-century>第 ${plan.through - 99}—${plan.through} 节的大总结</shunxi-century>，目标 300—500 字，整合可用分段摘要、旧累计总结中本百节相关事实和本节剧情；缺失资料不得编造。` : ''}摘要不属于正文或手机消息。本节若分轮补足，摘要须覆盖已有本节正文和本轮新增正文；只在正常正文请求中同答，不另作摘要请求。`;
}
export function splitSummaryReply(raw, plan = null, streaming = false) {
  const source = String(raw || ''), found = new Map();
  let body = '', cursor = 0;
  for (const match of visible(source).matchAll(/<(shunxi-summary|shunxi-century)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    const value = match[2].trim();
    if (/[\p{L}\p{N}]/u.test(value) && !/^<none>$/i.test(value)) found.set(match[1].toLowerCase(), value);
    const preceding = source.slice(cursor, match.index), fence = preceding.match(/(?:^|\n)```(?:xml)?\s*$/i);
    body += fence ? preceding.slice(0, fence.index) : preceding;
    cursor = match.index + match[0].length;
    const closingFence = source.slice(cursor).match(/^\s*```[^\S\r\n]*(?:\r?\n|$)/);
    if (closingFence) cursor += closingFence[0].length;
  }
  body += source.slice(cursor);
  // An unfinished block belongs to the raw reply, never to the visible body.
  const unfinished = visible(body).search(/<\/?shunxi-(?:summary|century)\b/i);
  if (unfinished >= 0) body = body.slice(0, unfinished);
  const lower = visible(body).toLowerCase();
  for (let i = Math.max(0, body.length - 24); i < body.length; i++) {
    const tail = lower.slice(i);
    if (tags.some(tag => (`<${tag}>`).startsWith(tail)) && tail.startsWith('<') && (streaming || tail.length >= 9)) { body = body.slice(0, i); break; }
  }
  if (body !== source) body = body.replace(/\n?```(?:xml)?\s*$/i, '').trimEnd();
  const summaries = [], warnings = [];
  if (plan) {
    for (const kind of plan.century ? ['segment', 'century'] : ['segment']) {
      const content = found.get(kind === 'segment' ? tags[0] : tags[1]);
      if (content) summaries.push({ kind, from: plan.through - (kind === 'segment' ? 9 : 99), through: plan.through, content });
      else warnings.push(kind === 'segment' ? '本次十节摘要缺失或未完整返回' : '本次百节总结缺失或未完整返回');
    }
  }
  return { body, summaries, warnings };
}
export function summarySettings(settings, plan) {
  if (!plan) return settings;
  // Temporary reply allowance only; never change the user's stored setting.
  const reserve = plan.century ? 2800 : 1200;
  return { ...settings, maxTokens: Math.min(200000, Math.max(128, Number(settings.maxTokens) || 60000) + reserve) };
}
