# Nishro voice control — high-quality offline speech via Whisper (faster-whisper).
# Voice-activity detection segments each spoken phrase, auto-gain boosts a weak
# mic, Whisper transcribes, and the text is fuzzy-matched to the command set.
# One JSON object per line on stdout:
#   {"ready":true} | {"c":"<cmd>"} | {"t":"<text>"} | {"mode":..} | {"level":..} | {"error":..}
import sys, os, json, time, queue, warnings, difflib
warnings.filterwarnings("ignore")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("HF_HUB_OFFLINE", "1")   # use the cached model; never block on network

def emit(o):
    try: sys.stdout.write(json.dumps(o) + "\n"); sys.stdout.flush()
    except Exception: pass

try:
    import numpy as np
    import sounddevice as sd
    from faster_whisper import WhisperModel
except Exception as e:
    emit({"error": "deps: " + str(e)}); sys.exit(1)

MODEL_SIZE = os.environ.get("NISHRO_WHISPER", "tiny.en")
try:
    model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8", cpu_threads=4)
except Exception as e:
    emit({"error": "model: " + str(e)}); sys.exit(1)

COMMANDS = [
    "next", "previous", "up", "down", "scroll", "scroll up", "scroll down", "swipe up", "swipe down",
    "like", "double tap", "heart", "tap", "select", "play", "pause", "okay",
    "back", "go back", "home", "go home", "recent apps", "recents", "notifications",
    "volume up", "volume down", "mute",
    "send", "enter", "clear", "delete", "backspace",
    "type", "dictate", "reply", "stop", "stop typing", "done",
]
DICT_TRIGGERS = {"type", "dictate", "reply"}
STOP_TRIGGERS = {"stop", "stop typing", "done", "stop dictation"}
DICT_CMDS = {"send", "enter", "clear", "delete", "backspace", "back", "home"}

def clean(t):
    return t.lower().strip().strip(".,!?;:\"' ")

# map a free transcript to the nearest command (Whisper output is fuzzy)
def match_command(text):
    t = clean(text)
    if not t: return None
    if t in COMMANDS: return t
    for c in COMMANDS:              # command appears as a phrase in the text
        if c in t: return c
    m = difflib.get_close_matches(t, COMMANDS, n=1, cutoff=0.62)
    if m: return m[0]
    w = t.split()[0] if t.split() else ""
    m = difflib.get_close_matches(w, COMMANDS, n=1, cutoff=0.72)  # first-word fallback
    return m[0] if m else None

SR = 16000
BLOCK = int(SR * 0.03)             # 30 ms frames
SIL_END = 11                       # ~330 ms of silence ends a phrase
MIN_SPEECH = 5                     # >=150 ms to count as speech
q = queue.Queue()
def _cb(indata, frames, tinfo, status):
    q.put(indata[:, 0].copy())

def transcribe(frames):
    audio = np.concatenate(frames).astype(np.float32)
    peak = float(np.max(np.abs(audio))) or 1.0
    audio = audio * min(10.0, 0.7 / peak)          # auto-gain for a weak mic
    segs, _ = model.transcribe(
        audio, language="en", beam_size=1, temperature=0.0, condition_on_previous_text=False,
        initial_prompt="Short voice commands: next, previous, back, home, like, play, pause, "
                       "volume up, volume down, scroll, notifications, send, stop.")
    return " ".join(s.text for s in segs).strip()

mode = "command"
try:
    with sd.InputStream(samplerate=SR, blocksize=BLOCK, dtype="float32", channels=1, callback=_cb):
        emit({"ready": True})
        noise = 0.006
        speech = []; sil = 0; in_speech = False; last_lvl = 0
        while True:
            block = q.get()
            rms = float(np.sqrt(np.mean(block * block)))
            now = time.time() * 1000
            if now - last_lvl >= 150:
                last_lvl = now; emit({"level": min(100, int(rms * 900))})
            thresh = max(0.010, noise * 3.5)
            if rms > thresh:
                if not in_speech: in_speech = True; speech = []
                speech.append(block); sil = 0
            else:
                if not in_speech:
                    noise = 0.97 * noise + 0.03 * rms        # track the noise floor
                else:
                    speech.append(block); sil += 1
                    if sil >= SIL_END:
                        in_speech = False
                        if len(speech) >= MIN_SPEECH + SIL_END:
                            text = transcribe(speech)
                            tl = clean(text)
                            if tl:
                                if mode == "command":
                                    cmd = match_command(text)
                                    if cmd in DICT_TRIGGERS: mode = "dictate"; emit({"mode": "dictate"})
                                    elif cmd: emit({"c": cmd})
                                else:
                                    if any(s in tl for s in STOP_TRIGGERS): mode = "command"; emit({"mode": "command"})
                                    else:
                                        cmd = match_command(text) if len(tl.split()) <= 2 else None
                                        if cmd in DICT_CMDS: emit({"c": cmd})
                                        else: emit({"t": text})
                        speech = []
except Exception as e:
    emit({"error": str(e)}); sys.exit(1)
