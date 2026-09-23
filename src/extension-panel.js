// Native settings container verified against SillyTavern 1.18.0 public/index.html.
export function mountExtensionPanel({ open, enabled, setEnabled }, container = document.getElementById('extensions_settings')) {
  if (!container) throw new Error('未找到酒馆扩展设置区域，请刷新页面后重试。');
  const panel = document.createElement('details');
  panel.id = 'shunxi-native-settings';
  panel.className = 'extension_container';
  const heading = document.createElement('summary');
  heading.textContent = '瞬息 · 番外小剧场';
  heading.style.cssText = 'cursor:pointer;font-weight:600;padding:10px 0';
  const row = document.createElement('label');
  row.className = 'checkbox_label';
  row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:12px 0';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox'; checkbox.checked = enabled;
  checkbox.addEventListener('change', () => setEnabled(checkbox.checked));
  row.append(checkbox, document.createTextNode('开启悬浮窗入口'));
  const launch = document.createElement('button');
  launch.type = 'button'; launch.className = 'menu_button'; launch.textContent = '打开瞬息';
  launch.addEventListener('click', open);
  panel.append(heading, row, launch); container.append(panel);
  return { sync(value) { checkbox.checked = value; }, dispose() { panel.remove(); } };
}
