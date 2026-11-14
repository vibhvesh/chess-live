/**
 * Sanket PTT adapter for Chess Live.
 *
 * Reuses the official SuperPTT client (window.SuperPTT / vendored copy):
 *   https://vibhvesh.github.io/sanketptt/superptt/superptt.js
 *
 * Wire format (plaintext channels only — we never set a channel key):
 *   prefix  ptt-radio-66ab9178/
 *   topics  <prefix><channel>/{presence/<id>,floor,audio,sstv}
 *   presence  retained JSON {id,name,ts} every 5s; empty retained on leave
 *   floor     JSON {t:'claim'|'hb'|'release',id,name,ts}; lower ts wins
 *   audio     [len][id][raw 12 kHz mono Int16 LE PCM], ~1024 samples / 85 ms
 *
 * Default channel is "chess". Channel names must match /^[a-z0-9_-]{1,40}$/.
 */
export const PTT_URL = readEnvUrl() || "https://ptt.bowlinger.net";
export const DEFAULT_CHANNEL = "chess";
export const CHANNEL_RE = /^[a-z0-9_-]{1,40}$/;
export const RATE = 12000;
export const FRAME_SAMPLES = 1024;
export const PREFIX = "ptt-radio-66ab9178/";
export const SUPERPTT_URL = "https://vibhvesh.github.io/sanketptt/superptt/superptt.js";
export const MQTT_CDN_URL = "https://unpkg.com/mqtt@5/dist/mqtt.min.js";

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

export function normalizeChannel(raw) {
  const ch = String(raw || "").trim().toLowerCase();
  return CHANNEL_RE.test(ch) ? ch : null;
}

export function encodeAudioFrame(id, pcmI16) {
  const name = String(id || "");
  const n = name.length;
  const pcm = pcmI16 instanceof Int16Array ? pcmI16 : new Int16Array(pcmI16);
  const bytes = new Uint8Array(1 + n + pcm.byteLength);
  bytes[0] = n;
  for (let i = 0; i < n; i++) bytes[1 + i] = name.charCodeAt(i) & 0xff;
  bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 1 + n);
  return bytes;
}

export function decodeAudioFrame(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const n = b[0];
  if (!n || 1 + n > b.length) return null;
  let id = "";
  for (let j = 1; j <= n; j++) id += String.fromCharCode(b[j]);
  const pcmB = b.subarray(1 + n);
  if (pcmB.byteLength % 2) return { id, pcm: new Int16Array(0) };
  const copy = new Uint8Array(pcmB.byteLength);
  copy.set(pcmB);
  return { id, pcm: new Int16Array(copy.buffer) };
}

export function isPttConfigured() {
  return true;
}

function publicAsset(file) {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) {
      const base = import.meta.env.BASE_URL.endsWith("/")
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`;
      return `${base}vendor/${file}`;
    }
  } catch {
    /* not bundled */
  }
  return `/vendor/${file}`;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("no document"));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve(src);
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function loadFirst(urls, ok) {
  let last = null;
  for (const url of urls) {
    try {
      await loadScript(url);
      if (ok()) return url;
    } catch (err) {
      last = err;
    }
  }
  throw last || new Error("no script loaded");
}

/**
 * Load mqtt + official SuperPTT (fallback: vendored copies under /vendor/).
 */
export async function loadSuperPTT() {
  if (typeof window === "undefined") {
    throw new Error("SuperPTT browser loader called in a non-browser environment");
  }
  if (!window.mqtt) {
    await loadFirst([MQTT_CDN_URL, publicAsset("mqtt.min.js")], () => !!window.mqtt);
  }
  if (!window.SuperPTT) {
    await loadFirst([SUPERPTT_URL, publicAsset("superptt.js")], () => !!window.SuperPTT);
  }
  return { SuperPTT: window.SuperPTT, mqtt: window.mqtt };
}

/**
 * Connect a SuperPTT client and join a plaintext channel (default: chess).
 */
export async function connectPtt(config = {}) {
  const channel = normalizeChannel(config.channel || DEFAULT_CHANNEL);
  if (!channel) {
    return { ok: false, error: `Invalid channel. Use ${CHANNEL_RE}`, url: "", channel: config.channel };
  }
  const { SuperPTT, mqtt } = await loadSuperPTT();
  const brokers = config.brokers || SuperPTT.BROKERS;
  const client = new SuperPTT.Client(mqtt, {
    id: config.id,
    name: String(config.name || "Chess").slice(0, 40),
    prefix: config.prefix || PREFIX,
    brokers,
    on: config.on || function () {},
  });
  client.join(channel);
  return {
    ok: true,
    client,
    SuperPTT,
    channel,
    url: client.url || brokers[0],
    disconnect() {
      try {
        client.leave(channel);
      } catch {
        /* ignore */
      }
      client.close();
    },
  };
}
