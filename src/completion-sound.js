import { COMPLETION_AUDIO } from './completion-audio.js';

// Resume synchronously from the Generate click, before the first asynchronous request.
// Audio is optional: a blocked/suspended device never prevents saving the story.
export function completionSound(createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)()) {
  let context, ready, source, disposed = false, revision = 0;
  function stop() { if (source) { try { source.stop(); source.disconnect(); } catch {} source = null; } }
  function prepare() {
    if (disposed) return;
    revision++; stop();
    try {
      context ||= createContext();
      Promise.resolve(context.resume()).catch(() => {});
      ready ||= context.decodeAudioData(Uint8Array.from(atob(COMPLETION_AUDIO), c => c.charCodeAt(0)).buffer)
        .catch(() => { ready = null; return null; });
    } catch { /* Missing audio capability is not a generation error. */ }
  }
  async function play() {
    const ticket = revision;
    try {
      const buffer = await ready;
      // Do not queue a stale notification to play on a later user interaction.
      if (!buffer || disposed || ticket !== revision || context.state !== 'running') return false;
      stop();
      const node = context.createBufferSource(); source = node;
      node.buffer = buffer; node.connect(context.destination);
      node.onended = () => { node.disconnect(); if (source === node) source = null; };
      node.start(); return true;
    } catch { return false; }
  }
  function dispose() {
    disposed = true; revision++; stop();
    try { Promise.resolve(context?.close()).catch(() => {}); } catch {}
  }
  return { prepare, play, dispose };
}
