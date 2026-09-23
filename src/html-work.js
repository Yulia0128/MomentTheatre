export const HTML_SANDBOX = 'allow-scripts';
export function cleanHtml(source) {
  return String(source ?? '').trim().replace(/^```(?:html)?\s*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
}
export function htmlIssue(source) {
  const content = cleanHtml(source);
  if (!content) return 'HTML 回复为空。';
  if (!/^<!doctype\s+html\s*>/i.test(content) || !/<html(?:\s|>)/i.test(content) || !/<head(?:\s|>)/i.test(content) || !/<\/head\s*>/i.test(content) || !/<body(?:\s|>)/i.test(content) || !/<\/body\s*>/i.test(content) || !/<\/html\s*>\s*$/i.test(content)) return 'HTML 文档结构不完整，可能被截断。代码已保留，请编辑补全或重新生成。';
  return '';
}
export function htmlDocument(source) {
  // Policy precedes all model markup. The caller MUST use HTML_SANDBOX without
  // allow-same-origin; no parent APIs, secrets or storage are passed to this frame.
  const policy = "default-src 'none'; script-src 'unsafe-inline' https: http:; style-src 'unsafe-inline' https: http:; img-src https: http: data: blob:; font-src https: http: data:; media-src https: http: data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${policy}">\n${cleanHtml(source).replace(/^<!doctype\s+html\s*>/i, '')}`;
}

export const HTML_PROMPT = '【HTML作品模式】只输出一份完整、可独立打开的 HTML 文档，从 <!doctype html> 开始，到 </html> 结束，包含 html、head、body、viewport、全部 CSS 与 JavaScript；不输出代码围栏或解释。按用户要求制作有完整交互的作品，应用以上人物、面具、预设、世界书和参考资料。界面适配电脑及 280px 窄容器，按钮、表单输入、对话、动画等用原生 HTML/CSS/JavaScript 实现。页面运行在仅 allow-scripts 的独立沙盒；不要读取 parent、top、酒馆接口、cookie、localStorage 或 IndexedDB，不使用 fetch、XHR、嵌套 iframe、eval、新窗口、顶层跳转或向服务端提交表单。游戏状态使用页面内变量，页面内弹窗使用 dialog 或 DOM。外部图片、字体、音乐可使用用户提供的完整 HTTP(S) 直链，不编造链接；音乐需有开关，用户点击后播放，处理播放失败。优先内联脚本和样式，所有必要逻辑须包含在本文件；控制代码长度，在最大回复 token 内完成文档，不按正文字数或消息条数扩写。本作品不提供续写。';
