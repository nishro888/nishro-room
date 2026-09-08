# Nishro Room

A Windows desktop app that puts the things I use constantly into one window: my
social and mail accounts, my phone's screen, and voice control — with a PIN lock
over the lot.

Electron for the shell, Python and PowerShell for the parts that need to touch
the OS, and a small JSON protocol between them.

**Version 0.6.0.** Built and installed with `electron-builder`.

---

## What it does

### 1. Social Hub

Facebook, Messenger, Instagram, WhatsApp, Telegram, LinkedIn, Gmail and Drive in
one window, with a sidebar to switch between them. Each is the real, official
website, logged into normally by hand.

**This is a wrapper, not a bot.** Nothing here reads, sends, or scripts
messages — automating WhatsApp/Instagram/Facebook messaging violates their Terms
of Service and risks account bans. Each service is just a normal, isolated
browser view, the same as opening it in a regular Chrome tab.

### 2. Phone mirror

Shows the phone's screen as an MJPEG stream in a window, and turns mouse and
keyboard input into control commands — tap, long-press, swipe, navigation
buttons, text entry — sent back to the device.

### 3. PC Companion

A Python service (`companion/pc_companion.py`) that the Nishro Android app talks
to over the LAN for file transfer and mouse control.

**Standard library only, no pip installs.** Mouse control goes through
`user32.dll` via `ctypes`, so it is Windows-only by design.

**A PIN is mandatory, not optional.** Unlike browsing files, these endpoints can
move the mouse and click — they can take over the PC. An unauthenticated version
of that sitting on the LAN is not an acceptable default.

### 4. Offline voice control

Two interchangeable backends:

- **`voice_whisper.py`** — faster-whisper. Voice-activity detection segments each
  spoken phrase, auto-gain compensates for a weak mic, Whisper transcribes, and
  the text is fuzzy-matched against the command set.
- **`voice_vosk.py`** — lighter Vosk stack for slower machines.

**Fully offline.** `HF_HUB_OFFLINE` is set so it uses the cached model and never
blocks on the network.

### 5. Meters

- **`micmon.py`** — live microphone input level, for the on-screen meter
- **`netspeed.ps1`** — up/down throughput sampled once a second from adapter byte
  counters. Counters rather than parsed output, so it is locale-independent

---

## How it's built

**Electron shell.** One `BrowserView` per service, each with its own persisted
session partition (`persist:whatsapp`, `persist:telegram`, …). Logins survive
restarts, and no service can see another's cookies or storage.

**Python and PowerShell helpers as child processes.** Each one emits
**line-delimited JSON on stdout** — one object per line:

```
{"ready":true}
{"level":42}
{"c":"open whatsapp"}
{"error":"no input device"}
```

Simple to parse, simple to debug by running the script directly in a terminal,
and it keeps the audio and OS-level work out of the Electron process entirely.

**Security posture on every web view:** `nodeIntegration: false`,
`contextIsolation: true`, `sandbox: true`.

These are real websites from the open internet. Node.js access from inside them
would turn any future issue on their end into a full compromise of this PC.
**Verified empirically — see below — not just configured and assumed.**

**One adjustment for WhatsApp Web.** It rejects Electron's default User-Agent
purely because it contains the literal string `Electron/43.3.0`, even though the
underlying engine (Chromium 150, confirmed via `process.versions.chrome`) is
thoroughly modern. Fixed by presenting that real version in the standard Chrome
UA format — not impersonating a different browser, just describing the same one
the way WhatsApp's check expects.

---

## Verified before shipping

Screenshotted each service after loading (`npm run screenshot-check`) and looked
at the actual rendered result, not just "did it launch without throwing":

- **WhatsApp** — genuine "Scan to log in" QR screen. Before the User-Agent fix
  this showed "WhatsApp works with Google Chrome 100+" and blocked access
  entirely
- **Telegram** — genuine "Log in to Telegram by QR Code" screen
- **Instagram** — genuine login form
- **Facebook** — genuine login form

**Security isolation was checked the same way — tested, not assumed from the
config.** Loaded a real page (Instagram) with the same isolation settings and
tried to reach Node and Electron from inside it. `process`, `global`, and a
functional `require("electron")` were all confirmed absent.

A bare `typeof require` did read `true`, but that is Instagram's own page script
defining something with that name. The decisive test is whether it can actually
*reach* Electron, and it cannot.

## Not yet verified

The sidebar's click-to-switch interaction and cross-restart session persistence
were not driven by an automated test. Both are standard, well-established
Electron patterns, but "does clicking the WhatsApp icon swap views instantly" and
"does WhatsApp stay logged in after closing and reopening" need a hands-on check.

---

## Run it

```powershell
npm install
npm start
```

**First run:** click each sidebar icon and log in to that service normally — scan
a QR code for WhatsApp and Telegram, or enter credentials for the others. Each
service's login is stored in its own partition and persists across restarts, so
you log in once per service.

**Voice control** needs its Python dependencies and a cached model. **PC
Companion** runs standalone:

```powershell
python companion/pc_companion.py --pin 4821
python companion/pc_companion.py --pin 4821 --root D:\Shared --port 8100
```

## Build an installer

```powershell
npm run dist
```

Output lands in `installer/`.

---

## Related

**Nishro PC Companion supersedes `lanshare`** for in-app file transfer. `lanshare`
remains only for sideloading the Android APK itself — before the app exists to
talk to this.

---

## Notes

Windows-only. Mouse control uses `user32.dll` through `ctypes`, and the network
sampler uses `Get-NetAdapter`.

Built for my own use, so the defaults are mine. The security decisions are
deliberate and documented above rather than left implicit — if you fork this,
read that section before changing the isolation settings.
