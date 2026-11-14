export const PTT_URL = import.meta.env.VITE_PTT_URL || "https://ptt.bowlinger.net";

export const PEER_OPTIONS = {
  host: import.meta.env.VITE_PEERJS_HOST || "0.peerjs.com",
  port: Number(import.meta.env.VITE_PEERJS_PORT || 443),
  path: import.meta.env.VITE_PEERJS_PATH || "/",
  secure: true,
  debug: 0,
};

export const HEARTBEAT_MS = 20_000;
export const STALE_AFTER_MS = 45_000;
export const RECONNECT_MS = 2_000;
