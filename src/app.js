import { PROSE_PREVIEW_TITLE, PROSE_PREVIEW_CONTENT } from './theme-preview.js';
import { VERSION, modeLabel, clone, id, newStory, appendChapter, invalidateSummaries, removeCategory, filterStories, backup, normalizeState } from './model.js';
import { LibraryStore } from './storage.js';
import { BUILTIN_THEMES, validateTheme, resolveTheme, captureReadingTheme, resolveChapterTheme, removeImportedTheme } from './themes.js';
import { renderReader } from './reader.js';
import { cleanHtml, htmlIssue, htmlDocument, HTML_SANDBOX } from './html-work.js';
import { PHONE_EXAMPLES } from './phone-examples.js';
import { phoneIcon } from './phone-assets.js';
import { generateChapter, ensureSummaries, contentLength } from './generation.js';
import { errorRecord } from './errors.js';
import { categoryFiles, makeZip, download } from './archive.js';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false && !key.startsWith('aria-')) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (key === 'value' || key === 'checked' || key === 'disabled') node[key] = value;
    else node.setAttribute(key, value === true && !key.startsWith('aria-') ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) if (child != null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
const button = (label, action, attrs = {}) => el('button', { type: 'button', onClick: action, ...attrs }, label);
const label = (title, control, hint) => {
  control.setAttribute('aria-label', title);
  return el('label', { class: 'field' }, el('span', { class: 'field-label' }, title), control, hint ? el('small', {}, hint) : null);
};
function chevron(kind = 'down') {
  const node = el('span', { class: 'chevron', 'aria-hidden': true });
  node.innerHTML = phoneIcon(kind); return node;
}
function sourceRow(title, control) { return el('div', { class: 'source-row' }, el('span', { class: 'source-label' }, title), control); }
function choiceRow(input, text, trailing = null) {
  const activate = () => { input.focus({ preventScroll: true }); input.click(); };
  // Explicit forwarding works throughout a shadow root, including padded label space.
  // Cancel the label's default forwarding so a checkbox only toggles once.
  const choice = el('label', { class: 'source-option-choice', onPointerdown: e => {
    if (e.target !== input) e.preventDefault();
  }, onClick: e => {
    if (e.target === input) return;
    e.preventDefault(); activate();
  } }, input, el('span', {}, text));
  const row = el('div', { class: 'source-option', onClick: e => { if (e.target === row) activate(); } }, choice, trailing);
  return row;
}
function mobius() {
  const wrapper = el('span', { class: 'mark', 'aria-hidden': 'true' });
  // Authored vector icon; a single twisted ribbon, no external font/icon dependency.
  const ribbon = 'M13 5C3 5-2 16 3 25c5 9 15 7 25-2l9-8c5-4 10-3 12 1 2 4 0 8-4 8-3 0-6-2-9-5l-6 6c6 6 12 8 18 5 9-4 10-17 3-23-8-6-17-2-26 6l-9 8c-4 4-8 4-10 0-2-4 0-8 4-8 3 0 6 2 9 5l6-6C21 7 17 5 13 5Z';
  const track = 'M28 18C20 11 17 8 12 9C1 9 1 27 12 27C19 27 24 21 28 18C34 12 39 7 45 9C55 12 52 27 44 27C38 27 32 22 28 18Z';
  const clipId = `shunxi-ring-${id()}`;
  wrapper.innerHTML = `<svg viewBox="0 0 56 36" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="${clipId}"><path d="${ribbon}"/></clipPath></defs><path fill="currentColor" d="${ribbon}"/><g clip-path="url(#${clipId})"><path class="mobius-trail" pathLength="100" d="${track}"/><path class="mobius-spark" pathLength="100" d="${track}"/></g></svg>`;
  return wrapper;
}
export async function mount(host, { preview = false, stylesheet = null } = {}) {
  const previous = document.getElementById('shunxi-extension-root');
  if (previous) return;
  const store = new LibraryStore(host.scope);
  let state = await store.open();
  state.themes = state.themes.map(validateTheme);
  let catalog = { characters: [], personas: [], books: [], presets: [] };
  let tab = 'generate', storyId = state.stories[0]?.id || null, chapterIndex = 0, continuationOpen = false;
  let category = 'all', tag = '', query = '', skinPreview = 'prose', task = null, editing = false, editText = '';
  if (state.editorDraft) {
    const saved = state.stories.find(story => story.id === state.editorDraft.storyId);
    const index = saved?.chapters.findIndex(ch => ch.id === state.editorDraft.chapterId) ?? -1;
    if (index >= 0) { storyId = saved.id; chapterIndex = index; editing = true; editText = state.editorDraft.content; }
  }
  const filterExpanded = { 分类: false, 标签: false }, filterLayouts = new Map();
  const filterObserver = new ResizeObserver(entries => {
    for (const entry of entries) filterLayouts.get(entry.target)?.(entry.contentRect.width);
  });
  let saveTimer, noticeTimer, unread = false, disposed = false, busyAction = false;
  let generationError = null, generationWarnings = [], nativePanel = null;
  const root = el('div', { id: 'shunxi-extension-root', 'data-theme': state.settings.theme });
  const shadow = root.attachShadow({ mode: 'open' });
  if (stylesheet === null) {
    const cssResponse = await fetch(new URL('../style.css', import.meta.url));
    if (!cssResponse.ok) throw new Error('瞬息样式文件加载失败，请检查扩展目录是否完整。');
    stylesheet = await cssResponse.text();
  }
  shadow.append(el('style', {}, stylesheet));
  const launcher = button('', () => open(), { class: 'launcher', 'aria-label': '打开瞬息番外小剧场', title: '瞬息 · 拖动可移动，点击打开' });
  launcher.append(mobius(), el('span', { class: 'unread', hidden: true }));
  const dialog = el('dialog', { class: 'shell', 'aria-label': '瞬息番外小剧场' });
  const content = el('div', { class: 'workspace' });
  const status = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const nav = el('nav', { class: 'tabs', 'aria-label': '页面' });
  const themeButton = button(state.settings.theme === 'night' ? '☾' : '☼', toggleTheme, { class: 'icon-button', 'aria-label': '切换日夜模式' });
  const header = el('header', { class: 'topbar' }, el('div', { class: 'brand' }, mobius(), el('span', {}, '瞬息')), nav,
    el('div', { class: 'window-actions' }, themeButton, button('−', () => dialog.close(), { class: 'icon-button', 'aria-label': '收起瞬息，生成继续' })));
  dialog.append(header);
  dialog.append(status, content);
  shadow.append(launcher, dialog); document.body.append(root);
  const openDropdowns = new Set();
  function setDropdownOpen(menu, open) {
    menu.dataset.open = String(open);
    menu.querySelector('.dropdown-trigger').setAttribute('aria-expanded', String(open));
    menu.querySelector('.dropdown-panel').hidden = !open;
    if (open) openDropdowns.add(menu); else openDropdowns.delete(menu);
  }
  // Close on an actual outside interaction, never during a label's focus transfer.
  // Hiding a native details/label while its click is being forwarded can hang Chromium.
  const closeOutsideDropdowns = e => {
    for (const menu of [...openDropdowns]) if (!e.composedPath().includes(menu)) setDropdownOpen(menu, false);
  };
  shadow.addEventListener('pointerdown', closeOutsideDropdowns);
  shadow.addEventListener('focusin', e => {
    // A real outside control can close menus; transient label/body blur cannot.
    if (e.composedPath()[0]?.matches?.('input,button,textarea,select,a[href],[tabindex]')) closeOutsideDropdowns(e);
  });
  function dropdown(title, initial, className = '') {
    const caption = el('span', { class: 'source-selection' }, initial);
    const panel = el('div', { class: 'dropdown-panel source-menu', hidden: true, role: 'group', 'aria-label': `${title}选项` });
    let menu;
    const trigger = button('', () => {
      const next = menu.dataset.open !== 'true';
      for (const other of [...openDropdowns]) if (other !== menu) setDropdownOpen(other, false);
      setDropdownOpen(menu, next);
    }, { class: 'dropdown-trigger', 'aria-label': title, 'aria-expanded': false });
    trigger.append(caption, chevron());
    menu = el('div', { class: `source-dropdown ${className}`, 'data-open': 'false', onKeydown: e => {
      if (e.key === 'Escape' && menu.dataset.open === 'true') { e.preventDefault(); e.stopPropagation(); setDropdownOpen(menu, false); trigger.focus(); }
      if (e.key === 'Tab') setTimeout(() => { if (!menu.contains(shadow.activeElement)) setDropdownOpen(menu, false); }, 0);
    } }, trigger, panel);
    return { menu, caption, panel };
  }
  function singleChoice(title, options, value, onChange) {
    const choice = dropdown(title, options.find(o => o.value === value)?.label || value);
    const groupName = id();
    choice.panel.setAttribute('role', 'radiogroup');
    choice.panel.append(...options.map(option => {
      const input = el('input', { type: 'radio', name: groupName, value: option.value, checked: option.value === value, 'aria-label': `${title}：${option.label}`, onChange: () => {
        choice.caption.textContent = option.label; choice.caption.title = option.label;
        onChange(option.value);
      } });
      return choiceRow(input, option.label);
    }));
    return choice.menu;
  }
  const dropdownField = (title, menu) => el('div', { class: 'field' }, el('span', { class: 'field-label' }, title), menu);
  dialog.addEventListener('close', () => { persist().catch(report); if (!launcher.hidden) launcher.focus(); });
  dialog.addEventListener('cancel', () => { if (task) notify('已收起，番外仍在生成。'); });
  const current = () => state.stories.find(s => s.id === storyId);
  function notify(message, error = false) {
    if (disposed) return;
    if (error) { report(new Error(message)); return; }
    clearTimeout(noticeTimer); status.textContent = message; status.dataset.error = error ? 'true' : 'false';
    if (!error) noticeTimer = setTimeout(() => { if (!task) status.textContent = ''; }, 8000);
  }
  function report(error, stage = task?.stage || '操作') {
    const entry = errorRecord(error, stage, host.getKey());
    state.errors.unshift(entry); state.errors = state.errors.slice(0, 50);
    if (task) generationError = entry;
    clearTimeout(noticeTimer); status.textContent = ''; status.dataset.error = 'false';
    store.save(state).catch(() => {});
    const list = shadow.querySelector('.error-list'); if (list) list.replaceChildren(...errorRows());
  }
  async function persist() { clearTimeout(saveTimer); store.checkpoint(state); await store.save(state); }
  function scheduleSave() {
    try { store.checkpoint(state); } catch (error) { report(error, '保存'); }
    clearTimeout(saveTimer); saveTimer = setTimeout(() => persist().catch(report), 250);
  }
  function setLauncherEnabled(value) { state.settings.launcherEnabled = value; launcher.hidden = !value; nativePanel?.sync(value); scheduleSave(); }
  async function action(fn) { if (busyAction) return; busyAction = true; try { await fn(); } catch (e) { report(e); } finally { busyAction = false; } }
  function open() { unread = false; launcher.querySelector('.unread').hidden = true; launcher.classList.remove('complete'); if (!dialog.open) dialog.showModal(); refreshCatalog(false); }
  function toggleTheme() { state.settings.theme = state.settings.theme === 'night' ? 'day' : 'night'; root.dataset.theme = state.settings.theme; themeButton.textContent = state.settings.theme === 'night' ? '☾' : '☼'; scheduleSave(); }
  function changeTab(value) { if (editing) { notify('请先保存或取消章节编辑。'); return; } tab = value; render(); content.scrollTop = 0; }
  function renderNav() { nav.replaceChildren(...[['generate', '番外'], ['library', '分类'], ['themes', '美化'], ['settings', '设置']].map(([value, title]) => button(title, () => changeTab(value), { 'aria-current': value === tab ? 'page' : null, class: value === tab ? 'active' : '' }))); }
  function render() {
    filterObserver.disconnect(); filterLayouts.clear();
    for (const menu of [...openDropdowns]) setDropdownOpen(menu, false);
    renderNav(); content.replaceChildren(tab === 'generate' ? generationPage() : tab === 'library' ? libraryPage() : tab === 'themes' ? themesPage() : settingsPage());
  }
  function makeReader(story, index = null, previewThemeId = null) {
    const mode = story.chapters[index]?.mode || story.mode;
    if (mode === 'html') {
      const chapter = story.chapters[index ?? 0], issue = htmlIssue(chapter?.content);
      if (!chapter?.complete || issue) return el('div', { class: 'html-diagnostic' }, el('p', {}, issue || 'HTML 代码尚未标记完成，请编辑后保存。'), el('pre', { class: 'stream-output' }, chapter?.content || ''));
      return el('iframe', { class: 'reader-frame html-frame', title: `${story.title} HTML 作品`, sandbox: HTML_SANDBOX, referrerpolicy: 'no-referrer', allow: 'fullscreen', srcdoc: htmlDocument(chapter.content) });
    }
    const themeForChapter = ch => previewThemeId ? resolveTheme(state, ch.mode || story.mode, previewThemeId) : resolveChapterTheme(state, story, ch);
    return el('iframe', { class: mode === 'phone' ? 'reader-frame phone-frame' : 'reader-frame prose-frame', title: `${story.title}阅读区`, sandbox: '', referrerpolicy: 'no-referrer', srcdoc: host.prepareReaderHtml?.(renderReader(story, themeForChapter(story.chapters[index ?? 0] || {}), index, themeForChapter)) ?? renderReader(story, themeForChapter(story.chapters[index ?? 0] || {}), index, themeForChapter) });
  }
  function summary(mode, words, themeId) {
    const s = state.settings;
    if (mode === 'html') return el('div', { class: 'properties html-properties' }, `最大回复 ${s.maxTokens} token`, el('span', {}, s.apiMode === 'main' ? '跟随主 API' : `独立 API${s.model ? ` · ${s.model}` : ''}`), el('span', {}, '作品自带样式'));
    return el('div', { class: 'properties' }, mode === 'phone' ? `目标 ${s.targetMessages} 条消息` : `目标 ${words} 字`, el('span', {}, s.apiMode === 'main' ? '跟随主 API' : `独立 API${s.model ? ` · ${s.model}` : ''}`), el('span', {}, `${mode === 'phone' ? '小手机' : '正文'} · ${resolveTheme(state, mode, themeId).name}`));
  }
  function chapterCount(story, chapter) {
    const mode = chapter.mode || story.mode;
    if (mode === 'html') return chapter.complete && !htmlIssue(chapter.content) ? 'HTML · 代码已保存' : 'HTML · 代码未完整';
    let actual = '—'; try { actual = contentLength(chapter.content, mode); } catch { /* Keep malformed partial JSON editable. */ }
    const target = mode === 'phone' ? chapter.targetMessages : chapter.targetWords;
    const unit = mode === 'phone' ? '条' : '字';
    return Number.isFinite(Number(target)) && Number(target) > 0 ? `${actual}/${target}${unit}` : `${actual}${unit}`;
  }
  function generationPage() {
    const story = current(), page = el('section', { class: 'page generation-page' });
    const hasChapters = Boolean(story?.chapters.length), mode = state.draft.mode;
    page.append(el('div', { class: 'page-heading' }, el('h1', {}, '番外')));
    const promptInput = el('textarea', { rows: 3, value: state.draft.prompt, 'aria-label': '番外设定', placeholder: '想看看另一个世界的你们？写下这篇番外的设定与要求。', disabled: Boolean(task) || editing, onInput: e => { state.draft.prompt = e.target.value; scheduleSave(); } });
    const modes = el('fieldset', { class: 'mode-choice', disabled: Boolean(task) || editing }, el('legend', {}, '生成模式'), ['prose', 'phone', 'html'].map(value => el('label', {}, el('input', { type: 'radio', name: 'story-mode', value, checked: mode === value, onChange: () => { state.draft.mode = value; scheduleSave(); render(); } }), modeLabel(value))));
    const themeId = state.settings[mode === 'phone' ? 'phoneTheme' : 'proseTheme'];
    page.append(el('div', { class: 'composer' }, promptInput, el('div', { class: 'composer-options' }, modes, summary(mode, state.settings.words, themeId), button(task ? '生成中…' : '生成番外', () => run(false), { class: 'primary', disabled: Boolean(task) || editing }))));
    page.append(el('div', { class: 'generation-feedback', 'aria-live': 'polite' }, generationError ? el('div', { class: 'generation-error', role: 'alert' }, el('strong', {}, `${generationError.stage} · ${generationError.code}`), el('p', {}, generationError.message), button('查看报错记录', () => changeTab('settings'), { class: 'text-button' })) : null, generationWarnings.length ? el('details', { class: 'generation-notes' }, el('summary', {}, '资料兼容说明'), ...generationWarnings.map(message => el('p', {}, message))) : null));
    if (task) {
      page.append(el('div', { class: 'task-bar', role: 'status' }, '生成中 · 收起后继续', button('停止', stop, { class: 'outline' })), el('pre', { class: 'stream-output', 'data-stream': true }, task.partial || (task.stream ? '正在准备资料…' : '正在等待完整回复…')));
    }
    if (hasChapters) {
      chapterIndex = Math.min(chapterIndex, story.chapters.length - 1);
      page.append(el('div', { class: 'chapter-bar' }, el('span', { class: 'chapter-count muted', 'aria-live': 'polite' }, chapterCount(story, story.chapters[chapterIndex])), story.mode === 'html' ? null : el('div', { class: 'chapter-buttons', 'aria-label': '章节' }, story.chapters.map((ch, i) => button(String(i + 1), () => { if (editing) return notify('请先保存编辑。'); chapterIndex = i; render(); }, { 'aria-pressed': chapterIndex === i, class: chapterIndex === i ? 'selected' : '' })))));
      if (editing) {
        const titleInput = el('input', { value: state.editorDraft?.title ?? story.title, maxlength: 120, onInput: e => { state.editorDraft.title = e.target.value; scheduleSave(); } });
        const editor = el('textarea', { rows: 14, value: editText, onInput: e => { editText = e.target.value; state.editorDraft.content = editText; scheduleSave(); } });
        const complete = el('input', { type: 'checkbox', checked: state.editorDraft?.complete ?? story.chapters[chapterIndex].complete, onChange: e => { state.editorDraft.complete = e.target.checked; scheduleSave(); } });
        page.append(label('标题', titleInput), label(story.mode === 'html' ? 'HTML 源代码' : (story.chapters[chapterIndex].mode || story.mode) === 'phone' ? '小手机消息 JSON' : '章节内容', editor), el('label', { class: 'check-row' }, complete, story.mode === 'html' ? '页面代码完整' : '这一节已完成'), el('div', { class: 'actions' }, button('保存编辑', () => action(async () => {
          if (!editText.trim()) throw new Error('章节内容不能为空。');
          if (story.mode === 'html') { editText = cleanHtml(editText); if (complete.checked && htmlIssue(editText)) throw new Error(htmlIssue(editText)); }
          const size = complete.checked ? contentLength(editText, story.chapters[chapterIndex].mode || story.mode) : 0;
          story.title = titleInput.value.trim() || story.title; story.chapters[chapterIndex].content = editText; story.chapters[chapterIndex].complete = complete.checked;
          story.chapters[chapterIndex][(story.chapters[chapterIndex].mode || story.mode) === 'phone' ? 'messageCount' : 'wordCount'] = size;
          invalidateSummaries(story, chapterIndex);
          story.updatedAt = Date.now(); state.editorDraft = null; await persist(); editing = false; render(); notify(story.mode === 'html' ? 'HTML 编辑已保存。' : '编辑已保存，后续续写会使用修改后的内容。');
        }), { class: 'primary' }), button('取消', () => { editing = false; state.editorDraft = null; scheduleSave(); render(); })));
      } else {
        page.append(makeReader(story, chapterIndex), el('div', { class: 'actions reader-actions' },
          button('编辑', () => { editing = true; editText = story.chapters[chapterIndex].content; state.editorDraft = { storyId: story.id, chapterId: story.chapters[chapterIndex].id, content: editText, title: story.title, complete: story.chapters[chapterIndex].complete }; scheduleSave(); render(); }, { disabled: Boolean(task) }),
          button('复制', () => copyStory(story)), button('保存', () => organize(story), { disabled: Boolean(task) }),
          button('删除', () => deleteStory(story), { disabled: Boolean(task) })));
      }
      if (!editing && story.mode !== 'html') {
        let continuation;
        const toggle = button('续写本篇', () => {
          continuationOpen = !continuationOpen;
          toggle.setAttribute('aria-expanded', String(continuationOpen)); continuation.hidden = !continuationOpen;
        }, { class: 'section-toggle', 'aria-expanded': continuationOpen });
        toggle.append(chevron()); page.append(toggle);
        {
          const input = el('textarea', { rows: 3, value: story.continuationDraft || '', placeholder: '想让接下来发生什么？也可以填写台词、动作或文风要求。', disabled: Boolean(task), onInput: e => { story.continuationDraft = e.target.value; scheduleSave(); } });
          continuation = el('div', { class: 'continuation', hidden: !continuationOpen }, el('p', { class: 'muted' }, `接续第 ${story.chapters.length} 节，生成第 ${story.chapters.length + 1} 节`),
            label('续写要求（选填）', input, '留空则根据上文自然续写'),
            el('div', { class: 'submit-row' }, el('fieldset', { class: 'mode-choice', disabled: Boolean(task) }, el('legend', {}, '续写模式'), ['prose','phone'].map(value => el('label', {}, el('input', { type: 'radio', name: 'continuation-mode', value, checked: (story.continuationMode || story.mode) === value, onChange: () => { story.continuationMode = value; scheduleSave(); } }), value === 'prose' ? '正文' : '小手机'))), button(task ? '生成中…' : '开始续写', () => run(true), { class: 'primary', disabled: Boolean(task) })));
          page.append(continuation);
        }
      }
    } else if (!task) page.append(el('div', { class: 'empty-state' }, el('h2', {}, '故事从这里开始'), el('p', {}, '写下另一种相遇。正文、小手机与 HTML，由你选择。')));
    return page;
  }
  async function run(continuing) {
    if (task || editing) return;
    const settings = clone(state.settings), previousStory = continuing ? current() : null;
    const mode = continuing ? previousStory?.continuationMode || previousStory?.mode : state.draft.mode;
    const prompt = continuing ? previousStory?.prompt || '' : state.draft.prompt;
    if (!prompt.trim()) return notify('请先填写番外内容。', true);
    if (continuing && (!previousStory?.chapters.length || previousStory.mode === 'html' || mode === 'html')) return;
    if (continuing && previousStory.chapters.at(-1).complete === false) return notify('请先编辑并标记最后一节完成，或删除未完成章节，再继续续写。', true);
    const controller = new AbortController();
    let readingTheme = null;
    generationError = null; generationWarnings = [];
    const generation = { controller, partial: '', stream: settings.stream !== false, story: previousStory, instruction: continuing ? previousStory.continuationDraft || '' : '', conflict: false, appended: false, stage: '读取资料' };
    task = generation; launcher.classList.remove('complete'); launcher.classList.add('busy'); render();
    host.onMainConflict = () => { generation.conflict = true; controller.abort(); };
    try {
      await persist();
      readingTheme = mode === 'html' ? null : captureReadingTheme(resolveTheme(state, mode, settings[mode === 'phone' ? 'phoneTheme' : 'proseTheme']), mode);
      const snapshot = previousStory?.snapshot || await host.snapshot(settings);
      if (controller.signal.aborted) throw new DOMException('已停止', 'AbortError');
      const onPhase = message => { generation.stage = message.includes('总结') ? '剧情总结' : message.includes('补') ? '自动补写' : '生成'; status.textContent = message; };
      const summary = previousStory ? await ensureSummaries({ story: previousStory, host, settings, signal: controller.signal, onPhase, onSave: persist }) : null;
      if (!generation.story) {
        generation.story = newStory({ title: prompt.split('\n')[0].slice(0, 28), prompt, mode, themeId: mode === 'html' ? '' : settings[mode === 'phone' ? 'phoneTheme' : 'proseTheme'], snapshot });
        state.stories.unshift(generation.story); storyId = generation.story.id;
      }
      await persist();
      render();
      generation.stage = '生成';
      const result = await generateChapter({ host, settings, snapshot, story: continuing ? previousStory : null, prompt, mode, instruction: generation.instruction, summary, signal: controller.signal, onPhase, onWarnings: warnings => { generationWarnings = warnings; render(); }, onChunk: content => {
        generation.partial = content; const output = shadow.querySelector('[data-stream]'); if (output) output.textContent = content;
        status.textContent = mode === 'phone' ? `${generation.stage}中 · 正在接收手机消息 · 可以收起窗口` : `${generation.stage}中 · 已收到 ${content.length} 字符 · 可以收起窗口`;
      } });
      if (controller.signal.aborted) throw new DOMException('已停止', 'AbortError');
      appendChapter(generation.story, { ...result, instruction: generation.instruction, mode, themeId: readingTheme?.id || '', readingTheme });
      generation.appended = true;
      if (!continuing) state.draft.prompt = '';
      chapterIndex = generation.story.chapters.length - 1; await persist();
      await ensureSummaries({ story: generation.story, host, settings, signal: controller.signal, onPhase, onSave: persist });
      unread = !dialog.open; launcher.querySelector('.unread').hidden = !unread;
      launcher.classList.add('complete'); setTimeout(() => launcher.classList.remove('complete'), 3000);
      if (result.short) report(Object.assign(new Error(`补写 3 轮后为 ${result.actual}/${result.target}${result.unit}，内容已保留。`), { code: mode === 'phone' ? 'MESSAGE_TARGET_UNMET' : 'WORD_TARGET_UNMET' }), '自动补写');
      else if (mode === 'html') { clearTimeout(noticeTimer); status.textContent = ''; }
      else notify(`本节已保存 · ${result.actual}${result.unit}${result.rounds ? ` · 自动补写 ${result.rounds} 轮` : ''}`);
    } catch (error) {
      if (!generation.appended && generation.story && generation.partial.trim()) {
        try { appendChapter(generation.story, { content: generation.partial, instruction: generation.instruction, complete: false, mode, targetWords: mode === 'prose' ? settings.words : 0, targetMessages: mode === 'phone' ? settings.targetMessages : 0, themeId: readingTheme?.id || '', readingTheme }); chapterIndex = generation.story.chapters.length - 1; await persist(); }
        catch (saveError) { report(saveError); }
      }
      if (!continuing && generation.story && generation.story.chapters.length === 0) {
        state.stories = state.stories.filter(s => s.id !== generation.story.id);
        storyId = null;
        await persist().catch(error => report(error, '保存'));
      }
      if (controller.signal.aborted) notify(mode === 'html' ? 'HTML 生成已停止。已收到的代码已保留，可编辑补全或重新生成。' : generation.appended ? '已停止总结，本节已保存；下次续写会重新总结。' : generation.conflict ? '正文开始生成，已停止跟随模式的番外；已收到的内容保留为草稿。' : '已停止。收到的内容已保留；请编辑并标记本节完成后再续写。');
      else report(error);
    } finally { task = null; host.onMainConflict = null; launcher.classList.remove('busy'); render(); }
  }
  function stop() { task?.controller.abort(); }
  function popup(title, body, footer = [], className = '') {
    const pop = el('dialog', { class: `popup ${className}`, 'aria-label': title });
    pop.append(el('div', { class: 'popup-heading' }, el('h2', {}, title), button('×', () => pop.close(), { class: 'icon-button', 'aria-label': '关闭' })), body, el('div', { class: 'actions' }, footer));
    shadow.append(pop); pop.addEventListener('close', () => { for (const menu of [...openDropdowns]) if (pop.contains(menu)) setDropdownOpen(menu, false); pop.remove(); }, { once: true }); pop.showModal(); return pop;
  }
  function ask(title, initial, submit) {
    const input = el('input', { value: initial, maxlength: 120 });
    let pop; pop = popup(title, label(title, input), [button('取消', () => pop.close()), button('保存', () => action(async () => { await submit(input.value.trim()); pop.close(); render(); }), { class: 'primary' })]);
    input.focus();
  }
  function confirm(title, message, submit) {
    let pop; pop = popup(title, el('p', {}, message), [button('取消', () => pop.close()), button('确认', () => action(async () => { await submit(); pop.close(); render(); }), { class: 'primary' })]);
  }
  function organize(story) {
    const title = el('input', { value: story.title, maxlength: 120 });
    const tags = el('input', { value: story.tags.join('，'), placeholder: '用逗号分隔，如：现代，甜，已完结' });
    const categorySet = new Set(story.categoryIds);
    const names = () => state.categories.filter(c => categorySet.has(c.id)).map(c => c.name).join('、') || '未分类';
    const choices = dropdown('分类（多选）', names(), 'category-dropdown');
    const optionList = el('div', { class: 'category-options' });
    const rows = state.categories.map(c => {
      const row = choiceRow(el('input', { type: 'checkbox', checked: categorySet.has(c.id), 'aria-label': `归入${c.name}`, onChange: e => {
        if (e.target.checked) categorySet.add(c.id); else categorySet.delete(c.id);
        choices.caption.textContent = names(); choices.caption.title = names();
      } }), c.name);
      return { row, name: c.name.toLocaleLowerCase() };
    });
    optionList.append(...rows.map(x => x.row));
    const empty = el('small', { hidden: rows.length > 0 }, '未选择分类时保存到未分类。');
    choices.panel.append(el('input', { type: 'search', placeholder: '搜索分类', 'aria-label': '搜索保存分类', onInput: e => {
      const query = e.target.value.trim().toLocaleLowerCase(); let visible = 0;
      for (const entry of rows) { entry.row.hidden = !entry.name.includes(query); if (!entry.row.hidden) visible++; }
      empty.hidden = visible > 0; empty.textContent = rows.length ? '没有匹配的分类。' : '未选择分类时保存到未分类。';
    } }), optionList, empty);
    let pop; pop = popup('保存番外', el('div', {}, label('标题', title), el('div', { class: 'field' }, el('span', { class: 'field-label' }, '分类'), choices.menu), label('标签', tags)), [button('取消', () => pop.close()), button('保存', () => action(async () => {
      story.title = title.value.trim() || story.title; story.tags = [...new Set(tags.value.split(/[,，\n]/).map(t => t.trim().slice(0, 60)).filter(Boolean))].slice(0, 100);
      story.categoryIds = [...categorySet]; story.saved = true; story.updatedAt = Date.now(); await persist(); pop.close(); render(); notify('已保存到收藏。');
    }), { class: 'primary' })]);
  }
  function copyStory(story) {
    if (story.mode === 'html') {
      const value = story.chapters[0]?.content || '';
      Promise.resolve().then(() => navigator.clipboard.writeText(value)).then(() => notify('HTML 源代码已复制。'), () => popup('手动复制 HTML', el('textarea', { rows: 12, value, readonly: true })));
      return;
    }
    let pop; const copy = async all => { const value = all ? story.chapters.map((c, i) => `第 ${i + 1} 节\n\n${c.content}`).join('\n\n') : story.chapters[chapterIndex].content;
      try { await navigator.clipboard.writeText(value); notify('已复制。'); pop.close(); } catch { popup('手动复制', el('textarea', { rows: 12, value, readonly: true })); } };
    pop = popup('复制番外', el('p', {}, '选择复制当前章节或整篇番外。'), [button('当前章节', () => copy(false)), button('整篇番外', () => copy(true), { class: 'primary' })]);
  }
  function deleteStory(story) {
    if (story.mode === 'html') return confirm('删除 HTML 作品', `删除「${story.title}」？`, async () => { state.stories = state.stories.filter(s => s.id !== story.id); storyId = null; await persist(); });
    let pop; pop = popup('删除内容', el('p', {}, '删除后无法在插件内撤销。可以先到设置导出备份。'), [button('删除本节', () => { pop.close(); confirm('删除本节', `删除第 ${chapterIndex + 1} 节？后续章节不会自动重写。`, async () => { invalidateSummaries(story, chapterIndex); story.chapters.splice(chapterIndex, 1); chapterIndex = Math.max(0, chapterIndex - 1); await persist(); }); }), button('删除整篇', () => { pop.close(); confirm('删除整篇番外', `删除「${story.title}」及全部章节？`, async () => { state.stories = state.stories.filter(s => s.id !== story.id); storyId = null; await persist(); }); })]);
  }
  function categoryItems() { return [...(state.categories.length ? [{ id: 'all', name: '全部' }, ...state.categories] : []), { id: 'uncategorized', name: '未分类' }]; }
  function chooseCategory(value) { category = value; render(); }
  function addCategory() { ask('新建分类', '', async name => { if (!name) throw new Error('分类名称不能为空。'); if (state.categories.some(c => c.name === name)) throw new Error('已有同名分类。'); state.categories.push({ id: id(), name }); await persist(); }); }
  function manageCategories() {
    let pop; pop = popup('管理分类', el('div', { class: 'choice-list' }, state.categories.map(c => el('div', { class: 'manage-row' }, el('span', {}, c.name), button('改名', () => { pop.close(); ask('重命名分类', c.name, async name => { if (!name || state.categories.some(other => other.id !== c.id && other.name === name)) throw new Error('名称不能为空或重复。'); c.name = name; await persist(); }); }), button('删除', () => { pop.close(); confirm('删除分类', '只解除归类，保留分类中的番外。', async () => { removeCategory(state, c.id); if (category === c.id) category = 'all'; await persist(); }); })))));
  }
  function storyRows() {
    const stories = filterStories(state, { category, tag, query });
    if (!stories.length) return [el('div', { class: 'empty-state' }, el('h2', {}, '这里还没有故事'), el('p', {}, '换个分类或标签看看，或生成新的番外。'))];
    return stories.map(story => el('article', { class: 'story-row' }, button(story.title, () => { if (task) return notify('请先完成当前生成。'); storyId = story.id; chapterIndex = Math.max(0, story.chapters.length - 1); tab = 'generate'; continuationOpen = false; render(); }, { class: 'story-title' }),
      el('span', { class: 'story-meta' }, `${story.mode === 'html' ? '独立作品' : `${story.chapters.length} 节`} · ${new Set(story.chapters.map(ch => ch.mode || story.mode)).size > 1 ? '混合' : modeLabel(story.chapters[0]?.mode || story.mode)}`),
      el('span', { class: 'story-categories' }, story.categoryIds.map(key => state.categories.find(c => c.id === key)?.name).filter(Boolean).join(' / ') || '未分类'),
      el('span', { class: 'story-tags' }, story.tags.slice(0, 3).join(' · ')), button('⋯', () => organize(story), { 'aria-label': `整理${story.title}`, class: 'icon-button' })));
  }
  function libraryPage() {
    const categories = categoryItems(); if (!categories.some(c => c.id === category)) category = state.categories.length ? 'all' : 'uncategorized';
    const tags = [...new Set(state.stories.flatMap(s => s.tags))];
    const list = el('div', { class: 'story-list' }, storyRows());
    const search = el('input', { type: 'search', placeholder: '搜索番外', value: query, 'aria-label': '搜索番外', onInput: e => { query = e.target.value; list.replaceChildren(...storyRows()); } });
    const filterRow = (title, controls, className) => {
      const strip = el('div', { id: `shunxi-filter-${className}`, class: 'filter-strip', role: 'group', 'aria-label': `${title}筛选` }, controls);
      const toggle = button(chevron('doubleDown'), () => { filterExpanded[title] = !filterExpanded[title]; layout(); }, { class: 'filter-toggle', 'aria-controls': strip.id, 'aria-expanded': filterExpanded[title], 'aria-label': `${filterExpanded[title] ? '收起' : '展开'}${title}`, hidden: true });
      let lastWidth = -1;
      const layout = width => {
        if (!strip.isConnected || width !== undefined && width === lastWidth) return;
        lastWidth = strip.getBoundingClientRect().width;
        controls.forEach(control => { control.hidden = false; });
        const firstTop = controls[0]?.offsetTop;
        const overflow = controls.filter(control => control.offsetTop > firstTop + 1);
        toggle.hidden = !overflow.length;
        toggle.setAttribute('aria-expanded', String(filterExpanded[title]));
        toggle.setAttribute('aria-label', `${filterExpanded[title] ? '收起' : '展开'}${title}`);
        if (!filterExpanded[title]) overflow.forEach(control => { control.hidden = true; });
      };
      filterLayouts.set(strip, layout); filterObserver.observe(strip);
      requestAnimationFrame(() => layout());
      return el('div', { class: `filter-row ${className}` }, el('span', { class: 'filter-label' }, title), strip, toggle);
    };
    return el('section', { class: 'page library-main' }, el('div', { class: 'page-heading' }, el('h1', {}, '分类收藏')), search,
      el('div', { class: 'library-tools' }, button('＋ 新建分类', addCategory), button('管理分类', manageCategories)),
      filterRow('分类', categories.map(c => button(c.name, () => chooseCategory(c.id), { 'aria-pressed': category === c.id, class: category === c.id ? 'active' : '' })), 'category-filter'),
      filterRow('标签', [{ value: '', name: '全部' }, ...tags.map(t => ({ value: t, name: t }))].map(t => button(t.name, () => { tag = t.value; render(); }, { 'aria-pressed': tag === t.value, class: tag === t.value ? 'active' : '' })), 'tag-filter'), list);
  }
  function sampleStory(mode) {
    return { title: mode === 'phone' ? '晚安之前' : PROSE_PREVIEW_TITLE, mode, snapshot: { character: { name: preview ? '林舟' : catalog.currentCharacter || '角色' } }, chapters: [{ complete: true, content: mode === 'phone' ? JSON.stringify({ messages: PHONE_EXAMPLES }) : PROSE_PREVIEW_CONTENT }] };
  }
  function themesPage() {
    const themes = [...BUILTIN_THEMES, ...state.themes];
    const deleteButton = button('删除', () => {
      const mode = skinPreview, theme = resolveTheme(state, mode, state.settings[mode === 'phone' ? 'phoneTheme' : 'proseTheme']);
      if (!state.themes.some(t => t.id === theme.id)) return;
      confirm('删除主题', `确定删除${mode === 'phone' ? '小手机' : '正文'}主题「${theme.name}」？确认后会从主题库移除，并切换为${mode === 'prose' ? '邮票素笺' : '简白'}。已保存番外保留当时的样式。`, async () => {
        removeImportedTheme(state, theme.id); await persist();
      });
    }, { class: 'outline' });
    const refreshDelete = () => {
      const theme = resolveTheme(state, skinPreview, state.settings[skinPreview === 'phone' ? 'phoneTheme' : 'proseTheme']);
      deleteButton.disabled = !state.themes.some(t => t.id === theme.id);
      deleteButton.title = deleteButton.disabled ? '内置默认风格不能删除' : `删除${skinPreview === 'phone' ? '小手机' : '正文'}主题：${theme.name}`;
    };
    const panels = ['prose', 'phone'].map(mode => {
      const key = mode === 'prose' ? 'proseTheme' : 'phoneTheme', title = mode === 'prose' ? '正文风格' : '小手机风格';
      const activate = () => {
        skinPreview = mode;
        for (const column of shadow.querySelectorAll('.skin-column')) column.classList.toggle('current-preview', column.dataset.mode === mode);
        refreshDelete();
      };
      const previewPanel = el('div', { class: 'skin-preview' });
      const refreshPreview = () => previewPanel.replaceChildren(el('p', { class: 'muted' }, `正在预览：${title} · ${resolveTheme(state, mode, state.settings[key]).name}`), makeReader(sampleStory(mode), 0, state.settings[key]));
      const choice = singleChoice(title, themes.filter(t => t.mode === mode).map(t => ({ value: t.id, label: t.name })), state.settings[key], value => { selectReadingTheme(mode, value); activate(); scheduleSave(); refreshPreview(); });
      choice.addEventListener('focusin', activate); refreshPreview();
      return el('div', { class: `skin-column ${skinPreview === mode ? 'current-preview' : ''}`, 'data-mode': mode, onPointerdown: activate }, dropdownField(title, choice), previewPanel);
    });
    const imported = el('input', { type: 'file', accept: '.json,application/json', hidden: true, onChange: e => action(async () => {
      const file = e.target.files?.[0]; if (!file) return; if (file.size > 1000000) throw new Error('主题文件过大，请使用小于 1 MB 的 JSON。');
      const raw = JSON.parse(await file.text()), incoming = Array.isArray(raw.themes) ? raw.themes : [raw];
      if (!incoming.length || incoming.length > 100) throw new Error('主题包数量不正确。');
      const valid = incoming.map(validateTheme);
      const merged = new Map(state.themes.map(t => [t.id, t])); for (const t of valid) merged.set(t.id, t);
      if (merged.size > 100) throw new Error('自定义主题数量超过 100。');
      state.themes = [...merged.values()];
      for (const theme of valid) { selectReadingTheme(theme.mode, theme.id); skinPreview = theme.mode; }
      await persist(); render(); notify(`阅读主题已导入并选中：${valid.map(t => `${t.mode === 'phone' ? '小手机' : '正文'} · ${t.name}`).join('；')}。`);
    }) });
    refreshDelete();
    return el('section', { class: 'page' }, el('div', { class: 'page-heading theme-heading' }, el('h1', {}, '阅读美化'),
      el('div', { class: 'theme-actions' }, button('导入', () => imported.click(), { class: 'outline' }), button('导出', () => download(JSON.stringify({ format: 'shunxi-reading-themes', version: 1, themes: ['prose','phone'].map(mode => resolveTheme(state, mode, state.settings[mode === 'phone' ? 'phoneTheme' : 'proseTheme'])) }, null, 2), '瞬息-阅读主题.json', 'application/json'), { class: 'outline' }), deleteButton)),
      el('p', { class: 'muted' }, '选择新章节的阅读风格，已生成内容保留原样。'), el('div', { class: 'skins-grid' }, panels), imported);
  }
  function selectReadingTheme(mode, themeId) {
    state.settings[mode === 'phone' ? 'phoneTheme' : 'proseTheme'] = themeId;
  }
  async function refreshCatalog(showNotice = true) { try { catalog = await host.catalog(); if (tab === 'settings') render(); if (showNotice) notify('酒馆资料列表已刷新。'); } catch (e) { report(e, '读取酒馆资料'); } }
  function errorRows() {
    return state.errors.length ? state.errors.map(e => el('article', { class: 'error-row' }, el('small', {}, `${new Date(e.time).toLocaleString()} · ${e.stage}`), el('strong', {}, e.code), el('p', {}, e.message))) : [el('p', { class: 'muted' }, '暂无报错')];
  }
  function entryRows(kind, name, entries) {
    const mapKey = kind === 'preset' ? 'presetOverrides' : 'bookOverrides';
    const set = (id, patch) => {
      const maps = state.settings[mapKey];
      maps[name] = { ...(maps[name] || {}), [id]: { ...(maps[name]?.[id] || {}), ...patch } }; scheduleSave();
    };
    return entries.map(entry => {
      const change = state.settings[mapKey]?.[name]?.[entry.id] || {};
      const checkbox = el('input', { type: 'checkbox', checked: change.enabled ?? entry.enabled, 'aria-label': `启用${entry.name}`, onClick: e => e.stopPropagation(), onChange: e => set(entry.id, { enabled: e.target.checked }) });
      return el('details', { class: 'source-entry' }, el('summary', {}, checkbox, el('span', {}, entry.name)),
        entry.marker ? el('p', { class: 'muted' }, '酒馆资料占位项') : label(`${entry.name}内容`, el('textarea', { rows: 4, value: change.content ?? entry.content, onInput: e => set(entry.id, { content: e.target.value }) })));
    });
  }
  function sourceArrow(kind, name, title) {
    const control = button('', () => action(async () => {
      const menu = control.closest('.source-dropdown'); if (menu) { setDropdownOpen(menu, false); menu.querySelector('.dropdown-trigger').focus(); }
      const body = el('div', { class: 'source-detail' }, el('p', { class: 'muted' }, '正在读取条目…'));
      const pop = popup(kind === 'preset' ? '预设条目' : '世界书条目', body, [], 'source-popup');
      try {
        const details = [kind === 'preset' ? await host.presetDetail(name) : await host.bookDetail(name)];
        if (!pop.isConnected) return;
        body.replaceChildren(el('p', { class: 'muted' }, '勾选和文本修改只用于番外，自动保存。'), ...details.map(detail => {
          const entries = kind === 'preset' ? detail.prompts : detail.entries;
          const title = kind === 'book' ? catalog.books.find(b => b.value === detail.name)?.label || detail.name : detail.name;
          return el('section', {}, el('h3', {}, title), entries.length ? entryRows(kind, detail.name, entries) : el('p', { class: 'muted' }, '暂无条目'));
        }));
      } catch (error) { body.replaceChildren(el('p', {}, '条目读取失败，详情已记录在报错记录。')); report(error, kind === 'preset' ? '读取预设' : '读取世界书'); }
    }), { class: 'source-arrow icon-button', 'aria-label': `查看${kind === 'preset' ? '预设' : '世界书'}：${title}` });
    control.innerHTML = phoneIcon('arrow'); return control;
  }
  function sourceSelector(kind) {
    const s = state.settings, isBook = kind === 'book', title = isBook ? '世界书' : '预设';
    const options = isBook ? catalog.books : [{ value: '', label: '使用当前已保存预设' }, { value: '__none__', label: '不采用预设' }, ...catalog.presets];
    const selectedNames = () => isBook ? s.books.map(v => catalog.books.find(b => b.value === v)?.label || v).join('、') || '选择世界书（可多选）' : options.find(o => o.value === s.preset)?.label || s.preset;
    const { menu, caption, panel } = dropdown(`${title}（${isBook ? '多选' : '单选'}）`, selectedNames());
    panel.setAttribute('aria-label', `${title}选项`);
    panel.append(...(options.length ? options.map(option => {
      const input = el('input', { type: isBook ? 'checkbox' : 'radio', name: isBook ? null : 'shunxi-preset-choice', value: option.value, checked: isBook ? s.books.includes(option.value) : s.preset === option.value, 'aria-label': `${isBook ? '使用世界书' : '使用预设'}${option.label}`, onChange: e => {
        if (isBook) s.books = e.target.checked ? [...new Set([...s.books, option.value])] : s.books.filter(v => v !== option.value);
        else s.preset = option.value;
        caption.textContent = selectedNames(); caption.title = caption.textContent; scheduleSave();
      } });
      return choiceRow(input, option.label, option.value === '__none__' ? null : sourceArrow(kind, option.value, option.label));
    }) : [el('p', { class: 'muted' }, `当前酒馆没有${title}。`)]));
    return sourceRow(title, menu);
  }
  function editPersona() {
    action(async () => {
      const s = state.settings;
      let following = s.personaMode !== 'custom';
      const initial = following ? await host.personaDetail() : { name: s.customPersonaName, description: s.customPersonaDescription };
      const name = el('input', { value: initial.name, maxlength: 120, onInput: () => { following = false; } });
      const description = el('textarea', { value: initial.description, rows: 8, maxlength: 50000, onInput: () => { following = false; } });
      let pop;
      pop = popup('当前面具', el('div', {}, label('面具名字', name), label('面具内容', description), el('p', { class: 'muted' }, '保存后用于新番外，已有番外保留原有人设。')),
        [button('读取当前面具', () => action(async () => {
          const persona = await host.personaDetail(); following = true; name.value = persona.name; description.value = persona.description;
          s.personaMode = 'current'; s.customPersonaName = ''; s.customPersonaDescription = ''; catalog.currentPersona = persona.name;
          await persist(); render(); notify('已恢复跟随酒馆当前面具。');
        }), { class: 'outline' }), button('保存面具', () => action(async () => {
          if (!name.value.trim()) throw new Error('请填写面具名字。');
          s.personaMode = following ? 'current' : 'custom'; s.customPersonaName = following ? '' : name.value.trim(); s.customPersonaDescription = following ? '' : description.value;
          await persist(); pop.close(); render(); notify('面具已保存，后续新番外使用此人设。');
        }), { class: 'primary' })]);
    });
  }
  function settingsPage() {
    const s = state.settings;
    const update = (key, value) => { s[key] = value; scheduleSave(); };
    const settingNumber = (title, key, min, max, hint) => label(title, el('input', { type: 'number', min, max, value: s[key], onInput: e => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v) && v >= min && v <= max) update(key, Math.floor(v)); }, onChange: e => { const v = Number(e.target.value); if (!Number.isFinite(v) || v < min || v > max) { e.target.value = s[key]; return notify(`${title}需在 ${min}–${max} 之间。`, true); } update(key, Math.floor(v)); } }), hint);
    const keyInput = el('input', { type: 'password', autocomplete: 'off', value: host.getKey(), placeholder: 'API Key', onInput: e => { try { host.setKey(e.target.value.trim()); } catch (error) { report(error); } } });
    const apiFields = el('div');
    const refreshApiFields = () => {
      if (s.apiMode !== 'independent') { apiFields.replaceChildren(el('p', { class: 'muted' }, '支持酒馆 Chat Completion 连接。正文生成时等待；可在独立 API 下同时生成。')); return; }
      const modelsArea = el('div');
      const refreshModels = () => {
        const values = s.modelsEndpoint === s.endpoint ? [...s.models] : [];
        if (s.model && !values.includes(s.model)) values.unshift(s.model);
        modelsArea.replaceChildren(dropdownField('模型', singleChoice('选择模型', [{ value: '', label: values.length ? '请选择模型' : '请先拉取模型' }, ...values.map(value => ({ value, label: value }))], s.model, value => update('model', value))));
      };
      const fetchModels = button('拉取模型', async () => {
        const endpoint = s.endpoint, controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        fetchModels.disabled = true; fetchModels.textContent = '拉取中…'; modelStatus.textContent = '';
        try {
          const models = await host.listModels(endpoint, { signal: controller.signal });
          if (s.endpoint !== endpoint) return;
          s.models = models; s.modelsEndpoint = endpoint;
          if (!models.includes(s.model)) s.model = '';
          await persist(); refreshModels(); modelStatus.textContent = '已拉取 ' + models.length + ' 个模型，请选择。';
        } catch (error) { if (error.name === 'AbortError') error = new Error('拉取模型超时，请稍后重试。'); report(error, '拉取模型'); modelStatus.textContent = state.errors[0].message; }
        finally { clearTimeout(timer); fetchModels.disabled = false; fetchModels.textContent = '拉取模型'; }
      }, { class: 'outline' });
      const modelStatus = el('small', { class: 'model-status', 'aria-live': 'polite' });
      refreshModels();
      apiFields.replaceChildren(el('div', { class: 'form-grid' }, label('API 地址', el('input', { type: 'url', placeholder: 'https://example.com/v1', value: s.endpoint, onInput: e => { update('endpoint', e.target.value); s.model = ''; refreshModels(); scheduleSave(); } })), label('API 密钥', keyInput, '密钥保存在当前浏览器，不进入番外、主题或备份。'), modelsArea, el('div', { class: 'model-fetch' }, fetchModels, modelStatus)));
    };
    const apiChoice = singleChoice('生成连接', [{ value: 'main', label: '跟随主 API · 与正文轮流生成' }, { value: 'independent', label: '独立 API · 可与正文同时请求' }], s.apiMode, value => { update('apiMode', value); refreshApiFields(); });
    refreshApiFields();
    const restore = el('input', { type: 'file', accept: '.json,application/json', hidden: true, onChange: e => action(async () => {
      const file = e.target.files?.[0]; if (!file) return; if (file.size > 50000000) throw new Error('备份超过 50 MB，基础版暂不支持导入。');
      const incoming = normalizeState(JSON.parse(await file.text())); incoming.themes = incoming.themes.map(validateTheme);
      confirm('恢复备份', `将替换当前资料库为 ${incoming.stories.length} 篇番外、${incoming.categories.length} 个分类。恢复前会自动下载当前备份。`, async () => {
        if (task) throw new Error('请先停止生成再恢复备份。');
        download(backup(state), `瞬息-恢复前备份-${Date.now()}.json`, 'application/json');
        await store.save(incoming); state = incoming; storyId = state.stories[0]?.id || null; root.dataset.theme = state.settings.theme; launcher.hidden = !state.settings.launcherEnabled; nativePanel?.sync(state.settings.launcherEnabled); render(); notify('备份已恢复。');
      });
    }) });
    return el('section', { class: 'page settings-page' }, el('div', { class: 'page-heading' }, el('h1', {}, '设置'), button('刷新酒馆资料', () => refreshCatalog(), { class: 'text-button' })),
      el('section', { class: 'settings-group' }, el('h2', {}, '人物与资料'),
        el('div', { class: 'sources-compact' }, sourceRow('当前角色', el('div', { class: 'source-text' }, el('strong', {}, catalog.currentCharacter || '未打开角色聊天'))),
          sourceRow('当前面具', el('div', { class: 'source-text persona-current' }, el('strong', {}, s.personaMode === 'custom' ? s.customPersonaName || '我' : catalog.currentPersona || '我'), (() => { const arrow = button('', editPersona, { class: 'source-arrow icon-button', 'aria-label': '编辑当前面具' }); arrow.innerHTML = phoneIcon('arrow'); return arrow; })())),
          sourceSelector('preset'), sourceSelector('book')),
        el('div', { class: 'context-row' }, el('label', { class: 'check-row' }, el('input', { type: 'checkbox', checked: s.readContext, onChange: e => { update('readContext', e.target.checked); render(); } }), '读取正文上下文'),
          el('input', { type: 'number', min: 1, max: 200, value: s.contextCount, disabled: !s.readContext, 'aria-label': '读取最近消息数', onChange: e => { update('contextCount', Math.min(200, Math.max(1, Math.floor(Number(e.target.value)) || 10))); e.target.value = s.contextCount; } }), el('small', {}, '条'))),
      el('section', { class: 'settings-group' }, el('h2', {}, '生成参数'),
        el('div', { class: 'parameter-pair' }, settingNumber('目标正文字数', 'words', 100, 20000), settingNumber('目标消息条数', 'targetMessages', 1, 1000)),
        el('small', { class: 'shared-hint' }, '正文／小手机不足时自动补写，最多 3 轮；生成与续写共用。HTML 不按字数或条数补写。'),
        el('div', { class: 'parameter-pair reply-parameters' }, settingNumber('最大回复token', 'maxTokens', 128, 200000), el('label', { class: 'stream-setting' }, el('input', { type: 'checkbox', checked: s.stream, onChange: e => update('stream', e.target.checked) }), el('span', {}, '流式传输')))),
      el('section', { class: 'settings-group' }, el('h2', {}, 'API'), dropdownField('生成连接', apiChoice), apiFields,
        button('测试连接', () => action(async () => {
          if (task) throw new Error('请先完成当前生成。');
          const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
          notify('正在测试连接（会发送一条极短请求）…');
          try { await host.generate({ messages: [{ role: 'user', content: 'Reply with OK.' }], settings: { ...s, maxTokens: 32 }, snapshot: null, signal: controller.signal }); notify('连接测试成功。'); } finally { clearTimeout(timer); }
        }), { class: 'outline' })),
      el('section', { class: 'settings-group' }, el('h2', {}, '悬浮入口'), el('label', { class: 'check-row' }, el('input', { type: 'checkbox', checked: s.launcherEnabled, onChange: e => setLauncherEnabled(e.target.checked) }), '开启悬浮窗入口')),
      el('section', { class: 'settings-group' }, el('h2', {}, '数据'), el('p', { class: 'muted' }, '番外保存在当前浏览器、当前酒馆账号的独立资料库。更新扩展代码不会覆盖资料；跨设备请使用备份恢复。'),
        el('div', { class: 'actions' }, button('按分类导出 ZIP', exportCategories), button('备份全部资料', () => download(backup(state), `瞬息-备份-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')), button('恢复备份', () => restore.click(), { disabled: Boolean(task) })), restore,
        ),
      el('section', { class: 'settings-group update-group' }, el('h2', {}, '更新'), el('p', {}, `当前版本 · ${VERSION}`), el('p', { class: 'muted' }, '1.0.2：原生扩展入口、模型拉取、即时草稿恢复；修复生成状态误判与宏拦截，最大回复支持 200000 token。'), button('检查更新', () => action(async () => { notify('正在检查更新…'); notify(await host.checkUpdate()); }))),
      el('section', { class: 'settings-group' }, el('h2', {}, '报错记录'), el('div', { class: 'error-list', 'aria-live': 'polite' }, errorRows())));
  }
  function exportCategories() {
    const choices = [...state.categories, { id: 'uncategorized', name: '未分类' }], selected = new Set(choices.map(c => c.id));
    let pop; pop = popup('按分类导出', el('div', {}, el('p', {}, 'ZIP 解压后按分类展示，同篇在多个分类下各保留一份。阅读文件不展示标签。'), el('div', { class: 'choice-list' }, choices.map(c => el('label', { class: 'check-row' }, el('input', { type: 'checkbox', checked: true, onChange: e => e.target.checked ? selected.add(c.id) : selected.delete(c.id) }), c.name))), el('small', {}, '导出 HTML 自带阅读样式；外部图片仍需网络。本功能不是完整备份。')), [button('取消', () => pop.close()), button('导出 ZIP', () => action(async () => {
      if (!selected.size) throw new Error('请至少选择一个分类。');
      download(makeZip(categoryFiles(state, [...selected])), `瞬息-分类导出-${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip'); pop.close(); notify('分类导出已开始下载。');
    }), { class: 'primary' })]);
  }
  function placeLauncher() {
    const position = state.settings.launcher, size = 32;
    const x = Math.max(8, Math.min(innerWidth - size - 8, position.x ?? innerWidth - size - 18));
    const y = Math.max(8, Math.min(innerHeight - size - 8, position.y ?? innerHeight * 0.65));
    launcher.style.left = `${x}px`; launcher.style.top = `${y}px`;
  }
  let drag = null, wasDragged = false;
  launcher.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, left: parseFloat(launcher.style.left), top: parseFloat(launcher.style.top) }; wasDragged = false; launcher.setPointerCapture(e.pointerId); });
  launcher.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) < 6 && !wasDragged) return; wasDragged = true; state.settings.launcher = { x: drag.left + dx, y: drag.top + dy }; placeLauncher(); });
  launcher.addEventListener('pointerup', () => { if (wasDragged) scheduleSave(); drag = null; });
  launcher.addEventListener('pointercancel', () => { drag = null; });
  launcher.addEventListener('click', e => { if (wasDragged) { e.stopImmediatePropagation(); e.preventDefault(); wasDragged = false; } }, true);
  const flushInputs = () => { try { store.checkpoint(state); } catch (error) { report(error, '保存'); } };
  const onVisibilityChange = () => { if (document.visibilityState === 'hidden') { flushInputs(); persist().catch(report); } };
  const beforeUnload = e => { flushInputs(); if (task || editing) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('resize', placeLauncher); window.addEventListener('beforeunload', beforeUnload);
  launcher.hidden = state.settings.launcherEnabled === false;
  try { nativePanel = host.mountSettingsPanel?.({ open, enabled: !launcher.hidden, setEnabled: setLauncherEnabled }); } catch (error) { report(error); }
  window.addEventListener('pagehide', flushInputs); document.addEventListener('visibilitychange', onVisibilityChange);
  placeLauncher(); render();
  try { catalog = await host.catalog(); if (tab === 'settings') render(); } catch (error) { report(error); }
  if (preview) open();
  return { open, async dispose() { disposed = true; stop(); filterObserver.disconnect(); filterLayouts.clear(); clearTimeout(saveTimer); clearTimeout(noticeTimer); await store.save(state).catch(() => {}); await store.close(); host.dispose(); window.removeEventListener('resize', placeLauncher); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('pagehide', flushInputs); document.removeEventListener('visibilitychange', onVisibilityChange); nativePanel?.dispose(); root.remove(); } };
}
