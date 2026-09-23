import { emptyState, normalizeState, clone, id } from './model.js';

export class LibraryStore {
  constructor(scope, indexedDBFactory = globalThis.indexedDB, journalStorage = null) {
    this.scope = scope; this.factory = indexedDBFactory; this.revision = 0; this.queue = Promise.resolve();
    this.writer = id(); this.sequence = 0; this.journalKey = `shunxi:${scope}:pending-input`;
    try { this.journal = journalStorage || globalThis.localStorage; } catch { this.journal = null; }
  }
  checkpoint(state) {
    if (!this.journal) return;
    const record = { writer: this.writer, sequence: ++this.sequence, revision: this.revision,
      draft: state.draft, settings: state.settings, editorDraft: state.editorDraft,
      continuations: state.stories.map(s => ({ id: s.id, continuationDraft: s.continuationDraft, continuationMode: s.continuationMode })) };
    try { this.journal.setItem(this.journalKey, JSON.stringify(record)); }
    catch { throw new Error('即时草稿保存失败，请先复制当前输入或导出备份，检查浏览器存储空间。'); }
  }
  readCheckpoint() {
    try { return JSON.parse(this.journal?.getItem(this.journalKey) || 'null'); } catch { return null; }
  }
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
    let state = value ? normalizeState(value.state) : emptyState();
    const pending = this.readCheckpoint();
    if (pending && (pending.revision === this.revision || (value?.writer === pending.writer && (value.sequence || 0) < pending.sequence))) {
      state.settings = pending.settings; state.draft = pending.draft; state.editorDraft = pending.editorDraft || null;
      for (const s of state.stories) {
        const entry = pending.continuations?.find(c => c.id === s.id);
        if (entry) { s.continuationDraft = entry.continuationDraft; s.continuationMode = entry.continuationMode; }
      }
      state = normalizeState(state);
      await this.save(state);
      if (this.readCheckpoint()?.writer === pending.writer) this.journal?.removeItem(this.journalKey);
    }
    return state;
  }
  save(state) {
    const snapshot = clone(state), sequence = this.sequence;
    const work = () => new Promise((resolve, reject) => {
      const transaction = this.db.transaction('accounts', 'readwrite');
      const store = transaction.objectStore('accounts');
      let conflict = false;
      const request = store.get(this.scope);
      request.onsuccess = () => {
        if ((request.result?.revision || 0) !== this.revision) { conflict = true; transaction.abort(); return; }
        store.put({ revision: this.revision + 1, writer: this.writer, sequence, state: snapshot }, this.scope);
      };
      transaction.oncomplete = () => {
        this.revision++;
        const pending = this.readCheckpoint();
        if (pending?.writer === this.writer && pending.sequence <= sequence) {
          try { this.journal?.removeItem(this.journalKey); } catch { /* IndexedDB already committed. */ }
        }
        resolve();
      };
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
