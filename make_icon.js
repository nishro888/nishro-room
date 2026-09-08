// One-off icon generator: renders the "N" app icon in a red Disney-style
// script (Waltograph) to icon.png + a set of size PNGs, then builds a
// multi-resolution icon.ico. Uses the offscreen capturePage technique.
//
// The font (build-assets/waltographUI.ttf) is FREEWARE for personal,
// non-commercial use only (CC BY-NC-SA) - see build-assets/waltograph-license.txt.
// It is used only here at build time to rasterize the glyph; the font file
// itself is NOT bundled into the shipped app.
//
// Run:  npx electron make_icon.js       (writes icon.png, icon-*.png, icon.ico)
const { app, BrowserWindow, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");

// Tunables for the look
const RED = "#e01522";               // vivid Disney-ish red
const FONT_PATH = path.join(__dirname, "build-assets", "waltographUI.ttf");
const SIZES = [256, 128, 64, 48, 32, 24, 16];

const WORK = path.join(__dirname, ".iconwork");
fs.mkdirSync(WORK, { recursive: true });
// reference the font by file:// URL (no giant data: URLs -> reliable loads)
const fontUrl = "file:///" + FONT_PATH.replace(/\\/g, "/");

function writePage(size) {
  const radius = Math.round(size * 0.22);
  const fs_ = size * 0.78;          // Waltograph "N" cap size relative to tile
  const ty = size * 0.04;           // nudge to optically center the glyph
  const shadow = size >= 48 ? `text-shadow:0 ${size * 0.008}px ${size * 0.012}px rgba(0,0,0,.18);` : "";
  const html = `<!doctype html><head><meta charset="utf-8"><style>
    @font-face{font-family:'Waltograph';src:url('${fontUrl}') format('truetype')}
    html,body{margin:0;background:transparent}
    .tile{width:${size}px;height:${size}px;border-radius:${radius}px;
      background:linear-gradient(160deg,#ffffff 0%,#f0eef5 100%);
      box-shadow:inset 0 ${size * 0.015}px ${size * 0.03}px rgba(255,255,255,.7),
                 inset 0 -${size * 0.03}px ${size * 0.06}px rgba(20,10,40,.06);
      display:flex;align-items:center;justify-content:center;overflow:hidden}
    .n{font-family:'Waltograph';color:${RED};font-size:${fs_}px;line-height:1;
      transform:translateY(${ty}px);${shadow}}
  </style></head><body><div class="tile"><span class="n">N</span></div></body>`;
  const p = path.join(WORK, `tile-${size}.html`);
  fs.writeFileSync(p, html);
  return p;
}

// Render the master 256px tile once (a single offscreen window is reliable;
// spinning up one per size races the offscreen compositor).
async function renderMaster(size) {
  const page = writePage(size);
  const win = new BrowserWindow({ show: false, width: size, height: size, transparent: true,
    webPreferences: { offscreen: true } });
  await win.loadFile(page);
  await win.webContents.executeJavaScript("document.fonts.load(\"32px 'Waltograph'\").then(()=>document.fonts.ready).then(()=>true)").catch(() => {});
  await new Promise((r) => setTimeout(r, 350));
  const img = await win.webContents.capturePage();
  win.destroy();
  return img;
}

app.whenReady().then(async () => {
  const master = await renderMaster(256);           // nativeImage @256
  const files = [];
  for (const s of SIZES) {
    const img = s === 256 ? master : master.resize({ width: s, height: s, quality: "best" });
    const png = img.toPNG();
    const p = path.join(__dirname, `icon-${s}.png`);
    fs.writeFileSync(p, png);
    files.push(p);
    if (s === 256) fs.writeFileSync(path.join(__dirname, "icon.png"), png);
    console.log("rendered", s);
  }

  try {
    const mod = require("png-to-ico");
    const pngToIco = typeof mod === "function" ? mod : mod.default;
    const buf = await pngToIco(files);
    fs.writeFileSync(path.join(__dirname, "icon.ico"), buf);
    console.log("ICO_DONE");
  } catch (e) {
    console.log("ICO_MODULE_MISSING", e.message);
  }
  fs.rmSync(WORK, { recursive: true, force: true });
  console.log("ALL_DONE");
  app.quit();
});
