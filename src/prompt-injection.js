// SillyTavern 1.18.0 PromptManager: relative=0, absolute=1; empty triggers allow all.
export function shouldTrigger(triggers, type) {
  return !Array.isArray(triggers) || !triggers.length || triggers.includes(type);
}
export function promptRole(role) { return ['system', 'user', 'assistant'].includes(role) ? role : 'system'; }
export function injectHistory(history, injections) {
  // All indices use the original history so one insertion cannot shift another's depth.
  const slots = new Map();
  for (const [index, injection] of injections.entries()) {
    if (!injection.content?.trim()) continue;
    const depth = Number.isFinite(Number(injection.depth)) ? Math.max(0, Math.floor(Number(injection.depth))) : 4;
    const boundary = Math.max(0, history.length - depth);
    if (!slots.has(boundary)) slots.set(boundary, []);
    slots.get(boundary).push({ ...injection, depth, index });
  }
  const messages = [];
  for (let i = 0; i <= history.length; i++) {
    const group = (slots.get(i) || []).sort((a, b) => b.depth - a.depth || (b.order ?? 100) - (a.order ?? 100) || a.index - b.index);
    messages.push(...group.map(p => ({ role: promptRole(p.role), content: p.content })));
    if (i < history.length) messages.push(history[i]);
  }
  return messages;
}
