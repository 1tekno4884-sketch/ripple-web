// Ripple web viewer config. Public values only — no secrets. Everything goes through the Ripple Worker (docs/API.md).
export const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
export const CONFIG = {
  apiUrl: LOCAL ? "http://127.0.0.1:8787" : "https://ripple-api.undertowstudio.workers.dev",
  mediaUrl: "",                       // public files: <apiUrl>/media/<key>
  androidApp: "https://1tekno4884-sketch.github.io/undertow-studio/#ripple",
  studio: "https://1tekno4884-sketch.github.io/undertow-studio/",
};
CONFIG.mediaUrl = CONFIG.apiUrl + "/media";
