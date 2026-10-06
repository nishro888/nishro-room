// UI tests for Nishro Room's window: the real index.html, renderer.js and
// style.css in a hidden window, with a fake bridge (fake-preload.js) in place
// of the main process - no service views, no companion, no settings file, no
// account. Each test loads the page fresh with its own data, then checks what
// the window shows and what it asked the app to do.
//
//   npm run test:ui
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");

const ROOT = path.join(__dirname, "..", "..");
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "nishro-room-ui-")));

// ------------------------------------------------------------------ data
// Example data only: made-up addresses and PINs.

const SERVICES = [
  ["facebook", "Facebook"], ["messenger", "Messenger"], ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"], ["telegram", "Telegram"], ["discord", "Discord"],
  ["github", "GitHub"], ["linkedin", "LinkedIn"], ["gmail", "Gmail"], ["youtube", "YouTube"],
].map(([id, name]) => ({ id, name }));
const IDS = SERVICES.map((s) => s.id);
const MIN = 60 * 1000;

function scenario(changes = {}) {
  const state = {
    services: SERVICES, enabled: {}, suspended: [], order: IDS, primary: "social",
    service: "whatsapp", primaryCollapsed: false, serviceRailCollapsed: false,
    layoutLocked: false, notesOpen: false,
    tabOrder: ["social", "pcstatus", "privacy", "pccompanion", "settings"],
    appearance: { appTitle: "Nishro Room" }, lastPhone: { ip: null, port: null },
    hasPin: false, urls: {}, defaultUrls: {},
    ...(changes.state || {}),
  };
  const answers = {
    getState: state, notesGet: "", hasPin: false, getAutostart: false, isWindowMaximized: false,
    companionInfo: {
      state: "serving", running: true, ip: "192.168.1.10", port: 8100, pin: "4821",
      folder: "C:\\Shared",
    },
    companionQr: {
      ok: true, svg: '<svg id="qr-app"></svg>', webSvg: '<svg id="qr-web"></svg>',
      webShown: "http://192.168.1.10:8100/send?pin=4821",
    },
    privacyScan: { microphone: [], camera: [] },
    pcStatsNow: { cpu: 10, mem: 20, disk: 30, uptime: 60 },
    pcStatsSeries: { live: [], daily: [] },
    toggleService: { ok: true }, setServiceUrl: { ok: true }, notesSave: { ok: true },
    ...(changes.answers || {}),
  };
  return { pin: changes.pin || null, answers };
}

// ---------------------------------------------------------------- runner

let fixtures = null;
ipcMain.on("ui-test:fixtures", (e) => { e.returnValue = fixtures; });

async function open(fx) {
  fixtures = fx;
  const win = new BrowserWindow({
    show: false, width: 1280, height: 820,
    webPreferences: {
      preload: path.join(__dirname, "fake-preload.js"), contextIsolation: true,
      nodeIntegration: false, backgroundThrottling: false,
    },
  });
  win.errors = [];
  win.webContents.on("console-message", (...a) => {
    const d = a[0] && a[0].message !== undefined ? a[0] : { level: a[1], message: a[2] };
    if (d.level === 3 || d.level === "error") win.errors.push(d.message);
  });
  await win.loadFile(path.join(ROOT, "index.html"));
  await wait(win, 300);
  return win;
}
const run = (win, code) => win.webContents.executeJavaScript(code);
const wait = (win, ms) => run(win, `new Promise((r) => setTimeout(r, ${ms}))`);
const text = (win, sel) => run(win, `(document.querySelector(${JSON.stringify(sel)}) || {}).textContent`);
const cls = (win, sel) => run(win, `(document.querySelector(${JSON.stringify(sel)}) || {}).className`);
const shown = (win, sel) => run(win, `getComputedStyle(document.querySelector(${JSON.stringify(sel)})).display !== "none"`);
const calls = (win, name) => run(win, `window.__uiTest.calls(${JSON.stringify(name)})`);
const emit = (win, event, payload) => run(win, `window.__uiTest.emit(${JSON.stringify(event)}, ${JSON.stringify(payload)})`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ----------------------------------------------------------------- tests

test("boots to the app, tabs in the saved order, no errors", async () => {
  const w = await open(scenario({ state: { appearance: { appTitle: "My Room" } } }));
  assert.ok(await shown(w, "#app-shell"));
  assert.ok(!(await shown(w, "#lock-screen")));
  assert.deepStrictEqual(
    await run(w, `[...document.querySelectorAll("#primary-tabs .tab-btn")].map((b) => b.dataset.primary)`),
    ["social", "pcstatus", "privacy", "pccompanion", "settings"]);
  assert.strictEqual(await cls(w, '.tab-btn[data-primary="social"]'), "tab-btn active");
  assert.strictEqual(await text(w, "#brand-text"), "My Room");
  assert.deepStrictEqual(w.errors, []);
  w.destroy();
});

test("the fake bridge offers exactly what preload.js offers", async () => {
  const real = [...fs.readFileSync(path.join(ROOT, "preload.js"), "utf8")
    .matchAll(/^\s+(\w+):\s*\(/gm)].map((m) => m[1]).sort();
  const w = await open(scenario());
  const fake = (await run(w, "window.__uiTest.names()")).sort();
  assert.deepStrictEqual(fake, real, "add the new preload.js names to tests/ui/fake-preload.js");
  w.destroy();
});

test("with a PIN set: the lock screen, and no way to skip it", async () => {
  const w = await open(scenario({ pin: "2468", state: { hasPin: true } }));
  assert.ok(await shown(w, "#lock-screen"));
  assert.ok(!(await shown(w, "#app-shell")));
  assert.ok(!(await shown(w, "#lock-skip")), "Skip would bypass the PIN");
  assert.strictEqual(await run(w, `document.getElementById("primary-tabs").style.visibility`), "hidden");
  await run(w, `document.getElementById("lock-input").value = "1111"; document.getElementById("lock-submit").click()`);
  await wait(w, 50);
  assert.strictEqual(await text(w, "#lock-error"), "Wrong PIN.");
  assert.strictEqual(await run(w, `document.getElementById("lock-input").value`), "");
  assert.ok(!(await shown(w, "#app-shell")));
  await run(w, `document.getElementById("lock-input").value = "2468"; document.getElementById("lock-submit").click()`);
  await wait(w, 50);
  assert.ok(await shown(w, "#app-shell"));
  assert.ok(!(await shown(w, "#lock-screen")));
  w.destroy();
});

test("the rail: enabled services in order, the paused one dimmed", async () => {
  const w = await open(scenario({
    state: { enabled: { linkedin: false }, suspended: ["youtube"], service: "discord" },
  }));
  const rail = await run(w, `[...document.querySelectorAll("#service-icons .svc-btn")].map((b) => b.dataset.id)`);
  assert.deepStrictEqual(rail, IDS.filter((id) => id !== "linkedin"));
  assert.match(await cls(w, '.svc-btn[data-id="discord"]'), /\bactive\b/);
  assert.match(await cls(w, '.svc-btn[data-id="youtube"]'), /\bsuspended\b/);
  assert.match(await run(w, `document.querySelector('.svc-btn[data-id="youtube"]').title`), /paused/);
  // Settings lists all ten; the one turned off has its switch off.
  assert.strictEqual(await run(w, `document.querySelectorAll("#settings-services .settings-service-row").length`), 10);
  assert.deepStrictEqual(
    await run(w, `[...document.querySelectorAll("#settings-services .settings-service-row")].filter((r) => !r.querySelector(".toggle.on")).map((r) => r.querySelector(".name").textContent)`),
    ["LinkedIn"]);
  w.destroy();
});

test("unread badges, capped at 99+", async () => {
  const w = await open(scenario());
  await emit(w, "badge-update", { whatsapp: 3, gmail: 150, telegram: 0 });
  assert.strictEqual(await text(w, '.badge[data-badge-for="whatsapp"]'), "3");
  assert.strictEqual(await text(w, '.badge[data-badge-for="gmail"]'), "99+");
  assert.ok(!(await shown(w, '.badge[data-badge-for="telegram"]')));
  w.destroy();
});

test("clicking a tab or a service asks the app to switch", async () => {
  const w = await open(scenario());
  await run(w, `document.querySelector('.tab-btn[data-primary="privacy"]').click()`);
  await run(w, `document.querySelector('.svc-btn[data-id="discord"]').click()`);
  assert.deepStrictEqual(await calls(w, "switchPrimary"), [["privacy"]]);
  assert.deepStrictEqual(await calls(w, "switchService"), [["discord"]]);
  w.destroy();
});

test("Camera & Mic: an app using the mic now comes first, flagged", async () => {
  const now = Date.now();
  const w = await open(scenario({
    state: { primary: "privacy" },
    answers: {
      privacyScan: {
        microphone: [
          { name: "Discord.exe", path: "C:\\Apps\\Discord\\Discord.exe", packaged: false, inUse: true, lastStart: now - MIN, lastStop: null },
          { name: "MSTeams", path: "MSTeams_8wekyb3d8bbwe", packaged: true, inUse: false, lastStart: now - 5 * MIN, lastStop: now - 4 * MIN },
        ],
        camera: [],
      },
    },
  }));
  assert.ok(await shown(w, "#panel-privacy"));
  assert.strictEqual(await text(w, "#priv-mic-state"), "● In use now");
  assert.match(await cls(w, "#priv-mic-state"), /\blive\b/);
  const rows = await run(w, `[...document.querySelectorAll("#priv-mic-list .priv-item")].map((li) => [li.className, li.querySelector(".priv-name").textContent, (li.querySelector(".priv-badge, .priv-when") || {}).textContent])`);
  assert.deepStrictEqual(rows, [
    ["priv-item live", "Discord.exe", "Using it now"],
    ["priv-item", "MSTeams", "last used 5 min ago"],
  ]);
  assert.strictEqual(await text(w, "#priv-cam-state"), "Idle");
  assert.match(await text(w, "#priv-cam-list"), /No app has used the camera/);
  assert.match(await text(w, "#priv-updated"), /^Updated /);
  w.destroy();
});

test("Camera & Mic: app names are shown as text, never run as markup", async () => {
  const evil = '<img src=x onerror="window.__pwned=1">';
  const w = await open(scenario({
    state: { primary: "privacy" },
    answers: { privacyScan: { microphone: [{ name: evil, path: evil, inUse: false, lastStart: null }], camera: [] } },
  }));
  assert.strictEqual(await text(w, "#priv-mic-list .priv-name"), evil);
  assert.strictEqual(await run(w, `document.querySelectorAll("#priv-mic-list img").length`), 0);
  assert.strictEqual(await run(w, "window.__pwned === undefined"), true);
  w.destroy();
});

test("Camera & Mic: asks every 3 s while open, stops when the tab is left", async () => {
  const w = await open(scenario({ state: { primary: "privacy" } }));
  const first = (await calls(w, "privacyScan")).length;
  assert.strictEqual(first, 1);
  await wait(w, 3300);
  const open1 = (await calls(w, "privacyScan")).length;
  assert.ok(open1 >= 2, `asked ${open1} times in 3.3 s`);
  await emit(w, "state", { ...scenario().answers.getState, primary: "social" });
  await wait(w, 3300);
  assert.strictEqual((await calls(w, "privacyScan")).length, open1, "kept asking after the tab was left");
  w.destroy();
});

test("PC Companion: serving, with the /send page's QR and address", async () => {
  const w = await open(scenario({ state: { primary: "pccompanion" } }));
  assert.ok(await shown(w, "#panel-pccompanion"));
  assert.strictEqual(await text(w, "#companion-state-text"), "Running — phone can connect");
  assert.strictEqual(await cls(w, "#companion-dot"), "companion-dot on");
  assert.strictEqual(await text(w, "#companion-toggle"), "Stop");
  assert.strictEqual(await text(w, "#conn-ip"), "192.168.1.10");
  assert.strictEqual(await text(w, "#conn-pin"), "4821");
  assert.strictEqual(await run(w, `!!document.querySelector("#companion-qr #qr-app")`), true);
  assert.strictEqual(await run(w, `!!document.querySelector("#companion-web-qr #qr-web")`), true);
  assert.strictEqual(await text(w, "#companion-web-url"), "http://192.168.1.10:8100/send?pin=4821");
  w.destroy();
});

test("PC Companion: a problem shows red, with the reason", async () => {
  const w = await open(scenario({ state: { primary: "pccompanion" } }));
  await emit(w, "companion-status", { state: "error", ip: "192.168.1.10", port: 8100, pin: "4821", error: "port 8100 is in use" });
  assert.strictEqual(await text(w, "#companion-state-text"), "Problem");
  assert.strictEqual(await cls(w, "#companion-dot"), "companion-dot err");
  assert.strictEqual(await text(w, "#companion-error"), "port 8100 is in use");
  assert.strictEqual(await text(w, "#companion-toggle"), "Start");
  w.destroy();
});

test("PC Companion: the QR codes are made again only when the address or PIN changes", async () => {
  const w = await open(scenario({ state: { primary: "pccompanion" } }));
  const info = scenario().answers.companionInfo;
  assert.strictEqual((await calls(w, "companionQr")).length, 1);
  await emit(w, "companion-status", info);
  await wait(w, 50);
  assert.strictEqual((await calls(w, "companionQr")).length, 1);
  await emit(w, "companion-status", { ...info, pin: "9035" });
  await wait(w, 50);
  assert.strictEqual((await calls(w, "companionQr")).length, 2);
  w.destroy();
});

test("PC Status: the rings, the notes and the app's own footprint", async () => {
  const w = await open(scenario({
    state: { primary: "pcstatus" },
    answers: {
      pcStatsNow: {
        cpu: 36, mem: 71, disk: 92, cores: 8, memUsedGB: 5.7, memTotalGB: 8,
        diskFreeGB: 19.6, diskTotalGB: 237, uptime: 93784,
        nishro: { cpu: 0.2, memMB: 693, procs: 5, todayAvgMB: 650, todayPeakMB: 1536 },
      },
      pcStatsSeries: { live: [{ cpu: 30, mem: 70 }], daily: [] },
    },
  }));
  assert.ok(await shown(w, "#panel-pcstatus"));
  assert.strictEqual(await text(w, "#cpu-val"), "36%");
  assert.strictEqual(await text(w, "#mem-val"), "71%");
  assert.strictEqual(await text(w, "#disk-val"), "92%");
  const colour = (k) => run(w, `document.getElementById("ring-${k}").style.getPropertyValue("--c")`);
  assert.strictEqual(await colour("cpu"), "var(--accent)");
  assert.strictEqual(await colour("mem"), "#f5a524");
  assert.strictEqual(await colour("disk"), "var(--red)");
  assert.strictEqual(await text(w, "#mem-note"), "5.7 / 8 GB used");
  assert.strictEqual(await text(w, "#disk-note"), "20 GB free of 237");
  assert.strictEqual(await text(w, "#stat-uptime"), "PC uptime: 1d 2h");
  assert.strictEqual(await text(w, "#nu-cpu"), "0.2%");
  assert.strictEqual(await text(w, "#nu-mem"), "693 MB");
  assert.strictEqual(await text(w, "#nu-procs"), "5 processes");
  assert.strictEqual(await text(w, "#nu-note"), "today — avg 650 MB · peak 1.50 GB");
  // One sample is not a history yet.
  assert.ok(!(await shown(w, "#stat-chart")));
  assert.ok(await shown(w, "#stat-empty"));
  w.destroy();
});

test("PC Status: a reading the PC can't give shows N/A", async () => {
  const w = await open(scenario({
    state: { primary: "pcstatus" },
    answers: { pcStatsNow: { cpu: null, mem: 50, disk: 50, uptime: 0 } },
  }));
  assert.strictEqual(await text(w, "#cpu-val"), "N/A");
  w.destroy();
});

test("the notes drawer: open as saved, and typing is saved after a pause", async () => {
  const w = await open(scenario({ state: { notesOpen: true }, answers: { notesGet: "old note" } }));
  assert.match(await cls(w, "#notes-drawer"), /\bopen\b/);
  assert.strictEqual(await run(w, `document.getElementById("notes-editor").value`), "old note");
  await run(w, `const e = document.getElementById("notes-editor"); e.value = "buy milk"; e.dispatchEvent(new Event("input"))`);
  assert.deepStrictEqual(await calls(w, "notesSave"), [], "saved before the pause");
  await wait(w, 700);
  assert.deepStrictEqual(await calls(w, "notesSave"), [["buy milk"]]);
  assert.strictEqual(await text(w, "#notes-status"), "Saved");
  w.destroy();
});

// ------------------------------------------------------------------ main

app.whenReady().then(async () => {
  let failed = 0;
  for (const [i, t] of tests.entries()) {
    try {
      await t.fn();
      console.log(`ok ${i + 1} - ${t.name}`);
    } catch (e) {
      failed += 1;
      console.log(`not ok ${i + 1} - ${t.name}\n  ${String(e.message).split("\n").join("\n  ")}`);
    }
  }
  console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  app.exit(failed ? 1 : 0);
});
app.on("window-all-closed", () => {});
