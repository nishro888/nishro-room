# Nishro voice control — offline speech via Vosk (small Indian-English model).
# Grammar-constrained recognition = it only listens for the command words, so it
# is fast + accurate even with an accent/marginal mic. One JSON object per line:
#   {"ready":true} | {"c":"<cmd>"} | {"t":"<dictated text>"} |
#   {"mode":"command|dictate"} | {"level":0..100} | {"error":"..."}
import sys, os, json, time, queue, warnings
warnings.filterwarnings("ignore")

def emit(o):
    try:
        sys.stdout.write(json.dumps(o) + "\n"); sys.stdout.flush()
    except Exception:
        pass

MODEL_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("LOCALAPPDATA", ""), "Nishro", "vosk-model")

try:
    import sounddevice as sd
    from vosk import Model, KaldiRecognizer, SetLogLevel
    SetLogLevel(-1)
except Exception as e:
    emit({"error": "deps: " + str(e)}); sys.exit(1)

if not os.path.isdir(MODEL_PATH):
    emit({"error": "model not found: " + MODEL_PATH}); sys.exit(1)

try:
    model = Model(MODEL_PATH)
except Exception as e:
    emit({"error": "model load: " + str(e)}); sys.exit(1)

COMMANDS = [
    "next", "previous", "up", "down", "scroll", "scroll down", "scroll up", "swipe up", "swipe down",
    "like", "double tap", "heart", "tap", "select", "play", "pause", "okay",
    "back", "go back", "home", "go home", "recent apps", "notifications",
    "volume up", "volume down", "mute",
    "send", "enter", "clear", "delete",
    "type", "dictate", "reply", "stop", "stop typing", "done",
]
GRAMMAR = json.dumps(COMMANDS + ["[unk]"])
DICT_TRIGGERS = {"type", "dictate", "reply"}
STOP_TRIGGERS = {"stop", "stop typing", "done"}
DICT_CMDS = {"send", "enter", "clear", "delete", "backspace", "back", "home"}

# open the default input device at its native rate; Vosk resamples internally
try:
    dev = sd.query_devices(kind="input")
    SR = int(dev.get("default_samplerate") or 16000)
except Exception:
    SR = 16000

rec_cmd = KaldiRecognizer(model, SR, GRAMMAR)   # constrained -> accurate commands
rec_dict = KaldiRecognizer(model, SR)           # full vocab -> free dictation
mode = "command"

q = queue.Queue()
def _cb(indata, frames, tinfo, status):
    q.put(bytes(indata))

def _peak(buf):
    # peak of signed 16-bit little-endian samples -> 0..100
    try:
        import audioop
        return min(100, int(audioop.max(buf, 2) / 327))
    except Exception:
        return 0

try:
    with sd.RawInputStream(samplerate=SR, blocksize=int(SR * 0.25), dtype="int16",
                           channels=1, callback=_cb):
        emit({"ready": True})
        last_lvl = 0
        while True:
            data = q.get()
            now = time.time() * 1000
            if now - last_lvl >= 200:
                last_lvl = now
                emit({"level": _peak(data)})
            rec = rec_cmd if mode == "command" else rec_dict
            if rec.AcceptWaveform(data):
                try:
                    text = (json.loads(rec.Result()).get("text") or "").strip().lower()
                except Exception:
                    text = ""
                if not text or text == "[unk]":
                    continue
                if mode == "command":
                    if text in DICT_TRIGGERS:
                        mode = "dictate"; emit({"mode": "dictate"}); continue
                    emit({"c": text})
                else:
                    if text in STOP_TRIGGERS:
                        mode = "command"; emit({"mode": "command"}); continue
                    if text in DICT_CMDS:
                        emit({"c": text}); continue
                    emit({"t": text})
except Exception as e:
    emit({"error": str(e)}); sys.exit(1)
