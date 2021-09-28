// import { printLine } from './modules/print';
console.log('Content script executed');

window.addEventListener("routeChangeComplete", run, false);
window.addEventListener("load", run, false);

function run() {
  if (location.pathname != '/auth-extension') return;

  console.log('Content script running!');
  if (!localStorage['supabase.auth.token']) return;

  const token = JSON.parse(localStorage['supabase.auth.token']);
  chrome.runtime.sendMessage({ action: "auth", payload: token });
}
