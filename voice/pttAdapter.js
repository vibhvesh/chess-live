/**
 * Pluggable adapter for the Sanket PTT backend.
 *
 * The app ships with PeerJS WebRTC push-to-talk between the two players.
 * To later route audio through Sanket PTT instead, implement `connectPtt`
 * and point the client voice module at this adapter.
 *
 * Config:
 *   - Browser: VITE_PTT_URL (see .env.example)
 *   - Default: https://ptt.bowlinger.net
 */
function readEnvUrl() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_PTT_URL) {
      return import.meta.env.VITE_PTT_URL;
    }
  } catch {
    /* not bundled */
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env.VITE_PTT_URL || process.env.PTT_URL || "";
  }
  return "";
}

export const PTT_URL = readEnvUrl() || "https://ptt.bowlinger.net";

/**
 * @param {{ url?: string, channel?: string, name?: string }} [config]
 * @returns {Promise<{ ok: boolean, url: string, error?: string, disconnect?: Function }>}
 */
export async function connectPtt(config = {}) {
  const url = config.url || PTT_URL;
  return {
    ok: false,
    url,
    error:
      "PTT adapter stub: voice currently uses in-game WebRTC. Set PTT_URL and implement connectPtt() to wire the Sanket PTT backend.",
  };
}

export function isPttConfigured() {
  return Boolean(PTT_URL);
}
