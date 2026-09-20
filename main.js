// Nishro Room - the desktop half of the Nishro ecosystem.
//
// Structure is two layers:
//   - Primary rail (the whole app's spine): Social, PC Companion, Settings.
//   - Service rail (inside the Social section only): Facebook, Gmail, etc.,
//     each a real isolated website. Both rails collapse independently.
//
// The Social services are the real official sites, logged into by hand.
// Nothing reads/sends/scripts messages - automating those platforms violates
// their ToS and risks bans, so this stays a wrapper, never a bot.
const { app, BrowserWindow, BrowserView, ipcMain, shell, Tray, Menu, nativeImage, Notification, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const http = require("http");
const { spawn, spawnSync } = require("child_process");
const QRCode = require("qrcode");

// Perf: disable Chromium's Windows occlusion calculation - a well-known cause of
// idle/background CPU churn in Electron apps. Must be set before app is ready.
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");

const APP_ID = "com.nishro.room";
const TITLEBAR_H = 40;
const SERVICE_W = 64;
const COLLAPSED_STRIP_W = 16; // thin transparent hover-edge kept when collapsed (matches .service-rail.collapsed width in style.css)
const NOTES_W = 340;          // quick-notes drawer width (matches .notes-drawer.open in style.css)

const SERVICES = [
  { id: "facebook", name: "Facebook", url: "https://www.facebook.com" },
  { id: "messenger", name: "Messenger", url: "https://www.messenger.com" },
  { id: "instagram", name: "Instagram", url: "https://www.instagram.com" },
  { id: "whatsapp", name: "WhatsApp", url: "https://web.whatsapp.com" },
  { id: "telegram", name: "Telegram", url: "https://web.telegram.org" },
  { id: "discord", name: "Discord", url: "https://discord.com/app" },
  { id: "github", name: "GitHub", url: "https://github.com" },
  { id: "linkedin", name: "LinkedIn", url: "https://www.linkedin.com" },
  { id: "gmail", name: "Gmail", url: "https://mail.google.com" },
  { id: "youtube", name: "YouTube", url: "https://www.youtube.com" },
];
const SERVICE_BY_ID = Object.fromEntries(SERVICES.map((s) => [s.id, s]));
const DEFAULT_URLS = Object.fromEntries(SERVICES.map((s) => [s.id, s.url]));

// A service opens its default URL unless a custom one is set in Developer settings.
function serviceUrl(id) {
  const custom = (readSettings().urls || {})[id];
  if (custom && /^https?:\/\//i.test(custom)) return custom;
  return SERVICE_BY_ID[id] ? SERVICE_BY_ID[id].url : "about:blank";
}

// ALL services share ONE session (a single cookie jar) - so Nishro Room behaves
// like one connected browser, not many. Log in with Google/Facebook once and it
// carries everywhere via SSO ("Continue as…", "Log in with Google/Facebook"),
// and same-provider apps (Gmail+Drive, FB+Messenger+Instagram) just work.
const SHARED_PARTITION = "persist:nishro";
const partitionFor = (_id) => SHARED_PARTITION;

const userDataDir = () => app.getPath("userData");
const securityFile = () => path.join(userDataDir(), "security.json");
const settingsFile = () => path.join(userDataDir(), "settings.json");
const notesFile = () => path.join(userDataDir(), "quicknotes.txt");

// ---------------------------------------------------------------- security

function readSecurity() {
  try {
    return JSON.parse(fs.readFileSync(securityFile(), "utf8"));
  } catch {
    return null;
  }
}
function hashPin(pin, salt) {
  return crypto.pbkdf2Sync(pin, salt, 100000, 32, "sha256").toString("hex");
}
function setPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  fs.mkdirSync(userDataDir(), { recursive: true });
  fs.writeFileSync(securityFile(), JSON.stringify({ salt, hash: hashPin(pin, salt) }));
}
function checkPin(pin) {
  const sec = readSecurity();
  return sec ? hashPin(pin, sec.salt) === sec.hash : false;
}
function removePin() {
  try { fs.unlinkSync(securityFile()); } catch {}
}

// ----------------------------------------------------------------- settings

function readSettings() {
  let s;
  try { s = JSON.parse(fs.readFileSync(settingsFile(), "utf8")); } catch { s = {}; }
  if (!s.enabled) s.enabled = {};
  if (!s.urls || typeof s.urls !== "object") s.urls = {};   // per-service custom URLs (Developer)
  // migrate replaced services in place so they keep their slot (discord -> github)
  const RENAMES = { drive: "youtube" };
  if (Array.isArray(s.order)) s.order = s.order.map((id) => RENAMES[id] || id);
  for (const [oldId, newId] of Object.entries(RENAMES)) {
    if (oldId in s.enabled) { if (!(newId in s.enabled)) s.enabled[newId] = s.enabled[oldId]; delete s.enabled[oldId]; }
  }
  for (const svc of SERVICES) if (!(svc.id in s.enabled)) s.enabled[svc.id] = true;
  // order: keep only known services, append any new ones not yet listed
  if (!Array.isArray(s.order)) s.order = SERVICES.map((x) => x.id);
  s.order = s.order.filter((id) => SERVICE_BY_ID[id]);
  for (const svc of SERVICES) if (!s.order.includes(svc.id)) s.order.push(svc.id);
  if (typeof s.primaryCollapsed !== "boolean") s.primaryCollapsed = false;
  if (typeof s.serviceRailCollapsed !== "boolean") s.serviceRailCollapsed = false;
  if (typeof s.layoutLocked !== "boolean") s.layoutLocked = false;
  if (typeof s.notesOpen !== "boolean") s.notesOpen = false;
  // top-tab order (the 3 whole-app sections)
  const SECTIONS = ["social", "pcstatus", "privacy", "pccompanion", "settings"];
  if (!Array.isArray(s.tabOrder)) s.tabOrder = [...SECTIONS];
  s.tabOrder = s.tabOrder.filter((x) => SECTIONS.includes(x));
  for (const x of SECTIONS) if (!s.tabOrder.includes(x)) s.tabOrder.push(x);
  // appearance: only the name is editable. The icon is fixed everywhere -
  // the red Waltograph "N" baked into icon.png / icon.ico.
  if (typeof s.appTitle !== "string" || !s.appTitle) s.appTitle = "Nishro Room";
  // remembered phone (mirror) target, prefilled in the PC Companion panel
  if (typeof s.lastPhoneIp !== "string") s.lastPhoneIp = "";
  if (typeof s.lastPhonePort !== "string") s.lastPhonePort = "8090";
  return s;
}
function writeSettings(s) {
  fs.mkdirSync(userDataDir(), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s));
}

// ---------------------------------------------------------- companion manager
// Nishro Room now owns the PC Companion instead of it being a separate script
// the user starts by hand: it spawns and supervises pc_companion.py, so the
// phone-side PC Connect just works whenever the app is open.
let companionProc = null;
let companionInfo = { running: false, state: "stopped", pin: null, folder: null, port: 8100, ip: null, error: null };
let companionDesired = false;   // does the user want it on? (gates auto-restart)
let companionHealthTimer = null;
let companionRestarts = 0;

function companionScriptPath() {
  // dev: <app>/companion/pc_companion.py ; packaged (electron-builder) the
  // same relative path resolves because the folder is shipped with the app.
  return path.join(__dirname, "companion", "pc_companion.py");
}

function lanIp() {
  // The phone reaches the PC over Wi-Fi/Ethernet, NOT over virtual adapters
  // (ZeroTier, VPNs, WSL/Hyper-V vEthernet, VMware...). Picking the first
  // non-internal IPv4 grabbed ZeroTier's 10.242.x here - so skip virtual
  // interface names and prefer a real home-LAN address.
  const virtualRe = /(vethernet|zerotier|vmware|virtualbox|hyper-?v|\bwsl\b|tailscale|docker|loopback|vpn|tun|tap)/i;
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (virtualRe.test(name)) continue;
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) candidates.push(a.address);
    }
  }
  return (
    candidates.find((ip) => ip.startsWith("192.168.")) ||
    candidates.find((ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) ||
    candidates.find((ip) => ip.startsWith("10.")) ||
    candidates[0] ||
    "127.0.0.1"
  );
}

function findPython() {
  for (const cmd of ["python", "py"]) {
    try {
      const r = spawnSync(cmd, ["--version"], { windowsHide: true });
      if (!r.error && r.status === 0) return cmd;
    } catch { /* try next */ }
  }
  return null;
}

function companionConfig() {
  const s = readSettings();
  let changed = false;
  if (!s.companionPin) { s.companionPin = String(Math.floor(1000 + Math.random() * 9000)); changed = true; }
  if (!s.companionFolder) { s.companionFolder = path.join(app.getPath("documents"), "NishroShare"); changed = true; }
  if (changed) writeSettings(s);
  return { pin: s.companionPin, folder: s.companionFolder };
}

// GET /api/ping on the companion - the ONLY trustworthy "is it serving?" signal
// (a live child process object does NOT mean it actually bound the port).
function pingCompanion() {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: 8100, path: "/api/ping", timeout: 1200 }, (res) => {
      let b = ""; res.on("data", (c) => (b += c));
      res.on("end", () => { try { resolve(res.statusCode === 200 && !!JSON.parse(b)); } catch { resolve(false); } });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}
async function waitForCompanion(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await pingCompanion()) return true; await new Promise((r) => setTimeout(r, 300)); }
  return false;
}

// Free a stuck/orphaned python holding 8100 (the classic cause of "won't start
// after a crash"). Only ever kills python processes, never unrelated apps.
function freePort(port) {
  try {
    const r = spawnSync("netstat", ["-ano", "-p", "tcp"], { windowsHide: true, encoding: "utf8" });
    const pids = new Set();
    for (const line of (r.stdout || "").split(/\r?\n/)) {
      if (!/LISTENING/i.test(line)) continue;
      const p = line.trim().split(/\s+/);
      if ((p[1] || "").endsWith(":" + port)) { const pid = p[p.length - 1]; if (/^\d+$/.test(pid)) pids.add(pid); }
    }
    for (const pid of pids) {
      const t = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { windowsHide: true, encoding: "utf8" });
      if (/python|pythonw|\bpy\b/i.test(t.stdout || "")) spawnSync("taskkill", ["/PID", pid, "/F", "/T"], { windowsHide: true });
    }
  } catch { /* best effort */ }
}

async function startCompanion() {
  companionDesired = true;
  const { pin, folder } = companionConfig();

  // Already serving (our live child, or an orphan from a previous run)? Adopt it
  // instead of spawning a duplicate that would fail to bind the port.
  if (await pingCompanion()) {
    companionInfo = { running: true, state: "serving", pin, folder, port: 8100, ip: lanIp(), error: null };
    broadcastCompanion();
    startHealthLoop();
    return { ok: true };
  }

  const py = findPython();
  if (!py) {
    companionInfo = { running: false, state: "error", pin, folder, port: 8100, ip: lanIp(),
      error: "Python isn't installed on this PC - the companion needs it. Install Python, then Start again." };
    broadcastCompanion();
    return { ok: false, error: companionInfo.error };
  }

  freePort(8100); // clear anything stuck on the port before we bind
  try { fs.mkdirSync(folder, { recursive: true }); } catch { /* best effort */ }

  let stderr = "";
  const proc = spawn(py, [companionScriptPath(), "--pin", pin, "--port", "8100", "--root", folder], { windowsHide: true });
  proc.stderr?.on("data", (d) => { stderr = (stderr + d.toString()).slice(-600); });
  proc.on("error", () => {
    if (companionProc === proc) companionProc = null;
    companionInfo = { ...companionInfo, running: false, state: "error", error: "Failed to launch the companion (Python error)." };
    broadcastCompanion();
  });
  proc.on("exit", (code) => {
    if (companionProc === proc) {
      companionProc = null;
      companionInfo.running = false;
      companionInfo.state = companionDesired ? "error" : "stopped";
      if (companionDesired) companionInfo.error = (stderr.split(/\r?\n/).find((l) => l.trim()) || "").trim() || `Companion exited (code ${code}).`;
      broadcastCompanion();
    }
  });
  companionProc = proc;
  companionInfo = { running: false, state: "starting", pin, folder, port: 8100, ip: lanIp(), error: null };
  broadcastCompanion();

  const ready = await waitForCompanion(6000); // only report "serving" once it truly responds
  if (ready) { companionInfo.running = true; companionInfo.state = "serving"; companionInfo.error = null; companionRestarts = 0; }
  else {
    companionInfo.running = false; companionInfo.state = "error";
    companionInfo.error = companionInfo.error || (stderr.split(/\r?\n/).find((l) => l.trim()) || "").trim() ||
      "Companion didn't come up - the port may be busy or Python errored.";
  }
  broadcastCompanion();
  startHealthLoop();
  return { ok: companionInfo.running, error: companionInfo.error };
}

function stopCompanion() {
  companionDesired = false;
  stopHealthLoop();
  if (companionProc) { try { companionProc.kill(); } catch {} companionProc = null; }
  freePort(8100); // also clears an adopted/orphaned server so Stop always works + no orphan next launch
  companionInfo = { ...companionInfo, running: false, state: "stopped", error: null };
  broadcastCompanion();
}

// Periodic verified health check: keeps the shown status TRUE and auto-recovers
// a companion that silently died or stopped responding (Wi-Fi hiccup, crash).
function startHealthLoop() {
  if (companionHealthTimer) return;
  companionHealthTimer = setInterval(async () => {
    if (!companionDesired) return;
    const ok = await pingCompanion();
    if (ok) {
      companionRestarts = 0;
      if (companionInfo.state !== "serving") {
        companionInfo = { ...companionInfo, running: true, state: "serving", error: null, ip: lanIp() };
        broadcastCompanion();
      }
    } else if (companionInfo.state === "serving") {
      companionInfo = { ...companionInfo, running: false, state: "error", error: "Companion stopped responding - reconnecting…" };
      broadcastCompanion();
      if (!companionProc && companionRestarts < 3) { companionRestarts++; startCompanion(); }
    }
  }, 4000);
}
function stopHealthLoop() {
  if (companionHealthTimer) { clearInterval(companionHealthTimer); companionHealthTimer = null; }
}

function broadcastCompanion() {
  companionInfo.ip = lanIp();
  // ?. only guards null; during quit the window can be destroyed while still
  // referenced, so guard the webContents explicitly (this crashed on force-quit).
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send("companion-status", companionInfo);
    }
  } catch {}
  try { updateTrayMenu(); } catch {}
}

// ---------------------------------------------------- phone mirror window
// The phone app streams its screen (MJPEG) + accepts control commands on 8090.
// We open a separate resizable window showing the stream, and relay its input
// (taps/swipes/nav buttons) to the phone via HTTP from here (no CORS in Node).
let mirrorWindow = null;

ipcMain.handle("mirror-open", (_e, { ip, port } = {}) => {
  if (!ip) return { ok: false };
  port = port || 8090;
  try { const s = readSettings(); s.lastPhoneIp = String(ip); s.lastPhonePort = String(port); writeSettings(s); } catch {}
  if (mirrorWindow && !mirrorWindow.isDestroyed()) {
    mirrorWindow.focus();
  } else {
    mirrorWindow = new BrowserWindow({
      width: 420, height: 860, minWidth: 240, minHeight: 380,
      title: "Phone - Nishro Room",
      backgroundColor: "#000000",
      autoHideMenuBar: true,
      icon: path.join(__dirname, "icon.png"),
      webPreferences: { preload: path.join(__dirname, "mirror-preload.js"), contextIsolation: true, sandbox: false },
    });
    mirrorWindow.on("closed", () => { mirrorWindow = null; stopVoice(); stopAudio(); stopMonitor(); });
  }
  mirrorWindow.loadFile("mirror.html", { query: { ip: String(ip), port: String(port) } });
  return { ok: true };
});

// POST a control command to the phone's screen-share server.
ipcMain.handle("phone-control", (_e, { ip, port, cmd } = {}) => {
  return new Promise((resolve) => {
    if (!ip) return resolve({ ok: false });
    try {
      const data = Buffer.from(JSON.stringify(cmd || {}));
      const req = http.request(
        { host: ip, port: port || 8090, path: "/control", method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": data.length }, timeout: 3000 },
        (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch { resolve({ ok: false }); } }); }
      );
      req.on("error", () => resolve({ ok: false }));
      req.on("timeout", () => { req.destroy(); resolve({ ok: false }); });
      req.write(data); req.end();
    } catch (e) { resolve({ ok: false }); }
  });
});

// GET the phone's control/status info.
ipcMain.handle("phone-info", (_e, { ip, port } = {}) => {
  return new Promise((resolve) => {
    if (!ip) return resolve({ ok: false });
    const req = http.get({ host: ip, port: port || 8090, path: "/info", timeout: 3000 }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch { resolve({ ok: false }); } });
    });
    req.on("error", () => resolve({ ok: false }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false }); });
  });
});

// POST live capture config (quality / fps / resolution) to the phone.
ipcMain.handle("phone-config", (_e, { ip, port, cfg } = {}) => {
  return new Promise((resolve) => {
    if (!ip) return resolve({ ok: false });
    try {
      const data = Buffer.from(JSON.stringify(cfg || {}));
      const req = http.request(
        { host: ip, port: port || 8090, path: "/config", method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": data.length }, timeout: 3000 },
        (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch { resolve({ ok: false }); } }); }
      );
      req.on("error", () => resolve({ ok: false }));
      req.on("timeout", () => { req.destroy(); resolve({ ok: false }); });
      req.write(data); req.end();
    } catch (e) { resolve({ ok: false }); }
  });
});

// Toggle the mirror window's fullscreen / always-on-top (from inside that window).
// Connection QR for the companion - the phone scans it to auto-fill IP/port/PIN.
ipcMain.handle("companion-qr", async () => {
  const s = readSettings();
  const ip = lanIp();
  const pin = s.companionPin || "";
  if (!ip || !pin) return { ok: false };
  const text = `nishro://pc?ip=${ip}&port=8100&pin=${encodeURIComponent(pin)}`;
  // Browser upload page (any phone, no app) - scanning this QR in the iPhone
  // Camera opens Safari straight to the already-authorised upload page.
  const webUrl = `http://${ip}:8100/send?pin=${encodeURIComponent(pin)}`;
  const webShown = `http://${ip}:8100/send`;
  try {
    const qopts = { type: "svg", margin: 1, color: { dark: "#0b0916", light: "#ffffff" } };
    const svg = await QRCode.toString(text, qopts);
    const webSvg = await QRCode.toString(webUrl, qopts);
    return { ok: true, svg, text, webSvg, webUrl, webShown };
  } catch (e) { return { ok: false }; }
});

ipcMain.handle("mirror-window", (_e, { action } = {}) => {
  if (!mirrorWindow || mirrorWindow.isDestroyed()) return { ok: false };
  if (action === "fullscreen") mirrorWindow.setFullScreen(!mirrorWindow.isFullScreen());
  else if (action === "ontop") mirrorWindow.setAlwaysOnTop(!mirrorWindow.isAlwaysOnTop());
  return { ok: true, fullscreen: mirrorWindow.isFullScreen(), ontop: mirrorWindow.isAlwaysOnTop() };
});

// ------------------------------------------------------------- voice control
// Hands-free: a Windows-speech (SAPI) helper recognizes commands offline and
// emits JSON on stdout; we map each to a phone control (swipe/tap/key/text).
let voiceProc = null;

function postControl(ip, port, cmd) {
  try {
    const data = Buffer.from(JSON.stringify(cmd));
    const req = http.request({ host: ip, port: port || 8090, path: "/control", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length }, timeout: 3000 }, () => {});
    req.on("error", () => {}); req.on("timeout", () => req.destroy());
    req.write(data); req.end();
  } catch (e) { /* ignore */ }
}

function stopVoice() {
  if (voiceProc) { try { voiceProc.kill(); } catch {} voiceProc = null; }
}

// Find a usable Python (for the Vosk speech engine). Prefer the per-user install.
function findPython() {
  const cands = [];
  if (process.env.LOCALAPPDATA) cands.push(path.join(process.env.LOCALAPPDATA, "Programs", "Python", "Python311", "python.exe"));
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch {} }
  return "python";  // fall back to PATH
}
const VOSK_MODEL = path.join(process.env.LOCALAPPDATA || "", "Nishro", "vosk-model");
function voskAvailable() { try { return fs.existsSync(VOSK_MODEL); } catch { return false; } }

// Read newline-delimited JSON from a child's stdout and hand each object to cb.
function pipeJsonLines(proc, cb) {
  let buf = "";
  proc.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      cb(msg);
    }
  });
}

function handleVoiceMsg(msg, ip, port) {
  if (msg.error) { mirrorWindow?.webContents.send("voice-status", { listening: false, error: msg.error }); return; }
  if (msg.level != null) { mirrorWindow?.webContents.send("voice-status", { listening: true, level: msg.level }); return; }
  if (msg.ready) { mirrorWindow?.webContents.send("voice-status", { listening: true, mode: "command" }); return; }
  if (msg.mode) { mirrorWindow?.webContents.send("voice-status", { listening: true, mode: msg.mode }); return; }
  if (msg.t != null) {
    postControl(ip, port, { type: "text", text: String(msg.t) });
    mirrorWindow?.webContents.send("voice-status", { listening: true, mode: "dictate", heard: String(msg.t) });
    return;
  }
  // low-confidence hit: show it so the user knows the mic heard something
  if (msg.rej != null) { mirrorWindow?.webContents.send("voice-status", { listening: true, heard: msg.rej + " (unclear)" }); return; }
  if (!msg.c) return;
  const c = msg.c;
  mirrorWindow?.webContents.send("voice-status", { listening: true, heard: c + (msg.conf != null ? " · " + msg.conf : "") });
  const swipe = (y1, y2) => postControl(ip, port, { type: "swipe", x1: 0.5, y1, x2: 0.5, y2, dur: 220 });
  const key = (k) => postControl(ip, port, { type: "key", key: k });
  const tap = () => postControl(ip, port, { type: "tap", x: 0.5, y: 0.5 });
  switch (c) {
    case "next": case "down": case "scroll": case "scroll down": case "swipe up": swipe(0.72, 0.30); break;
    case "previous": case "up": case "scroll up": case "swipe down": swipe(0.30, 0.72); break;
    case "like": case "double tap": case "heart": tap(); setTimeout(tap, 130); break;
    case "tap": case "select": case "play": case "pause": case "okay": tap(); break;
    case "back": case "go back": key("back"); break;
    case "home": case "go home": key("home"); break;
    case "recents": case "recent apps": key("recents"); break;
    case "notifications": key("notifications"); break;
    case "volume up": key("volup"); break;
    case "volume down": key("voldown"); break;
    case "mute": key("mute"); break;
    case "send": case "enter": postControl(ip, port, { type: "text", text: "\n" }); break;
    case "clear": case "delete": case "backspace": postControl(ip, port, { type: "backspace" }); break;
    default: break;
  }
}

// Whisper (best) is used if its model is cached; otherwise Vosk; otherwise SAPI.
function whisperAvailable() {
  try {
    const hub = path.join(process.env.USERPROFILE || os.homedir(), ".cache", "huggingface", "hub");
    const size = process.env.NISHRO_WHISPER || "tiny.en";
    return fs.existsSync(path.join(hub, "models--Systran--faster-whisper-" + size))
        && fs.existsSync(path.join(__dirname, "voice_whisper.py"));
  } catch { return false; }
}
function spawnVoiceEngine(kind, ip, port) {
  if (kind === "whisper") {
    return spawn(findPython(), [path.join(__dirname, "voice_whisper.py")], {
      windowsHide: true,
      env: Object.assign({}, process.env, { KMP_DUPLICATE_LIB_OK: "TRUE", HF_HUB_OFFLINE: "1", NISHRO_WHISPER: process.env.NISHRO_WHISPER || "tiny.en" }),
    });
  }
  if (kind === "vosk") return spawn(findPython(), [path.join(__dirname, "voice_vosk.py"), VOSK_MODEL], { windowsHide: true });
  return spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "voice.ps1")], { windowsHide: true });
}
// Try engines in order; if one doesn't come up (missing/crash/timeout), fall to the next.
function startVoiceChain(list, idx, ip, port) {
  if (idx >= list.length) { mirrorWindow?.webContents.send("voice-status", { listening: false, error: "no speech engine" }); return; }
  const kind = list[idx];
  let proc, ready = false, settled = false;
  const advance = () => { if (settled) return; settled = true; try { proc.kill(); } catch {} startVoiceChain(list, idx + 1, ip, port); };
  try { proc = spawnVoiceEngine(kind, ip, port); } catch (e) { advance(); return; }
  voiceProc = proc;
  pipeJsonLines(proc, (msg) => {
    if (msg.ready) { ready = true; settled = true; }
    if (msg.error && !ready) { advance(); return; }
    handleVoiceMsg(msg, ip, port);
  });
  proc.on("close", () => { if (voiceProc !== proc) return; if (!ready) { advance(); } else { voiceProc = null; mirrorWindow?.webContents.send("voice-status", { listening: false }); } });
  proc.on("error", () => { if (!ready) advance(); });
  setTimeout(() => { if (!ready) advance(); }, kind === "whisper" ? 16000 : 5000);  // Whisper loads a model first
}

ipcMain.handle("voice-start", async (_e, { ip, port } = {}) => {
  stopVoice();
  if (!ip) return { ok: false };
  try { await runMic(["-Action", "auto"]); } catch {}   // real mic, never a loopback
  const chain = [];
  if (whisperAvailable()) chain.push("whisper");
  if (voskAvailable()) chain.push("vosk");
  chain.push("sapi");
  startVoiceChain(chain, 0, ip, port);
  return { ok: true };
});

ipcMain.handle("voice-stop", () => { stopVoice(); mirrorWindow?.webContents.send("voice-status", { listening: false }); return { ok: true }; });

// ------------------------------------------------------------- phone audio
// Pull the phone's raw-PCM /audio stream in Node (no CORS), forward chunks to
// the mirror window, which plays them via Web Audio. Toggled by the 🔊 button.
let audioReq = null;
function stopAudio() { if (audioReq) { try { audioReq.destroy(); } catch {} audioReq = null; } }

ipcMain.handle("audio-start", (_e, { ip, port } = {}) => {
  stopAudio();
  if (!ip) return { ok: false };
  try {
    audioReq = http.get({ host: ip, port: port || 8090, path: "/audio", timeout: 0 }, (res) => {
      if (res.statusCode !== 200) { mirrorWindow?.webContents.send("audio-end"); return; }
      res.on("data", (chunk) => { mirrorWindow?.webContents.send("audio-chunk", chunk); });
      res.on("end", () => { mirrorWindow?.webContents.send("audio-end"); });
    });
    audioReq.on("error", () => { audioReq = null; mirrorWindow?.webContents.send("audio-end"); });
    return { ok: true };
  } catch (e) { audioReq = null; return { ok: false }; }
});
ipcMain.handle("audio-stop", () => { stopAudio(); return { ok: true }; });

// ------------------------------------------------------------ mic selection
// Voice uses the Windows default recording device. Let the user pick which mic
// (and it always gets unmuted). mic.ps1 does the Core Audio work.
function runMic(args) {
  return new Promise((resolve) => {
    try {
      const p = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "mic.ps1"), ...args], { windowsHide: true });
      let out = "";
      p.stdout.on("data", (d) => (out += d.toString()));
      p.on("close", () => { try { resolve(JSON.parse(out.trim().split("\n").pop())); } catch { resolve(null); } });
      p.on("error", () => resolve(null));
    } catch { resolve(null); }
  });
}
ipcMain.handle("mic-list", () => runMic(["-Action", "list"]));
ipcMain.handle("mic-set", (_e, { id } = {}) => id ? runMic(["-Action", "default", "-Id", id]) : { ok: false });

// Live mic-level monitor (no recognition) so the settings panel can show input.
let monProc = null;
function stopMonitor() { if (monProc) { try { monProc.kill(); } catch {} monProc = null; } }
function wireMonitor(proc) {
  pipeJsonLines(proc, (msg) => {
    if (msg.level != null) mirrorWindow?.webContents.send("voice-status", { listening: false, level: msg.level, monitor: true });
    else if (msg.error) mirrorWindow?.webContents.send("voice-status", { listening: false, micError: msg.error });
  });
  proc.on("error", () => { monProc = null; });
}
function spawnSapiMonitor() {
  monProc = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "micmon.ps1")], { windowsHide: true });
  wireMonitor(monProc);
  monProc.on("close", () => { monProc = null; });
}
ipcMain.handle("mic-monitor-start", async () => {
  stopMonitor();
  try { await runMic(["-Action", "auto"]); } catch {}
  if (voskAvailable()) {
    let ready = false, fellBack = false;
    const toSapi = () => { if (fellBack) return; fellBack = true; try { if (monProc) monProc.kill(); } catch {} spawnSapiMonitor(); };
    try {
      monProc = spawn(findPython(), [path.join(__dirname, "micmon.py")], { windowsHide: true });
      pipeJsonLines(monProc, (msg) => {
        if (msg.ready) ready = true;
        if (msg.level != null) mirrorWindow?.webContents.send("voice-status", { listening: false, level: msg.level, monitor: true });
        else if (msg.error) mirrorWindow?.webContents.send("voice-status", { listening: false, micError: msg.error });
      });
      monProc.on("close", () => { if (monProc && !fellBack && !ready) toSapi(); else monProc = null; });
      monProc.on("error", () => { if (!fellBack) toSapi(); });
      setTimeout(() => { if (!ready && !fellBack) toSapi(); }, 4000);
      return { ok: true };
    } catch (e) { /* fall through */ }
  }
  try { spawnSapiMonitor(); } catch (e) { monProc = null; return { ok: false, error: e.message }; }
  return { ok: true };
});
ipcMain.handle("mic-monitor-stop", () => { stopMonitor(); return { ok: true }; });

// Privacy monitor: which apps are using / last used the camera & mic. Reads the
// Windows ConsentStore ledger via privacy.ps1 (the same source Settings uses),
// so it catches e.g. "Discord mic is live" even when you think it's muted.
function runPrivacy() {
  return new Promise((resolve) => {
    const empty = { camera: [], microphone: [] };
    try {
      const p = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "privacy.ps1")], { windowsHide: true });
      let out = "";
      p.stdout.on("data", (d) => (out += d.toString()));
      p.on("close", () => { try { const j = JSON.parse(out.trim()); resolve({ camera: j.camera || [], microphone: j.microphone || [] }); } catch { resolve(empty); } });
      p.on("error", () => resolve(empty));
    } catch { resolve(empty); }
  });
}
ipcMain.handle("privacy-scan", () => runPrivacy());

// --------------------------------------------------------------------- state

let mainWindow;
const views = {};
const badgeCounts = {};
let currentPrimary = "social"; // "social" | "pccompanion" | "settings"
let currentService = null;
let notesOpen = false;         // quick-notes drawer visible (persisted in settings)
let locked = false;            // PIN lock active -> hide ALL service views until unlocked
// Temporarily suspended services (session-only, NOT persisted -> every restart
// starts with all member services active). Suspending unloads the view to free
// memory; the icon stays in the rail (dimmed) so a click resumes it.
const suspended = new Set();

// enabled[id] !== false = a MEMBER of the room (persisted in settings).
function firstEnabledService() {
  const s = readSettings();
  return s.order.find((id) => s.enabled[id] !== false) || null;
}
// A member that is also not suspended right now -> the one we can actually show.
function firstActiveService() {
  const s = readSettings();
  return s.order.find((id) => s.enabled[id] !== false && !suspended.has(id)) || null;
}

// ---------------------------------------------------------------- webviews

function createView(service) {
  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "service-preload.js"), // bridges site notifications -> native (clickable) ones
      partition: partitionFor(service.id), // shared session per account provider (Meta / Google) - one login flows across them
    },
  });

  // Popups (OAuth/consent, email-verify links, "open in new window") were opening
  // as chrome-less child windows the user couldn't close, and force-quitting them
  // then crashed the app. Open every popup as a REAL framed, closable window that
  // shares this service's session (so logins/verification still work).
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (!/^https?:\/\//i.test(url || "")) {
      try { if (url) shell.openExternal(url); } catch {}
      return { action: "deny" };
    }
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        frame: true, autoHideMenuBar: true, backgroundColor: "#0b0912",
        width: 520, height: 700, minWidth: 360, minHeight: 420,
        webPreferences: {
          nodeIntegration: false, contextIsolation: true, sandbox: true,
          partition: partitionFor(service.id),   // same login as the parent service
        },
      },
    };
  });

  // keep the nav bar (url + back/forward state) in sync while browsing a service
  const onNav = () => { if (currentService === service.id) broadcastNav(); };
  view.webContents.on("did-navigate", onNav);
  view.webContents.on("did-navigate-in-page", onNav);

  if (service.id === "whatsapp") {
    // WhatsApp Web rejects Electron's default UA on sight of "Electron/x";
    // present the real Chromium version in standard Chrome UA form instead.
    view.webContents.setUserAgent(
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`
    );
  }
  if (service.id === "telegram") {
    // Telegram Web caps its message column width for readability, which leaves a
    // narrow chat with big side padding on a wide window. Widen it to use the
    // available space. Covers both web versions (K: /k/, A: /a/). insertCSS is
    // injected by Electron so it isn't blocked by the site's CSP.
    const widen = () => view.webContents.insertCSS(
      "#column-center,#MiddleColumn,#Main{max-width:none!important}" +
      ".bubbles-inner,.bubbles .scrollable-y,.messages-container,.MessageList,.messages-layout{max-width:none!important;width:100%!important}"
    ).catch(() => {});
    view.webContents.on("dom-ready", widen);
  }
  view.webContents.on("page-title-updated", (_e, title) => {
    const m = title.match(/^\((\d+)\)/); // "(3) WhatsApp" -> 3, same signal a tab title shows
    badgeCounts[service.id] = m ? parseInt(m[1], 10) : 0;
    broadcastBadges();
  });

  // Clicking a desktop notification focuses the webContents that raised it -
  // even a background/detached service view. Turn that into the expected
  // behavior: bring Nishro Room forward (it may be hidden to tray) and switch
  // to that service so the message is right there.
  view.webContents.on("focus", () => surfaceService(service.id));

  // Per-service zoom: Ctrl +/- / Ctrl+0. Doesn't move a site's internal
  // divider (that's the site's own fixed layout), but scales the whole view.
  view.webContents.on("before-input-event", (event, input) => {
    if (!input.control || input.type !== "keyDown") return;
    const wc = view.webContents;
    if (input.key === "=" || input.key === "+") { wc.setZoomLevel(wc.getZoomLevel() + 0.5); event.preventDefault(); }
    else if (input.key === "-") { wc.setZoomLevel(wc.getZoomLevel() - 0.5); event.preventDefault(); }
    else if (input.key === "0") { wc.setZoomLevel(0); event.preventDefault(); }
  });

  // Install our main-world patches via executeJavaScript (bypasses the site's
  // CSP, unlike an injected <script>): (1) the Notification override, and
  // (2) the WebAuthn/passkey neutralizer that stops the "insert security key"
  // popup. Re-applied on each full load.
  const injectPatches = () => {
    view.webContents.executeJavaScript(NOTIF_PATCH).catch(() => {});
    view.webContents.executeJavaScript(WEBAUTHN_PATCH).catch(() => {});
  };
  view.webContents.on("dom-ready", injectPatches);

  view.webContents.loadURL(serviceUrl(service.id));
  return view;
}

// Runs in the service page's main world. Makes WebAuthn (security key / passkey)
// look unavailable so sites like Facebook/Google/LinkedIn stop auto-triggering
// the Windows "insert your security key" dialog and fall back to password. A
// publicKey get/create rejects as if cancelled (the graceful password-fallback
// path); everything else is untouched.
const WEBAUTHN_PATCH = `(function(){
  try{
    if(window.__nishroNoWebauthn) return; window.__nishroNoWebauthn=true;
    if(navigator.credentials){
      var g = navigator.credentials.get && navigator.credentials.get.bind(navigator.credentials);
      navigator.credentials.get = function(o){
        if(o && o.publicKey) return Promise.reject(new DOMException('Security key is disabled in Nishro Room - use your password.','NotAllowedError'));
        return g ? g(o) : Promise.reject(new DOMException('unsupported','NotSupportedError'));
      };
      var c = navigator.credentials.create && navigator.credentials.create.bind(navigator.credentials);
      navigator.credentials.create = function(o){
        if(o && o.publicKey) return Promise.reject(new DOMException('Security key is disabled in Nishro Room.','NotAllowedError'));
        return c ? c(o) : Promise.reject(new DOMException('unsupported','NotSupportedError'));
      };
    }
    if(window.PublicKeyCredential){
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable=function(){return Promise.resolve(false);};
      if(window.PublicKeyCredential.isConditionalMediationAvailable) window.PublicKeyCredential.isConditionalMediationAvailable=function(){return Promise.resolve(false);};
    }
  }catch(e){}
})();`;

// Runs in the service page's main world. Replaces window.Notification so its
// use forwards to the app (which shows a clickable native notification) instead
// of a web toast whose click can't raise a hidden window.
const NOTIF_PATCH = `(function(){
  try{
    if(window.__nishroNotif) return; window.__nishroNotif=true;
    var Orig=window.Notification;
    function N(title,options){
      options=options||{};
      try{ window.postMessage({__nishroNotify:{title:String(title==null?'':title),body:String((options&&options.body)||'')}},'*'); }catch(e){}
      this.title=title; this.body=(options&&options.body)||''; this.tag=(options&&options.tag)||''; this.data=options&&options.data;
      this.onclick=null; this.onshow=null; this.onerror=null; this.onclose=null;
    }
    N.prototype.close=function(){}; N.prototype.addEventListener=function(){}; N.prototype.removeEventListener=function(){}; N.prototype.dispatchEvent=function(){return false;};
    N.requestPermission=function(cb){ if(typeof cb==='function') cb('granted'); return Promise.resolve('granted'); };
    try{ Object.defineProperty(N,'permission',{get:function(){return 'granted';}}); }catch(e){ N.permission='granted'; }
    try{ Object.defineProperty(N,'maxActions',{get:function(){return (Orig&&Orig.maxActions)||0;}}); }catch(e){}
    window.Notification=N;
  }catch(e){}
})();`;

function ensureView(id) {
  if (!views[id]) views[id] = createView(SERVICE_BY_ID[id]);
  return views[id];
}

// Show + switch to a service, reliably raising the window even from tray. Called
// by the native-notification click and the service view's 'focus' event.
function surfaceService(svcId) {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  if (svcId && (currentPrimary !== "social" || currentService !== svcId)) {
    currentPrimary = "social";
    currentService = svcId;
    relayout();
    broadcastState();
  }
}

// A service view's page called Notification(): show a NATIVE notification whose
// click (handled here in the main process) can actually raise the hidden window.
const lastNotifAt = {};
ipcMain.on("service-notify", (event, payload) => {
  let svcId = null;
  for (const id in views) { if (views[id] && views[id].webContents === event.sender) { svcId = id; break; } }
  // Don't notify for the service you're actively looking at (fast chatting fired
  // a native toast + sound per message here - the main cause of notification lag).
  if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused() && currentPrimary === "social" && currentService === svcId) return;
  // Rate-limit bursts so a flurry of messages can't flood toasts.
  const now = Date.now();
  if (svcId && lastNotifAt[svcId] && now - lastNotifAt[svcId] < 2500) return;
  if (svcId) lastNotifAt[svcId] = now;

  const svc = SERVICE_BY_ID[svcId];
  const name = svc ? svc.name : "Nishro Room";
  const title = payload && payload.title && String(payload.title).trim() ? String(payload.title) : name;
  const body = payload && payload.body ? String(payload.body) : "";
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, icon: path.join(__dirname, "icon.png"), silent: false });
    n.on("click", () => surfaceService(svcId));
    n.show();
  } catch (e) { /* ignore notification failures */ }
});

// ---------------------------------------------------------------- badges

let lastBadgesJson = "";
function broadcastBadges() {
  const j = JSON.stringify(badgeCounts);
  if (j === lastBadgesJson) return; // unread counts unchanged - skip IPC + overlay entirely
  lastBadgesJson = j;
  mainWindow?.webContents.send("badge-update", badgeCounts);
  updateTaskbarOverlay();
}
// Rendering the badge overlay spawns an offscreen window + GPU capture, so it
// must NOT run per title change (fast chat fires those dozens/sec). Skip when
// the total is unchanged, debounce bursts, and cache rendered numbers.
let lastOverlayTotal = -1;
let overlayTimer = null;
const badgeCache = new Map();

function updateTaskbarOverlay() {
  if (!mainWindow) return;
  const total = Object.values(badgeCounts).reduce((a, b) => a + b, 0);
  if (total === lastOverlayTotal) return; // nothing changed - the common case while chatting
  lastOverlayTotal = total;
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (total === 0) { try { mainWindow.setOverlayIcon(null, ""); } catch {} return; }
    const text = total > 99 ? "99+" : String(total);
    let img = badgeCache.get(text);
    if (!img) { img = await renderBadgeIcon(text); badgeCache.set(text, img); }
    try { mainWindow.setOverlayIcon(img, `${total} unread`); } catch {}
  }, 400); // coalesce bursts into one render
}
async function renderBadgeIcon(text) {
  const w = new BrowserWindow({ show: false, width: 32, height: 32, transparent: true, webPreferences: { offscreen: true } });
  const html = `<!doctype html><body style="margin:0;background:transparent">
    <div style="width:32px;height:32px;border-radius:50%;background:#f43f5e;display:flex;
      align-items:center;justify-content:center;color:#fff;font:700 ${text.length > 2 ? 10 : 15}px system-ui">${text}</div></body>`;
  await w.loadURL("data:text/html," + encodeURIComponent(html));
  const img = await w.webContents.capturePage();
  w.destroy();
  return img;
}

// ------------------------------------------------------------- app appearance

// The app icon is fixed everywhere: the baked red Waltograph "N" (icon.png,
// same art as the exe's icon.ico). Not user-customizable.
function currentAppIcon() {
  return nativeImage.createFromPath(path.join(__dirname, "icon.png"));
}

function applyAppearance() {
  const s = readSettings();
  if (mainWindow) mainWindow.setTitle(s.appTitle);
  try {
    const icon = currentAppIcon();
    if (mainWindow && !icon.isEmpty()) mainWindow.setIcon(icon);
    if (tray && !icon.isEmpty()) tray.setImage(icon.resize({ width: 16, height: 16 }));
  } catch { /* keep the built-in icon if loading fails */ }
}

// ---------------------------------------------------------------- layout

function currentBounds() {
  // Primary sections are top tabs in the title bar (no left rail). The only
  // left offset is the service rail: full width when open, a thin hover-edge
  // when collapsed (kept > 0 so it stays DOM-visible in front of the webview,
  // where the reveal control can actually be hovered/clicked).
  const s = readSettings();
  const [w, h] = mainWindow.getContentSize();
  const serviceW = s.serviceRailCollapsed ? COLLAPSED_STRIP_W : SERVICE_W;
  const notesW = notesOpen ? NOTES_W : 0;   // reserve the right strip for the notes drawer
  return { x: serviceW, y: TITLEBAR_H, width: Math.max(0, w - serviceW - notesW), height: Math.max(0, h - TITLEBAR_H) };
}

// Re-fits the active service view to the window. Called on every resize and
// on maximize/unmaximize - the latter twice (now + a beat later) because the
// window's content size isn't final the instant the maximize event fires, so
// an immediate-only recompute leaves the view sized to the pre-maximize
// window (the reported bug; toggling a rail happened to fix it by recomputing
// after the window had settled).
function syncViewBounds() {
  if (!locked && currentPrimary === "social" && currentService && views[currentService]) {
    views[currentService].setBounds(currentBounds());
  }
}

function relayout() {
  // While the PIN lock is up, no service view may be shown - a BrowserView is a
  // native layer that would otherwise render ON TOP of the lock screen.
  if (locked || currentPrimary !== "social") {
    for (const id in views) mainWindow.removeBrowserView(views[id]);
    broadcastNav();
    return;
  }
  if (!currentService || suspended.has(currentService)) currentService = firstActiveService();
  for (const id in views) if (id !== currentService) mainWindow.removeBrowserView(views[id]);
  if (currentService) {
    const view = ensureView(currentService);
    mainWindow.addBrowserView(view);
    view.setBounds(currentBounds());
    // No setAutoResize: it adjusts the view by the window's size delta, which
    // conflicts with the explicit setBounds on maximize and produced the
    // mis-fit. The resize/maximize handlers below drive bounds instead.
  }
  broadcastNav();
}

function broadcastState() {
  const s = readSettings();
  mainWindow?.webContents.send("state", {
    services: SERVICES.map(({ id, name }) => ({ id, name })),
    enabled: s.enabled,
    suspended: [...suspended],
    order: s.order,
    primary: currentPrimary,
    service: currentService,
    primaryCollapsed: s.primaryCollapsed,
    serviceRailCollapsed: s.serviceRailCollapsed,
    layoutLocked: s.layoutLocked,
    notesOpen: notesOpen,
    tabOrder: s.tabOrder,
    appearance: { appTitle: s.appTitle },
    urls: s.urls,
    defaultUrls: DEFAULT_URLS,
  });
  broadcastNav();
}

// Developer: set/clear a service's custom URL, then reload that service.
ipcMain.handle("set-service-url", (_e, { id, url } = {}) => {
  if (!SERVICE_BY_ID[id]) return { ok: false };
  const s = readSettings();
  s.urls = s.urls || {};
  const clean = String(url || "").trim();
  if (!clean) delete s.urls[id];
  else if (/^https?:\/\//i.test(clean)) s.urls[id] = clean;
  else return { ok: false, error: "URL must start with http:// or https://" };
  writeSettings(s);
  // rebuild the view so it loads the new URL now
  if (views[id]) {
    const wasCurrent = currentService === id;
    mainWindow.removeBrowserView(views[id]);
    try { views[id].webContents.destroy?.(); } catch {}
    delete views[id];
    if (wasCurrent) relayout();   // recreates + loads the new URL
  }
  broadcastState();
  return { ok: true, url: serviceUrl(id) };
});

// Per-service nav bar state: current URL + whether back/forward are possible.
function broadcastNav() {
  const view = views[currentService];
  const show = currentPrimary === "social" && !!view && !locked;
  let url = "", canBack = false, canForward = false;
  if (show) {
    try { url = view.webContents.getURL(); canBack = view.webContents.canGoBack(); canForward = view.webContents.canGoForward(); } catch {}
  }
  try {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send("svc-nav-state", { show, url, canBack, canForward });
    }
  } catch {}
}

ipcMain.on("svc-nav", (_e, action) => {
  const wc = views[currentService] && views[currentService].webContents;
  if (!wc || currentPrimary !== "social" || locked) return;
  try {
    if (action === "back" && wc.canGoBack()) wc.goBack();
    else if (action === "forward" && wc.canGoForward()) wc.goForward();
    else if (action === "reload") wc.reload();
  } catch {}
  broadcastNav();
});
ipcMain.handle("svc-copy-url", () => {
  const wc = views[currentService] && views[currentService].webContents;
  let url = ""; try { url = wc ? wc.getURL() : ""; } catch {}
  if (url) clipboard.writeText(url);
  return url;
});

// ---------------------------------------------------------------- companion

function checkCompanion(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: "/api/ping", timeout: 3000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve({ online: true, ...JSON.parse(body) }); } catch { resolve({ online: false }); } });
    });
    req.on("error", () => resolve({ online: false }));
    req.on("timeout", () => { req.destroy(); resolve({ online: false }); });
  });
}

// --------------------------------------------------------------------- ipc

ipcMain.handle("get-state", () => {
  const s = readSettings();
  return {
    services: SERVICES.map(({ id, name }) => ({ id, name })),
    enabled: s.enabled, suspended: [...suspended], order: s.order,
    primary: currentPrimary, service: currentService,
    primaryCollapsed: s.primaryCollapsed, serviceRailCollapsed: s.serviceRailCollapsed,
    layoutLocked: s.layoutLocked, notesOpen: notesOpen, tabOrder: s.tabOrder,
    appearance: { appTitle: s.appTitle },
    lastPhone: { ip: s.lastPhoneIp, port: s.lastPhonePort },
    hasPin: !!readSecurity(),
  };
});

// ------------------------------------------------------------- quick notes
ipcMain.on("toggle-notes", (_e, open) => {
  notesOpen = (open === undefined) ? !notesOpen : !!open;
  const s = readSettings(); s.notesOpen = notesOpen; writeSettings(s);
  relayout();            // resize the service view to make room for the drawer
  broadcastState();
});
ipcMain.handle("notes-get", () => { try { return fs.readFileSync(notesFile(), "utf8"); } catch { return ""; } });
ipcMain.handle("notes-save", (_e, text) => {
  try { fs.mkdirSync(userDataDir(), { recursive: true }); fs.writeFileSync(notesFile(), String(text == null ? "" : text), "utf8"); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle("reorder-tabs", (_e, newOrder) => {
  const SECTIONS = ["social", "pcstatus", "privacy", "pccompanion", "settings"];
  const valid = (newOrder || []).filter((x) => SECTIONS.includes(x));
  for (const x of SECTIONS) if (!valid.includes(x)) valid.push(x);
  const s = readSettings();
  s.tabOrder = valid;
  writeSettings(s);
  broadcastState();
  return true;
});

ipcMain.handle("set-app-title", (_e, title) => {
  const s = readSettings();
  s.appTitle = String(title || "").trim() || "Nishro Room";
  writeSettings(s);
  applyAppearance();
  broadcastState();
  return s.appTitle;
});

ipcMain.on("switch-primary", (_e, section) => {
  currentPrimary = section;
  if (section === "social" && !currentService) currentService = firstEnabledService();
  relayout();
  broadcastState();
});

ipcMain.on("switch-service", (_e, id) => {
  currentPrimary = "social";
  suspended.delete(id);   // clicking a dimmed (suspended) icon resumes it
  currentService = id;
  relayout();             // ensureView recreates + reloads a resumed service
  broadcastState();
});

// MEMBERSHIP (persisted): whether a service is part of the room at all.
function setServiceEnabled(id, enabled) {
  const s = readSettings();
  s.enabled[id] = enabled;
  writeSettings(s);
  if (!enabled) {
    suspended.delete(id);   // leaving the room clears any temp-suspend state
    if (views[id]) { mainWindow.removeBrowserView(views[id]); views[id].webContents.destroy?.(); delete views[id]; delete badgeCounts[id]; }
    if (currentService === id) currentService = firstActiveService();
  }
  relayout();
  broadcastState();
}
ipcMain.handle("toggle-service", (_e, { id, enabled }) => { setServiceEnabled(id, enabled); return true; });

// TEMPORARY (session-only): pause/resume a member service. Suspending unloads
// its view to free memory; the dimmed icon stays so a click brings it back.
function setServiceSuspended(id, suspend) {
  const s = readSettings();
  if (s.enabled[id] === false) return;   // not a member -> nothing to suspend
  if (suspend) {
    suspended.add(id);
    if (views[id]) { mainWindow.removeBrowserView(views[id]); views[id].webContents.destroy?.(); delete views[id]; }
    delete badgeCounts[id];
    broadcastBadges();
    if (currentService === id) currentService = firstActiveService();
  } else {
    suspended.delete(id);
    currentPrimary = "social";
    currentService = id;   // resume => show it (relayout recreates + reloads the view)
  }
  relayout();
  broadcastState();
}
ipcMain.handle("suspend-service", (_e, { id, suspend }) => { setServiceSuspended(id, !!suspend); return true; });

// Right-click a rail icon -> native context menu (pops above the BrowserView).
ipcMain.on("service-context-menu", (_e, { id } = {}) => {
  const svc = SERVICE_BY_ID[id];
  if (!svc || !mainWindow) return;
  const isSuspended = suspended.has(id);
  const template = [
    { label: svc.name, enabled: false },
    { type: "separator" },
  ];
  if (isSuspended) {
    template.push({ label: "Resume (was paused)", click: () => setServiceSuspended(id, false) });
  } else {
    template.push({ label: "Reload", enabled: !!views[id], click: () => { try { views[id].webContents.reload(); } catch {} } });
    template.push({ label: "Pause (free memory, keep icon)", click: () => setServiceSuspended(id, true) });
  }
  template.push({ type: "separator" });
  template.push({ label: "Remove from social room", click: () => setServiceEnabled(id, false) });
  Menu.buildFromTemplate(template).popup({ window: mainWindow });
});

ipcMain.handle("reorder-services", (_e, newOrder) => {
  const s = readSettings();
  if (s.layoutLocked) return false; // ignore reorders while locked, even if UI somehow allows a drag
  const valid = newOrder.filter((id) => SERVICE_BY_ID[id]);
  for (const svc of SERVICES) if (!valid.includes(svc.id)) valid.push(svc.id);
  s.order = valid;
  writeSettings(s);
  broadcastState();
  return true;
});

ipcMain.on("toggle-primary-collapse", () => {
  const s = readSettings();
  s.primaryCollapsed = !s.primaryCollapsed;
  writeSettings(s);
  relayout();
  broadcastState();
});

ipcMain.on("toggle-service-rail-collapse", () => {
  const s = readSettings();
  s.serviceRailCollapsed = !s.serviceRailCollapsed;
  writeSettings(s);
  relayout();
  broadcastState();
});

ipcMain.on("toggle-layout-lock", () => {
  const s = readSettings();
  s.layoutLocked = !s.layoutLocked;
  writeSettings(s);
  broadcastState();
});

ipcMain.handle("get-autostart", () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle("set-autostart", (_e, on) => {
  // Uses the packaged exe path; meaningful in the built app, harmless in dev.
  app.setLoginItemSettings({ openAtLogin: !!on, path: process.execPath });
  return true;
});

ipcMain.handle("submit-pin", (_e, pin) => {
  const ok = checkPin(pin);
  if (ok && locked) { locked = false; relayout(); }   // unlocked -> restore the service view
  return ok;
});
ipcMain.handle("has-pin", () => !!readSecurity());
ipcMain.handle("set-pin", (_e, pin) => { setPin(pin); return true; });
ipcMain.handle("remove-pin", () => { removePin(); return true; });
ipcMain.handle("check-companion", (_e, { host, port }) => checkCompanion(host, port));
ipcMain.handle("open-shared-folder", (_e) => { shell.openPath(companionConfig().folder); return true; });

// managed companion
ipcMain.handle("companion-start", () => startCompanion());
ipcMain.handle("companion-stop", () => { stopCompanion(); return true; });
ipcMain.handle("companion-info", () => ({ ...companionInfo, ip: lanIp(), ...companionConfig() }));
ipcMain.handle("companion-set-pin", (_e, pin) => {
  const s = readSettings();
  s.companionPin = String(pin || "").trim() || s.companionPin;
  writeSettings(s);
  if (companionProc) { stopCompanion(); startCompanion(); } // restart with new PIN
  return true;
});
ipcMain.handle("companion-pick-folder", async () => {
  const { dialog } = require("electron");
  const r = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  if (r.canceled || !r.filePaths[0]) return companionConfig().folder;
  const s = readSettings();
  s.companionFolder = r.filePaths[0];
  writeSettings(s);
  if (companionProc) { stopCompanion(); startCompanion(); }
  return r.filePaths[0];
});

ipcMain.on("window-minimize", () => mainWindow.minimize());
ipcMain.on("window-maximize-toggle", () => { mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
ipcMain.on("window-close", () => mainWindow.close());
ipcMain.handle("window-is-maximized", () => mainWindow.isMaximized());

// --------------------------------------------------------------------- tray

let tray = null;
function trayIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, "icon.png"));
  return img.isEmpty() ? img : img.resize({ width: 16, height: 16 });
}
function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Nishro Room", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: "separator" },
    { label: companionInfo.running ? "Companion: running" : "Companion: stopped", enabled: false },
    { label: companionInfo.running ? "Stop companion" : "Start companion", click: () => (companionInfo.running ? stopCompanion() : startCompanion()) },
    { type: "separator" },
    { label: "Quit Nishro Room", click: () => { app.isQuiting = true; app.quit(); } },
  ]));
}
function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip("Nishro Room");
  tray.on("click", () => { mainWindow?.show(); mainWindow?.focus(); });
  updateTrayMenu();
}

// ---------------------------------------------------------- internet meter
let netProc = null;
function stopNetSpeed() { if (netProc) { try { netProc.kill(); } catch {} netProc = null; } }
function startNetSpeed() {
  stopNetSpeed();
  try {
    netProc = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "netspeed.ps1")], { windowsHide: true });
    pipeJsonLines(netProc, (msg) => { if (msg.down != null) mainWindow?.webContents.send("net-speed", msg); });
    netProc.on("close", () => { netProc = null; });
    netProc.on("error", () => { netProc = null; });
  } catch (e) { netProc = null; }
}

// -------------------------------------------------------- PC status monitor
// Samples CPU / RAM / disk every few seconds into a short live ring, and rolls
// each day into a compact daily average/peak record so weeks–months of history
// fit in a tiny file. Runs quietly the whole time Nishro Room is open.
const statsFile = () => path.join(userDataDir(), "pcstats.json");
let statLive = [];        // {t, cpu, mem, disk} — ~75 min at 5s
let statDaily = [];       // {date, cpuA, cpuM, memA, memM, disk, n}
let lastCpuTimes = null;
let statTimer = null;
let statPersistN = 0;
const CORES = os.cpus().length || 1;

function readCpuTimes() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) { for (const k in c.times) total += c.times[k]; idle += c.times.idle; }
  return { idle, total };
}
// Nishro Room's own footprint across all its processes (main/renderers/GPU/views).
function nishroUsage() {
  let mem = 0, cpu = 0, procs = 0;
  try {
    for (const m of app.getAppMetrics()) {
      mem += (m.memory && m.memory.workingSetSize) || 0;   // KB
      cpu += (m.cpu && m.cpu.percentCPUUsage) || 0;         // % of one core
      procs++;
    }
  } catch {}
  return { memMB: mem / 1024, cpu: cpu / CORES, procs };    // cpu -> % of the whole machine
}
function diskInfo() {
  try {
    const drv = (process.env.SystemDrive || "C:") + "\\";
    const s = fs.statfsSync(drv);
    const totalGB = (s.bsize * s.blocks) / 1e9;
    const freeGB = (s.bsize * s.bavail) / 1e9;
    return { pct: (1 - s.bavail / s.blocks) * 100, freeGB, totalGB };
  } catch { return null; }
}
function sampleStats() {
  const now = Date.now();
  const t = readCpuTimes();
  let cpu = 0;
  if (lastCpuTimes) {
    const dt = t.total - lastCpuTimes.total, di = t.idle - lastCpuTimes.idle;
    if (dt > 0) cpu = Math.max(0, Math.min(100, (1 - di / dt) * 100));
  }
  lastCpuTimes = t;
  const mem = (1 - os.freemem() / os.totalmem()) * 100;
  const dk = diskInfo();
  const disk = dk ? dk.pct : null;
  const nu = nishroUsage();

  statLive.push({ t: now, cpu: Math.round(cpu), mem: Math.round(mem), disk: disk == null ? null : Math.round(disk) });
  if (statLive.length > 900) statLive.shift();

  const date = new Date(now).toISOString().slice(0, 10);
  let d = statDaily[statDaily.length - 1];
  if (!d || d.date !== date) {
    d = { date, cpuA: 0, cpuM: 0, memA: 0, memM: 0, disk: disk, nMemA: 0, nMemM: 0, nCpuA: 0, nCpuM: 0, n: 0 };
    statDaily.push(d);
    if (statDaily.length > 400) statDaily.shift();
  }
  d.n++;
  d.cpuA += (cpu - d.cpuA) / d.n;   // running mean
  d.memA += (mem - d.memA) / d.n;
  d.cpuM = Math.max(d.cpuM, cpu);
  d.memM = Math.max(d.memM, mem);
  d.nMemA = (d.nMemA || 0) + (nu.memMB - (d.nMemA || 0)) / d.n;   // Nishro's own RAM/CPU trend
  d.nMemM = Math.max(d.nMemM || 0, nu.memMB);
  d.nCpuA = (d.nCpuA || 0) + (nu.cpu - (d.nCpuA || 0)) / d.n;
  d.nCpuM = Math.max(d.nCpuM || 0, nu.cpu);
  if (disk != null) d.disk = disk;

  if (++statPersistN >= 24) { statPersistN = 0; persistStats(); }   // ~every 2 min
}
function persistStats() { try { fs.writeFileSync(statsFile(), JSON.stringify({ daily: statDaily }), "utf8"); } catch {} }
function startStats() {
  try { const j = JSON.parse(fs.readFileSync(statsFile(), "utf8")); if (Array.isArray(j.daily)) statDaily = j.daily; } catch {}
  lastCpuTimes = readCpuTimes();
  if (statTimer) clearInterval(statTimer);
  statTimer = setInterval(sampleStats, 5000);
}
function downsample(arr, max) {
  if (arr.length <= max) return arr;
  const step = arr.length / max, out = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}
ipcMain.handle("pc-stats-now", () => {
  const last = statLive.length ? statLive[statLive.length - 1] : { cpu: 0, mem: 0, disk: null };
  const dk = diskInfo();
  const nu = nishroUsage();
  const today = statDaily[statDaily.length - 1];
  return {
    cpu: last.cpu, mem: last.mem, disk: last.disk,
    memUsedGB: (os.totalmem() - os.freemem()) / 1e9, memTotalGB: os.totalmem() / 1e9,
    diskFreeGB: dk ? dk.freeGB : null, diskTotalGB: dk ? dk.totalGB : null,
    uptime: os.uptime(), cores: os.cpus().length,
    nishro: {
      cpu: nu.cpu, memMB: nu.memMB, procs: nu.procs,
      todayAvgMB: today ? today.nMemA : null, todayPeakMB: today ? today.nMemM : null,
    },
  };
});
ipcMain.handle("pc-stats-series", () => ({ live: downsample(statLive, 240), daily: statDaily.slice(-120) }));

// --------------------------------------------------------------------- main

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 400, minHeight: 480,
    title: "Nishro Room",
    backgroundColor: "#07060d",
    frame: false,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });

  mainWindow.on("resize", syncViewBounds);
  const onMaxChange = () => {
    mainWindow.webContents.send("window-maximized", mainWindow.isMaximized());
    syncViewBounds();               // immediate
    setTimeout(syncViewBounds, 50); // and again after the window settles
  };
  mainWindow.on("maximize", onMaxChange);
  mainWindow.on("unmaximize", onMaxChange);

  // Close hides to tray (companion keeps running); real quit is via the tray
  // menu or window-all-closed after isQuiting. This is normal for an app that
  // hosts a background service.
  mainWindow.on("close", (e) => {
    if (!app.isQuiting) { e.preventDefault(); mainWindow.hide(); }
  });

  mainWindow.loadFile("index.html");

  mainWindow.webContents.on("did-finish-load", () => {
    locked = !!readSecurity();               // start locked if a PIN is set (renderer shows the lock UI)
    notesOpen = readSettings().notesOpen;   // restore the drawer if it was left open
    currentService = firstEnabledService();
    broadcastState();       // shell + service rail paint immediately (interactive right away)
    applyAppearance();
    broadcastCompanion();
    // Defer the heavy service web-app load so it doesn't stack on the Electron/
    // Chromium cold-start CPU burst - lowers the startup spike, and the window is
    // usable while the first service loads a beat later.
    setTimeout(() => relayout(), 900);
  });
}

// single instance: focus the existing window instead of opening a second app
const gotLock = process.argv.includes("--screenshot-check") ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

app.whenReady().then(async () => {
  if (!gotLock) return;  // a duplicate instance is already quitting; make no window/tray/icon
  app.setAppUserModelId(APP_ID); // Windows taskbar identity / notification attribution
  createWindow();
  if (!process.argv.includes("--screenshot-check")) {
    createTray();
    // Defer the companion (Python) spawn off the startup CPU burst - it isn't
    // needed in the first seconds (the phone won't connect that fast).
    setTimeout(() => startCompanion(), 2500);
    setTimeout(() => startNetSpeed(), 3500);   // internet speed meter (off the startup burst)
    setTimeout(() => startStats(), 4500);      // PC status sampler (off the startup burst)
  }

  if (process.argv.includes("--screenshot-check")) {
    const outDir = path.join(__dirname, "screenshots");
    fs.mkdirSync(outDir, { recursive: true });
    const shot = async (name) => { await new Promise((r) => setTimeout(r, 500)); fs.writeFileSync(path.join(outDir, name), (await mainWindow.webContents.capturePage()).toPNG()); };
    await new Promise((r) => setTimeout(r, 1500));

    // social layout (both rails) - webview area is empty in a mainWindow
    // capture, but the rails + title bar are what we're verifying here
    currentPrimary = "social"; relayout(); broadcastState(); await shot("layout_social.png");

    const s1 = readSettings(); s1.serviceRailCollapsed = true; writeSettings(s1); relayout(); broadcastState(); await shot("layout_service_collapsed.png");
    const s2 = readSettings(); s2.serviceRailCollapsed = false; s2.primaryCollapsed = true; writeSettings(s2); relayout(); broadcastState(); await shot("layout_primary_collapsed.png");
    const s3 = readSettings(); s3.primaryCollapsed = false; writeSettings(s3); relayout(); broadcastState();

    currentPrimary = "settings"; relayout(); broadcastState(); await shot("panel_settings.png");
    currentPrimary = "pcstatus"; relayout(); broadcastState(); await new Promise((r) => setTimeout(r, 700)); await shot("panel_pcstatus.png");
    currentPrimary = "pccompanion"; relayout(); broadcastState(); await shot("panel_pccompanion.png");
    // privacy scan spawns PowerShell - give it extra time to populate before capture
    currentPrimary = "privacy"; relayout(); broadcastState(); await new Promise((r) => setTimeout(r, 1600)); await shot("panel_privacy.png");

    console.log("SCREENSHOT_CHECK_DONE");
    app.quit();
  }
});

function cleanupTray() { try { if (tray) { tray.destroy(); tray = null; } } catch {} }
app.on("before-quit", () => { app.isQuiting = true; stopCompanion(); stopVoice(); stopAudio(); stopMonitor(); stopNetSpeed(); try { if (statTimer) clearInterval(statTimer); persistStats(); } catch {} cleanupTray(); });
app.on("will-quit", cleanupTray);   // ensure the tray icon is removed (no ghost icon)
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
