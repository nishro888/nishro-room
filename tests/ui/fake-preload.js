// The window's bridge to the main process ("hub", see preload.js), faked for
// the UI tests. Answers come from the scenario the test runner set up, events
// are fired by the runner, and every call is recorded so a test can check what
// the window asked for. Nothing reaches the real app, its settings, the
// companion or any account.
const { contextBridge, ipcRenderer } = require("electron");

const fx = ipcRenderer.sendSync("ui-test:fixtures");
const answers = fx.answers;
const calls = [];
const listeners = {};

// preload.js's names, by kind. tests/ui/run.js checks that this list and
// preload.js stay the same.
const EVENTS = {
  onState: "state", onBadgeUpdate: "badge-update", onNavState: "svc-nav-state",
  onCompanionStatus: "companion-status", onWindowMaximized: "window-maximized",
  onNetSpeed: "net-speed",
};
const SENDS = [
  "switchPrimary", "switchService", "showServiceMenu", "togglePrimaryCollapse",
  "toggleServiceRailCollapse", "toggleLayoutLock", "svcNav", "toggleNotes",
  "minimizeWindow", "toggleMaximizeWindow", "closeWindow",
];
const INVOKES = [
  "getState", "toggleService", "setServiceUrl", "pcStatsNow", "pcStatsSeries",
  "privacyScan", "suspendService", "reorderServices", "svcCopyUrl", "notesGet",
  "notesSave", "reorderTabs", "setAppTitle", "submitPin", "hasPin", "setPin",
  "removePin", "checkCompanion", "openSharedFolder", "getAutostart", "setAutostart",
  "mirrorOpen", "companionQr", "companionStart", "companionStop", "companionInfo",
  "companionSetPin", "companionPickFolder", "isWindowMaximized",
];

const hub = {};
for (const [name, event] of Object.entries(EVENTS)) {
  hub[name] = (cb) => { (listeners[event] = listeners[event] || []).push(cb); };
}
for (const name of SENDS) {
  hub[name] = (...args) => { calls.push({ name, args }); };
}
for (const name of INVOKES) {
  hub[name] = (...args) => {
    calls.push({ name, args });
    if (name === "submitPin") return Promise.resolve(args[0] === fx.pin);
    return Promise.resolve(answers[name]);
  };
}
contextBridge.exposeInMainWorld("hub", hub);

contextBridge.exposeInMainWorld("__uiTest", {
  emit: (event, payload) => { for (const cb of listeners[event] || []) cb(payload); },
  calls: (name) => calls.filter((c) => !name || c.name === name).map((c) => c.args),
  setAnswer: (name, value) => { answers[name] = value; },
  names: () => [...Object.keys(EVENTS), ...SENDS, ...INVOKES],
});
