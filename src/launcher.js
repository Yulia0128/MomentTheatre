// Only the launcher is public light DOM. Its ID-scoped stylesheet travels logically
// with it when a collector reparents the button; the application stays in Shadow DOM.
export function installLauncherStyle(document) {
  const style = document.createElement('style');
  style.id = 'shunxi-launcher-style';
  style.textContent = `
#shunxi-floating-launcher{all:initial;box-sizing:border-box;position:fixed;z-index:2147483000;display:flex;align-items:center;justify-content:center;width:32px;height:32px;min-width:32px;min-height:32px;padding:2.667px;margin:0;border:0!important;border-radius:50%;background:transparent!important;box-shadow:none!important;color:#282724;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;appearance:none;-webkit-appearance:none}
#shunxi-floating-launcher[data-theme="night"]{color:#e9e6df}
#shunxi-floating-launcher[hidden]{display:none!important}
#shunxi-floating-launcher:focus-visible{outline:2px solid currentColor;outline-offset:3px}
#shunxi-floating-launcher .mark{display:inline-flex;align-items:center;width:26.667px;pointer-events:none}
#shunxi-floating-launcher .mark svg{display:block;width:100%;height:auto;overflow:visible}
#shunxi-floating-launcher[data-theme="night"] .mark{filter:drop-shadow(0 0 1px #0005)}
#shunxi-floating-launcher .unread{position:absolute;right:3px;top:3px;width:7px;height:7px;border-radius:50%;background:currentColor;pointer-events:none}
#shunxi-floating-launcher .unread[hidden]{display:none!important}
#shunxi-floating-launcher :is(.mobius-trail,.mobius-spark){display:none;fill:none;stroke:#fff;stroke-linecap:round;pointer-events:none}
#shunxi-floating-launcher .mobius-trail{stroke-width:5;stroke-dasharray:6 94;opacity:.5;filter:blur(1px)}
#shunxi-floating-launcher .mobius-spark{stroke-width:3;stroke-dasharray:.1 99.9;filter:drop-shadow(0 0 1.3px #fff)}
#shunxi-floating-launcher.busy :is(.mobius-trail,.mobius-spark){display:block;animation:shunxi-launcher-flow 2.8s linear infinite}
#shunxi-floating-launcher.complete :is(.mobius-trail,.mobius-spark){display:block;animation:shunxi-launcher-flow 1.4s linear 2}
#shunxi-floating-launcher.complete .mark{animation:shunxi-launcher-finish .7s ease-in-out 3}
@keyframes shunxi-launcher-flow{to{stroke-dashoffset:-100}}
@keyframes shunxi-launcher-finish{50%{opacity:.55}}
@media(prefers-reduced-motion:reduce){#shunxi-floating-launcher :is(.mobius-trail,.mobius-spark),#shunxi-floating-launcher.complete .mark{animation:none!important}#shunxi-floating-launcher.busy .mobius-spark{stroke-dashoffset:-16}}
`;
  document.head.append(style);
  return () => style.remove();
}
