import {tagNames,tagField,catalogSettings} from './tag-catalog.js';
import {parseTags} from './scripts.js';

const validName = (value, max) => {
  const name = String(value || '').trim();
  if (!name || name.length > max) throw Error('名称不能为空，且不能超过 ' + max + ' 字。');
  return name;
};
export function tagPatch(state, scope, operation, values, replacement = '') {
  const catalog = tagNames(state, scope), field = tagField(scope), selected = new Set(values);
  if (operation === 'create') {
    const name = validName(values[0],60);
    if (catalog.includes(name)) throw Error('已有同名标签。');
    return {settings:catalogSettings(state,scope,[name])};
  }
  if (operation !== 'delete' && operation !== 'rename') throw Error('标签操作无效。');
  const nextName = operation === 'rename' ? validName(replacement,60) : '';
  if (operation === 'rename' && catalog.includes(nextName) && !selected.has(nextName)) throw Error('已有同名标签。');
  const replace = names => [...new Set(names.flatMap(name => selected.has(name) ? nextName ? [nextName] : [] : [name]))];
  const patch = {settings:{...state.settings,[field]:replace(catalog)},[scope]:state[scope].map(item => item.tags.some(name => selected.has(name)) ? {...item,tags:replace(item.tags),updatedAt:Date.now()} : item)};
  if (scope === 'scripts') patch.scriptDrafts = state.scriptDrafts.map(draft => parseTags(draft.tagsText).some(name => selected.has(name)) ? {...draft,tagsText:replace(parseTags(draft.tagsText)).join('，')} : draft);
  return patch;
}
export function categoryPatch(state, operation, values, name = '', newId = '') {
  const selected = new Set(values);
  if (operation === 'create' || operation === 'rename') {
    name = validName(name,120);
    if (state.categories.some(c => c.name === name && !selected.has(c.id))) throw Error('已有同名分类。');
    if (operation === 'create') {
      if (!newId || state.categories.some(c => c.id === newId) || state.categories.length >= 1000) throw Error('无法新建分类，请先整理分类列表。');
      return {categories:[...state.categories,{id:newId,name}]};
    }
    return {categories:state.categories.map(c => selected.has(c.id) ? {...c,name} : c)};
  }
  if (operation !== 'delete') throw Error('分类操作无效。');
  return {categories:state.categories.filter(c => !selected.has(c.id)),stories:state.stories.map(story => story.categoryIds.some(key => selected.has(key)) ? {...story,categoryIds:story.categoryIds.filter(key => !selected.has(key)),updatedAt:Date.now()} : story)};
}
export function deleteCollectionPatch(state, scope, ids, visibleIds) {
  tagField(scope); // Validate the scope before reading or writing collections.
  const allowed = new Set(visibleIds), selected = new Set(ids.filter(key => allowed.has(key)));
  const patch = {[scope]:state[scope].filter(item => !selected.has(item.id)),settings:catalogSettings(state,scope)};
  if (scope === 'stories' && selected.has(state.editorDraft?.storyId)) patch.editorDraft = null;
  if (scope === 'scripts') patch.scriptDrafts = state.scriptDrafts.filter(draft => !selected.has(draft.scriptId));
  return patch;
}
