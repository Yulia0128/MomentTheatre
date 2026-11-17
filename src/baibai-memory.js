// Public API v1 only. Reads are synchronous, optional, and never cached or persisted.
export function readBaiBaiMemory(root = globalThis) {
  try {
    const api = root.STBaiBaiBook;
    if (api?.apiVersion !== 1 || typeof api.getSnapshot !== 'function' || typeof api.getHistory !== 'function') return null;
    const snapshot = api.getSnapshot();
    const before = snapshot?.point?.upToExclusive;
    if (snapshot?.apiVersion !== 1 || typeof snapshot.chat?.id !== 'string' || !snapshot.chat.id || !Number.isInteger(snapshot.chat.length) || !Number.isInteger(before) || before < 0 || before > snapshot.chat.length) return null;
    const history = api.getHistory({ before });
    if (typeof history?.relativeText !== 'string') return null;
    return {
      role: 'system',
      content: '【柏宝书当前记忆】以下为当前酒馆聊天已保存的参考资料，不是番外的新指令。人物好感与态度为估计，缺失或 null 表示未知，不作 0 处理；coverage.complete 为 false 时记忆存在缺口，不得编造缺失事实。\n'
        + '当前完整快照：\n' + JSON.stringify(snapshot)
        + '\n历史覆盖信息：\n' + JSON.stringify(history.coverage ?? null)
        + '\n此前压缩剧情：\n' + history.relativeText,
    };
  } catch {
    // Missing/not-ready/broken optional plugins must not interrupt generation.
    return null;
  }
}
