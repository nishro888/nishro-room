// Phone mirror window: shows the MJPEG stream and turns mouse/keyboard input
// into control commands (tap / long-press / swipe / nav buttons / text) sent to
// the phone via the main process (window.phone.control).
const screenEl = document.getElementById("screen");
const connEl = document.getElementById("conn");
const hintEl = document.getElementById("hint");
const overlay = document.getElementById("overlay");
const ovMsg = document.getElementById("ov-msg");
const ovActions = document.getElementById("ov-actions");
const ovSpin = document.getElementById("ov-spin");

let controlOn = false;
let everConnected = false;   // have we shown a frame yet this session?
let retryTimer = null;

function setOverlay(msg, spin, actions) {
  ovMsg.textContent = msg;
  ovSpin.style.display = spin ? "block" : "none";
  ovActions.innerHTML = "";
  (actions || []).forEach((a) => { const b = document.createElement("button"); b.textContent = a.label; b.onclick = a.onClick; ovActions.appendChild(b); });
  overlay.classList.remove("hidden");
}

function tryConnect() {
  clearTimeout(retryTimer);
  if (!everConnected) { setOverlay("Connecting to phone…", true, []); connEl.textContent = "connecting…"; connEl.className = ""; }
  screenEl.src = window.phone.streamUrl(); // cache-busted each call -> reopens the stream
}

screenEl.onload = () => {
  everConnected = true;
  overlay.classList.add("hidden");   // live frames -> hide the waiting UI
  connEl.textContent = "connected"; connEl.className = "ok";
};

screenEl.onerror = async () => {
  screenEl.removeAttribute("src");
  if (!everConnected) {
    // phone hasn't started sharing yet -> keep waiting + auto-retry (the PC "waiting screen")
    connEl.textContent = "waiting for phone"; connEl.className = "";
    setOverlay("Waiting for the phone to start sharing…\nOn the phone: Nishro app → More → Screen to PC → Share my screen.", true, []);
    retryTimer = setTimeout(tryConnect, 1500);
    return;
  }
  // we were connected and the stream dropped: is the phone still up (blip) or did it end?
  connEl.textContent = "reconnecting…"; connEl.className = "err";
  setOverlay("Connection interrupted — checking…", true, []);
  const info = await window.phone.info().catch(() => null);
  if (info && info.ok) {
    retryTimer = setTimeout(tryConnect, 800);   // server alive -> transient, retry
  } else {
    setOverlay("The phone ended the session.", false, [
      { label: "Reconnect", onClick: tryConnect },
      { label: "Close", onClick: () => window.close() },
    ]);
  }
};

function connect() {
  tryConnect();
  refreshInfo();
}

let cfgLoaded = false;
let infoFails = 0;
async function refreshInfo() {
  let info = null;
  try { info = await window.phone.info(); } catch (e) {}
  const ok = !!(info && info.ok);
  controlOn = ok && !!info.control;
  if (ok) {
    infoFails = 0;
    if (!cfgLoaded && (info.maxDim || info.quality || info.fps)) { loadConfig(info); cfgLoaded = true; }
  } else if (everConnected && ++infoFails >= 2) {
    // backup for the rare half-hung stream: the phone server is gone -> ended.
    everConnected = false;
    screenEl.removeAttribute("src");
    connEl.textContent = "ended"; connEl.className = "err";
    setOverlay("The phone ended the session.", false, [
      { label: "Reconnect", onClick: () => { infoFails = 0; tryConnect(); } },
      { label: "Close", onClick: () => window.close() },
    ]);
  }
  if (!voiceOn) {
    hintEl.textContent = controlOn
      ? "click = tap · hold = long-press · drag = swipe · wheel = scroll · just type to enter text"
      : "View only - enable 'Control from PC' in the phone app (More → Screen to PC) to tap & swipe.";
  }
}

// Map a mouse event to normalized (0..1) coordinates within the CONTAINED image
// (accounts for letterboxing from object-fit: contain).
function norm(evt) {
  const iw = screenEl.naturalWidth, ih = screenEl.naturalHeight;
  if (!iw || !ih) return null;
  const rect = screenEl.getBoundingClientRect();
  const scale = Math.min(rect.width / iw, rect.height / ih);
  const dispW = iw * scale, dispH = ih * scale;
  const offX = rect.left + (rect.width - dispW) / 2;
  const offY = rect.top + (rect.height - dispH) / 2;
  const nx = (evt.clientX - offX) / dispW;
  const ny = (evt.clientY - offY) / dispH;
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null; // on the black letterbox
  return { x: nx, y: ny };
}

const send = (cmd) => window.phone.control(cmd);

// --- pointer: tap / long-press / swipe ---
let down = null;
screenEl.addEventListener("pointerdown", (e) => {
  const p = norm(e);
  if (!p) return;
  down = { x: p.x, y: p.y, t: Date.now() };
  try { screenEl.setPointerCapture(e.pointerId); } catch (err) {}
});
screenEl.addEventListener("pointerup", (e) => {
  if (!down) return;
  const p = norm(e) || { x: down.x, y: down.y };
  const dt = Date.now() - down.t;
  const dist = Math.hypot(p.x - down.x, p.y - down.y);
  if (dist < 0.02 && dt < 450) {
    send({ type: "tap", x: down.x, y: down.y });
  } else if (dist < 0.02) {
    send({ type: "longpress", x: down.x, y: down.y });
  } else {
    send({ type: "swipe", x1: down.x, y1: down.y, x2: p.x, y2: p.y, dur: Math.min(600, Math.max(60, dt)) });
  }
  down = null;
});
screenEl.addEventListener("pointercancel", () => { down = null; });
screenEl.addEventListener("contextmenu", (e) => e.preventDefault());

// --- wheel: scroll = vertical swipe ---
let wheelTimer = null;
screenEl.addEventListener("wheel", (e) => {
  e.preventDefault();
  const p = norm(e);
  if (!p) return;
  const amt = Math.max(0.12, Math.min(0.5, Math.abs(e.deltaY) / 600));
  const dir = e.deltaY > 0 ? 1 : -1; // wheel down -> content scrolls up -> swipe up
  const y1 = Math.min(0.85, Math.max(0.15, p.y + dir * amt / 2));
  const y2 = Math.min(0.85, Math.max(0.15, p.y - dir * amt / 2));
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => send({ type: "swipe", x1: p.x, y1, x2: p.x, y2, dur: 120 }), 10);
}, { passive: false });

// --- nav buttons ---
document.querySelectorAll("#bar button[data-key]").forEach((b) => {
  b.addEventListener("click", () => send({ type: "key", key: b.dataset.key }));
});

// --- keyboard: type in real time into the phone's focused field ---
window.addEventListener("keydown", (e) => {
  if (e.key === "F11") { window.phone.win("fullscreen"); e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return; // let window/app shortcuts pass
  if (e.key === "Backspace") { send({ type: "backspace" }); e.preventDefault(); return; }
  if (e.key === "Enter") { send({ type: "text", text: "\n" }); e.preventDefault(); return; }
  if (e.key.length === 1) { send({ type: "text", text: e.key }); e.preventDefault(); return; }
});

// --- settings panel: quality / fps / resolution, applied live ---
const PRESETS = {
  smooth:   { maxDim: 560,  fps: 20, quality: 32 },   // fluid for reels
  balanced: { maxDim: 720,  fps: 16, quality: 45 },
  sharp:    { maxDim: 1200, fps: 12, quality: 78 },
};
const sRes = document.getElementById("s-res"), sFps = document.getElementById("s-fps"), sQ = document.getElementById("s-q");
const vRes = document.getElementById("v-res"), vFps = document.getElementById("v-fps"), vQ = document.getElementById("v-q");

function paintSliders() {
  vRes.textContent = sRes.value + "px";
  vFps.textContent = sFps.value + " fps";
  vQ.textContent = sQ.value + "%";
}
function markActivePreset() {
  document.querySelectorAll(".preset").forEach((b) => {
    const p = PRESETS[b.dataset.preset];
    b.classList.toggle("active", !!p && +sRes.value === p.maxDim && +sFps.value === p.fps && +sQ.value === p.quality);
  });
}
function loadConfig(cfg) {
  if (cfg.maxDim) sRes.value = cfg.maxDim;
  if (cfg.fps) sFps.value = cfg.fps;
  if (cfg.quality) sQ.value = cfg.quality;
  paintSliders();
  markActivePreset();
}
let cfgTimer = null;
function sendConfig() {
  clearTimeout(cfgTimer);
  cfgTimer = setTimeout(() => window.phone.config({ maxDim: +sRes.value, fps: +sFps.value, quality: +sQ.value }), 180);
}
[sRes, sFps, sQ].forEach((s) => s.addEventListener("input", () => { paintSliders(); markActivePreset(); sendConfig(); }));
document.querySelectorAll(".preset").forEach((b) => b.addEventListener("click", () => {
  const p = PRESETS[b.dataset.preset]; if (!p) return;
  sRes.value = p.maxDim; sFps.value = p.fps; sQ.value = p.quality;
  paintSliders(); markActivePreset(); sendConfig();
}));
document.getElementById("btn-settings").addEventListener("click", () => {
  const panel = document.getElementById("panel");
  panel.classList.toggle("hidden");
  const open = !panel.classList.contains("hidden");
  // Show live mic input while settings is open (unless full voice is already on)
  if (open && !voiceOn) window.phone.micMonitorStart();
  else if (!open && !voiceOn) window.phone.micMonitorStop();
});
document.getElementById("btn-full").addEventListener("click", async () => {
  const r = await window.phone.win("fullscreen");
  document.getElementById("btn-full").classList.toggle("active", !!(r && r.fullscreen));
});
document.getElementById("btn-top").addEventListener("click", async () => {
  const r = await window.phone.win("ontop");
  document.getElementById("btn-top").classList.toggle("active", !!(r && r.ontop));
});

// ---- voice control (hands-free) ----
let voiceOn = false;
const voiceBtn = document.getElementById("btn-voice");
voiceBtn.addEventListener("click", async () => {
  if (voiceOn) { await window.phone.voiceStop(); return; }
  voiceBtn.classList.add("active");
  hintEl.textContent = "🎤 Starting voice AI… (first start loads the model, ~5s)";
  const r = await window.phone.voiceStart();
  if (!r || !r.ok) { voiceBtn.classList.remove("active"); hintEl.textContent = "Couldn't start voice (mic in use?)."; }
});
const micBar = document.getElementById("mic-bar");
const micHint = document.getElementById("mic-hint");
window.phone.onVoice((s) => {
  if (s.micError) { micHint.textContent = "mic error"; micHint.style.color = "var(--err)"; return; }
  // live mic level: show the exact number so a dead vs weak vs good mic is clear
  if (s.level != null) {
    const raw = Math.max(0, Math.round(s.level));
    micBar.style.width = Math.min(100, Math.round(raw * 2.4)) + "%";   // amplified so weak mics still show
    const hearing = raw > 4;
    micHint.textContent = (hearing ? "🎤 " : "quiet ") + raw;
    micHint.style.color = hearing ? "var(--ok)" : "var(--muted)";
    return;
  }
  voiceOn = !!s.listening;
  voiceBtn.classList.toggle("active", voiceOn);
  if (!voiceOn) { micBar.style.width = "0"; micHint.textContent = "🎤 off"; micHint.style.color = "var(--muted)"; }
  if (s.error) { hintEl.textContent = "Voice error: " + s.error; return; }
  if (!voiceOn) { hintEl.textContent = ""; return; } // refreshInfo repaints the normal hint
  const heard = s.heard ? "  ·  heard: " + s.heard : "";
  hintEl.textContent = (s.mode === "dictate")
    ? "🎤 Dictating — speak your message, then say “send”. Say “stop” to finish." + heard
    : "🎤 Voice on — say: next · previous · like · back · home · volume up · type … / send" + heard;
});

// ---- mic picker (populate on open; unmutes + sets default on change) ----
const micSel = document.getElementById("mic-sel");
async function loadMics() {
  const mics = await window.phone.micList();
  micSel.innerHTML = "";
  if (!Array.isArray(mics) || !mics.length) { const o = document.createElement("option"); o.textContent = "No microphone found"; micSel.appendChild(o); return; }
  for (const m of mics) {
    const o = document.createElement("option");
    o.value = m.id;
    const tag = m.loopback ? "  — system sound, NOT a mic" : (m.muted ? "  (was muted)" : "");
    o.textContent = m.name + tag;
    if (m.loopback) o.style.color = "#f4556e";
    if (m.default) o.selected = true;
    micSel.appendChild(o);
  }
}
micSel.addEventListener("change", async () => {
  await window.phone.micSet(micSel.value);
  await loadMics();  // reflect the new default
});
loadMics();
// ---- phone audio playback (raw PCM S16LE stereo @ 44100 -> Web Audio) ----
const AUDIO_RATE = 44100;
let audioCtx = null, audioNext = 0, audioOn = false, audioLeftover = new Uint8Array(0);
const soundBtn = document.getElementById("btn-sound");

function feedAudio(u8) {
  if (!audioCtx) return;
  let data = u8;
  if (audioLeftover.length) { const m = new Uint8Array(audioLeftover.length + u8.length); m.set(audioLeftover); m.set(u8, audioLeftover.length); data = m; }
  const frames = Math.floor(data.length / 4);       // 2 ch * 2 bytes
  audioLeftover = data.slice(frames * 4);           // carry partial frame
  if (frames === 0) return;
  const dv = new DataView(data.buffer, data.byteOffset, frames * 4);
  const L = new Float32Array(frames), R = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { L[i] = dv.getInt16(i * 4, true) / 32768; R[i] = dv.getInt16(i * 4 + 2, true) / 32768; }
  const buf = audioCtx.createBuffer(2, frames, AUDIO_RATE);
  buf.copyToChannel(L, 0); buf.copyToChannel(R, 1);
  const src = audioCtx.createBufferSource();
  src.buffer = buf; src.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  if (audioNext < now + 0.02) audioNext = now + 0.10; // (re)prime jitter buffer on underrun
  src.start(audioNext);
  audioNext += buf.duration;
}

soundBtn.addEventListener("click", async () => {
  if (audioOn) {
    audioOn = false;
    await window.phone.audioStop();
    if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
    audioLeftover = new Uint8Array(0);
    soundBtn.textContent = "🔈"; soundBtn.classList.remove("active");
  } else {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try { await audioCtx.resume(); } catch (e) {}
    audioNext = 0; audioLeftover = new Uint8Array(0);
    const r = await window.phone.audioStart();
    audioOn = !!(r && r.ok);
    soundBtn.textContent = audioOn ? "🔊" : "🔈";
    soundBtn.classList.toggle("active", audioOn);
    if (!audioOn) hintEl.textContent = "Couldn't start audio.";
  }
});
window.phone.onAudioChunk((chunk) => { if (audioOn) feedAudio(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)); });

// ---- private view: dim the phone screen (PC capture is unaffected) ----
let privateOn = false;
const privBtn = document.getElementById("btn-private");
privBtn.addEventListener("click", async () => {
  const want = !privateOn;
  const r = await window.phone.config({ private: want });
  if (r && r.private != null) {
    privateOn = !!r.private;
    privBtn.classList.toggle("active", privateOn);
    if (want && r.canDim === false) {
      hintEl.textContent = "To dim the phone, allow “Display over other apps” for Nishro on the phone.";
      privBtn.classList.remove("active"); privateOn = false;
    } else {
      hintEl.textContent = privateOn ? "🕶️ Private view on — phone screen dimmed (you still see it here)." : "";
    }
  }
});

paintSliders();

connect();
// re-check control status periodically (in case it's enabled after opening)
setInterval(refreshInfo, 5000);
