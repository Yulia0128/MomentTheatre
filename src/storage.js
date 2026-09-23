import { emptyState, normalizeState, clone } from './model.js';

export class LibraryStore {
  constructor(scope, indexedDBFactory = globalThis.indexedDB) { this.scope = scope; this.factory = indexedDBFactory; this.revision = 0; this.queue = Promise.resolve(); }
  async open() {
    if (!this.factory) throw new Error('浏览器不支持 IndexedDB，无法安全保存番外。请使用正常浏览模式。');
    this.db = await new Promise((resolve, reject) => {
      const request = this.factory.open('shunxi-library', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('accounts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('番外资料库打开失败，请检查浏览器存储权限。'));
      request.onblocked = () => reject(new Error('资料库正在其他页面升级，请关闭旧页面后重试。'));
    });
    this.db.onversionchange = () => this.db.close();
    return this.load();
  }
  async load() {
    const value = await new Promise((resolve, reject) => {
      const request = this.db.transaction('accounts').objectStore('accounts').get(this.scope);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    this.revision = value?.revision || 0;
    return value ? normalizeState(value.state) : emptyState();
  }
  save(state) {
    const snapshot = clone(state);
    const work = () => new Promise((resolve, reject) => {
      const transaction = this.db.transaction('accounts', 'readwrite');
      const store = transaction.objectStore('accounts');
      let conflict = false;
      const request = store.get(this.scope);
      request.onsuccess = () => {
        if ((request.result?.revision || 0) !== this.revision) { conflict = true; transaction.abort(); return; }
        store.put({ revision: this.revision + 1, state: snapshot }, this.scope);
      };
      transaction.oncomplete = () => { this.revision++; resolve(); };
      transaction.onabort = transaction.onerror = () => reject(new Error(conflict
        ? '另一页面已修改资料，请先导出当前备份，再刷新以载入最新内容。为避免覆盖，本次未保存。'
        : '保存失败，可能是浏览器空间不足。请先导出备份，保留当前页面。'));
    });
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }
  async close() { await this.queue; this.db?.close(); }
}
