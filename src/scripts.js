import { clone, id, modeLabel } from './model.js';

export const scriptModeLabel = mode => mode === 'any' ? '不限' : modeLabel(mode);
export const parseTags = value => [...new Set(value.split(/[,，\n]/).map(t => t.trim().slice(0, 60)).filter(Boolean))].slice(0, 100);

export function filterScripts(state, { tag = '', query = '' } = {}) {
  const needle = query.trim().toLocaleLowerCase();
  return state.scripts.filter(s => !tag || s.tags.includes(tag))
    .filter(s => !needle || `${s.title}\n${s.content}\n${s.tags.join(' ')}`.toLocaleLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function newScriptDraft({ script = null, content = '', mode = 'any' } = {}) {
  return { id: id(), scriptId: script?.id || '', title: script?.title || '', content: script?.content ?? content,
    tagsText: script?.tags.join('，') || '', mode: script?.mode || mode };
}

// Prepare a separate collection so a failed persistence never reports a saved script.
export function saveScriptDraft(state, draftId) {
  const draft = state.scriptDrafts.find(d => d.id === draftId);
  if (!draft) throw new Error('没有找到这份剧本草稿，请重新打开。');
  if (!draft.title.trim()) throw new Error('请填写剧本名称。');
  if (!draft.content.trim()) throw new Error('请填写指令内容。');
  if (draft.content.length > 1000000) throw new Error('指令内容超过保存上限，请先拆分剧本。');
  const previous = state.scripts.find(s => s.id === draft.scriptId);
  if (!previous && state.scripts.length >= 10000) throw new Error('剧本数量已达到上限，请先整理剧本库。');
  const script = { id: previous?.id || id(), title: draft.title.trim().slice(0, 120), content: draft.content,
    tags: parseTags(draft.tagsText), mode: ['prose', 'phone', 'html'].includes(draft.mode) ? draft.mode : 'any',
    createdAt: previous?.createdAt || Date.now(), updatedAt: Date.now(), syncConflict: previous?.syncConflict === true };
  return { script, scripts: previous ? state.scripts.map(s => s.id === previous.id ? script : clone(s)) : [...clone(state.scripts), script],
    scriptDrafts: state.scriptDrafts.filter(d => d.id !== draftId).map(clone) };
}

export function scriptToPrompt(script, draft) {
  return { prompt: script.content, mode: script.mode === 'any' ? draft.mode : script.mode };
}

// Public import format deliberately has only title, tag, types and content.
// Validate the entire collection before preparing any writes.
export function parseScriptImport(raw) {
  const rows = Array.isArray(raw) ? raw : [raw];
  if (!rows.length || rows.length > 10000) throw new Error('剧本合集需包含 1～10000 条剧本。');
  return rows.map((row, index) => {
    const fail = message => { throw new Error(`第 ${index + 1} 条剧本：${message}`); };
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('需为包含 title、tag、types、content 的对象。');
    if (typeof row.title !== 'string' || !row.title.trim() || row.title.length > 120) fail('title 需为 1～120 字的名称。');
    if (typeof row.content !== 'string' || !row.content.trim() || row.content.length > 1000000) fail('content 需为非空指令文本，最多 100 万字符。');
    if (!Array.isArray(row.tag) || row.tag.length > 100 || row.tag.some(t => typeof t !== 'string' || !t.trim() || t.length > 60)) fail('tag 需为标签字符串数组，每个标签 1～60 字，最多 100 个；无标签用 []。');
    if (!['any', 'prose', 'phone', 'html'].includes(row.types)) fail('types 只能为 any、prose、phone 或 html。');
    return { title: row.title.trim(), content: row.content, tags: [...new Set(row.tag.map(t => t.trim()))], mode: row.types };
  });
}

export function prepareScriptImport(state, rows) {
  const key = s => JSON.stringify([s.title, s.content, s.mode, [...s.tags].sort()]);
  const known = new Set(state.scripts.map(key)), added = []; let skipped = 0;
  for (const row of rows) {
    const identity = key(row);
    if (known.has(identity)) { skipped++; continue; }
    known.add(identity); added.push({ ...clone(row), id: id(), createdAt: Date.now(), updatedAt: Date.now(), syncConflict: false });
  }
  if (state.scripts.length + added.length > 10000) throw new Error('导入后剧本超过 10000 条，请先整理剧本库。');
  return { scripts: [...state.scripts, ...added], added, skipped };
}
