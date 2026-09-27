// Connection probes must not inherit long-form streaming behavior or mutate settings.
export async function probeConnection(host, settings, { timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('测试连接超时，请稍后重试。');
      error.code = 'CONNECTION_TIMEOUT'; reject(error); controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([host.generate({
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      settings: { ...settings, maxTokens: 256, stream: false }, snapshot: null, signal: controller.signal,
    }), timeout]);
  } finally { clearTimeout(timer); }
}
