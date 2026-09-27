import { createId } from './id.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const cardToken = () => createId().replaceAll('-', '');

// Only this bridge runs in the reading document. Rule scripts run one origin
// boundary further away, in individual opaque-origin card frames.
export function readerBridge(nonce) {
  return `<script nonce="${nonce}">(${function () {
    const token = document.currentScript.nonce;
    window.addEventListener('message', event => {
      const data = event.data;
      if (!data || data.type !== 'shunxi-card' || typeof data.id !== 'string') return;
      const frame = [...document.querySelectorAll('iframe[data-regex-card]')].find(f => f.dataset.regexCard === data.id && f.contentWindow === event.source);
      if (!frame) return;
      if (Number.isFinite(data.height)) frame.style.height = Math.min(2400, Math.max(40, data.height)) + 'px';
      if (typeof data.error === 'string') parent.postMessage({type:'shunxi-reader-error', token, error:data.error.slice(0, 1000)}, '*');
    });
  }.toString()})();</script>`;
}

export function cardFrame(content, css, scripts, nonce, id, name) {
  const bootstrap = `(${function (id, name) {
    let scheduled = false, previous = 0;
    function size() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const body = document.body;
        if (!body) return;
        const height = Math.ceil(Math.max(body.getBoundingClientRect().height, body.scrollHeight)) + 2;
        if (height !== previous) { previous = height; parent.postMessage({type:'shunxi-card', id, height}, '*'); }
      });
    }
    const reported = new Set();
    function fail(value) {
      const error = '正则「' + name + '」卡片脚本：' + String(value || '运行失败').slice(0, 800);
      if (reported.has(error) || reported.size >= 5) return;
      reported.add(error);
      function show() {
        const p = document.createElement('p'); p.className = 'shunxi-card-error'; p.textContent = error;
        p.style.cssText = 'font:13px/1.5 system-ui;padding:12px;border:1px solid currentColor;white-space:pre-wrap';
        document.body.append(p); size();
      }
      if (document.body) show(); else document.addEventListener('DOMContentLoaded', show, {once:true});
      parent.postMessage({type:'shunxi-card', id, error}, '*');
    }
    addEventListener('error', e => { if (e.message) { fail(e.message); e.preventDefault(); } });
    addEventListener('unhandledrejection', e => { fail(e.reason?.message || e.reason); e.preventDefault(); });
    document.addEventListener('DOMContentLoaded', () => {
      new ResizeObserver(size).observe(document.body);
      new MutationObserver(size).observe(document.body, {subtree:true, childList:true, attributes:true, characterData:true});
      document.fonts?.ready.then(size); size();
    }, {once:true});
    addEventListener('load', size); addEventListener('resize', size);
  }.toString()})(${JSON.stringify(id)},${JSON.stringify(name).replaceAll('<', '\\u003c')});`;
  for (const script of scripts) {
    content = content.replaceAll(`<span data-regex-script="${script.id}"></span>`, () => `<script nonce="${nonce}">${script.code}</script>`);
  }
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src https: http: data:; font-src https: http: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><style>html{background:transparent;overflow:auto}body{display:flow-root;margin:0;min-height:0;background:transparent;font:14px/1.7 system-ui;overflow-wrap:anywhere}*{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:#8886 transparent}img{max-width:100%} ${css}</style><script nonce="${nonce}">${bootstrap}</script></head><body>${content}</body></html>`;
  return `<iframe class="regex-card" data-regex-card="${id}" title="${escape(name || '正文卡片')}" sandbox="allow-scripts" referrerpolicy="no-referrer" style="display:block;width:100%;height:160px;border:0;background:transparent" srcdoc="${escape(doc)}"></iframe>`;
}

export function readerToken(html) {
  return html.match(/<meta name="shunxi-reader" content="([a-f0-9]+)">/)?.[1] || '';
}
