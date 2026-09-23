// Cache only public reading assets. Never include credentials or API responses.
const MAX_BYTES = 64 * 1024 * 1024, TTL = 7 * 86400000;
export class ReaderAssets {
  constructor() { this.pending = new Map(); this.bytes = 0; this.memory = new Map(); }
  async database() {
    return this.db ||= new Promise(resolve => {
      try {
        const request = indexedDB.open('shunxi-reading-assets', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('assets', { keyPath: 'url' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = request.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  async cached(url) {
    const db = await this.database();
    if (!db) return null;
    return new Promise(resolve => {
      const request = db.transaction('assets').objectStore('assets').get(url);
      request.onsuccess = () => resolve(request.result?.time > Date.now() - TTL ? request.result : null);
      request.onerror = () => resolve(null);
    });
  }
  async persist(entry) {
    const db = await this.database(); if (!db) return;
    await new Promise(resolve => {
      const transaction = db.transaction('assets', 'readwrite'), store = transaction.objectStore('assets');
      const request = store.getAll();
      request.onsuccess = () => {
        const existing = request.result.filter(e => e.url !== entry.url).sort((a, b) => b.time - a.time);
        let total = entry.size;
        for (const item of existing) {
          total += item.size;
          if (total > MAX_BYTES || item.time < Date.now() - TTL) store.delete(item.url);
        }
        store.put(entry);
      };
      transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve();
    });
  }
  async load(url) {
    if (this.memory.has(url)) return this.memory.get(url).data;
    if (this.pending.has(url)) return this.pending.get(url);
    const promise = (async () => {
      try {
        let entry = await this.cached(url);
        if (!entry) {
          const response = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'force-cache', signal: AbortSignal.timeout(12000) });
          if (!response.ok || Number(response.headers.get('content-length')) > 24 * 1024 * 1024) return url;
          const blob = await response.blob();
          if (blob.size > 24 * 1024 * 1024 || !/^(image\/|font\/|application\/(octet-stream|font|x-font))/i.test(blob.type)) return url;
          const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
          entry = { url, data, size: data.length, time: Date.now() };
          await this.persist(entry);
        }
        while (this.bytes + entry.size > MAX_BYTES && this.memory.size) {
          const [key, item] = this.memory.entries().next().value; this.memory.delete(key); this.bytes -= item.size;
        }
        this.memory.set(url, entry); this.bytes += entry.size;
        return entry.data;
      } catch { return url; }
    })();
    this.pending.set(url, promise);
    try { return await promise; } finally { this.pending.delete(url); }
  }
  async prepare(html) {
    // Reader documents are inert, validated HTML/CSS. HTML-game mode never uses this cache.
    const urls = [...new Set(html.match(/https?:[^\s"'()<>]+/g) || [])].slice(0, 32), replacements = new Map();
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
      while (next < urls.length) { const original = urls[next++]; replacements.set(original, await this.load(original.replaceAll('&amp;', '&'))); }
    }));
    return html.replace(/https?:[^\s"'()<>]+/g, url => replacements.get(url) || url);
  }
}
