const ICONS = {
  facebook: `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#1877F2"/><path fill="#fff" d="M15.6 8.6h-1.9c-.4 0-.7.2-.7.7v1.8h2.5l-.3 2.4h-2.2V19h-2.5v-5.5H8.4v-2.4h2.1V9.2c0-2 1.2-3.4 3.3-3.4.9 0 1.6.1 1.8.1v2.7z"/></svg>`,
  messenger: `<svg viewBox="0 0 24 24"><defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00B2FF"/><stop offset=".5" stop-color="#B620E0"/><stop offset="1" stop-color="#F30C43"/></linearGradient></defs><rect width="24" height="24" rx="12" fill="url(#mg)"/><path fill="#fff" d="M12 5.4c-4 0-7.1 2.9-7.1 6.8 0 2.2 1 4.1 2.7 5.4v2.6l2.5-1.4c.6.2 1.3.3 2 .3 4 0 7.1-2.9 7.1-6.9s-3.2-6.8-7.2-6.8zm.8 9.1-1.8-1.9-3.6 2 4-4.2 1.8 1.9 3.5-2z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FFDC80"/><stop offset=".3" stop-color="#F77737"/><stop offset=".6" stop-color="#F0087C"/><stop offset="1" stop-color="#B620E0"/></linearGradient></defs><rect width="24" height="24" rx="7" fill="url(#ig)"/><rect x="6" y="6" width="12" height="12" rx="4" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="16.3" cy="7.7" r="1" fill="#fff"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#25D366"/><path fill="#fff" d="M12 5.6a6.4 6.4 0 0 0-5.4 9.9l-.9 3.2 3.3-.9A6.4 6.4 0 1 0 12 5.6zm3.8 9.1c-.2.5-1 .9-1.4 1-.4.1-.8.1-1.3-.1-.3-.1-.7-.2-1.2-.5-2-.9-3.4-3-3.5-3.1-.1-.1-.8-1.1-.8-2.1s.5-1.5.7-1.7c.2-.2.4-.3.6-.3h.4c.1 0 .3 0 .5.4.2.5.6 1.6.7 1.7.1.1.1.3 0 .4-.1.2-.2.3-.3.4-.1.1-.3.3-.4.4-.1.1-.3.3-.1.6.2.3.7 1.1 1.5 1.7.9 1 1.8 1.3 2.1 1.4.3.1.4.1.6-.1.1-.2.6-.7.7-.9.1-.2.3-.2.5-.1.2.1 1.3.6 1.5.7.2.1.3.2.4.3 0 .2 0 .5-.2 1z"/></svg>`,
  telegram: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#26A5E4"/><path fill="#fff" d="M17.6 7.1 15.6 17c-.2.7-.6.9-1.2.5l-3.3-2.4-1.6 1.5c-.2.2-.3.3-.6.3l.2-3.1 5.7-5.1c.2-.2-.1-.3-.4-.1L7.3 12l-3-.9c-.7-.3-.7-.7.1-1L16.1 6c.6-.2 1.1.1.9 1.1z"/></svg>`,
  discord: `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#5865F2"/><g transform="translate(3.4,4.7) scale(0.71)"><path fill="#fff" d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></g></svg>`,
  github: `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#1B1F24"/><g transform="translate(2.4,2.4) scale(0.8)"><path fill="#fff" d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.56 9.56 0 015 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.01 10.01 0 0022 12c0-5.52-4.48-10-10-10z"/></g></svg>`,
  linkedin: `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="#0A66C2"/><text x="12" y="16.3" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="10.5" fill="#fff" text-anchor="middle">in</text></svg>`,
  gmail: `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#fff"/><path fill="#EA4335" d="M4 8.3 12 14l8-5.7v2L12 16 4 10.3z"/><path fill="#4285F4" d="M17.4 6.5h1.5c.7 0 1.2.5 1.2 1.2v9c0 .7-.5 1.2-1.2 1.2h-1.5V6.5z"/><path fill="#34A853" d="M5.1 17.9h1.5V6.5H5.1c-.7 0-1.2.5-1.2 1.2v9c0 .7.5 1.2 1.2 1.2z"/><path fill="#FBBC05" d="M6.6 6.5h10.8v3L12 14 6.6 9.5z"/><path fill="#C5221F" d="M6.6 6.5 12 10.9l5.4-4.4-1-1.5-4.4 3.6-4.4-3.6z"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#FF0000"/><path fill="#fff" d="M9.8 8.1 16.4 12 9.8 15.9z"/></svg>`,
};

let state = { services: [], enabled: {}, suspended: [], order: [], primary: "social", service: null, primaryCollapsed: false, serviceRailCollapsed: false, layoutLocked: false };
const nameOf = (id) => (state.services.find((s) => s.id === id) || {}).name || id;

// ------------------------------------------------------------------- lock

async function initLock() {
  const st = await window.hub.getState();
  if (st.hasPin) showLock();
  else showShell();
}
function lockChrome(hidden) {
  // hide the interactive title-bar chrome while locked (window controls stay)
  const v = hidden ? "hidden" : "";
  document.getElementById("primary-tabs").style.visibility = v;
  const tb = document.getElementById("tb-notes"); if (tb) tb.style.visibility = v;
}
function showLock() {
  document.getElementById("lock-screen").style.display = "flex";
  document.getElementById("app-shell").style.display = "none";
  // a PIN is set -> this is the UNLOCK screen; the "skip" bypass must not appear
  document.getElementById("lock-skip").style.display = "none";
  document.getElementById("lock-sub").textContent = "Enter your PIN to continue";
  lockChrome(true);
  document.getElementById("lock-input").focus();
}
function showShell() {
  document.getElementById("lock-screen").style.display = "none";
  document.getElementById("app-shell").style.display = "flex";
  lockChrome(false);
}
document.getElementById("lock-submit").addEventListener("click", async () => {
  const ok = await window.hub.submitPin(document.getElementById("lock-input").value);
  if (ok) showShell();
  else { document.getElementById("lock-error").textContent = "Wrong PIN."; document.getElementById("lock-input").value = ""; }
});
document.getElementById("lock-input").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("lock-submit").click(); });
document.getElementById("lock-skip").addEventListener("click", showShell);

// ------------------------------------------------------------------ state

window.hub.onState((s) => { state = s; render(); });

function render() {
  renderTabs();

  // service rail visibility (Social only) + collapse
  const inSocial = state.primary === "social";
  const rail = document.getElementById("service-rail");
  rail.classList.toggle("hidden", !inSocial);
  rail.classList.toggle("collapsed", state.serviceRailCollapsed);

  // lock state reflected on the rail's lock button (icon only: open vs closed)
  document.getElementById("rail-lock").classList.toggle("locked", state.layoutLocked);
  document.getElementById("rail-lock-wrap").classList.toggle("locked", state.layoutLocked);
  document.getElementById("rail-lock").title = state.layoutLocked ? "Icons locked - click to unlock" : "Icons unlocked - click to lock";

  // quick-notes drawer
  const notesDrawer = document.getElementById("notes-drawer");
  const notesWasOpen = notesDrawer.classList.contains("open");
  notesDrawer.classList.toggle("open", !!state.notesOpen);
  document.getElementById("tb-notes").classList.toggle("active", !!state.notesOpen);
  if (state.notesOpen && !notesWasOpen) setTimeout(() => document.getElementById("notes-editor").focus(), 130);

  // panels
  document.getElementById("panel-settings").style.display = state.primary === "settings" ? "block" : "none";
  document.getElementById("panel-pccompanion").style.display = state.primary === "pccompanion" ? "block" : "none";

  renderServiceRail();
  renderSettingsServices();
  renderDevUrls();
  if (state.appearance) applyAppearanceVisuals(state.appearance);
}

// ------------------------------------------------------------- top tabs

const TAB_DEFS = {
  social: { name: "Social", svg: `<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>` },
  pccompanion: { name: "PC Companion", svg: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>` },
  settings: { name: "Settings", svg: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>` },
};
let tabDragId = null;
function renderTabs() {
  const nav = document.getElementById("primary-tabs");
  nav.innerHTML = "";
  const order = (state.tabOrder && state.tabOrder.length) ? state.tabOrder : ["social", "pccompanion", "settings"];
  for (const id of order) {
    const def = TAB_DEFS[id];
    if (!def) continue;
    const btn = document.createElement("button");
    btn.className = "tab-btn" + (id === state.primary ? " active" : "");
    btn.dataset.primary = id;
    btn.draggable = true;
    btn.title = def.name; // discoverable when labels collapse to icons at narrow widths
    btn.innerHTML = def.svg + `<span>${def.name}</span>`;
    btn.addEventListener("click", () => window.hub.switchPrimary(id));
    btn.addEventListener("dragstart", (e) => { tabDragId = id; btn.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
    btn.addEventListener("dragend", () => { tabDragId = null; document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("dragging", "drop-left", "drop-right")); });
    btn.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (tabDragId === id) return;
      const before = e.offsetX < btn.offsetWidth / 2;
      btn.classList.toggle("drop-left", before);
      btn.classList.toggle("drop-right", !before);
    });
    btn.addEventListener("dragleave", () => btn.classList.remove("drop-left", "drop-right"));
    btn.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!tabDragId || tabDragId === id) return;
      const before = btn.classList.contains("drop-left");
      const arr = order.filter((x) => x !== tabDragId);
      const idx = arr.indexOf(id);
      arr.splice(before ? idx : idx + 1, 0, tabDragId);
      window.hub.reorderTabs(arr);
    });
    nav.appendChild(btn);
  }
}

// ------------------------------------------------------------- appearance UI
// The icon is fixed (the red "N", a static <img> in the title bar + Settings).
// Only the app name is editable.

function applyAppearanceVisuals(a) {
  document.getElementById("brand-text").textContent = a.appTitle || "Nishro Room";
}

let appearanceInitialized = false;
function syncAppearanceInputs(a) {
  if (appearanceInitialized || !a) return;
  appearanceInitialized = true;
  document.getElementById("app-title-input").value = a.appTitle || "";
}

// ------------------------------------------------------------ service rail

function renderServiceRail() {
  const container = document.getElementById("service-icons");
  container.innerHTML = "";
  for (const id of state.order) {
    if (state.enabled[id] === false) continue;

    const isSuspended = (state.suspended || []).includes(id);
    const btn = document.createElement("button");
    btn.className = "svc-btn" + (id === state.service ? " active" : "") + (state.layoutLocked ? " locked" : "") + (isSuspended ? " suspended" : "");
    btn.dataset.id = id;
    btn.innerHTML = ICONS[id];
    btn.title = isSuspended ? nameOf(id) + " (paused - click to resume)" : nameOf(id);
    btn.addEventListener("click", () => window.hub.switchService(id));   // resumes if paused
    btn.addEventListener("contextmenu", (e) => { e.preventDefault(); window.hub.showServiceMenu(id); });

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.style.display = "none";
    badge.dataset.badgeFor = id;
    btn.appendChild(badge);

    // dragging only when unlocked - locked icons are click-only
    if (!state.layoutLocked) {
      btn.draggable = true;
      attachDrag(btn, id);
    }
    container.appendChild(btn);
  }
  applyBadges();
}

// drag-to-reorder: drop the dragged icon before/after the icon under the
// cursor (by vertical midpoint), then persist the new full order.
let dragId = null;
function attachDrag(btn, id) {
  btn.addEventListener("dragstart", (e) => { dragId = id; btn.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
  btn.addEventListener("dragend", () => { dragId = null; document.querySelectorAll(".svc-btn").forEach((b) => b.classList.remove("dragging", "drop-before", "drop-after")); });
  btn.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (dragId === id) return;
    const before = e.offsetY < btn.offsetHeight / 2;
    btn.classList.toggle("drop-before", before);
    btn.classList.toggle("drop-after", !before);
  });
  btn.addEventListener("dragleave", () => btn.classList.remove("drop-before", "drop-after"));
  btn.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!dragId || dragId === id) return;
    const before = btn.classList.contains("drop-before");
    const order = state.order.filter((x) => x !== dragId);
    const idx = order.indexOf(id);
    order.splice(before ? idx : idx + 1, 0, dragId);
    window.hub.reorderServices(order);
  });
}

// ------------------------------------------------------------------ badges

let latestBadges = {};
window.hub.onBadgeUpdate((counts) => { latestBadges = counts; applyBadges(); });
function applyBadges() {
  for (const [id, count] of Object.entries(latestBadges)) {
    const el = document.querySelector(`.badge[data-badge-for="${id}"]`);
    if (!el) continue;
    if (count > 0) { el.textContent = count > 99 ? "99+" : String(count); el.style.display = "flex"; }
    else el.style.display = "none";
  }
}

// Top-tab click/drag handlers are attached per-button inside renderTabs().

// -------------------------------------------------------- collapse / reveal

// Both controls just flip serviceRailCollapsed: the collapse chevron shows in
// the open bar, the expand chevron fades in on hover of the thin collapsed edge.
document.getElementById("rail-collapse").addEventListener("click", () => window.hub.toggleServiceRailCollapse());
document.getElementById("rail-expand").addEventListener("click", () => window.hub.toggleServiceRailCollapse());
document.getElementById("rail-lock").addEventListener("click", () => window.hub.toggleLayoutLock());

// ---------------------------------------------------------- quick notes drawer
(function () {
  const editor = document.getElementById("notes-editor");
  const statusEl = document.getElementById("notes-status");
  if (!editor) return;

  window.hub.notesGet().then((t) => { editor.value = t || ""; });   // load saved notes

  document.getElementById("tb-notes").addEventListener("click", () => window.hub.toggleNotes());
  document.getElementById("notes-close").addEventListener("click", () => window.hub.toggleNotes(false));

  let saveTimer = null, clearTimer = null;
  function setStatus(text, cls) { statusEl.textContent = text; statusEl.className = "notes-status" + (cls ? " " + cls : ""); }
  editor.addEventListener("input", () => {
    setStatus("Saving…", "saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await window.hub.notesSave(editor.value);
      setStatus("Saved", "saved");
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => setStatus("", ""), 1600);
    }, 450);
  });

  document.getElementById("notes-add-date").addEventListener("click", () => {
    const heading = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    const start = editor.selectionStart;
    const before = editor.value.slice(0, start);
    const lead = before && !before.endsWith("\n") ? "\n" : "";
    editor.setRangeText(lead + "— " + heading + " —\n", start, editor.selectionEnd, "end");
    editor.dispatchEvent(new Event("input"));
    editor.focus();
  });

  // Ctrl+Shift+N toggles the drawer from anywhere in the shell
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "N" || e.key === "n")) { e.preventDefault(); window.hub.toggleNotes(); }
  });
})();

// ---------------------------- per-service nav buttons (in the title bar)
(function () {
  const bar = document.getElementById("tb-nav");
  if (!bar) return;
  const back = document.getElementById("svc-back");
  const fwd = document.getElementById("svc-forward");
  const reload = document.getElementById("svc-reload");
  const copy = document.getElementById("svc-copy");
  back.addEventListener("click", () => window.hub.svcNav("back"));
  fwd.addEventListener("click", () => window.hub.svcNav("forward"));
  reload.addEventListener("click", () => window.hub.svcNav("reload"));
  copy.addEventListener("click", async () => {
    const url = await window.hub.svcCopyUrl();
    if (url) { copy.classList.add("copied"); copy.title = "Copied!"; setTimeout(() => { copy.classList.remove("copied"); copy.title = "Copy link"; }, 1100); }
  });
  window.hub.onNavState((s) => {
    bar.hidden = !s.show;
    if (!s.show) return;
    back.disabled = !s.canBack;
    fwd.disabled = !s.canForward;
  });
})();

// ------------------------------------------------------ theme toggle
(function () {
  const btn = document.getElementById("tb-theme");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const light = document.documentElement.getAttribute("data-theme") === "light";
    if (light) { document.documentElement.removeAttribute("data-theme"); }
    else { document.documentElement.setAttribute("data-theme", "light"); }
    try { localStorage.setItem("nishro.theme", light ? "dark" : "light"); } catch {}
  });
})();

// ------------------------------------------------- internet speed meter (top)
function fmtSpeed(bytesPerSec) {
  const b = Math.max(0, bytesPerSec || 0);
  if (b < 1024) return Math.round(b) + " B/s";
  const kb = b / 1024;
  if (kb < 1000) return (kb < 10 ? kb.toFixed(1) : Math.round(kb)) + " KB/s";
  const mb = kb / 1024;
  return (mb < 10 ? mb.toFixed(2) : mb.toFixed(1)) + " MB/s";
}
if (window.hub.onNetSpeed) {
  const dlEl = document.getElementById("net-dl-val");
  const ulEl = document.getElementById("net-ul-val");
  window.hub.onNetSpeed((s) => {
    if (dlEl) dlEl.textContent = fmtSpeed(s.down);
    if (ulEl) ulEl.textContent = fmtSpeed(s.up);
  });
}

// ----------------------------------------------------- app name (rename only)

document.getElementById("app-title-save").addEventListener("click", async () => {
  const title = document.getElementById("app-title-input").value.trim();
  if (!title) return;
  await window.hub.setAppTitle(title);
});
document.getElementById("app-title-input").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("app-title-save").click(); });

// ------------------------------------------------------------------ settings

function renderSettingsServices() {
  const container = document.getElementById("settings-services");
  if (!container) return;
  container.innerHTML = "";
  for (const id of state.order) {
    const svc = state.services.find((s) => s.id === id);
    if (!svc) continue;
    const row = document.createElement("div");
    row.className = "settings-service-row";

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.innerHTML = ICONS[id];

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = svc.name;

    const toggle = document.createElement("button");
    const on = state.enabled[id] !== false;
    toggle.className = "toggle" + (on ? " on" : "");
    toggle.addEventListener("click", () => window.hub.toggleService(id, !on));

    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(toggle);
    container.appendChild(row);
  }
}

// Developer: editable per-service URLs.
function renderDevUrls() {
  const c = document.getElementById("dev-urls");
  if (!c) return;
  c.innerHTML = "";
  const urls = state.urls || {};
  const defs = state.defaultUrls || {};
  const order = (state.order && state.order.length) ? state.order : state.services.map((s) => s.id);
  for (const id of order) {
    const svc = state.services.find((s) => s.id === id);
    if (!svc) continue;
    const row = document.createElement("div");
    row.className = "dev-url-row";

    const name = document.createElement("span");
    name.className = "dev-url-name";
    name.innerHTML = `<span class="dev-url-ic">${ICONS[id] || ""}</span><span>${svc.name}</span>`;

    const input = document.createElement("input");
    input.type = "text"; input.className = "dev-url-input";
    input.value = urls[id] || "";
    input.placeholder = defs[id] || "https://…";
    input.spellcheck = false; input.autocapitalize = "off"; input.autocomplete = "off";

    const btn = document.createElement("button");
    btn.className = "dev-url-save"; btn.textContent = "Save";
    const save = async () => {
      btn.disabled = true; btn.textContent = "…";
      const r = await window.hub.setServiceUrl(id, input.value.trim());
      btn.disabled = false;
      btn.textContent = (r && r.ok) ? "Saved ✓" : "Retry";
      setTimeout(() => { btn.textContent = "Save"; }, 1500);
    };
    btn.addEventListener("click", save);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });

    row.append(name, input, btn);
    c.appendChild(row);
  }
}

async function refreshPinStatus() {
  const has = await window.hub.hasPin();
  document.getElementById("pin-status-text").textContent = has
    ? "A PIN is set - required each time you open Nishro Room."
    : "No PIN set - anyone who opens this PC can open Nishro Room.";
}
document.getElementById("settings-set-pin").addEventListener("click", async () => {
  const pin = document.getElementById("settings-pin-input").value.trim();
  if (!pin) return;
  await window.hub.setPin(pin);
  document.getElementById("settings-pin-input").value = "";
  refreshPinStatus();
});
document.getElementById("settings-remove-pin").addEventListener("click", async () => { await window.hub.removePin(); refreshPinStatus(); });

// auto-start on Windows login
async function refreshAutostart() {
  const on = await window.hub.getAutostart();
  document.getElementById("autostart-toggle").classList.toggle("on", on);
}
document.getElementById("autostart-toggle").addEventListener("click", async () => {
  const btn = document.getElementById("autostart-toggle");
  const next = !btn.classList.contains("on");
  await window.hub.setAutostart(next);
  btn.classList.toggle("on", next);
});

// --------------------------------------------------------------- companion

function applyCompanion(info) {
  const dot = document.getElementById("companion-dot");
  const stateText = document.getElementById("companion-state-text");
  const toggle = document.getElementById("companion-toggle");
  const err = document.getElementById("companion-error");

  // state = "serving" | "starting" | "error" | "stopped" (verified by a live ping)
  const state = info.state || (info.running ? "serving" : "stopped");
  const label = {
    serving: "Running — phone can connect",
    starting: "Starting…",
    error: "Problem",
    stopped: "Stopped",
  }[state] || (info.running ? "Running" : "Stopped");

  dot.className = "companion-dot" + (state === "serving" ? " on" : state === "error" ? " err" : "");
  stateText.textContent = label;
  toggle.textContent = state === "serving" || state === "starting" ? "Stop" : "Start";
  toggle.classList.toggle("secondary-btn", state === "serving" || state === "starting");

  document.getElementById("conn-ip").textContent = info.ip || "—";
  document.getElementById("conn-port").textContent = info.port || 8100;
  document.getElementById("conn-pin").textContent = info.pin || "—";
  if (info.folder) document.getElementById("companion-folder").value = info.folder;
  err.textContent = info.error || "";
  refreshQr(info);
}

let _qrKey = "";
async function refreshQr(info) {
  const key = (info.ip || "") + "|" + (info.pin || "");
  if (!info.ip || !info.pin || key === _qrKey) return; // only regenerate when ip/pin change
  _qrKey = key;
  try {
    const r = await window.hub.companionQr();
    const box = document.getElementById("companion-qr");
    if (box && r && r.ok) box.innerHTML = r.svg;
  } catch { /* ignore */ }
}

window.hub.onCompanionStatus((info) => applyCompanion(info));

document.getElementById("companion-toggle").addEventListener("click", async () => {
  const running = document.getElementById("companion-toggle").textContent === "Stop";
  if (running) await window.hub.companionStop();
  else await window.hub.companionStart();
  applyCompanion(await window.hub.companionInfo());
});
document.getElementById("companion-set-pin").addEventListener("click", async () => {
  const pin = document.getElementById("companion-pin-input").value.trim();
  if (!pin) return;
  await window.hub.companionSetPin(pin);
  document.getElementById("companion-pin-input").value = "";
  applyCompanion(await window.hub.companionInfo());
});
document.getElementById("companion-pick-folder").addEventListener("click", async () => {
  await window.hub.companionPickFolder();
  applyCompanion(await window.hub.companionInfo());
});
document.getElementById("companion-open-folder").addEventListener("click", () => window.hub.openSharedFolder());

// ------------------------------------------------- phone screen & control
// Opens a separate, resizable window that streams the phone and relays input
// (taps/swipes/nav buttons) back to it. See mirror.html / mirror.js.

function setPhoneViewStatus(msg, kind) {
  const el = document.getElementById("phone-view-status");
  el.textContent = msg || "";
  el.className = "mirror-status" + (kind ? " " + kind : "");
}

document.getElementById("phone-show-btn").addEventListener("click", async () => {
  const ip = document.getElementById("phone-ip").value.trim();
  const port = (document.getElementById("phone-port").value || "8090").toString().trim();
  if (!ip) { setPhoneViewStatus("Enter the phone's IP shown in the Nishro app.", "err"); return; }
  const r = await window.hub.mirrorOpen(ip, port);
  setPhoneViewStatus(r && r.ok ? `Opened the phone window (${ip}:${port}).` : "Couldn't open the phone window.", r && r.ok ? "ok" : "err");
});

document.getElementById("phone-ip").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("phone-show-btn").click(); });

// ------------------------------------------------------------------ titlebar

document.getElementById("win-min").addEventListener("click", () => window.hub.minimizeWindow());
document.getElementById("win-close").addEventListener("click", () => window.hub.closeWindow());
const maxBtn = document.getElementById("win-max");
maxBtn.addEventListener("click", () => window.hub.toggleMaximizeWindow());
function setMaxIcon(isMax) { maxBtn.textContent = isMax ? "" : ""; maxBtn.title = isMax ? "Restore" : "Maximize"; }
window.hub.onWindowMaximized(setMaxIcon);
window.hub.isWindowMaximized().then(setMaxIcon);

// ---------------------------------------------------------------- shortcuts

document.addEventListener("keydown", (e) => {
  if (!e.ctrlKey || e.altKey || e.metaKey) return;
  const k = e.key.toLowerCase();
  if (k === "b") { e.preventDefault(); window.hub.togglePrimaryCollapse(); return; }
  if (k === ",") { e.preventDefault(); window.hub.switchPrimary("settings"); return; }
  // Ctrl+1..8 -> jump to the Nth enabled service, in the current order
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9) {
    const enabled = state.order.filter((id) => state.enabled[id] !== false);
    const id = enabled[n - 1];
    if (id) { e.preventDefault(); window.hub.switchService(id); }
  }
});

// --------------------------------------------------------------------- boot

window.hub.getState().then((s) => {
  state = s; render(); refreshPinStatus(); refreshAutostart(); syncAppearanceInputs(s.appearance);
  if (s.lastPhone && s.lastPhone.ip) {
    document.getElementById("phone-ip").value = s.lastPhone.ip;
    document.getElementById("phone-port").value = s.lastPhone.port || "8090";
  }
});
window.hub.companionInfo().then(applyCompanion);
initLock();
