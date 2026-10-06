# State

**Last updated:** 2026-10-06

## Version

- **0.7.0 - on GitHub (source, 2026-10-06) and installed on the maintainer's
  laptop; no setup published.** It adds the camera and mic privacy monitor,
  the `/send` browser upload page (any phone, no app), and the Discord fix (a
  Chrome user agent, so Go Live streams and cameras show). The installed
  copy matches the source.

## Not yet verified

- Watching a Discord Go Live stream. Discord now sees the app as Chrome; no
  stream was live during the test.
- By hand, never confirmed: the feel of drag-to-reorder, logins surviving a
  restart, the taskbar badge with a real unread message.

## Next

1. Bring `README.md` up to date (it still says 0.6.0 and lists eight services;
   there are ten).

## Ideas, not started

- Load a service only when it is clicked (most of the startup CPU).
- H.264 for the phone screen (MJPEG now); mirroring the phone's
  notifications.
- Lock again when reopened from the tray (the PIN lock works at launch only).
- Instagram shows some emoji as boxes - not diagnosed.
- For a public release: add a service by URL, more than one account per
  service, import/export, auto-update, a signed setup.
