/**
 * Sanket PTT button module for Chess Live.
 * Wraps voice/pttAdapter (official SuperPTT client) with mic capture,
 * 12 kHz resample, 1024-sample frames, mixer playback, and hold-to-talk.
 * AudioContext is created only after a user tap (Connect or PTT).
 */
import {
  connectPtt,
  DEFAULT_CHANNEL,
  FRAME_SAMPLES,
  RATE,
  normalizeChannel,
  encodeAudioFrame,
} from "./pttAdapter.js";

const LS_KEY = "chess-live:ptt";
const listeners = new Set();

function defaultName() {
  return `Chess-${Math.random().toString(36).slice(2, 6)}`;
}

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    return {
      channel: normalizeChannel(raw.channel) || DEFAULT_CHANNEL,
      name: String(raw.name || defaultName()).slice(0, 40),
    };
  } catch {
    return { channel: DEFAULT_CHANNEL, name: defaultName() };
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ channel: s.channel, name: s.name }));
  } catch {
    /* ignore */
  }
}

function brokerHost(url) {
  if (!url) return "";
  return String(url).replace(/^wss:\/\/([^@]*@)?/, "").split("/")[0];
}

const state = {
  status: "idle", // idle | connecting | connected | reconnecting | error
  broker: "",
  brokerUrl: "",
  channel: loadSettings().channel,
  name: loadSettings().name,
  online: [],
  floor: null,
  talking: false,
  receiving: false,
  error: "",
  connected: false,
  audioReady: false,
  framesSent: 0,
  framesRecv: 0,
};

let session = null; // { client, SuperPTT, disconnect, channel }
let ac = null;
let mix = null;
let micStream = null;
let inNode = null;
let outNode = null;
let talking = false;
let pcmBuf = new Int16Array(0);
let spaceBound = false;
let testAudio = [];

function emit() {
  const snap = getPttState();
  for (const fn of listeners) fn(snap);
  if (typeof window !== "undefined") {
    window.__chessPtt = {
      getState: getPttState,
      framesRecv: state.framesRecv,
      framesSent: state.framesSent,
      audio: testAudio.slice(-8),
      startTalk,
      stopTalk,
    };
  }
}

export function getPttState() {
  return { ...state, online: state.online.slice(), floor: state.floor ? { ...state.floor } : null };
}

export function isSanketPttConnected() {
  return state.connected;
}

export function subscribePtt(fn) {
  listeners.add(fn);
  fn(getPttState());
  return () => listeners.delete(fn);
}

function applyNet(v) {
  state.connected = !!v.connected;
  state.brokerUrl = v.url || state.brokerUrl;
  state.broker = v.connected ? brokerHost(v.url) : state.broker;
  state.status = v.connected ? "connected" : session ? "reconnecting" : "idle";
  if (v.connected) state.error = "";
  emit();
}

function applySnapshot(list) {
  const ch = (list || []).find((c) => c.name === state.channel);
  const others = ch?.users || [];
  const you = state.name ? `${state.name} (you)` : "you";
  state.online = [you, ...others];
  state.floor = ch?.floor
    ? { id: ch.floor.id, name: ch.floor.mine ? `${ch.floor.name} (you)` : ch.floor.name, mine: !!ch.floor.mine }
    : null;
  state.receiving = !!(ch && ch.talkers && ch.talkers.length);
  emit();
}

function onEvent(t, v) {
  if (t === "net") applyNet(v);
  else if (t === "state") applySnapshot(v);
  else if (t === "audio") {
    state.framesRecv += 1;
    testAudio.push({ id: v.id, name: v.name, samples: v.pcm?.length || 0, t: Date.now() });
    if (testAudio.length > 40) testAudio = testAudio.slice(-20);
    mix?.feed(v);
    emit();
  } else if (t === "preempted") {
    talking = false;
    state.talking = false;
    pcmBuf = new Int16Array(0);
    emit();
  } else if (t === "reject") {
    if (v.reason === "nokey" || v.reason === "plain") {
      state.error = "This channel looks encrypted; Chess Live stays on plaintext (try channel “chess”).";
      emit();
    }
  }
}

export function setPttChannel(raw) {
  const ch = normalizeChannel(raw);
  if (!ch) return { ok: false, error: "Use 1–40 letters, numbers, _ or -." };
  state.channel = ch;
  saveSettings(state);
  if (session?.client) {
    const prev = session.channel;
    if (prev && prev !== ch) session.client.leave(prev);
    session.client.join(ch);
    session.channel = ch;
  }
  emit();
  return { ok: true, channel: ch };
}

export function setPttName(name) {
  state.name = String(name || defaultName()).slice(0, 40);
  saveSettings(state);
  if (session?.client) session.client.name = state.name;
  emit();
}

/**
 * Create (or resume) AudioContext. Must run in a user-gesture handler.
 */
export async function ensureAudio() {
  if (!ac) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ac = new Ctx();
    const SuperPTT = session?.SuperPTT || window.SuperPTT;
    mix = SuperPTT ? new SuperPTT.Mixer() : mix;
    const ratio = RATE / ac.sampleRate;
    let tail = 0;
    let phase = 0;
    outNode = ac.createScriptProcessor(2048, 1, 1);
    outNode.onaudioprocess = (e) => {
      if (!mix) {
        e.outputBuffer.getChannelData(0).fill(0);
        return;
      }
      const o = e.outputBuffer.getChannelData(0);
      const need = Math.ceil(o.length * ratio + phase) + 1;
      const x = mix.render(need - 1);
      const prev = tail;
      for (let i = 0; i < o.length; i++) {
        const p = phase + i * ratio;
        const k = Math.floor(p);
        const a = k === 0 ? prev : x[k - 1];
        const b = x[k] == null ? a : x[k];
        o[i] = a + (b - a) * (p - k);
      }
      const used = phase + o.length * ratio;
      phase = used - Math.floor(used);
      tail = x[Math.floor(used) - 1] || 0;
    };
    outNode.connect(ac.destination);
    state.audioReady = true;
  }
  if (ac.state === "suspended") await ac.resume();
  emit();
  return ac;
}

async function ensureMic() {
  await ensureAudio();
  if (micStream) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
  const src = ac.createMediaStreamSource(micStream);
  inNode = ac.createScriptProcessor(4096, 1, 1);
  inNode.onaudioprocess = (e) => {
    if (!talking || !session?.client) return;
    const input = e.inputBuffer.getChannelData(0);
    const ratio = ac.sampleRate / RATE;
    const n = Math.floor(input.length / ratio);
    const next = new Int16Array(pcmBuf.length + n);
    next.set(pcmBuf, 0);
    for (let k = 0; k < n; k++) {
      const v = Math.max(-1, Math.min(1, input[Math.floor(k * ratio)]));
      next[pcmBuf.length + k] = v < 0 ? v * 32768 : v * 32767;
    }
    let offset = 0;
    while (next.length - offset >= FRAME_SAMPLES) {
      const frame = next.subarray(offset, offset + FRAME_SAMPLES);
      // copy — subarray may share buffer that will be overwritten
      const copy = new Int16Array(FRAME_SAMPLES);
      copy.set(frame);
      session.client.sendAudio(copy);
      state.framesSent += 1;
      offset += FRAME_SAMPLES;
    }
    pcmBuf = next.subarray(offset).slice();
  };
  src.connect(inNode);
  const mute = ac.createGain();
  mute.gain.value = 0;
  inNode.connect(mute);
  mute.connect(ac.destination);
  return micStream;
}

function bindSpace() {
  if (spaceBound) return;
  spaceBound = true;
  function typing(el) {
    const tag = el?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable;
  }
  function down(e) {
    if (e.code !== "Space" && e.key !== " ") return;
    if (e.repeat || typing(e.target)) return;
    if (!state.connected) return;
    e.preventDefault();
    startTalk();
  }
  function up(e) {
    if (e.code !== "Space" && e.key !== " ") return;
    if (!state.connected) return;
    stopTalk();
  }
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", stopTalk);
  bindSpace._off = () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", stopTalk);
    spaceBound = false;
  };
}

export async function connectSanketPtt({ channel, name } = {}) {
  if (channel) {
    const r = setPttChannel(channel);
    if (!r.ok) {
      state.error = r.error;
      state.status = "error";
      emit();
      return r;
    }
  }
  if (name) setPttName(name);
  saveSettings(state);
  state.status = "connecting";
  state.error = "";
  emit();
  try {
    await ensureAudio();
    const result = await connectPtt({
      channel: state.channel,
      name: state.name,
      on: onEvent,
    });
    if (!result.ok) {
      state.status = "error";
      state.error = result.error || "Could not connect";
      emit();
      return result;
    }
    session = result;
    bindSpace();
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", disconnectSanketPtt);
    }
    return result;
  } catch (err) {
    state.status = "error";
    state.error = err.message || String(err);
    emit();
    return { ok: false, error: state.error };
  }
}

export function disconnectSanketPtt() {
  stopTalk();
  try {
    session?.disconnect?.();
  } catch {
    /* ignore */
  }
  session = null;
  state.connected = false;
  state.status = "idle";
  state.broker = "";
  state.online = [];
  state.floor = null;
  emit();
}

export async function startTalk() {
  if (talking) return;
  if (!session?.client) {
    const r = await connectSanketPtt();
    if (!r?.ok && !session?.client) return r;
  }
  try {
    await ensureMic();
  } catch (err) {
    state.error = err.message || "Microphone permission was denied.";
    emit();
    return { ok: false, error: state.error };
  }
  pcmBuf = new Int16Array(0);
  session.client.claim([state.channel], {}, (r) => {
    if (!r.ok.length) {
      talking = false;
      state.talking = false;
      state.error = r.busy.length ? `Busy: ${r.busy.join(", ")}` : "Could not claim the floor";
      emit();
      return;
    }
    talking = true;
    state.talking = true;
    state.error = "";
    emit();
  });
}

export function stopTalk() {
  if (session?.client) {
    if (pcmBuf.length >= 160) {
      const pad = new Int16Array(FRAME_SAMPLES);
      pad.set(pcmBuf);
      session.client.sendAudio(pad);
      state.framesSent += 1;
    }
    session.client.release();
  }
  pcmBuf = new Int16Array(0);
  talking = false;
  state.talking = false;
  emit();
}

/** Encode helper re-exported for tests / interop checks. */
export { encodeAudioFrame, DEFAULT_CHANNEL, FRAME_SAMPLES, RATE };
