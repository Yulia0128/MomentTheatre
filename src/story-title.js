export function extractTitle(raw, mode = 'prose') {
  const text = String(raw || '');
  if (mode === 'html') return { title: text.match(/<title\b[^>]*>([^<]+)<\/title>/i)?.[1]?.trim().slice(0, 80) || '', content: text };
  if (mode === 'phone') return { title: '', content: text };
  const match = text.match(/<shunxi-title>([^\n]*?)<\/shunxi-title>\s*/i);
  if (match) return { title: match[1].trim().slice(0, 80), content: text.slice(0, match.index) + text.slice(match.index + match[0].length) };
  // Do not display a half-received title tag during streaming.
  if (/^\s*<shunxi-title>/i.test(text) || /^\s*<shunxi(?:-title)?$/i.test(text)) return { title: '', content: '' };
  const heading = text.match(/^\s*#\s+([^\n]+)\n+/);
  return heading ? { title: heading[1].trim().slice(0, 80), content: text.slice(heading[0].length) } : { title: '', content: text };
}
export async function generateTitle({ host, settings, snapshot, prompt, content, signal }) {
  const messages = [{ role: 'system', content: '为短篇作品拟定一个贴切、独立的中文标题。按故事氛围决定标题语气：喜剧可以跳脱，酸涩、悲伤或严肃故事使用相应克制的标题。不得复制用户指令，不加标题二字、书名号、说明或 Markdown。只输出一行标题，2—30字。' },
    { role: 'user', content: `设定：${prompt.slice(0, 3000)}\n作品：${content.slice(0, 12000)}` }];
  const raw = await host.generate({ messages, settings: { ...settings, maxTokens: 256 }, snapshot, signal });
  const title = String(raw || '').trim().replace(/^(?:#+\s*|标题[：:]\s*)/, '').replace(/^[《“"]|[》”"]$/g, '').trim();
  if (!title || /[\r\n]/.test(title) || title.length > 80 || /^<none>$/i.test(title)) throw Object.assign(new Error('模型未返回有效标题，内容已保留，可在编辑中修改标题。'), { code: 'TITLE_MISSING' });
  return title;
}
