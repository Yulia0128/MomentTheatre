// Native settings container verified against SillyTavern 1.18.0 public/index.html.
export function mountExtensionPanel({ enabled, setEnabled }, container = document.getElementById('extensions_settings')) {
  if (!container) throw new Error('未找到酒馆扩展设置区域，请刷新页面后重试。');
  const panel = document.createElement('div');
  panel.id = 'shunxi-native-settings';
  panel.className = 'extension_container';
  const drawer = document.createElement('div'); drawer.className = 'inline-drawer';
  const heading = document.createElement('div');
  heading.className = 'inline-drawer-toggle inline-drawer-header';
  const title = document.createElement('b'); title.textContent = '瞬息 · 番外小剧场';
  const icon = document.createElement('div'); icon.className = 'fa-solid fa-circle-chevron-down inline-drawer-icon down';
  heading.append(title, icon);
  const content = document.createElement('div'); content.className = 'inline-drawer-content';
  const row = document.createElement('label');
  row.className = 'checkbox_label';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox'; checkbox.checked = enabled;
  checkbox.addEventListener('change', () => setEnabled(checkbox.checked));
  row.append(checkbox, document.createTextNode('开启悬浮窗入口'));
  // SillyTavern owns the delegated click handler, animation, icon font and theme styles.
  content.append(row); drawer.append(heading, content); panel.append(drawer); container.append(panel);
  return { sync(value) { checkbox.checked = value; }, dispose() { panel.remove(); } };
}
