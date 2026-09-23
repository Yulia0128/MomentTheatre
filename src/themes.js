import { compileThemeCss, parseThemeCss } from './theme-css.js';

import { BUILTIN_THEMES, THEME_ALIASES, RETIRED_THEME_IDS } from './builtin-themes.js';
import { LEGACY_THEMES } from './legacy-themes.js';
export { BUILTIN_THEMES, THEME_ALIASES, RETIRED_THEME_IDS };
export function resolveLegacyTheme(state, mode, themeId) {
  return state.themes.find(t => t.id === themeId && t.mode === mode) || LEGACY_THEMES.find(t => t.id === themeId && t.mode === mode) || resolveTheme(state, mode, themeId);
}
const tokenKeys = new Set(['background', 'color', 'fontFamily', 'fontSize', 'lineHeight', 'bubble', 'ownBubble']);
export function validateTheme(raw, { allowBuiltInId = false } = {}) {
  if (!raw || !['prose', 'phone'].includes(raw.mode) || typeof raw.name !== 'string' || !raw.name.trim()) throw new Error('主题需要 name、mode（prose 或 phone）和 tokens。');
  if (!raw.tokens || typeof raw.tokens !== 'object' || Array.isArray(raw.tokens)) throw new Error('主题 tokens 必须是对象。');
  const tokens = {};
  for (const [key, value] of Object.entries(raw.tokens)) {
    if (!tokenKeys.has(key) || typeof value !== 'string' || value.length > 200 || /[;{}<>\\]|expression\s*\(/i.test(value)) throw new Error(`不支持的主题变量：${key}`);
    parseThemeCss(value, 'value');
    tokens[key] = value;
  }
  const css = raw.css ?? '';
  compileThemeCss(css, tokens.fontFamily);
  return { id: typeof raw.id === 'string' && (/^custom-[a-z0-9-]{1,80}$/.test(raw.id) || allowBuiltInId && [...BUILTIN_THEMES, ...LEGACY_THEMES].some(t => t.id === raw.id && t.mode === raw.mode)) ? raw.id : `custom-${crypto.randomUUID()}`,
    name: raw.name.trim().slice(0, 60), mode: raw.mode, tokens, css };
}
export function resolveTheme(state, mode, themeId) {
  return [...BUILTIN_THEMES, ...state.themes].find(t => t.id === themeId && t.mode === mode)
    || BUILTIN_THEMES.find(t => t.mode === mode);
}
export function removeImportedTheme(state, themeId) {
  const theme = state.themes.find(t => t.id === themeId);
  if (!theme) throw new Error('内置默认风格不能删除。');
  state.themes = state.themes.filter(t => t.id !== themeId);
  const key = theme.mode === 'phone' ? 'phoneTheme' : 'proseTheme';
  if (state.settings[key] === themeId) state.settings[key] = BUILTIN_THEMES.find(t => t.mode === theme.mode).id;
}
export function captureReadingTheme(theme, mode) {
  if (theme?.mode !== mode) throw new Error('章节的阅读风格与正文／小手机类型不一致。');
  return validateTheme(theme, { allowBuiltInId: true });
}
export function resolveChapterTheme(state, story, chapter) {
  const mode = chapter.mode || story.mode;
  return chapter.readingTheme || resolveTheme(state, mode, chapter.themeId || story.themeId);
}
