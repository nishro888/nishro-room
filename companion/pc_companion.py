#!/usr/bin/env python3
"""Nishro PC Companion - file transfer + mouse control, called from the
Nishro Android app's "PC Connect" screen over the LAN.

Windows only (mouse control uses user32.dll via ctypes). Stdlib only, no
pip installs - same design principle as lanshare, which this supersedes
for in-app file transfer (lanshare stays only for sideloading the APK
itself, before the app exists to talk to this).

    python pc_companion.py --pin 4821
    python pc_companion.py --pin 4821 --root D:\Shared --port 8100

A PIN is mandatory, not optional like lanshare's - unlike browsing files,
these endpoints can move the mouse and click, i.e. take over the PC. An
unauthenticated version of that on the LAN is not an acceptable default.
"""

from __future__ import annotations

import argparse
import ctypes
import ctypes.wintypes
import json
import mimetypes
import re
import socket
import subprocess
import sys
import urllib.parse
try:
    import winreg
except ImportError:
    winreg = None
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CHUNK = 256 * 1024

# ------------------------------------------------------------ mouse control
# user32.dll constants (winuser.h). ctypes + ctypes.wintypes are stdlib, so
# this needs no pywin32 or any other dependency.
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_WHEEL = 0x0800

_user32 = ctypes.windll.user32 if sys.platform == "win32" else None


def get_cursor_pos() -> tuple[int, int]:
    pt = ctypes.wintypes.POINT()
    _user32.GetCursorPos(ctypes.byref(pt))
    return pt.x, pt.y


def move_cursor_relative(dx: int, dy: int) -> None:
    # mouse_event(MOUSEEVENTF_MOVE, ...) runs requested deltas through
    # Windows' pointer-acceleration curve ("Enhance pointer precision"),
    # which is on by default and makes the actual movement not match what
    # was asked for - confirmed by testing (a requested 50,30 delta landed
    # at 118,27). SetCursorPos with a computed absolute target sidesteps
    # acceleration entirely, since it sets the position directly.
    x, y = get_cursor_pos()
    _user32.SetCursorPos(int(x + dx), int(y + dy))


def click(button: str, action: str) -> None:
    down = MOUSEEVENTF_LEFTDOWN if button == "left" else MOUSEEVENTF_RIGHTDOWN
    up = MOUSEEVENTF_LEFTUP if button == "left" else MOUSEEVENTF_RIGHTUP
    if action in ("down", "click"):
        _user32.mouse_event(down, 0, 0, 0, 0)
    if action in ("up", "click"):
        _user32.mouse_event(up, 0, 0, 0, 0)


def scroll(delta: int) -> None:
    _user32.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, int(delta), 0)


# ------------------------------------------------------------ keyboard/media
# keybd_event is the same stdlib user32 approach as the mouse - no pywin32.
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004

# named non-character keys the phone remote exposes -> Windows virtual keys
VK_SPECIAL = {
    "enter": 0x0D, "backspace": 0x08, "tab": 0x09, "escape": 0x1B,
    "space": 0x20, "left": 0x25, "up": 0x26, "right": 0x27, "down": 0x28,
    "delete": 0x2E, "home": 0x24, "end": 0x23,
}
# media / volume keys (the same ones a keyboard's media row sends)
VK_MEDIA = {
    "mute": 0xAD, "voldown": 0xAE, "volup": 0xAF,
    "next": 0xB0, "prev": 0xB1, "stop": 0xB2, "playpause": 0xB3,
}


def _press_vk(vk: int) -> None:
    _user32.keybd_event(vk, 0, 0, 0)
    _user32.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)


def type_text(text: str) -> None:
    # KEYEVENTF_UNICODE injects the character directly by codepoint, so it
    # types any character regardless of keyboard layout - no per-key VK
    # mapping needed. (Covers the Basic Multilingual Plane; exotic emoji
    # beyond U+FFFF aren't handled, which is fine for typing into fields.)
    for ch in text:
        code = ord(ch)
        if code > 0xFFFF:
            continue
        _user32.keybd_event(0, code, KEYEVENTF_UNICODE, 0)
        _user32.keybd_event(0, code, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0)


def press_special(name: str) -> bool:
    vk = VK_SPECIAL.get(name)
    if vk is None:
        return False
    _press_vk(vk)
    return True


def press_media(name: str) -> bool:
    vk = VK_MEDIA.get(name)
    if vk is None:
        return False
    _press_vk(vk)
    return True


# ------------------------------------------------------------------ clipboard
# Uses PowerShell (always present on Windows) rather than raw clipboard
# ctypes calls - keeps this stdlib-only and avoids the OpenClipboard dance.
def get_clipboard() -> str:
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command", "Get-Clipboard -Raw"],
            capture_output=True, text=True, timeout=5,
        )
        # Get-Clipboard -Raw tacks on a trailing newline; drop it so the phone
        # receives exactly what was copied, not text + a stray blank line.
        return out.stdout.rstrip("\r\n")
    except Exception:
        return ""


def set_clipboard(text: str) -> bool:
    try:
        # text piped via stdin so arbitrary content needs no shell escaping
        subprocess.run(
            ["powershell", "-NoProfile", "-Command", "$input | Set-Clipboard"],
            input=text, text=True, timeout=5,
        )
        return True
    except Exception:
        return False


# ----------------------------------------------------------------- helpers


def primary_lan_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


# ------------------------------------------------- camera/mic privacy monitor
#
# Same source Windows Settings + the taskbar mic dot use: the CapabilityAccess-
# Manager\ConsentStore ledger. Each app key carries LastUsedTimeStart/Stop as
# FILETIME QWORDs; Stop == 0 means "using the device right now".

_CONSENT = r"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore"
_FT_EPOCH = 116444736000000000   # 100-ns ticks between 1601-01-01 and 1970-01-01


def _ft_to_ms(ft: int):
    if not ft or ft <= 0:
        return None
    return (int(ft) - _FT_EPOCH) // 10000


def _iter_consent_keys(hive, base):
    """Yield (relative_path, open_handle) for base and every descendant key."""
    try:
        root = winreg.OpenKey(hive, base)
    except OSError:
        return
    stack = [("", root)]
    while stack:
        rel, handle = stack.pop()
        yield rel, handle
        i = 0
        while True:
            try:
                name = winreg.EnumKey(handle, i)
            except OSError:
                break
            i += 1
            child_rel = rel + "\\" + name if rel else name
            try:
                stack.append((child_rel, winreg.OpenKey(hive, base + "\\" + child_rel)))
            except OSError:
                pass


def _scan_consent_device(device: str):
    by_id = {}
    base = _CONSENT + "\\" + device
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for rel, handle in _iter_consent_keys(hive, base):
            if not rel:
                continue
            try:
                start = winreg.QueryValueEx(handle, "LastUsedTimeStart")[0]
            except OSError:
                continue
            try:
                stop = winreg.QueryValueEx(handle, "LastUsedTimeStop")[0]
            except OSError:
                stop = 0
            parts = rel.split("\\")
            if parts[0] == "NonPackaged" and len(parts) >= 2:
                token = parts[1]
                fpath = token.replace("#", "\\")
                name = fpath.rsplit("\\", 1)[-1]
                packaged = False
            else:
                token = parts[0]
                fpath = token
                name = re.sub(r"_[^_]+$", "", token)   # strip publisher hash
                packaged = True
            in_use = bool(stop == 0 and start and start > 0)
            entry = {
                "name": name, "path": fpath, "packaged": packaged, "inUse": in_use,
                "lastStart": _ft_to_ms(start), "lastStop": _ft_to_ms(stop),
            }
            prev = by_id.get(token)
            if prev is None or in_use or (entry["lastStart"] or 0) > (prev["lastStart"] or 0):
                by_id[token] = entry
    items = list(by_id.values())
    items.sort(key=lambda e: (not e["inUse"], -(e["lastStart"] or 0)))
    return items


def scan_privacy():
    if winreg is None or sys.platform != "win32":
        return {"camera": [], "microphone": []}
    try:
        return {"camera": _scan_consent_device("webcam"),
                "microphone": _scan_consent_device("microphone")}
    except Exception as exc:   # never let a registry quirk take the endpoint down
        return {"camera": [], "microphone": [], "error": str(exc)}


class _MultipartReader:
    """Streaming multipart/form-data reader - same design as lanshare's:
    written by hand because cgi.FieldStorage buffers whole parts in memory
    and was removed in Python 3.13."""

    def __init__(self, rfile, content_length: int, boundary: bytes):
        self.rfile = rfile
        self.remaining = content_length
        self.delim = b"\r\n--" + boundary
        self.buf = b""

    def _fill(self) -> bool:
        if self.remaining <= 0:
            return False
        data = self.rfile.read(min(CHUNK, self.remaining))
        if not data:
            self.remaining = 0
            return False
        self.remaining -= len(data)
        self.buf += data
        return True

    def _read_line(self) -> bytes:
        while b"\r\n" not in self.buf:
            if not self._fill():
                line, self.buf = self.buf, b""
                return line
        idx = self.buf.find(b"\r\n")
        line, self.buf = self.buf[:idx], self.buf[idx + 2:]
        return line

    def _read_exact(self, count: int) -> bytes:
        while len(self.buf) < count:
            if not self._fill():
                break
        out, self.buf = self.buf[:count], self.buf[count:]
        return out

    def read_file_part(self):
        """Consume the opening boundary + headers, return (filename, stream)."""
        self._read_line()  # opening "--boundary"
        filename = None
        while True:
            line = self._read_line()
            if not line:
                break
            if line.lower().startswith(b"content-disposition:"):
                m = re.search(r'filename="([^"]*)"', line.decode("utf-8", "replace"))
                filename = m.group(1) if m else None
        return filename, self

    def copy_to(self, out) -> None:
        keep = len(self.delim)
        while True:
            idx = self.buf.find(self.delim)
            if idx >= 0:
                out.write(self.buf[:idx])
                self.buf = self.buf[idx + len(self.delim):]
                return
            if len(self.buf) > keep:
                out.write(self.buf[:-keep])
                self.buf = self.buf[-keep:]
            if not self._fill():
                out.write(self.buf)
                self.buf = b""
                return


def _safe_name(filename: str) -> str:
    name = filename.replace("\\", "/").split("/")[-1]
    name = re.sub(r'[<>:"|?*\x00-\x1f]', "_", name).strip(" .")
    return name[:180]


def _unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem, suffix, index = path.stem, path.suffix, 1
    while True:
        candidate = path.with_name(f"{stem} ({index}){suffix}")
        if not candidate.exists():
            return candidate
        index += 1


# ---------------------------------------------------------------- handler


class CompanionHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "nishro-pc-companion/1.0"

    root: Path
    pin: str

    # ---------------------------------------------------------------- auth

    def _authed(self) -> bool:
        header = self.headers.get("X-Pin")
        if header == self.pin:
            return True
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        return query.get("pin", [""])[0] == self.pin

    # ------------------------------------------------------------- replies

    def _json(self, status: int, payload) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        try:
            self.wfile.write(body)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def _cors(self) -> None:
        # The app calls this from its own origin (file:// in the Android
        # WebView, or https://nishro-app.vercel.app on the web build), never
        # this server's own origin, so CORS must be explicitly opened up.
        # The PIN is the real access control, not CORS - CORS only decides
        # whether a *browser* is allowed to read the response back.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "X-Pin, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ---------------------------------------------------------------- log

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s  %s\n" % (datetime.now().strftime("%H:%M:%S"), fmt % args))

    # ------------------------------------------------------------- routing

    def do_GET(self) -> None:
        split = urllib.parse.urlsplit(self.path)
        path = split.path

        if path == "/api/ping":
            self._json(200, {"ok": True, "name": socket.gethostname()})
            return
        if not self._authed():
            self._json(401, {"error": "bad or missing pin"})
            return
        if path == "/api/files":
            self._list_files(urllib.parse.parse_qs(split.query).get("path", [""])[0])
        elif path == "/api/download":
            self._download(urllib.parse.parse_qs(split.query).get("path", [""])[0])
        elif path == "/api/clipboard":
            self._json(200, {"text": get_clipboard()})
        elif path == "/api/privacy":
            self._json(200, scan_privacy())
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if not self._authed():
            self._json(401, {"error": "bad or missing pin"})
            return

        path = urllib.parse.urlsplit(self.path).path
        if path == "/api/mouse/move":
            self._mouse_move()
        elif path == "/api/mouse/click":
            self._mouse_click()
        elif path == "/api/mouse/scroll":
            self._mouse_scroll()
        elif path == "/api/key/type":
            self._key_type()
        elif path == "/api/key/special":
            self._key_special()
        elif path == "/api/media":
            self._media()
        elif path == "/api/clipboard":
            self._set_clipboard()
        elif path == "/api/upload":
            self._upload()
        else:
            self._json(404, {"error": "not found"})

    # ------------------------------------------------------------- files

    def _translate(self, rel_path: str) -> Path | None:
        rel = urllib.parse.unquote(rel_path, errors="surrogatepass").lstrip("/")
        candidate = (self.root / rel).resolve()
        if candidate != self.root and self.root not in candidate.parents:
            return None
        return candidate

    def _list_files(self, rel_path: str) -> None:
        target = self._translate(rel_path)
        if target is None or not target.is_dir():
            self._json(403 if target is None else 404, {"error": "invalid path"})
            return
        entries = []
        try:
            for entry in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
                stat = entry.stat()
                entries.append({
                    "name": entry.name,
                    "isDir": entry.is_dir(),
                    "size": stat.st_size,
                    "mtime": stat.st_mtime,
                })
        except OSError as exc:
            self._json(500, {"error": str(exc)})
            return
        self._json(200, {"path": rel_path, "entries": entries})

    def _download(self, rel_path: str) -> None:
        target = self._translate(rel_path)
        if target is None or not target.is_file():
            self._json(403 if target is None else 404, {"error": "invalid path"})
            return

        try:
            stat = target.stat()
            handle = open(target, "rb")
        except OSError:
            self._json(404, {"error": "cannot open"})
            return

        with handle:
            total = stat.st_size
            ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            rng = self._parse_range(total)

            if rng == "invalid":
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{total}")
                self.send_header("Content-Length", "0")
                self._cors()
                self.end_headers()
                return

            start, end = rng if rng else (0, total - 1)
            length = end - start + 1
            self.send_response(206 if rng else 200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(length))
            self.send_header("Accept-Ranges", "bytes")
            if rng:
                self.send_header("Content-Range", f"bytes {start}-{end}/{total}")
            self._cors()
            self.end_headers()

            handle.seek(start)
            remaining = length
            try:
                while remaining > 0:
                    data = handle.read(min(CHUNK, remaining))
                    if not data:
                        break
                    self.wfile.write(data)
                    remaining -= len(data)
            except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
                self.close_connection = True

    def _parse_range(self, total: int):
        header = self.headers.get("Range")
        if not header:
            return None
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", header.strip())
        if not match or total == 0:
            return "invalid"
        first, last = match.group(1), match.group(2)
        if first == "":
            if last == "":
                return "invalid"
            start = max(0, total - int(last))
            end = total - 1
        else:
            start = int(first)
            end = min(int(last), total - 1) if last else total - 1
        if start > end or start >= total:
            return "invalid"
        return start, end

    def _upload(self) -> None:
        ctype = self.headers.get("Content-Type", "")
        match = re.search(r'boundary=(?:"([^"]+)"|([^;]+))', ctype)
        if "multipart/form-data" not in ctype or not match:
            self._json(400, {"error": "expected multipart/form-data"})
            return

        boundary = (match.group(1) or match.group(2)).strip().encode()
        length = int(self.headers.get("Content-Length") or 0)
        reader = _MultipartReader(self.rfile, length, boundary)

        dest_param = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get("path", [""])[0]
        dest_dir = self._translate(dest_param) or self.root
        dest_dir.mkdir(parents=True, exist_ok=True)

        filename, stream = reader.read_file_part()
        if not filename:
            self._json(400, {"error": "no file in request"})
            return
        safe = _safe_name(filename)
        out_path = _unique_path(dest_dir / safe)
        try:
            with open(out_path, "wb") as out:
                stream.copy_to(out)
        except (ConnectionResetError, ConnectionAbortedError) as exc:
            self._json(400, {"error": f"upload interrupted: {exc}"})
            return
        self._json(200, {"saved": out_path.name})

    # -------------------------------------------------------------- mouse

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None

    def _mouse_move(self) -> None:
        body = self._read_json_body()
        if not body or "dx" not in body or "dy" not in body:
            self._json(400, {"error": "expected {dx, dy}"})
            return
        move_cursor_relative(body["dx"], body["dy"])
        self._json(200, {"ok": True})

    def _mouse_click(self) -> None:
        body = self._read_json_body() or {}
        button = body.get("button", "left")
        action = body.get("action", "click")
        if button not in ("left", "right") or action not in ("down", "up", "click"):
            self._json(400, {"error": "expected {button: left|right, action: down|up|click}"})
            return
        click(button, action)
        self._json(200, {"ok": True})

    def _mouse_scroll(self) -> None:
        body = self._read_json_body() or {}
        if "delta" not in body:
            self._json(400, {"error": "expected {delta}"})
            return
        scroll(body["delta"])
        self._json(200, {"ok": True})

    # -------------------------------------------------------- keyboard/media

    def _key_type(self) -> None:
        body = self._read_json_body()
        if not body or "text" not in body:
            self._json(400, {"error": "expected {text}"})
            return
        type_text(str(body["text"]))
        self._json(200, {"ok": True})

    def _key_special(self) -> None:
        body = self._read_json_body() or {}
        if not press_special(body.get("key", "")):
            self._json(400, {"error": f"unknown key; expected one of {sorted(VK_SPECIAL)}"})
            return
        self._json(200, {"ok": True})

    def _media(self) -> None:
        body = self._read_json_body() or {}
        if not press_media(body.get("action", "")):
            self._json(400, {"error": f"unknown media action; expected one of {sorted(VK_MEDIA)}"})
            return
        self._json(200, {"ok": True})

    def _set_clipboard(self) -> None:
        body = self._read_json_body()
        if body is None or "text" not in body:
            self._json(400, {"error": "expected {text}"})
            return
        ok = set_clipboard(str(body["text"]))
        self._json(200 if ok else 500, {"ok": ok})


# --------------------------------------------------------------------- main


def main() -> int:
    if sys.platform != "win32":
        print("error: mouse control needs Windows (user32.dll via ctypes)", file=sys.stderr)
        return 1

    parser = argparse.ArgumentParser(description="Nishro PC Companion")
    parser.add_argument("--root", default=".", help="folder exposed for file transfer")
    parser.add_argument("-p", "--port", type=int, default=8100)
    parser.add_argument("--pin", required=True, help="required for every request except /api/ping")
    parser.add_argument("--bind", default="0.0.0.0")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not root.is_dir():
        print(f"error: {root} is not a folder", file=sys.stderr)
        return 1

    CompanionHandler.root = root
    CompanionHandler.pin = args.pin

    server = ThreadingHTTPServer((args.bind, args.port), CompanionHandler)
    server.daemon_threads = True

    print(f"\n  Nishro PC Companion")
    print(f"  file root : {root}")
    print(f"  PIN       : {args.pin}")
    print(f"\n  In the Nishro app's PC Connect screen, enter:")
    print(f"      IP   : {primary_lan_ip()}")
    print(f"      Port : {args.port}")
    print("\n  Ctrl+C to stop.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
