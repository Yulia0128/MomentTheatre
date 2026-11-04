// Device/account-local routing only. Never included in backups or cloud snapshots.
export class LibraryLocation {
  constructor(scope, storage = undefined) {
    this.scope = scope; this.key = `shunxi:${scope}:active-library`;
    try { this.storage = storage === undefined ? globalThis.localStorage : storage; } catch { this.storage = null; }
  }
  route(generation) {
    return generation ? { generation, scope: `${this.scope}:workspace:${generation}`, databaseName: `shunxi-library-workspace-${generation}` }
      : { generation: 0, scope: this.scope, databaseName: 'shunxi-library' };
  }
  current() {
    const raw = this.storage?.getItem(this.key);
    if (!raw) return this.route(0);
    let marker; try { if (raw.length > 200) throw Error(); marker = JSON.parse(raw); } catch { throw Error('资料库入口记录无法读取。'); }
    if (marker?.version !== 1 || !Number.isSafeInteger(marker.generation) || marker.generation < 1) throw Error('资料库入口记录无效。');
    return this.route(marker.generation);
  }
  next() {
    const generation = this.current().generation + 1;
    if (!Number.isSafeInteger(generation)) throw Error('无法创建新的资料库入口。');
    return this.route(generation);
  }
  activate(route) {
    if (!this.storage) throw Error('无法记住新的资料库，请检查浏览器存储权限。');
    const current = this.current().generation;
    if (route.generation !== current && route.generation !== current + 1) throw Error('资料库已在另一页面切换，请重试。');
    this.storage.setItem(this.key, JSON.stringify({ version: 1, generation: route.generation }));
    if (this.current().generation !== route.generation) throw Error('新的资料库入口保存失败，请重试。');
  }
}
