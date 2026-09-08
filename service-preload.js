// Injected (isolated world) into each service view. The main-world Notification
// override (installed by main via executeJavaScript, which bypasses the site's
// CSP) posts a window message on each notification; we forward it to the main
// process, which shows a NATIVE notification whose click can raise the window.
// window.postMessage crosses from the page's main world to this isolated
// preload because both share the same DOM 'message' event target.
const { ipcRenderer } = require("electron");

window.addEventListener("message", function (e) {
  const d = e && e.data;
  if (d && d.__nishroNotify) ipcRenderer.send("service-notify", d.__nishroNotify);
});
