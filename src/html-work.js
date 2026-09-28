import { filterHtmlDocument } from './html-filters.js';
export const HTML_SANDBOX = 'allow-scripts';
// Locate the document without rewriting its scripts, styles, comments or text.
// The masked copy is only used for finding the start; editable source stays exact.
function documentSource(source) {
  const raw=String(source??''),markers=/<!doctype\s+html\b[^>]*>|<html(?=[\s>])[^>]*>|<(think|thinking|cot)\b[^>]*>|<!--/gi;
  for(let match;(match=markers.exec(raw));){
    if(match[0]==='<!--'){const end=raw.indexOf('-->',markers.lastIndex);if(end>=0)markers.lastIndex=end+3;continue;}
    if(!match[1])return raw.slice(match.index);
    const close=new RegExp('</'+match[1]+'\\s*>','gi');close.lastIndex=markers.lastIndex;
    let end=close.exec(raw);
    // A closing thought literal inside a JS string is not the end of a prefix.
    const doc=/<!doctype\s+html\b[^>]*>|<html(?=[\s>])[^>]*>/gi;doc.lastIndex=markers.lastIndex;
    const candidate=doc.exec(raw);
    if(candidate&&end&&candidate.index<end.index){
      const shape=documentShape(raw.slice(candidate.index));
      if(shape.end&&candidate.index+shape.end>end.index){close.lastIndex=candidate.index+shape.end;end=close.exec(raw);}
    }
    if(end)markers.lastIndex=close.lastIndex;
  }
  return '';
}
function documentShape(text) {
  const tags=/<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?([a-z][a-z0-9:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  let root=false,head=false,headClosed=false,body=false,bodyClosed=false,template=0;
  for(let match; (match=tags.exec(text));){
    if(!match[1])continue;
    const name=match[1].toLowerCase(),closing=match[0].startsWith('</');
    if(!closing&&['script','style','textarea','title','xmp'].includes(name)){
      const close=new RegExp('</'+name+'\\s*>','gi');close.lastIndex=tags.lastIndex;
      const end=close.exec(text);if(!end)return {end:0,complete:false};tags.lastIndex=close.lastIndex;continue;
    }
    if(name==='template'){template=Math.max(0,template+(closing?-1:1));continue;}
    if(template)continue;
    if(name==='html'){
      if(!closing)root=true;
      else if(root)return {end:tags.lastIndex,complete:head&&headClosed&&body&&bodyClosed};
    }
    if(!root)continue;
    if(name==='head'){if(!closing&&!body)head=true;else if(closing&&head)headClosed=true;}
    if(name==='body'){if(!closing&&headClosed)body=true;else if(closing&&body)bodyClosed=true;}
  }
  return {end:0,complete:false};
}
export function cleanHtml(source, rules = [], snapshot = {}, onWarnings) {
  const document=documentSource(source);if(!document)return '';
  const shape=documentShape(document);
  const filtered = filterHtmlDocument((shape.end?document.slice(0,shape.end):document.replace(/\s*```\s*$/,'')).trim(), rules, snapshot);
  if(filtered.warnings.length)onWarnings?.(filtered.warnings);
  return filtered.content;
}
export function htmlIssue(source) {
  if(!String(source??'').trim())return 'HTML 回复为空。';
  const content=cleanHtml(source);
  if(!content)return '未识别到 HTML 文档，原始回复已保留，可打开编辑查看。';
  if(!documentShape(content).complete)return 'HTML 文档结构不完整，可能被截断。代码已保留，请编辑补全或重新生成。';
  return '';
}
export function htmlDocument(source, rules = [], snapshot = {}, onWarnings) {
  // Policy precedes all model markup. The caller MUST use HTML_SANDBOX without
  // allow-same-origin; no parent APIs, secrets or storage are passed to this frame.
  const policy = "default-src 'none'; script-src 'unsafe-inline' https: http:; style-src 'unsafe-inline' https: http:; img-src https: http: data: blob:; font-src https: http: data:; media-src https: http: data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${policy}">\n${cleanHtml(source, rules, snapshot, onWarnings).replace(/^<!doctype\s+html\s*>/i, '')}`;
}

export const HTML_PROMPT = '【HTML作品模式】只输出一份完整、可独立打开的 HTML 文档，从 <!doctype html> 开始，到 </html> 结束，包含 html、head、body、viewport、全部 CSS 与 JavaScript；不输出代码围栏或解释。按用户要求制作有完整交互的作品，应用以上人物、面具、预设、世界书和参考资料。界面适配电脑及 280px 窄容器，按钮、表单输入、对话、动画等用原生 HTML/CSS/JavaScript 实现。页面运行在仅 allow-scripts 的独立沙盒；不要读取 parent、top、酒馆接口、cookie、localStorage 或 IndexedDB，不使用 fetch、XHR、嵌套 iframe、eval、新窗口、顶层跳转或向服务端提交表单。游戏状态使用页面内变量，页面内弹窗使用 dialog 或 DOM。外部图片、字体、音乐可使用用户提供的完整 HTTP(S) 直链，不编造链接；音乐需有开关，用户点击后播放，处理播放失败。优先内联脚本和样式，所有必要逻辑须包含在本文件；控制代码长度，在最大回复 token 内完成文档，不按正文字数或消息条数扩写。本作品不提供续写。';
