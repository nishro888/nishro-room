# Working on Nishro Room

A Windows desktop app (Electron): social and mail sites in one window, a
phone's screen and control, offline voice commands, PC status, a camera and
mic privacy monitor, and a PC companion that the Nishro phone app talks to
over the LAN. Windows only.

## First: the project's working memory - `devnotes/`

Work continues from where it stopped, on any computer. **At the start of a
session, read `devnotes/STATE.md`**, and before a build, a deploy or a test,
the matching section of `devnotes/LESSONS.md`: what already failed is there,
with what works instead - do not repeat it.

As you go: a step that fails or misleads -> a line in `LESSONS.md`, at once; a
result that matters -> `TESTLOG.md`; before stopping -> `STATE.md` brought up
to date, and `devnotes/` committed with the work. `devnotes/README.md` has the
routine. Nothing personal in any of it.

## Where things are

| | |
|---|---|
| `main.js` | The main process: the window, the service views (one `BrowserView` each), tray, settings, the companion's supervisor, every IPC handler. |
| `index.html`, `renderer.js`, `style.css`, `preload.js` | The app window. |
| `service-preload.js` | Carries a service page's notifications to the main process. |
| `mirror.html`, `mirror.js`, `mirror-preload.js` | The phone screen and control window. |
| `companion/pc_companion.py` | The PC companion: files, mouse, keys, media, clipboard, the `/send` upload page. Python standard library only; `main.js` starts it on port 8100. |
| `voice_whisper.py`, `voice_vosk.py`, `voice.ps1` | Voice commands - Whisper, then Vosk, then Windows speech as fallbacks. |
| `mic.ps1`, `micmon.ps1`, `micmon.py` | Choose a real microphone (never a loopback), unmute it, report its level. |
| `netspeed.ps1`, `privacy.ps1` | The title bar's network meter; which apps used the camera or mic. |
| `make_icon.js`, `build-assets/` | The icon. |

## Commands

```powershell
npm install
npm start                    # from source; in a VS Code terminal first: Remove-Item Env:ELECTRON_RUN_AS_NODE
npm run screenshot-check     # every panel to screenshots/*.png
npx electron-builder --win --dir     # installer/win-unpacked - the app without a setup
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"; npx electron-builder --win nsis   # the setup - see LESSONS
```

There are no automated tests. Check a change with `--screenshot-check` and a
real run, and say plainly what was not verified (much needs a phone or a
logged-in account).

## Rules

- **A wrapper, not a bot.** Never read, send or script messages on the
  services; their terms forbid it, and accounts get banned.
- **Don't change the sites' own pages blind.** The proven levers are a
  per-view user agent, the notification and passkey patches, and zoom.
- **The companion can move the mouse**: every endpoint except `/api/ping`
  needs the PIN.
- **Change the source, then deploy it to the installed copy.** Never patch only
  the installed copy. Restart the app only with the maintainer's OK - it runs
  all day, maybe in a call.
- **In a logged-in account, click nothing that acts** (join, send, post,
  change a setting) without asking. A test click once joined a voice call.
- **This repository is public.** No names, addresses, accounts or PINs - in
  code, docs, screenshots or commit messages.
- Ask the maintainer before pushing, tagging or publishing.
