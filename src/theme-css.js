import { parse, walk, generate } from './reading-vendor.js';

function resourceUrl(value) {
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return;
    if (/^data:(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|font\/[a-z0-9.+-]+|application\/(?:font-woff|x-font-ttf|x-font-opentype));base64,/i.test(value)) return;
  } catch {}
  throw new Error('主题 CSS 资源请使用完整的 HTTP(S) 字体／图片直链或字体／图片 Base64；不支持本地文件和脚本地址。');
}

export function parseThemeCss(css, context = 'stylesheet') {
  if (typeof css !== 'string' || css.length > 30000 || /[<>]|expression\s*\(|javascript:/i.test(css)) throw new Error('主题 CSS 不能包含 HTML、脚本或尖括号，且最多 30,000 字符。');
  let ast;
  try { ast = parse(css, { context, parseCustomProperty: true, onParseError: error => { throw error; } }); }
  catch (error) { throw new Error(`主题 CSS 格式不正确：${error.message}`); }
  walk(ast, node => {
    if (node.type === 'Url') resourceUrl(node.value);
    if (node.type === 'Raw') throw new Error('主题 CSS 有无法解析的片段，请检查括号、属性与分号。');
    if (node.type === 'Atrule' && node.name.toLowerCase() === 'import') throw new Error('主题 CSS 请用 @font-face 的 src: url(...) 填写字体文件直链；暂不导入整份外部 CSS（@import）。');
  });
  return ast;
}

function familyName(nodes) {
  if (nodes.length === 1 && nodes[0].type === 'String') return nodes[0].value;
  return nodes.every(n => n.type === 'Identifier') ? nodes.map(n => n.name).join(' ') : '';
}
function rewriteFamilies(value, names) {
  const groups = [[]];
  value.children.forEach(node => {
    if (node.type === 'Operator' && node.value === ',') groups.push([]);
    else groups.at(-1).push(node);
  });
  const parts = groups.map(nodes => {
    const mapped = names.get(familyName(nodes).toLowerCase());
    return mapped ? JSON.stringify(mapped) : nodes.map(node => generate(node)).join(' ');
  });
  return parse(parts.join(','), { context: 'value' });
}

export function compileThemeCss(css = '', fontFamily = 'system-ui,sans-serif', chapter = 1) {
  const ast = parseThemeCss(css), names = new Map(), faces = [];
  let scopedRoot = false;
  // Within @scope, a plain class selector targets descendants, not the scope
  // root itself. These documented classes belong to the chapter root.
  walk(ast, function(node, item, list) {
    if (node.type !== 'ClassSelector' || !['prose-chapter', 'phone-chapter'].includes(node.name)) return;
    if (item?.prev?.data.type === 'PseudoClassSelector' && item.prev.data.name === 'scope') return;
    list.insertData({ type: 'PseudoClassSelector', name: 'scope', children: null }, item);
    scopedRoot = true;
  });
  ast.children.forEach((node, item, list) => {
    if (node.type !== 'Atrule' || node.name.toLowerCase() !== 'font-face') return;
    const family = node.block?.children.toArray().find(d => d.type === 'Declaration' && d.property.toLowerCase() === 'font-family');
    const name = family && familyName(family.value.children.toArray());
    if (!name) throw new Error('主题 CSS 的 @font-face 需要有效的 font-family 名称。');
    if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), `shunxi-font-${chapter}-${names.size}`);
    faces.push(node); list.remove(item);
  });
  walk(ast, node => {
    if (node.type === 'Atrule' && node.name.toLowerCase() === 'font-face') throw new Error('主题 CSS 请把 @font-face 放在最外层，不要放入 @media 或选择器内。');
  });
  for (const tree of [ast, ...faces]) walk(tree, node => {
    if (node.type !== 'Declaration') return;
    const property = node.property.toLowerCase();
    if (property === 'font-family') node.value = rewriteFamilies(node.value, names);
    else if (property === 'font') walk(node.value, part => {
      if (part.type !== 'String' && part.type !== 'Identifier') return;
      const replacement = names.get((part.value ?? part.name ?? '').toLowerCase());
      if (replacement) { part.type = 'String'; part.value = replacement; delete part.name; }
    });
  });
  return { css: names.size || scopedRoot ? generate(ast) : css, fonts: faces.map(face => generate(face)).join('\n'), fontFamily: names.size ? generate(rewriteFamilies(parse(fontFamily, { context: 'value' }), names)) : fontFamily };
}
