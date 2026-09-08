// Preload for the phone mirror window. Exposes the phone address + a control
// relay (control commands go through the main process to avoid CORS).
const { ipcRenderer, contextBridge } = require("electron");

const params = new URLSearchParams(location.search);
const ip = params.get("ip") || "";
const port = params.get("port") || "8090";

contextBridge.exposeInMainWorld("phone", {
  ip,
  port,
  streamUrl: () => `http://${ip}:${port}/?t=${Date.now()}`,
  control: (cmd) => ipcRenderer.invoke("phone-control", { ip, port, cmd }),
  info: () => ipcRenderer.invoke("phone-info", { ip, port }),
  config: (cfg) => ipcRenderer.invoke("phone-config", { ip, port, cfg }),
  win: (action) => ipcRenderer.invoke("mirror-window", { action }),
  voiceStart: () => ipcRenderer.invoke("voice-start", { ip, port }),
  voiceStop: () => ipcRenderer.invoke("voice-stop"),
  onVoice: (cb) => ipcRenderer.on("voice-status", (_e, s) => cb(s)),
  audioStart: () => ipcRenderer.invoke("audio-start", { ip, port }),
  audioStop: () => ipcRenderer.invoke("audio-stop"),
  onAudioChunk: (cb) => ipcRenderer.on("audio-chunk", (_e, chunk) => cb(chunk)),
  onAudioEnd: (cb) => ipcRenderer.on("audio-end", () => cb()),
  micList: () => ipcRenderer.invoke("mic-list"),
  micSet: (id) => ipcRenderer.invoke("mic-set", { id }),
  micMonitorStart: () => ipcRenderer.invoke("mic-monitor-start"),
  micMonitorStop: () => ipcRenderer.invoke("mic-monitor-stop"),
});
