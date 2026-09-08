# Nishro mic monitor (Vosk stack) — emits live input level only, for the meter.
#   {"ready":true} | {"level":0..100} | {"error":"..."}
import sys, json, time, warnings
warnings.filterwarnings("ignore")

def emit(o):
    try: sys.stdout.write(json.dumps(o) + "\n"); sys.stdout.flush()
    except Exception: pass

try:
    import sounddevice as sd
    import audioop
except Exception as e:
    emit({"error": "deps: " + str(e)}); sys.exit(1)

try:
    dev = sd.query_devices(kind="input")
    SR = int(dev.get("default_samplerate") or 16000)
    block = int(SR * 0.1)
    with sd.RawInputStream(samplerate=SR, blocksize=block, dtype="int16", channels=1) as stream:
        emit({"ready": True})
        last = 0
        while True:
            data, _ = stream.read(block)
            now = time.time() * 1000
            if now - last >= 120:
                last = now
                try: lvl = min(100, int(audioop.max(bytes(data), 2) / 327))
                except Exception: lvl = 0
                emit({"level": lvl})
except Exception as e:
    emit({"error": str(e)}); sys.exit(1)
