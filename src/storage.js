import { emptyState, normalizeState, clone, id } from './model.js';
import { packAvatars, unpackAvatars, avatarReferences } from './avatar-assets.js';

export class LibraryStore {
  constructor(scope, indexedDBFactory = globalThis.indexedDB, journalStorage = null) {
    this.scope = scope; this.factory = indexedDBFactory; this.revision = 0; this.queue = Promise.resolve();
    this.writer = id(); this.sequence = 0; this.syncEpoch = 0; this.activeSync = null; this.journalKey = `shunxi:${scope}:pending-input`;
    try { this.journal = journalStorage || globalThis.localStorage; } catch { this.journal = null; }
  }
  checkpoint(state) {
    if (this.activeSync) { try { this.activeSync.abort(); } catch { /* Already committed: journal recovers newer input. */ } }
    this.sequence++;
    if (!this.journal) return;
    // Confirmed phone appearance lives in IndexedDB. Embedded avatars can exceed
    // localStorage's quota even when both uploads are within their size limit.
    // They are not keystroke drafts, so never duplicate them in this journal.
    const settings = { ...state.settings }; delete settings.phoneAppearance;
    const record = { writer: this.writer, sequence: this.sequence, revision: this.revision,
      draft: state.draft, settings, retainPhoneAppearance: true, editorDraft: state.editorDraft, scriptDrafts: state.scriptDrafts,
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
      const request = this.factory.open('shunxi-library', 2);
      let abandoned = false;
      const fail = error => { abandoned = true; reject(error); };
      this.cancelOpen = () => fail(new Error('资料库读取已取消。'));
      request.onupgradeneeded = () => {
        if (abandoned) { request.transaction.abort(); return; }
        if (!request.result.objectStoreNames.contains('accounts')) request.result.createObjectStore('accounts');
        if (!request.result.objectStoreNames.contains('avatars')) request.result.createObjectStore('avatars');
      };
      request.onsuccess = () => { if (abandoned) request.result.close(); else { this.cancelOpen = null; resolve(request.result); } };
      request.onerror = () => fail(new Error('番外资料库打开失败，请检查浏览器存储权限。'));
      request.onblocked = () => fail(new Error('资料库正在其他页面升级，请关闭旧页面后重试。'));
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
    const decoded = await this.decodeRow(value);
    this.syncMeta = decoded?.syncMeta || null;
    let state = decoded ? normalizeState(decoded.state) : emptyState();
    const pending = this.readCheckpoint();
    if (pending && (pending.revision === this.revision || (value?.writer === pending.writer && (value.sequence || 0) < pending.sequence))) {
      const appearance = pending.retainPhoneAppearance && Object.hasOwn(state.settings, 'phoneAppearance') ? { phoneAppearance: state.settings.phoneAppearance } : {};
      state.settings = { ...pending.settings, ...appearance }; state.draft = pending.draft; state.editorDraft = pending.editorDraft || null;
      if (Array.isArray(pending.scriptDrafts)) state.scriptDrafts = pending.scriptDrafts;
      for (const s of state.stories) {
        const entry = pending.continuations?.find(c => c.id === s.id);
        if (entry) { s.continuationDraft = entry.continuationDraft; s.continuationMode = entry.continuationMode; }
      }
      state = normalizeState(state);
      await this.save(state);
      if (this.readCheckpoint()?.writer === pending.writer) this.journal?.removeItem(this.journalKey);
    }
    // Migrate inline images only after successfully decoding the legacy state.
    if (value && value.storageVersion !== 2 && !pending) await this.save(state);
    return state;
  }
  async decodeRow(row) {
    if (!row || row.storageVersion === undefined) return row;
    if (row.storageVersion !== 2) throw new Error('资料库版本不支持，请更新瞬息。');
    const refs = avatarReferences(row), assets = new Map();
    if (refs.size) await new Promise((resolve, reject) => {
      const tx = this.db.transaction('avatars'), store = tx.objectStore('avatars');
      for (const hash of refs) { const req = store.get([this.scope, hash]); req.onsuccess = () => assets.set(hash, req.result); }
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(new Error('读取头像失败，原资料未覆盖。'));
    });
    return unpackAvatars(row, assets);
  }
  save(state, { syncMeta = this.syncMeta, recovery = false, expectedRevision = null, expectedSequence = null } = {}) {
    const metadata = clone(syncMeta || null), packed = packAvatars({ state, syncMeta: metadata }), sequence = this.sequence, epoch = this.syncEpoch;
    const work = () => new Promise((resolve, reject) => {
      if (epoch !== this.syncEpoch) { reject(new Error('同步后资料已更新，已阻止旧的待保存内容覆盖合并结果。')); return; }
      const transaction = this.db.transaction(['accounts', 'avatars'], 'readwrite');
      if (expectedRevision !== null) this.activeSync = transaction;
      const store = transaction.objectStore('accounts');
      const avatars = transaction.objectStore('avatars');
      let conflict = false;
      const request = store.get(this.scope);
      request.onsuccess = () => {
        if ((request.result?.revision || 0) !== this.revision || (expectedRevision !== null && expectedRevision !== this.revision) || (expectedSequence !== null && expectedSequence !== this.sequence)) { conflict = true; transaction.abort(); return; }
        const previous = request.result;
        const recoveryRequest = store.get(this.scope + ':sync-recovery');
        recoveryRequest.onsuccess = () => {
          // Recovery, main record and assets commit together. Old inline recovery
          // snapshots also migrate, without creating a second image copy.
          const savedRecovery = recovery && previous ? previous : recoveryRequest.result;
          const compactRecovery = savedRecovery ? packAvatars(savedRecovery) : null;
          const assets = new Map([...packed.assets, ...(compactRecovery?.assets || [])]);
          const refs = new Set([...avatarReferences(packed.data), ...avatarReferences(compactRecovery?.data)]);
          for (const [hash, url] of assets) {
            const existing = avatars.get([this.scope, hash]);
            existing.onsuccess = () => { if (existing.result === undefined) avatars.put(url, [this.scope, hash]); };
          }
          if (compactRecovery) store.put({ ...compactRecovery.data, storageVersion: 2 }, this.scope + ':sync-recovery');
          store.put({ revision: this.revision + 1, writer: this.writer, sequence, storageVersion: 2, ...packed.data }, this.scope);
          const cursor = avatars.openCursor();
          cursor.onsuccess = () => {
            const item = cursor.result; if (!item) return;
            if (item.key[0] === this.scope && !refs.has(item.key[1])) item.delete();
            item.continue();
          };
        };
      };
      transaction.oncomplete = () => {
        this.revision++; this.syncMeta = metadata;
        if (expectedRevision !== null) this.syncEpoch++;
        if (this.activeSync === transaction) this.activeSync = null;
        const pending = this.readCheckpoint();
        if (pending?.writer === this.writer && pending.sequence <= sequence) {
          try { this.journal?.removeItem(this.journalKey); } catch { /* IndexedDB already committed. */ }
        }
        resolve();
      };
      transaction.onabort = transaction.onerror = () => { if (this.activeSync === transaction) this.activeSync = null; reject(new Error(conflict
        ? '另一页面已修改资料，请先导出当前备份，再刷新以载入最新内容。为避免覆盖，本次未保存。'
        : '保存失败，可能是浏览器空间不足或同步期间出现新输入。请先导出备份，保留当前页面。')); };
    });
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }
  async syncRecovery() {
    const row = await new Promise((resolve,reject)=>{
      const request=this.db.transaction('accounts').objectStore('accounts').get(this.scope+':sync-recovery');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    return (await this.decodeRow(row))?.state || null;
  }
  async close() { this.cancelOpen?.(); this.cancelOpen = null; await this.queue; this.db?.close(); }
}
