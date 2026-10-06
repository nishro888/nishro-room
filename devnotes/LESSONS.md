# Lessons

What failed or misled, why, and what works instead. Read the section that
touches the task before starting it. Newest at the end of each section.

## Building and packaging

- **`asar` must stay off.** Inside `app.asar`, `child_process` cannot start
  the bundled companion. `@electron/packager` turns asar on by default and
  silently breaks it; use electron-builder with `asar: false`.
- **The NSIS setup failed without symlink rights.** electron-builder extracts
  `winCodeSign-2.6.0.7z` on every build, and 7-Zip stops (exit 2) at two macOS
  `.dylib` symlinks that need Developer Mode or admin. `--win --dir` skips
  NSIS. For the setup without admin: wrap `node_modules/7zip-bin/win/x64/7za.exe`
  in a pass-through that turns 7-Zip's exit 1/2 into 0 (those files are
  macOS-only). The wrapper is lost on `npm install` - put it back, or turn on
  Developer Mode.
- **A new npm dependency must reach the installed copy** (`node_modules`
  too): after adding `qrcode`, an install without it crashed on `require`.
- **Icons:** render one 256 px master and resize it with `nativeImage`; an
  offscreen window per size raced the compositor. `png-to-ico` is ESM - use
  its `default` export.
- **The icon's font is free for non-commercial use only.** Only a rasterized
  "N" is shipped, never the font; change the font if this ever goes
  commercial.

## Electron at run time

- **A `BrowserView` is a native layer drawn over the page.** No HTML can sit
  over a service: the PIN lock showed the service through it until the views
  were removed while locked; the notes drawer resizes the view instead of
  covering it; context menus are native (`Menu.popup`). A collapsed strip of
  0 px sits behind the view and cannot be hovered - keep it wider than 0.
- **Sites read the user agent.** WhatsApp refused Electron's; Discord, seeing
  "Electron", never asked for video, so Go Live streams and cameras did not
  show. Present a Chrome-form user agent, per view (`webContents.setUserAgent`)
  - not per session, which every service shares.
- **Sites' Content Security Policy blocks injected `<script>` tags**;
  `executeJavaScript` and `insertCSS` are exempt. The notification and passkey
  patches rely on that.
- **A page's notification click cannot raise a hidden window** (`focus()`
  does nothing when the window is hidden to the tray). Web notifications are
  turned into native ones whose click runs in the main process.
- **The "insert security key" prompts** came from sites starting passkey
  logins on their own; the passkey patch declines them, and sites fall back
  to the password.
- **Popups** (sign-in, verify links) need `setWindowOpenHandler`: a framed,
  closable child window in the same session.
- **`ELECTRON_RUN_AS_NODE=1` is set in VS Code's terminals** and makes any
  Electron program, the installed `Nishro.exe` included, run as plain Node and
  exit. Remove it first, or start the app through `explorer.exe`. Add
  `--user-data-dir=<temp folder>` to run beside the installed one.
- **A second instance made a second tray icon**: return early when the
  single-instance lock was not won. Destroy the tray on quit; a force-killed
  app leaves a ghost icon until hovered.
- **Fast chats lagged**: every message changed the page title, and each change
  re-rendered the taskbar badge in an offscreen window. Skip unchanged counts,
  debounce, cache the images.
- **Quitting crashed** ("Object has been destroyed") - check `isDestroyed()` on
  the window and its `webContents`, not just for null.
- **A global `button { padding }` squeezed small icons** to a few pixels;
  utility buttons reset it. Judge small icons by sampling the screenshot's
  pixels; zoomed crops were too blurry to trust.
- **Changing the session partition logs everyone out once.**
- **With no permission handler set, Electron grants every permission** (camera,
  mic, notifications...). A site feature that fails is not missing a
  permission because no handler exists - a test chat once proposed that fix
  for the Discord streams. Check the site's console before adding handlers.

## The sites

- **Don't inject CSS into WhatsApp Web's layout.** Its class names are
  obfuscated, the result can't be checked without a login, and a width change
  broke it and was reverted. Zoom is the safe lever there.
- **Discord: a click on an "Active Now" card or a voice channel joins the
  call** - it happened in a test. Click server icons at most, and ask first.

## The companion

- **"Started" is not "serving".** Report it running only after `/api/ping`
  answers; ping it every few seconds and restart it if it dies.
- **A force-killed app can leave the companion holding port 8100**: free the
  port (only an orphaned Python process) before starting.
- **The LAN address:** skip virtual adapters (ZeroTier, vEthernet, WSL, VPN)
  and prefer 192.168.*; the first IPv4 found was a virtual one.
- **Relative `mouse_event` moves go through pointer acceleration** - (50,30)
  landed at (118,27). Set absolute positions.
- **401s that look like "the PC is down"** were a stale PIN saved on the phone.
- **Don't set `allow_reuse_address` on Windows**: `SO_REUSEADDR` lets two
  servers share a port.

## Voice and the microphone

- **The default recording device was "Stereo Mix"**, a loopback of the
  speakers: the engine heard system sound, never a mic. `mic.ps1 -Action auto`
  picks a real mic (headset, then USB, then built-in; a loopback never) and
  unmutes it.
- **A muted mic at 100% level looked like a broken recognizer.** Check mute
  first.
- **Playing speech through the speakers cannot test a built-in array mic**: its
  echo cancelling removes it.
- **`ctranslate2` 4.8.1 crashed (0xC0000005) loading the Whisper model**; 4.4.0
  works - keep it pinned.
- Windows speech was too unreliable for accented speech; Vosk's small
  Indian-English model was better; Whisper `tiny.en` best (about 5 s to load,
  about 1 s a command). Hence the chain Whisper -> Vosk -> Windows speech.

## Deploying and testing

- **Change the source, then deploy.** A fix once existed only in the installed
  copy. Deploy by copying the built `resources\app` over the installed one,
  then restart.
- **The X button only hides to the tray.** A restart is tray Quit, then open
  again - and only with the maintainer's OK.
- **The phone side can't be screenshotted from the PC**: say what the
  maintainer has to check on the phone.

## The tools used to do the work

- **`git add -A` after cherry-picking onto an older commit** swept in an
  untracked build folder that the newer `.gitignore` had been hiding - 11 MB
  of PyInstaller output, with local paths in it. Name the files to add, and
  check `git diff --cached --name-only` before committing.
