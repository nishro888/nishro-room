# Test log

Newest first. What was checked, how, and what came out - so a result is not
re-earned, and a failure is not repeated. "The laptop" is the maintainer's
Windows 10 machine; "the phone" an Android 13 phone with the Nishro app.

## 2026-10-06 - Discord fix

- After a restart, Discord's Settings > Devices lists the app as "Windows -
  Chrome": the user agent fix is live. **Not verified:** watching a stream (none
  was live).
- The installed copy matches the committed source (`main.js`, `preload.js`,
  `renderer.js`, `index.html`, `style.css`, the companion).
- Ruled out for the missing streams: codecs - Electron 43.3 decodes VP8, VP9,
  H.264, AV1 and H.265 in WebRTC.

## 2026-09 - 0.7.0

- 09-19, `/send`: the page serves on the LAN; a test upload was saved.
- 09-13, the privacy monitor: 14 mic and 5 camera apps listed (screenshot).
- 09-14, the panels as cards: all four panels by screenshot.
- 09-10, PC Status: gauges and history by screenshot; the app's own footprint
  read 0.2% CPU, 693 MB, 5 processes.

## 2026-08 - 0.6.0 and before

- 08-28, the PIN lock: the service no longer shows through it, and the "Skip"
  button that bypassed it is hidden.
- 08-18, Whisper: `tiny.en` loads in 2.6 s and transcribes a clip in 0.9 s;
  fuzzy matching maps near misses to commands and rejects other words.
- 08-17, Vosk recognized the command set from a clean recording; the mic
  chooser moved the default from Stereo Mix to the real mic.
- 08-12, **the phone, controlled from the PC window over Wi-Fi** (tap, swipe,
  buttons): confirmed on the phone.
- 08-11, notifications: a page with a strict CSP called `new Notification`;
  the bridge reached the main process and a hidden window was shown.
- 08-10, the NSIS setup (0.6.0): silent install, the Add/Remove entry and both
  shortcuts; after launch, 6 app processes and 0 "electron", companion ping
  200.
- 08-08, the companion: no PIN -> 401, path traversal -> 403, a 2 MB upload
  and ranged download byte-identical (SHA-256).
