const span = item => item.kind === 'segment' ? 10 : item.kind === 'century' ? 100 : item.through;
const start = item => item.kind ? item.from : 1;
const excerpt = (text, size) => size <= 0 ? '' : text.length <= size ? text : size < 24 ? text.slice(-size) : text.slice(0, Math.floor((size - 8) / 2)) + '\n…节选…\n' + text.slice(-Math.floor((size - 8) / 2));

// Keep every record on disk; select a bounded, chronologically covered view.
export function storyMemory({ chapters = [], summaries = [], recentCount = 2, budget = 60000 }) {
  const available = summaries.filter(s => s.content?.trim() && Number.isInteger(s.through) && s.through <= chapters.length);
  const legacyThrough = Math.max(0, ...available.filter(s => !s.kind).map(s => s.through));
  const recentFrom = Math.max(1, chapters.length - recentCount + 1, legacyThrough + 1), chunks = [];
  for (let cursor = 1; cursor <= chapters.length;) {
    const selected = cursor < recentFrom ? available.filter(s => start(s) <= cursor && s.through >= cursor && s.through < recentFrom)
      .sort((a, b) => b.through - a.through || span(b) - span(a))[0] : null;
    if (selected) {
      chunks.push({ role: 'system', prefix: selected.kind ? `第 ${start(selected)}—${selected.through} 节${selected.kind === 'century' ? '大总结' : '分段摘要'}：\n` : `截至第 ${selected.through} 节的剧情总结：\n`, text: selected.content, weight: 4 });
      cursor = selected.through + 1;
    } else {
      const chapter = chapters[cursor - 1];
      chunks.push({ role: 'assistant', prefix: '', text: String(chapter.content || ''), instruction: chapter.instruction, weight: cursor >= recentFrom ? 20 : 1 });
      cursor++;
    }
  }
  // Include instructions in the same budget; original message roles remain intact.
  const items = chunks.flatMap(c => [c.instruction ? { role: 'user', prefix: '', text: c.instruction, weight: c.weight } : null, c].filter(Boolean));
  let remaining = Math.max(0, budget - items.reduce((n, c) => n + c.prefix.length, 0));
  const sizes = items.map(() => 0);
  for (let pass = 0; pass < items.length + 1 && remaining > 0; pass++) {
    const active = items.map((c, i) => ({ c, i })).filter(({ c, i }) => sizes[i] < c.text.length);
    const total = active.reduce((n, { c }) => n + c.weight, 0);
    if (!total) break;
    const allowance = remaining;
    for (const { c, i } of active) {
      const add = Math.min(c.text.length - sizes[i], Math.max(1, Math.floor(allowance * c.weight / total)), remaining);
      sizes[i] += add; remaining -= add;
    }
  }
  return { messages: items.map((c, i) => ({ role: c.role, content: c.prefix + excerpt(c.text, sizes[i]) })), clipped: items.some((c, i) => c.text.length > sizes[i]) };
}
