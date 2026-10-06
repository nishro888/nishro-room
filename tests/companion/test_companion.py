"""Tests for the PC companion (companion/pc_companion.py): the real server on a
spare local port, serving a temporary folder.

The functions that would move the mouse, type, press keys or touch the
clipboard are replaced by recorders first, and user32 is taken away, so no
test can act on this desktop.

    python -m unittest discover -s tests/companion -v
"""
import importlib.util
import json
import os
import random
import socket
import tempfile
import threading
import unittest
import urllib.parse
from datetime import datetime, timezone
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("pc_companion", ROOT / "companion" / "pc_companion.py")
pc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pc)

PIN = "test-7f3a"   # not a 4-digit number, so it can't turn up in a page by chance
HOST = socket.gethostname()


class Recorder:
    """Stands in for the desktop-touching functions; remembers each call."""

    def __init__(self):
        self.calls = []
        self.clipboard = "copied on the PC"

    def install(self):
        def rec(name, result=None):
            def fn(*args):
                self.calls.append((name,) + args)
                return result
            return fn
        pc.move_cursor_relative = rec("move")
        pc.click = rec("click")
        pc.scroll = rec("scroll")
        pc.type_text = rec("type")
        pc._press_vk = rec("vk")
        pc.set_clipboard = rec("set_clipboard", True)
        pc.get_clipboard = lambda: self.clipboard
        pc._user32 = None   # anything not replaced fails instead of acting


class CompanionServer(unittest.TestCase):
    """Starts one server per test class, on 127.0.0.1 and a free port."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.base = Path(cls.tmp.name)
        cls.root = cls.base / "shared"
        cls.root.mkdir()
        cls.rec = Recorder()
        cls.rec.install()
        handler = type("Handler", (pc.CompanionHandler,), {
            "root": cls.root.resolve(), "pin": PIN, "log_message": lambda *a: None})
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.server.daemon_threads = True
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()

    def setUp(self):
        self.rec.calls.clear()

    def request(self, method, path, body=None, headers=None, pin=True):
        if pin:
            path += ("&" if "?" in path else "?") + "pin=" + urllib.parse.quote(PIN)
        conn = HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            conn.request(method, path, body=body, headers=headers or {})
            r = conn.getresponse()
            return r.status, dict(r.getheaders()), r.read()
        finally:
            conn.close()

    def post_json(self, path, payload, pin=True):
        status, _, body = self.request("POST", path, json.dumps(payload).encode(),
                                       {"Content-Type": "application/json"}, pin=pin)
        return status, json.loads(body or b"{}")

    @staticmethod
    def preamble(filename, boundary):
        return (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
                f"filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n").encode()

    def upload(self, filename, data, dest="Phone Uploads", boundary=None):
        boundary = boundary or "----nishroTest%08x" % random.getrandbits(32)
        body = self.preamble(filename, boundary) + data + f"\r\n--{boundary}--\r\n".encode()
        path = "/api/upload?path=" + urllib.parse.quote(dest)
        status, _, out = self.request("POST", path, body, {
            "Content-Type": f"multipart/form-data; boundary={boundary}"})
        return status, json.loads(out or b"{}")


class TheSendPage(CompanionServer):
    """The /send page (0.7.0): any phone's browser can send files, no app."""

    def test_is_public_and_names_this_pc(self):
        for path in ("/send", "/"):
            status, headers, body = self.request("GET", path, pin=False)
            page = body.decode("utf-8")
            self.assertEqual(status, 200, path)
            self.assertTrue(headers["Content-Type"].startswith("text/html"))
            self.assertIn(f"<title>Send to {HOST}</title>", page)
            self.assertNotIn("__PCNAME__", page)

    def test_never_contains_the_pin(self):
        """The page is unauthenticated; the PIN only ever comes from its URL."""
        _, _, body = self.request("GET", "/send", pin=False)
        page = body.decode("utf-8")
        self.assertNotIn(PIN, page)
        self.assertIn("new URLSearchParams(location.search).get('pin')", page)

    def test_uploads_where_the_page_sends_them(self):
        _, _, body = self.request("GET", "/send", pin=False)
        self.assertIn("'/api/upload?path='+encodeURIComponent('Phone Uploads')", body.decode())

    def test_an_upload_lands_whole_in_phone_uploads(self):
        # Larger than the reader's 256 KB chunks, with boundary-like bytes in it.
        data = bytes(random.getrandbits(8) for _ in range(700 * 1024))
        data = data[:300000] + b"\r\n--" + data[300000:524288] + b"\r\n----" + data[524288:]
        status, out = self.upload("IMG_0042.HEIC", data)
        self.assertEqual((status, out), (200, {"saved": "IMG_0042.HEIC"}))
        self.assertEqual((self.root / "Phone Uploads" / "IMG_0042.HEIC").read_bytes(), data)

    def test_a_file_ending_across_the_readers_chunks_arrives_intact(self):
        """The reader takes 256 KB at a time; the end-of-file marker may be split
        between two reads, and none of it may end up in the file."""
        boundary = "----nishroTestSplit01"
        marker = len(b"\r\n--" + boundary.encode())
        for k in (1, 2, marker // 2, marker - 1):   # marker bytes before the chunk edge
            name = f"split-{k}.bin"
            size = pc.CHUNK - k - len(self.preamble(name, boundary))
            data = bytes(random.getrandbits(8) for _ in range(size))
            status, out = self.upload(name, data, boundary=boundary)
            self.assertEqual((status, out), (200, {"saved": name}), k)
            self.assertEqual((self.root / "Phone Uploads" / name).read_bytes(), data, k)

    def test_the_same_name_twice_keeps_both(self):
        self.upload("twice.jpg", b"first")
        status, out = self.upload("twice.jpg", b"second")
        self.assertEqual((status, out["saved"]), (200, "twice (1).jpg"))
        self.assertEqual((self.root / "Phone Uploads" / "twice.jpg").read_bytes(), b"first")
        self.assertEqual((self.root / "Phone Uploads" / "twice (1).jpg").read_bytes(), b"second")

    def test_an_upload_cannot_leave_the_shared_folder(self):
        status, out = self.upload("../../escaped.txt", b"x")
        self.assertEqual((status, out["saved"]), (200, "escaped.txt"))
        self.assertTrue((self.root / "Phone Uploads" / "escaped.txt").exists())
        status, out = self.upload("outside.txt", b"x", dest="../../elsewhere")
        self.assertEqual(status, 200)
        self.assertTrue((self.root / "outside.txt").exists(), "a bad folder falls back to the root")
        outside = [p for p in self.base.rglob("*") if self.root not in p.parents and p != self.root]
        self.assertEqual(outside, [])

    def test_unsafe_characters_in_a_name_are_replaced(self):
        status, out = self.upload('a<b>:c|d?.txt', b"x")
        self.assertEqual((status, out["saved"]), (200, "a_b__c_d_.txt"))

    def test_not_multipart_or_no_file_is_refused(self):
        status, _, _ = self.request("POST", "/api/upload", b"plain", {"Content-Type": "text/plain"})
        self.assertEqual(status, 400)
        body = b"--B\r\nContent-Disposition: form-data; name=\"note\"\r\n\r\nhi\r\n--B--\r\n"
        status, _, out = self.request("POST", "/api/upload", body,
                                      {"Content-Type": "multipart/form-data; boundary=B"})
        self.assertEqual((status, json.loads(out)), (400, {"error": "no file in request"}))


class ThePin(CompanionServer):
    GETS = ["/api/files", "/api/download?path=x", "/api/clipboard", "/api/privacy", "/api/nope"]
    POSTS = ["/api/mouse/move", "/api/mouse/click", "/api/mouse/scroll", "/api/key/type",
             "/api/key/special", "/api/media", "/api/clipboard", "/api/upload"]

    def test_ping_needs_none(self):
        status, _, body = self.request("GET", "/api/ping", pin=False)
        self.assertEqual((status, json.loads(body)), (200, {"ok": True, "name": HOST}))

    def test_everything_else_needs_it(self):
        for wrong in (None, "0000", PIN + "x"):
            for path in self.GETS:
                p = path if wrong is None else path + ("&" if "?" in path else "?") + "pin=" + wrong
                self.assertEqual(self.request("GET", p, pin=False)[0], 401, (p, wrong))
            for path in self.POSTS:
                headers = {} if wrong is None else {"X-Pin": wrong}
                self.assertEqual(self.request("POST", path, b"{}", headers, pin=False)[0], 401, (path, wrong))
        self.assertEqual(self.rec.calls, [], "something ran without the PIN")

    def test_by_header_or_in_the_address(self):
        self.assertEqual(self.request("GET", "/api/files", headers={"X-Pin": PIN}, pin=False)[0], 200)
        self.assertEqual(self.request("GET", "/api/files")[0], 200)

    def test_preflight_lets_browsers_send_it(self):
        status, headers, _ = self.request("OPTIONS", "/api/files", pin=False)
        self.assertEqual(status, 204)
        self.assertIn("X-Pin", headers["Access-Control-Allow-Headers"])
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")


class Files(CompanionServer):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        (cls.root / "Music").mkdir()
        (cls.root / "b.txt").write_bytes(bytes(range(100)))
        (cls.root / "a.txt").write_bytes(b"hello")
        (cls.base / "secret.txt").write_bytes(b"outside the shared folder")

    def test_listing_puts_folders_first(self):
        status, _, body = self.request("GET", "/api/files?path=")
        names = [(e["name"], e["isDir"]) for e in json.loads(body)["entries"]]
        self.assertEqual(status, 200)
        self.assertEqual(names[0], ("Music", True))
        self.assertIn(("a.txt", False), names)

    def test_paths_outside_the_folder_are_refused(self):
        for path in ("..", "../", "../secret.txt", "Music/../../secret.txt", "%2e%2e/secret.txt"):
            self.assertEqual(self.request("GET", "/api/files?path=" + path)[0], 403, path)
            self.assertEqual(self.request("GET", "/api/download?path=" + path)[0], 403, path)

    def test_missing_is_not_found(self):
        self.assertEqual(self.request("GET", "/api/files?path=nope")[0], 404)
        self.assertEqual(self.request("GET", "/api/download?path=nope.txt")[0], 404)

    def test_download_whole_and_in_ranges(self):
        whole = bytes(range(100))
        status, headers, body = self.request("GET", "/api/download?path=b.txt")
        self.assertEqual((status, body, headers["Accept-Ranges"]), (200, whole, "bytes"))
        status, headers, body = self.request("GET", "/api/download?path=b.txt", headers={"Range": "bytes=10-19"})
        self.assertEqual((status, body, headers["Content-Range"]), (206, whole[10:20], "bytes 10-19/100"))
        status, _, body = self.request("GET", "/api/download?path=b.txt", headers={"Range": "bytes=-5"})
        self.assertEqual((status, body), (206, whole[-5:]))
        status, headers, _ = self.request("GET", "/api/download?path=b.txt", headers={"Range": "bytes=500-"})
        self.assertEqual((status, headers["Content-Range"]), (416, "bytes */100"))


class Remote(CompanionServer):
    """Mouse, keys, media, clipboard: checked and passed on - to recorders."""

    def test_mouse(self):
        self.assertEqual(self.post_json("/api/mouse/move", {"dx": 5, "dy": -3})[0], 200)
        self.assertEqual(self.post_json("/api/mouse/move", {"dx": 5})[0], 400)
        self.assertEqual(self.post_json("/api/mouse/click", {"button": "right", "action": "down"})[0], 200)
        self.assertEqual(self.post_json("/api/mouse/click", {"button": "middle"})[0], 400)
        self.assertEqual(self.post_json("/api/mouse/scroll", {"delta": -120})[0], 200)
        self.assertEqual(self.post_json("/api/mouse/scroll", {})[0], 400)
        self.assertEqual(self.rec.calls, [("move", 5, -3), ("click", "right", "down"), ("scroll", -120)])

    def test_keys_and_media(self):
        self.assertEqual(self.post_json("/api/key/type", {"text": "héllo"})[0], 200)
        self.assertEqual(self.post_json("/api/key/special", {"key": "enter"})[0], 200)
        self.assertEqual(self.post_json("/api/key/special", {"key": "f13"})[0], 400)
        self.assertEqual(self.post_json("/api/media", {"action": "volup"})[0], 200)
        self.assertEqual(self.post_json("/api/media", {"action": "louder"})[0], 400)
        self.assertEqual(self.rec.calls, [("type", "héllo"), ("vk", 0x0D), ("vk", 0xAF)])

    def test_clipboard_both_ways(self):
        status, _, body = self.request("GET", "/api/clipboard")
        self.assertEqual((status, json.loads(body)), (200, {"text": "copied on the PC"}))
        self.assertEqual(self.post_json("/api/clipboard", {"text": "from the phone"}), (200, {"ok": True}))
        self.assertEqual(self.post_json("/api/clipboard", {})[0], 400)
        self.assertEqual(self.rec.calls, [("set_clipboard", "from the phone")])

    def test_privacy_answers_with_both_lists(self):
        saved = pc.scan_privacy
        pc.scan_privacy = lambda: {"camera": [], "microphone": [{"name": "Discord.exe", "inUse": True}]}
        try:
            status, _, body = self.request("GET", "/api/privacy")
        finally:
            pc.scan_privacy = saved
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["microphone"][0]["name"], "Discord.exe")


# ---------------------------------------------------- the privacy scan (0.7.0)

def filetime(dt):
    return int(dt.timestamp() * 10_000_000) + pc._FT_EPOCH


class FakeRegistry:
    """Just enough of winreg for the consent-store walk: a nested dict per hive,
    where a key holding LastUsedTimeStart/Stop is an app."""
    HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE = "HKCU", "HKLM"

    def __init__(self, hives):
        self.hives = hives

    def OpenKey(self, hive, path):
        node = self.hives.get(hive, {})
        for part in path.split("\\"):
            if not isinstance(node, dict) or part not in node:
                raise OSError(path)
            node = node[part]
        return node

    def EnumKey(self, node, i):
        subkeys = [k for k, v in node.items() if isinstance(v, dict)]
        if i >= len(subkeys):
            raise OSError("no more")
        return subkeys[i]

    def QueryValueEx(self, node, name):
        if name not in node or isinstance(node[name], dict):
            raise OSError(name)
        return node[name], 11


class PrivacyScan(unittest.TestCase):
    T = [datetime(2026, 10, 6, h, tzinfo=timezone.utc) for h in range(8, 14)]

    def scan(self, hkcu, hklm=None):
        def tree(apps):
            t = node = {}
            for part in pc._CONSENT.split("\\"):
                node = node.setdefault(part, {})
            node.update(apps)
            return t
        saved = pc.winreg
        pc.winreg = FakeRegistry({"HKCU": tree(hkcu), "HKLM": tree(hklm or {})})
        try:
            return pc._scan_consent_device("microphone"), pc._scan_consent_device("webcam")
        finally:
            pc.winreg = saved

    def test_filetime_to_unix_milliseconds(self):
        self.assertIsNone(pc._ft_to_ms(0))
        self.assertEqual(pc._ft_to_ms(pc._FT_EPOCH), 0)
        self.assertEqual(pc._ft_to_ms(filetime(self.T[0])), int(self.T[0].timestamp() * 1000))

    def test_apps_using_a_device_now_come_first(self):
        t = self.T
        mic, cam = self.scan({
            "microphone": {"NonPackaged": {
                "C:#Apps#Zoom#Zoom.exe": {"LastUsedTimeStart": filetime(t[3]), "LastUsedTimeStop": filetime(t[4])},
                "C:#Apps#Discord#Discord.exe": {"LastUsedTimeStart": filetime(t[1]), "LastUsedTimeStop": 0},
                "C:#Apps#Never#Never.exe": {},   # no times: never used, not listed
            }},
            "webcam": {"Microsoft.WindowsCamera_8wekyb3d8bbwe": {
                "LastUsedTimeStart": filetime(t[2]), "LastUsedTimeStop": filetime(t[2])}},
        })
        self.assertEqual([(a["name"], a["inUse"]) for a in mic], [("Discord.exe", True), ("Zoom.exe", False)])
        self.assertEqual(mic[0]["path"], "C:\\Apps\\Discord\\Discord.exe")
        self.assertFalse(mic[0]["packaged"])
        self.assertEqual(mic[1]["lastStart"], int(t[3].timestamp() * 1000))
        self.assertEqual(len(cam), 1)
        self.assertEqual((cam[0]["name"], cam[0]["packaged"], cam[0]["inUse"]),
                         ("Microsoft.WindowsCamera", True, False))

    def test_one_row_per_app_across_user_and_machine(self):
        t = self.T
        key = "C:#Apps#Discord#Discord.exe"
        mic, _ = self.scan(
            {"microphone": {"NonPackaged": {key: {"LastUsedTimeStart": filetime(t[1]), "LastUsedTimeStop": filetime(t[2])}}}},
            {"microphone": {"NonPackaged": {key: {"LastUsedTimeStart": filetime(t[5]), "LastUsedTimeStop": filetime(t[5])}}}},
        )
        self.assertEqual(len(mic), 1)
        self.assertEqual(mic[0]["lastStart"], int(t[5].timestamp() * 1000), "the latest use wins")

    def test_no_store_means_empty_lists(self):
        self.assertEqual(self.scan({}), ([], []))

    @unittest.skipUnless(os.name == "nt", "Windows only")
    def test_on_windows_it_never_takes_the_endpoint_down(self):
        result = pc.scan_privacy()
        self.assertEqual(set(result) - {"error"}, {"camera", "microphone"})


if __name__ == "__main__":
    unittest.main()
