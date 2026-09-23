// Independent prompt-only evaluation. Never invoke host variable setters or scripts.
// Syntax reference: SillyTavern 1.18.0 macros.js / variables.js.
export function macroContext() { return { local: new Map(), global: new Map(), warnings: new Set() }; }
export function expandPrompt(value, snapshot, context = macroContext()) {
  let result = typeof value === 'string' ? value : '';
  if (/<%/.test(result)) {
    context.warnings.add('包含第三方模板脚本：已按原文提供，瞬息不执行这些脚本。');
    return result;
  }
  const c = snapshot.character || {}, u = snapshot.persona || {};
  const basic = { char: c.name || '角色', user: u.name || '我', description: c.description || '', chardescription: c.description || '', personality: c.personality || '', charpersonality: c.personality || '', scenario: c.scenario || '', persona: u.description || '', personadescription: u.description || '', mesexamples: c.mes_example || '', mesexample: c.mes_example || '', original: '', newline: '\n', noop: '' };
  result = result.replace(/\{\{\/\/[\s\S]*?\}\}/g, '').replace(/(?:\r?\n)*\{\{trim\}\}(?:\r?\n)*/gi, '');
  for (let i = 0; i < 12; i++) {
    const next = result.replace(/\{\{([^{}]+)\}\}/g, (full, body) => {
      const [rawName, key, ...tail] = body.split('::'), name = rawName.trim().toLowerCase();
      if (Object.hasOwn(basic, name)) return basic[name];
      if (/^(set|get)(global)?var$/.test(name) && key?.trim()) {
        const variables = name.includes('global') ? context.global : context.local;
        if (name.startsWith('set') && tail.length) { variables.set(key.trim(), tail.join('::')); return ''; }
        if (name.startsWith('get') && variables.has(key.trim())) return variables.get(key.trim());
      }
      return full;
    });
    if (next === result) break;
    result = next;
  }
  for (const match of result.matchAll(/\{\{([^{}]+)\}\}/g)) {
    const name = match[1].split('::')[0].trim().slice(0, 60);
    context.warnings.add(`未解析的宏 {{${name}}} 已按原文提供；不会执行或改写正文变量。`);
  }
  return result;
}
