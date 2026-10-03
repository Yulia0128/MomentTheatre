// Expand the existing top-layer shell. Moving or rebuilding an iframe would
// reload opaque HTML games and discard their live state and scroll position.
export function readingIcon(collapse = false) {
  const path = collapse
    ? 'M20 10h-4a2 2 0 0 1-2-2V4M4 14h4a2 2 0 0 1 2 2v4'
    : 'M14 4h4a2 2 0 0 1 2 2v4M10 20H6a2 2 0 0 1-2-2v-4';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}
export function readerFullscreen(shell, workspace) {
  let active = null;
  const exit = (focus = true) => {
    if (!active) return;
    const previous = active; active = null;
    shell.classList.remove('reading-fullscreen'); delete shell.dataset.readingMode;
    for (const node of previous.hidden) node.removeAttribute('inert');
    workspace.scrollTop = previous.scrollTop;
    previous.opener.setAttribute('aria-expanded', 'false');
    if (focus && previous.opener.isConnected) previous.opener.focus({ preventScroll: true });
  };
  const cancel = event => { if (active) { event.preventDefault(); exit(); } };
  const close = () => exit(false);
  shell.addEventListener('cancel', cancel); shell.addEventListener('close', close);
  return {
    enter(surface, opener, mode) {
      if (active || !shell.open || !surface?.isConnected) return;
      const hidden = [...shell.children].filter(node => node !== workspace && !node.inert);
      for (const sibling of surface.parentElement.children) if (sibling !== surface && !sibling.inert) hidden.push(sibling);
      active = { opener, hidden, scrollTop: workspace.scrollTop };
      for (const node of hidden) node.inert = true;
      shell.dataset.readingMode = mode; shell.classList.add('reading-fullscreen');
      opener.setAttribute('aria-expanded', 'true');
      surface.querySelector('.reader-collapse').focus({ preventScroll: true });
    },
    exit,
    dispose() { exit(false); shell.removeEventListener('cancel', cancel); shell.removeEventListener('close', close); }
  };
}
