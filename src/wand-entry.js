// Native SillyTavern 1.15–1.18: extensions.js / templates/wandMenu.html,
// with the same item classes as extensions/caption/index.js. See API-COMPATIBILITY.md.
const mounted = new WeakMap();
export function mountWandEntry({ open }, container = document.getElementById('extensionsMenu')) {
  if (!container) throw new Error('未找到酒馆小魔棒菜单，瞬息入口未能添加。');
  mounted.get(container)?.dispose();
  const wrapper = document.createElement('div');
  wrapper.id = 'shunxi-wand-container'; wrapper.className = 'extension_container';
  const entry = document.createElement('div');
  entry.id = 'shunxi-wand-entry'; entry.className = 'list-group-item flex-container flexGap5';
  entry.setAttribute('role', 'button'); entry.tabIndex = 0;
  const icon = document.createElement('span');
  icon.className = 'fa-solid fa-infinity extensionsMenuExtensionButton'; icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span'); text.textContent = '瞬息 · 番外小剧场';
  entry.append(icon, text); wrapper.append(entry); container.append(wrapper);
  // Let clicks bubble: the native menu owns its visibility and closes itself.
  const activate = () => open();
  const keyboard = event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) entry.click(); }
  };
  entry.addEventListener('click', activate); entry.addEventListener('keydown', keyboard);
  const handle = { dispose() {
    entry.removeEventListener('click', activate); entry.removeEventListener('keydown', keyboard); wrapper.remove();
    if (mounted.get(container) === handle) mounted.delete(container);
  } };
  mounted.set(container, handle); return handle;
}
