export const tagField = scope => {
  if (!['stories','scripts'].includes(scope)) throw Error('标签范围无效。');
  return scope === 'stories' ? 'storyTagCatalog' : 'scriptTagCatalog';
};
export function tagNames(state, scope) {
  return [...new Set([...(state.settings[tagField(scope)] || []), ...state[scope].flatMap(item => item.tags)])];
}
export function catalogSettings(state, scope, extra = []) {
  const names = [...new Set([...tagNames(state, scope), ...extra])];
  if (names.length > 10000) throw Error('标签数量超过 10000 个，请先整理。');
  return {...state.settings, [tagField(scope)]:names};
}
