import { clone, id } from './model.js';

export function normalizeEndpoint(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('请输入完整 API 地址，例如 https://example.com/v1。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API 地址只支持不含账号、查询参数和片段的 HTTP(S) 地址。');
  url.pathname = url.pathname.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}
function presetSnapshot(preset) {
  if (!preset) return null;
  const output = {};
  for (const key of ['prompts', 'prompt_order', 'temperature', 'top_p', 'frequency_penalty', 'presence_penalty', 'openai_max_tokens']) if (preset[key] !== undefined) output[key] = clone(preset[key]);
  return output;
}
export function presetOrder(preset, characterIndex) {
  return preset?.prompt_order?.find(o => String(o.character_id) === String(characterIndex))?.order
    || preset?.prompt_order?.find(o => Number(o.character_id) === 100001)?.order
    || preset?.prompt_order?.find(o => Number(o.character_id) === 100000)?.order
    || preset?.prompt_order?.[0]?.order
    || (preset?.prompts || []).map(p => ({ identifier: p.identifier, enabled: p.enabled !== false }));
}
export function applyPresetOverrides(preset, overrides, characterIndex) {
  const result = presetSnapshot(preset);
  if (!result) return null;
  const order = clone(presetOrder(result, characterIndex));
  for (const p of result.prompts || []) {
    const change = overrides?.[p.identifier];
    if (!change) continue;
    if (typeof change.content === 'string' && !p.marker) p.content = change.content;
    if (typeof change.enabled === 'boolean') {
      const item = order.find(o => o.identifier === p.identifier);
      if (item) item.enabled = change.enabled;
      else order.push({ identifier: p.identifier, enabled: change.enabled });
    }
  }
  result.prompt_order = [{ character_id: characterIndex, order }];
  return result;
}
export class TavernHost {
  constructor(context, extensionUrl) {
    this.getContext = context; this.extensionUrl = extensionUrl; this.preview = false; this.mainBusy = false; this.disposers = [];
    const c = context();
    if (!c?.accountStorage || !c?.eventSource) throw new Error('需要 SillyTavern 1.18.0 的扩展接口。');
    const scopeKey = 'shunxi.library.scope.v1';
    let scope = c.accountStorage.getItem(scopeKey);
    if (!scope) { scope = id(); c.accountStorage.setItem(scopeKey, scope); }
    this.scope = `tavern:${scope}`;
    this.sessionKey = `shunxi:${scope}:api-key`;
    const on = (name, callback) => { if (!name) return; c.eventSource.on(name, callback); this.disposers.push(() => c.eventSource.removeListener(name, callback)); };
    on(c.eventTypes.GENERATION_STARTED, () => { this.mainBusy = true; });
    on(c.eventTypes.GENERATION_ENDED, () => { this.mainBusy = false; });
    on(c.eventTypes.GENERATION_STOPPED, () => { this.mainBusy = false; });
  }
  getKey() { try { return sessionStorage.getItem(this.sessionKey) || ''; } catch { return ''; } }
  setKey(key) { try { if (key) sessionStorage.setItem(this.sessionKey, key); else sessionStorage.removeItem(this.sessionKey); } catch { throw new Error('无法保存本次会话的密钥，请检查浏览器存储权限。'); } }
  async catalog() {
    const c = this.getContext(), p = c.powerUserSettings;
    if (!Array.isArray(c.characters) || !p || typeof c.getWorldInfoNames !== 'function') throw new Error('酒馆资料接口尚未就绪，请稍后刷新资料。');
    const manager = c.getPresetManager?.('openai');
    return { currentCharacter: c.characters[c.characterId]?.name || '未打开角色聊天', currentPersona: c.name1 || '我',
      characters: c.characters.map((ch, i) => ({ value: ch.avatar, label: ch.name || `角色 ${i + 1}` })),
      personas: Object.entries(p.personas || {}).map(([value, label]) => ({ value, label })),
      books: c.getWorldInfoNames().map(name => ({ value: name, label: name })),
      presets: (manager?.getAllPresets() || []).map(name => ({ value: name, label: name })), mainApi: c.mainApi };
  }
  async presetDetail(name) {
    if (name === '__none__') return { name: '', prompts: [] };
    const c = this.getContext(), manager = c.getPresetManager?.('openai');
    const actual = name || manager?.getSelectedPresetName();
    const preset = actual && manager?.getCompletionPresetByName(actual);
    if (!preset) throw new Error('当前预设不存在或无法读取。');
    const order = presetOrder(preset, c.characterId);
    const prompts = (preset.prompts || []).map(p => ({ id: p.identifier, name: p.name || p.identifier, content: p.content || '', marker: Boolean(p.marker), enabled: order.some(o => o.identifier === p.identifier && o.enabled) }));
    prompts.sort((a,b) => {
      const ai = order.findIndex(o => o.identifier === a.id), bi = order.findIndex(o => o.identifier === b.id);
      return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
    });
    return { name: actual, prompts };
  }
  async personaDetail() {
    // SillyTavern 1.18.0: st-context.js name1 / powerUserSettings; personas.js setPersonaDescription.
    const c = this.getContext();
    if (!c.powerUserSettings) throw new Error('当前面具资料尚未就绪，请稍后重试。');
    return { name: c.name1 || '我', description: String(c.powerUserSettings.persona_description || '') };
  }
  async bookDetail(name) {
    const data = await this.getContext().loadWorldInfo(name);
    if (!data?.entries) throw new Error(`世界书「${name}」读取失败。`);
    return { name, entries: Object.entries(data.entries).map(([key,e]) => ({ id: key, name: e.comment || `条目 ${e.uid ?? key}`, content: e.content || '', enabled: !e.disable })) };
  }
  async snapshot(settings) {
    const c = this.getContext();
    const characterIndex = c.characterId == null ? NaN : Number(c.characterId);
    if (!Number.isInteger(characterIndex) || characterIndex < 0 || !c.characters[characterIndex]) throw new Error('酒馆当前没有打开角色聊天。');
    if (typeof c.unshallowCharacter !== 'function') throw new Error('当前酒馆不支持完整角色资料读取。');
    const avatar = c.characters[characterIndex].avatar;
    await c.unshallowCharacter(String(characterIndex));
    const latest = this.getContext();
    const selected = latest.characters.find(ch => ch.avatar === avatar);
    if (!selected) throw new Error('所选角色已变化，请刷新资料后重试。');
    const d = selected.data || selected, character = { name: selected.name };
    for (const key of ['description', 'personality', 'scenario', 'mes_example', 'system_prompt']) character[key] = String(d[key] || selected[key] || '');
    const powers = latest.powerUserSettings;
    let persona;
    if (settings.personaMode === 'custom') {
      persona = { name: settings.customPersonaName?.trim() || latest.name1 || '我', description: settings.customPersonaDescription || '' };
    } else persona = { name: latest.name1 || '我', description: powers.persona_description || '' };
    const books = [];
    for (const name of settings.books) {
      const book = await latest.loadWorldInfo(name);
      if (!book?.entries) throw new Error(`无法读取世界书「${name}」。`);
      const entries = clone(book.entries);
      for (const [key, entry] of Object.entries(entries)) {
        const change = settings.bookOverrides?.[name]?.[key];
        if (typeof change?.enabled === 'boolean') entry.disable = !change.enabled;
        if (typeof change?.content === 'string') entry.content = change.content;
      }
      books.push({ name, entries });
    }
    const manager = latest.getPresetManager?.('openai');
    const presetName = settings.preset === '__none__' ? '' : settings.preset || manager?.getSelectedPresetName();
    const preset = presetName ? manager?.getCompletionPresetByName(presetName) : null;
    if (presetName && !preset) throw new Error('无法读取所选 Chat Completion 预设。请刷新资料或选择不采用预设。');
    if (settings.readContext && this.isMainBusy()) throw new Error('正文正在生成。请关闭读取正文上下文，或等待这一条正文完成后再取材。');
    const context = settings.readContext ? (latest.chat || []).filter(m => !m.is_system && typeof m.mes === 'string').slice(-settings.contextCount)
      .map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes })) : [];
    return { character, characterIndex, persona, books, presetName: presetName || '', preset: applyPresetOverrides(preset, settings.presetOverrides?.[presetName], characterIndex), context, capturedAt: Date.now() };
  }
  isMainBusy() { const stream = this.getContext().streamingProcessor; return this.mainBusy || Boolean(stream && !stream.isFinished && !stream.isStopped); }
  async generate({ messages, settings, snapshot, signal, onChunk }) {
    const c = this.getContext(), Service = c.ChatCompletionService;
    if (!Service?.sendRequest || !Service?.presetToGeneratePayload) throw new Error('当前酒馆缺少 ChatCompletionService，请使用 1.18.0 或兼容版本。');
    let payload;
    if (settings.apiMode === 'independent') {
      if (!settings.model.trim()) throw new Error('请填写独立 API 的模型名称。');
      const key = this.getKey();
      payload = { chat_completion_source: 'custom', custom_url: normalizeEndpoint(settings.endpoint), model: settings.model.trim(),
        max_tokens: settings.maxTokens, messages, stream: settings.stream !== false, custom_prompt_post_processing: '',
        secret_id: 'shunxi-use-explicit-header', custom_include_headers: JSON.stringify({ Authorization: key ? `Bearer ${key}` : '' }) };
      for (const k of ['temperature', 'top_p', 'frequency_penalty', 'presence_penalty']) if (typeof snapshot?.preset?.[k] === 'number') payload[k] = snapshot.preset[k];
    } else {
      if (this.isMainBusy()) throw new Error('正文正在生成。跟随主 API 模式需等待正文结束，或改用独立 API。');
      if (c.mainApi !== 'openai') throw new Error('基础版跟随模式目前支持酒馆 Chat Completion 连接。其他连接类型请先使用独立 OpenAI 兼容 API。');
      payload = await Service.presetToGeneratePayload(snapshot?.preset || {}, {}, {
        messages, model: c.getChatCompletionModel(c.chatCompletionSettings), max_tokens: settings.maxTokens, stream: settings.stream !== false,
      });
    }
    const conflictController = new AbortController();
    const requestSignal = signal ? AbortSignal.any([signal, conflictController.signal]) : conflictController.signal;
    const stopIfMainStarts = () => { if (settings.apiMode === 'main') { conflictController.abort(); this.onMainConflict?.(); } };
    if (settings.apiMode === 'main') c.eventSource.on(c.eventTypes.GENERATION_STARTED, stopIfMainStarts);
    try {
      if (settings.apiMode === 'main' && this.isMainBusy()) throw new Error('正文已开始生成，请等待正文结束后重试。');
      // 1.18.0 custom-request.js: payload.stream chooses transport; the second argument extracts response data.
      const response = await Service.sendRequest(payload, true, requestSignal);
      requestSignal.throwIfAborted();
      let result = '';
      if (typeof response === 'function') {
        for await (const chunk of response()) { requestSignal.throwIfAborted(); result = chunk.text; onChunk?.(result); }
      } else {
        result = typeof response?.content === 'string' ? response.content : response?.content && typeof response.content === 'object' ? JSON.stringify(response.content) : '';
        onChunk?.(result);
      }
      if (!result.trim()) throw Object.assign(new Error('API 返回空内容。'), { code: 'EMPTY_RESPONSE' });
      return result;
    } finally { if (settings.apiMode === 'main') c.eventSource.removeListener(c.eventTypes.GENERATION_STARTED, stopIfMainStarts); }
  }
  async checkUpdate() {
    const match = new URL(this.extensionUrl).pathname.match(/\/scripts\/extensions\/third-party\/([^/]+)\//);
    if (!match) throw new Error('只有通过酒馆扩展安装的 Git 仓库才能检查更新。');
    for (const global of [false, true]) {
      const response = await fetch('/api/extensions/version', { method: 'POST', headers: this.getContext().getRequestHeaders(), body: JSON.stringify({ extensionName: decodeURIComponent(match[1]), global }) });
      if (response.status === 404) continue;
      if (!response.ok) throw new Error('检查更新失败，请到酒馆扩展管理重试。');
      const data = await response.json();
      return !data.remoteUrl ? '当前是本地安装包。发布后请通过 GitHub 仓库地址安装，才能原位更新。'
        : data.isUpToDate ? '当前仓库已是最新版本。' : '发现新版本。请在酒馆「扩展管理」中更新瞬息，然后刷新页面；不需要卸载。';
    }
    throw new Error('未找到扩展安装目录，请到酒馆扩展管理检查。');
  }
  dispose() { this.disposers.forEach(off => off()); }
}
