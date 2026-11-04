import { normalizeState, clone, id } from './model.js';
import { packAvatars, unpackAvatars, avatarReferences } from './avatar-assets.js';
import {LibraryVersions,VERSION_STORES} from './storage-versions.js';
import {StorageCompute} from './storage-compute.js';

export class LibraryStore {
  constructor(scope, indexedDBFactory = globalThis.indexedDB, journalStorage = null) {
    this.knownAssets = new Set(); this.knownImages = new Map(); this.scope = scope; this.factory = indexedDBFactory; this.revision = 0; this.queue = Promise.resolve();
    this.writer = id(); this.sequence = 0; this.persistedSequence = 0; this.syncEpoch = 0; this.activeSync = null; this.journalKey = `shunxi:${scope}:pending-input`;
    this.health={kind:'loading',writable:false,issues:[]};
    this.compute=new StorageCompute();
    try { this.journal = journalStorage || globalThis.localStorage; } catch { this.journal = null; }
  }
  checkpoint(state) {
    if(!this.health.writable)throw new Error('资料正在保护性只读，输入未写回。');
    if (this.activeSync) { try { this.activeSync.abort(); } catch { /* Already committed: journal recovers newer input. */ } }
    this.sequence++;
    if (!this.journal) return;
    // Confirmed phone appearance lives in IndexedDB. Embedded avatars can exceed
    // localStorage's quota even when both uploads are within their size limit.
    // They are not keystroke drafts, so never duplicate them in this journal.
    const settings = { ...state.settings }; delete settings.phoneAppearance;
    const record = { writer: this.writer, sequence: this.sequence, revision: this.revision,
      draft: state.draft, settings: packAvatars(settings, { knownHashes: this.knownAssets, knownUrls: this.knownImages }).data, packedStickerImages: true, retainPhoneAppearance: true, editorDraft: state.editorDraft, scriptDrafts: state.scriptDrafts,
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
      const request = this.factory.open('shunxi-library', 3);
      let abandoned = false;
      const fail = error => { abandoned = true; reject(error); };
      this.cancelOpen = () => fail(new Error('资料库读取已取消。'));
      request.onupgradeneeded = () => {
        if (abandoned) { request.transaction.abort(); return; }
        for(const name of VERSION_STORES)if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);
      };
      request.onsuccess = () => { if (abandoned) request.result.close(); else { this.cancelOpen = null; resolve(request.result); } };
      request.onerror = () => fail(new Error('番外资料库打开失败，请检查浏览器存储权限。'));
      request.onblocked = () => fail(new Error('资料库正在其他页面升级，请关闭旧页面后重试。'));
    });
    this.db.onversionchange = () => {this.health={kind:'closed',writable:false,issues:[{stage:'versionchange'}]};this.onHealth?.(this.health);this.db.close();};
    this.versions=new LibraryVersions(this);
    return this.load();
  }
  async load() {
    this.migratedFrom=null;
    let state=await this.versions.load();
    if(!this.health.writable)return state;
    const pending = this.readCheckpoint();
    const manifest=this.versions.current?.manifest;
    if (pending && (pending.revision === this.revision || pending.revision===this.migratedFrom?.revision || (manifest?.writer === pending.writer && (manifest.sequence || 0) < pending.sequence))) {
      const appearance = pending.retainPhoneAppearance && Object.hasOwn(state.settings, 'phoneAppearance') ? { phoneAppearance: state.settings.phoneAppearance } : {};
      const pendingSettings = pending.packedStickerImages ? (await this.decodeRow({ storageVersion: 2, settings: pending.settings })).settings : pending.settings;
      state.settings = { ...pendingSettings, ...appearance }; state.draft = pending.draft; state.editorDraft = pending.editorDraft || null;
      if (Array.isArray(pending.scriptDrafts)) state.scriptDrafts = pending.scriptDrafts;
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
  async decodeRow(row) {
    if (!row || row.storageVersion === undefined) return row;
    if (row.storageVersion !== 2) throw new Error('资料库版本不支持，请更新瞬息。');
    const refs = avatarReferences(row), assets = new Map();
    if (refs.size) await new Promise((resolve, reject) => {
      const tx = this.db.transaction('avatars'), store = tx.objectStore('avatars');
      for (const hash of refs) { const req = store.get([this.scope, hash]); req.onsuccess = () => assets.set(hash, req.result); }
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(new Error('读取头像失败，原资料未覆盖。'));
    });
    const decoded = unpackAvatars(row, assets);
    for (const hash of refs) { this.knownAssets.add(hash); this.knownImages.set(assets.get(hash), hash); }
    return decoded;
  }
  save(state, { syncMeta = this.syncMeta, recovery = false, expectedRevision = null, expectedSequence = null } = {}) {
    if(!this.health.writable)return Promise.reject(new Error('资料正在保护性只读，不能保存或同步。'));
    const snapshot=clone(state),metadata=clone(syncMeta||null),sequence=this.sequence,epoch=this.syncEpoch;
    const work=()=>this.versions.commit(snapshot,{syncMeta:metadata,recovery,expectedRevision,expectedSequence,sequence,epoch});
    const result=this.queue.then(work);this.queue=result.catch(()=>{});return result;
  }
  async syncRecovery() {
    if(!this.health.writable)throw new Error('资料完整性尚未确认，不能导出完整同步备份。');
    return clone(this.versions.current?.value.recovery||null);
  }
  diagnostic(){
    const stages={};for(const item of this.health.issues||[])stages[item.stage]=(stages[item.stage]||0)+1;
    return {format:'momenttheatre-storage-diagnostic',version:1,databaseVersion:this.db?.version||0,health:this.health.kind,revision:this.revision,stages,durability:this.durability||'unknown'};
  }
  async close() { this.cancelOpen?.(); this.cancelOpen = null; await this.queue; this.compute.close(); this.db?.close(); }
}
