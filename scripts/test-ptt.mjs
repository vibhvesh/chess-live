/**
 * Sanket PTT protocol tests: channel rules, 12 kHz Int16 frame interop
 * with the official SuperPTT client (vendored superptt.js).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  CHANNEL_RE,
  DEFAULT_CHANNEL,
  FRAME_SAMPLES,
  PREFIX,
  RATE,
  encodeAudioFrame,
  decodeAudioFrame,
  normalizeChannel,
} from "../voice/pttAdapter.js";

function loadSuperPTT() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../client/public/vendor/superptt.js");
  const code = readFileSync(file, "utf8");
  const module = { exports: {} };
  const fn = new Function("module", "exports", "Buffer", "crypto", `${code}\nreturn module.exports;`);
  return fn(module, module.exports, Buffer, globalThis.crypto);
}
const SuperPTT = loadSuperPTT();

const results = [];
function test(name, fn) {
  try {
    const out = fn();
    if (out && typeof out.then === "function") {
      return out.then(
        () => {
          results.push({ name, ok: true });
          console.log(`  ok  ${name}`);
        },
        (err) => {
          results.push({ name, ok: false, error: err });
          console.error(`  FAIL ${name}: ${err.message}`);
        },
      );
    }
    results.push({ name, ok: true });
    console.log(`  ok  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err });
    console.error(`  FAIL ${name}: ${err.message}`);
  }
  return Promise.resolve();
}

function fakeMqtt() {
  const handlers = {};
  const pubs = [];
  const c = {
    connected: false,
    on(ev, fn) {
      handlers[ev] = (handlers[ev] || []).concat(fn);
      return c;
    },
    subscribe() {},
    unsubscribe() {},
    publish(t, p, o) {
      pubs.push({ t, p, o: o || {} });
    },
    end() {},
    _fire(ev, ...a) {
      for (const fn of handlers[ev] || []) fn(...a);
    },
    pubs,
  };
  return {
    connect() {
      queueMicrotask(() => {
        c.connected = true;
        c._fire("connect");
      });
      return c;
    },
    client: c,
    pubs,
  };
}

console.log("Sanket PTT tests\n");

await test("default channel is chess and regex validates names", () => {
  assert.equal(DEFAULT_CHANNEL, "chess");
  assert.equal(normalizeChannel("chess"), "chess");
  assert.equal(normalizeChannel("  Chess-Live_1 "), "chess-live_1");
  assert.equal(normalizeChannel("police"), "police"); // valid form, we just default to chess
  assert.equal(normalizeChannel("NO SPACES"), null);
  assert.equal(normalizeChannel("Bad!"), null);
  assert.equal(normalizeChannel(""), null);
  assert.ok(CHANNEL_RE.test("chess"));
  assert.ok(!CHANNEL_RE.test(""));
  assert.ok(CHANNEL_RE.test("a".repeat(40)));
  assert.ok(!CHANNEL_RE.test("a".repeat(41)));
});

await test("audio frames are [len][id][Int16LE PCM] at 12 kHz / 1024 samples", () => {
  assert.equal(RATE, 12000);
  assert.equal(FRAME_SAMPLES, 1024);
  const id = "ab12xy";
  const pcm = new Int16Array(FRAME_SAMPLES);
  for (let i = 0; i < pcm.length; i++) pcm[i] = (i * 13) % 30000 - 15000;
  const buf = encodeAudioFrame(id, pcm);
  assert.equal(buf[0], id.length);
  assert.equal(buf.length, 1 + id.length + FRAME_SAMPLES * 2);
  const decoded = decodeAudioFrame(buf);
  assert.equal(decoded.id, id);
  assert.equal(decoded.pcm.length, FRAME_SAMPLES);
  assert.deepEqual(Array.from(decoded.pcm), Array.from(pcm));
  // little-endian: first sample written as lo, hi
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const first = view.getInt16(1 + id.length, true);
  assert.equal(first, pcm[0]);
});

await test("encodeAudioFrame matches SuperPTT.Client.sendAudio on the wire", async () => {
  const mqtt = fakeMqtt();
  const id = "u8idtest";
  const cl = new SuperPTT.Client(mqtt, {
    id,
    name: "Interop",
    prefix: PREFIX,
    brokers: ["wss://example.invalid"],
    on() {},
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(cl.join("chess"));
  await new Promise((r) => setTimeout(r, 30));

  const pcm = new Int16Array(FRAME_SAMPLES);
  for (let i = 0; i < pcm.length; i++) pcm[i] = i === 0 ? -20000 : i * 3;
  const expected = encodeAudioFrame(id, pcm);

  const result = await new Promise((resolve) => {
    cl.claim(["chess"], {}, resolve);
  });
  assert.ok(result.ok.includes("chess"), `claim failed: ${JSON.stringify(result)}`);
  mqtt.pubs.length = 0;
  const sent = cl.sendAudio(pcm);
  assert.equal(sent, 1);
  const audioPubs = mqtt.pubs.filter((p) => String(p.t).endsWith("/chess/audio"));
  assert.equal(audioPubs.length, 1, `expected one audio publish, got ${mqtt.pubs.map((p) => p.t).join(",")}`);
  const payload = audioPubs[0].p;
  const got = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  assert.deepEqual(Array.from(got), Array.from(expected));
  assert.equal(audioPubs[0].t, `${PREFIX}chess/audio`);
  cl.close();
});

await test("presence is retained JSON {id,name,ts} and floor uses claim/hb/release", async () => {
  const mqtt = fakeMqtt();
  const id = "unitp1";
  const cl = new SuperPTT.Client(mqtt, {
    id,
    name: "Alice",
    prefix: PREFIX,
    brokers: ["wss://example.invalid"],
    on() {},
  });
  await new Promise((r) => setTimeout(r, 30));
  cl.join("chess");
  await new Promise((r) => setTimeout(r, 30));
  const presence = mqtt.pubs.filter((p) => String(p.t).endsWith(`/presence/${id}`));
  assert.ok(presence.length >= 1, "expected a presence beat");
  const last = presence[presence.length - 1];
  assert.equal(last.o.retain, true);
  const body = JSON.parse(String(last.p));
  assert.equal(body.id, id);
  assert.equal(body.name, "Alice");
  assert.equal(typeof body.ts, "number");

  const result = await new Promise((resolve) => cl.claim(["chess"], {}, resolve));
  assert.ok(result.ok.includes("chess"));
  const floors = mqtt.pubs.filter((p) => String(p.t).endsWith("/chess/floor"));
  assert.ok(floors.length >= 1);
  const claim = JSON.parse(String(floors[0].p));
  assert.equal(claim.t, "claim");
  assert.equal(claim.id, id);
  assert.equal(claim.name, "Alice");
  assert.equal(typeof claim.ts, "number");

  cl.release();
  const rel = mqtt.pubs.filter((p) => String(p.t).endsWith("/chess/floor")).map((p) => JSON.parse(String(p.p)));
  assert.ok(rel.some((m) => m.t === "release" && m.id === id));
  cl.close();
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length} passed, ${failed.length} failed`);
if (failed.length) process.exit(1);
