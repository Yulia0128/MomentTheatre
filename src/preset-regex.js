import { sanitizeHtml, parse, walk, generate } from './reading-vendor.js';
import { renderProseInline } from './prose.js';
import { extractTitle } from './story-title.js';

const str = (x, max = 100000) => typeof x === 'string' ? x.slice(0, max) : '';
export function normalizeRegexRules(rules) {
  return (Array.isArray(rules) ? rules : []).slice(0, 200).map((r, i) => ({
    id: str(r.id, 160) || `rule-${i}`, scriptName: str(r.scriptName, 120) || `正则 ${i + 1}`,
    findRegex: str(r.findRegex, 20000), replaceString: str(r.replaceString),
    trimStrings: (Array.isArray(r.trimStrings) ? r.trimStrings : []).slice(0, 100).map(x => str(x, 2000)),
    disabled: r.disabled === true, placement: (Array.isArray(r.placement) ? r.placement : [2]).map(Number).filter(Number.isFinite),
    markdownOnly: r.markdownOnly === true, promptOnly: r.promptOnly === true, runOnEdit: r.runOnEdit === true,
    substituteRegex: [1, 2].includes(Number(r.substituteRegex)) ? Number(r.substituteRegex) : 0,
    minDepth: r.minDepth == null || r.minDepth === '' ? null : Number(r.minDepth),
    maxDepth: r.maxDepth == null || r.maxDepth === '' ? null : Number(r.maxDepth),
  }));
}
export const defaultRegexSelection = rules => rules.filter(r => !r.disabled && r.placement.includes(2) && (!r.promptOnly || r.markdownOnly)).map(r => r.id);
export function selectedRegexRules(detail, settings) {
  const selection = Object.hasOwn(settings.regexPresets || {}, detail.name) ? settings.regexPresets[detail.name] : undefined;
  const selected = selection?.selected ?? defaultRegexSelection(detail.rules);
  return detail.rules.filter(r => selected.includes(r.id)).map(r => ({ ...r, ...selection?.edits?.[r.id], disabled: false }));
}
export function stripDefaultFilters(text) {
  return String(text ?? '').replace(/<(think|thinking|cot)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?:think|thinking|cot)\b[^>]*>[\s\S]*$/gi, '').replace(/<!--[\s\S]*?(?:-->|$)/gi, '');
}
export function compileRegex(expression) {
  const source = String(expression || '');
  if (!source) throw new Error('表达式为空');
  const literal = source.match(/^\/([\s\S]*)\/([a-z]*)$/i);
  return literal ? new RegExp(literal[1], literal[2]) : new RegExp(source);
}
function macros(value, snapshot, escaped = false) {
  return value.replace(/\{\{(char|user|newline|noop)\}\}/gi, (_, key) => {
    const text = ({ char: snapshot.character?.name || '角色', user: snapshot.persona?.name || '我', newline:'\n', noop:'' })[key.toLowerCase()];
    return escaped ? text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : text;
  });
}
function sliceSegments(parts, start, end) {
  let offset = 0;
  return parts.flatMap(part => {
    const left = Math.max(0, start - offset), right = Math.min(part.text.length, end - offset); offset += part.text.length;
    return right > left ? [{ text: part.text.slice(left, right), html: part.html }] : [];
  });
}
export function transformProse(raw, rules = [], snapshot = {}) {
  let parts = [{ text: extractTitle(stripDefaultFilters(raw), 'prose').content, html: false }];
  const warnings = [];
  for (const rule of normalizeRegexRules(rules)) {
    if (rule.disabled) continue;
    try {
      const expression = rule.substituteRegex ? macros(rule.findRegex, snapshot, rule.substituteRegex === 2) : rule.findRegex;
      const regex = compileRegex(expression), text = parts.map(p => p.text).join(''), next = []; let last = 0;
      text.replace(regex, (...args) => {
        const groups = typeof args.at(-1) === 'object' ? args.at(-1) : null;
        const offset = args.at(groups ? -3 : -2), captures = args.slice(0, groups ? -3 : -2);
        next.push(...sliceSegments(parts, last, offset));
        const replacement = rule.replaceString.replace(/\{\{match\}\}/gi, '$0').replace(/\$(\d+)|\$<([^>]+)>|\$&/g, (token, num, name) => {
          let capture = String(name ? groups?.[name] ?? '' : captures[token === '$&' ? 0 : Number(num)] ?? '');
          for (const trim of rule.trimStrings) capture = capture.replaceAll(macros(trim, snapshot), '');
          return capture;
        });
        const html = /<\/?[a-z][\s\S]*?>/i.test(rule.replaceString) || sliceSegments(parts, offset, offset + args[0].length).some(p => p.html);
        next.push({ text: macros(replacement, snapshot), html }); last = offset + args[0].length;
        return args[0];
      });
      next.push(...sliceSegments(parts, last, text.length));
      if (next.reduce((n,p) => n + p.text.length, 0) > 2000000) throw new Error('替换结果过长');
      parts = next.reduce((out, part) => { if (!part.text) return out; const last = out.at(-1); if (last?.html === part.html) last.text += part.text; else out.push(part); return out; }, []);
    } catch (error) { warnings.push(`正则「${rule.scriptName}」未应用：${error.message}`); }
  }
  return { parts, warnings };
}
function safeCss(css, context = 'stylesheet') {
  if (css.length > 100000 || /<\/style|expression\s*\(/i.test(css)) throw new Error('美化样式包含不支持的内容');
  const tree = parse(css, { context, parseCustomProperty: true, onParseError: e => { throw e; } });
  walk(tree, node => {
    if (node.type === 'TypeSelector' && /^(html|body)$/i.test(node.name)) { node.type = 'PseudoClassSelector'; node.name = 'scope'; node.children = null; }
    if (node.type === 'PseudoClassSelector' && node.name === 'root') node.name = 'scope';
    if (node.type === 'Raw' || node.type === 'Atrule' && node.name.toLowerCase() === 'import') throw new Error('不支持的样式语法或外部样式导入');
    if (node.type === 'Url' && !/^https?:\/\//i.test(node.value) && !/^data:(?:image|font)\/[\w.+-]+;base64,/i.test(node.value)) throw new Error('样式图片／字体需要 HTTP(S) 直链');
  });
  const result = generate(tree); if (/<\/style/i.test(result)) throw new Error('不支持的样式结束标记'); return result;
}
export function renderRegexProse(raw, rules, snapshot, chapter = 1) {
  const { parts, warnings } = transformProse(raw, rules, snapshot);
  let block = 0;
  const html = parts.map(part => {
    if (!part.html) return part.text.split(/\n\s*\n/).filter(p => p.trim()).map(p => `<p class="paragraph">${renderProseInline(p)}</p>`).join('');
    const key = `regex-${chapter}-${++block}`, styles = [];
    const input = part.text.replace(/^\s*```(?:html)?\s*\n?|\n?```\s*$/gi, '').replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_, css) => {
      try { styles.push(safeCss(css)); } catch(error) { warnings.push(error.message); } return '';
    });
    const content = sanitizeHtml(input, {
      allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'details', 'summary', 'del'],
      allowedAttributes: { '*': ['class','id','style','title','aria-*','data-*'], img: ['src','alt','width','height','loading','referrerpolicy'], details:['open'], td:['colspan','rowspan'], th:['colspan','rowspan'] },
      allowedSchemes: ['https','http'], allowProtocolRelative: false,
      parseStyleAttributes: false,
      transformTags: { '*': (tagName, attrs) => {
        if (attrs.style) { try { attrs.style = safeCss(attrs.style, 'declarationList'); } catch(error) { delete attrs.style; warnings.push(error.message); } }
        return { tagName, attribs: tagName === 'img' ? { ...attrs, loading:'lazy', referrerpolicy:'no-referrer' } : attrs };
      } },
    });
    return `<div class="preset-markup" data-regex-block="${key}">${styles.length ? `<style>@scope ([data-regex-block="${key}"]) { ${styles.join('\n')} }</style>` : ''}${content}</div>`;
  }).join('');
  return { html, warnings };
}
