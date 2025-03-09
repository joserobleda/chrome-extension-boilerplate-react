// import { printLine } from './modules/print';
console.log('Content script executed');
chrome.runtime.sendMessage({ action: "wakeup" });

window.addEventListener("routeChangeComplete", run, false);
window.addEventListener("load", run, false);

function run() {
  if (location.pathname != '/auth-extension') return;
  if (!localStorage['sb-127-auth-token']) return;

  const token = JSON.parse(localStorage['sb-127-auth-token']);
  chrome.runtime.sendMessage({ action: "auth", payload: token });
}
