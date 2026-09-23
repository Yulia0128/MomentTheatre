export function errorRecord(error, stage = '操作', secret = '') {
  let message = String(error?.message || error || '未知错误');
  if (/^\s*(?:<none>|undefined|null)\s*$/i.test(message)) message = '接口未提供有效错误详情（原始返回：' + message.trim() + '）。已收到的内容会保留，可再次补足。';
  if (secret) message = message.split(secret).join('[已隐藏]');
  message = message.replace(/Bearer\s+[^\s"',}]+/gi, 'Bearer [已隐藏]').replace(/\bsk-[\w-]+/g, '[已隐藏]');
  const status = Number(error?.status) || Number(message.match(/(?:status|HTTP|code|error)[^\d]{0,20}([45]\d{2})/i)?.[1]) || Number(message.match(/\b(429|401|403|502|503|504)\b/)?.[1]);
  return { time: Date.now(), stage, code: status ? `HTTP ${status}` : error?.code || (error?.name === 'AbortError' ? 'ABORTED' : /fetch|network|网络/i.test(message) ? 'NETWORK_ERROR' : 'ERROR'), message: message.slice(0, 1500) };
}
