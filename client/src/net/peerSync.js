import { Peer } from "peerjs";
import { PEER_OPTIONS, HEARTBEAT_MS, STALE_AFTER_MS, RECONNECT_MS } from "../config.js";
import { TYPES, publicState, hostWelcome, hostApply, mergeResync, freshHostGame } from "./protocol.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Open a PeerJS session. The host uses a stable `hostId` (in the share
 * link) so a refresh reclaims the same room. Guests connect to that id.
 */
export function createPeerSession({
  hostId,
  isHost,
  token,
  onState,
  onStatus,
  onTalking,
  onPeerId,
  onRemotePeerId,
  onChat,
  loadLocalGame,
  saveLocalGame,
}) {
  let peer = null;
  let stopped = false;
  let connections = new Map(); // peerId -> DataConnection
  let game = null;
  let myColor = isHost ? "w" : null;
  let myToken = token || null;
  let myRole = isHost ? "player" : null;
  let heartbeat = null;
  let staleTimer = null;
  let lastPong = Date.now();
  let reconnectTimer = null;
  let myPeerId = isHost ? hostId : null;

  function setStatus(status, extra = {}) {
    onStatus?.({ status, color: myColor, role: myRole, token: myToken, hostId, peerId: myPeerId, ...extra });
  }

  function emitState() {
    if (game) onState?.({ ...game }, { color: myColor, role: myRole, token: myToken });
  }

  function persist() {
    if (game) saveLocalGame?.(game);
  }

  function broadcast(msg, exceptId) {
    for (const [id, conn] of connections) {
      if (id !== exceptId && conn.open) {
        try {
          conn.send(msg);
        } catch {
          /* ignore */
        }
      }
    }
  }

  function sendTo(conn, msg) {
    if (conn?.open) {
      try {
        conn.send(msg);
      } catch {
        /* ignore */
      }
    }
  }

  function pushState(exceptId) {
    if (!game) return;
    const msg = { type: TYPES.STATE, game: publicState(game) };
    broadcast(msg, exceptId);
    persist();
    emitState();
  }

  function handleHostMessage(conn, msg) {
    const fromId = conn.peer;
    const meta = conn.meta || {};
    if (msg.type === TYPES.HELLO) {
      const result = hostWelcome(game, { token: msg.token, peerId: fromId });
      game = result.game;
      conn.meta = { color: result.color, token: result.token, role: result.role, peerId: fromId };
      if (result.color === "b") onRemotePeerId?.(fromId);
      sendTo(conn, {
        type: TYPES.WELCOME,
        color: result.color,
        token: result.token,
        role: result.role,
        game: publicState(game),
        hostPeerId: myPeerId,
      });
      // If they brought a longer game (reconnect), merge first.
      if (msg.game) {
        game = mergeResync(game, msg.game);
      }
      pushState();
      setStatus(connections.size ? "connected" : "waiting", { peers: connections.size });
      return;
    }
    if (msg.type === TYPES.PING) {
      sendTo(conn, { type: TYPES.PONG, t: msg.t, now: Date.now() });
      return;
    }
    if (msg.type === TYPES.PONG) {
      lastPong = Date.now();
      return;
    }
    if (msg.type === TYPES.TALKING) {
      onTalking?.({ color: meta.color || msg.color, on: msg.on });
      broadcast({ type: TYPES.TALKING, color: meta.color || msg.color, on: msg.on }, fromId);
      return;
    }
    if (msg.type === TYPES.CHAT) {
      onChat?.(msg);
      broadcast(msg, fromId);
      return;
    }
    if (msg.type === TYPES.STATE && msg.game) {
      game = mergeResync(game, msg.game);
      pushState();
      return;
    }
    const color = meta.color;
    const result = hostApply(game, msg.type, msg, color);
    if (!result.ok) {
      sendTo(conn, { type: TYPES.MOVE_REJECTED, error: result.error, game: publicState(game) });
      return;
    }
    game = result.game;
    pushState();
  }

  function handleGuestMessage(conn, msg) {
    if (msg.type === TYPES.WELCOME) {
      myColor = msg.color;
      myToken = msg.token;
      myRole = msg.role;
      game = mergeResync(game, msg.game);
      persist();
      emitState();
      setStatus("connected");
      onRemotePeerId?.(conn.peer);
      return;
    }
    if (msg.type === TYPES.STATE && msg.game) {
      game = mergeResync(game, msg.game);
      persist();
      emitState();
      setStatus("connected");
      return;
    }
    if (msg.type === TYPES.MOVE_REJECTED) {
      if (msg.game) {
        game = mergeResync(game, msg.game);
        persist();
        emitState();
      }
      setStatus("connected", { error: msg.error });
      return;
    }
    if (msg.type === TYPES.PING) {
      sendTo(conn, { type: TYPES.PONG, t: msg.t, now: Date.now() });
      return;
    }
    if (msg.type === TYPES.PONG) {
      lastPong = Date.now();
      return;
    }
    if (msg.type === TYPES.TALKING) {
      onTalking?.({ color: msg.color, on: msg.on });
      return;
    }
    if (msg.type === TYPES.CHAT) {
      onChat?.(msg);
    }
  }

  function attach(conn, asHost) {
    connections.set(conn.peer, conn);
    conn.on("data", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if (asHost) handleHostMessage(conn, msg);
      else handleGuestMessage(conn, msg);
    });
    conn.on("close", () => {
      connections.delete(conn.peer);
      if (!stopped && !isHost) scheduleReconnect();
      if (isHost) setStatus(connections.size ? "connected" : "waiting", { peers: connections.size });
    });
    conn.on("error", () => {
      connections.delete(conn.peer);
      if (!stopped && !isHost) scheduleReconnect();
    });
    if (!asHost && conn.open) {
      sendTo(conn, { type: TYPES.HELLO, token: myToken, game: game ? publicState(game) : null });
    }
    if (!asHost) {
      conn.on("open", () => {
        lastPong = Date.now();
        setStatus("connected");
        sendTo(conn, { type: TYPES.HELLO, token: myToken, game: game ? publicState(game) : null });
      });
    } else {
      setStatus("connected", { peers: connections.size });
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeat = setInterval(() => {
      const msg = { type: TYPES.PING, t: Date.now() };
      broadcast(msg);
      if (!isHost && Date.now() - lastPong > STALE_AFTER_MS) {
        setStatus("reconnecting", { reason: "heartbeat timeout" });
        scheduleReconnect();
      }
    }, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  }

  function scheduleReconnect() {
    if (stopped || isHost || reconnectTimer) return;
    setStatus("reconnecting");
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      if (stopped) return;
      try {
        await connectAsGuest();
      } catch {
        scheduleReconnect();
      }
    }, RECONNECT_MS);
  }

  async function openPeer(preferredId) {
    if (peer) {
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
      peer = null;
    }
    peer = preferredId ? new Peer(preferredId, PEER_OPTIONS) : new Peer(PEER_OPTIONS);
    return new Promise((resolve, reject) => {
      const onOpen = (id) => {
        cleanup();
        myPeerId = id;
        onPeerId?.(id);
        resolve(id);
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      function cleanup() {
        peer.off("open", onOpen);
        peer.off("error", onError);
      }
      peer.on("open", onOpen);
      peer.on("error", onError);
    });
  }

  async function connectAsGuest() {
    if (stopped) return;
    setStatus("connecting");
    connections.forEach((c) => {
      try {
        c.close();
      } catch {
        /* ignore */
      }
    });
    connections = new Map();
    try {
      if (!peer || peer.destroyed) {
        await openPeer(undefined);
        wirePeer();
      }
      const conn = peer.connect(hostId, { reliable: true, metadata: { token: myToken } });
      attach(conn, false);
      lastPong = Date.now();
    } catch (err) {
      setStatus("reconnecting", { error: err.message });
      scheduleReconnect();
    }
  }

  function wirePeer() {
    peer.on("connection", (conn) => {
      if (!isHost) {
        // Guests don't accept inbound game connections.
        conn.close();
        return;
      }
      attach(conn, true);
    });
    peer.on("disconnected", () => {
      if (stopped) return;
      setStatus("reconnecting", { reason: "broker disconnected" });
      try {
        peer.reconnect();
      } catch {
        if (isHost) startHost().catch(() => {});
        else scheduleReconnect();
      }
    });
    peer.on("close", () => {
      if (!stopped) {
        setStatus("reconnecting", { reason: "peer closed" });
        if (isHost) startHost().catch(() => {});
        else scheduleReconnect();
      }
    });
    peer.on("error", (err) => {
      const msg = String(err?.type || err?.message || err);
      if (msg.includes("unavailable-id") && isHost) {
        // Previous tab still dying — retry the same id shortly.
        setTimeout(() => {
          if (!stopped) startHost().catch(() => {});
        }, 1200);
        return;
      }
      setStatus("error", { error: msg });
    });
  }

  async function startHost() {
    setStatus("connecting");
    const saved = await loadLocalGame?.(hostId);
    game = saved && saved.id === hostId ? mergeResync(freshHostGame(hostId), saved) : freshHostGame(hostId);
    if (token) game.whiteToken = token;
    myToken = game.whiteToken;
    myColor = "w";
    myRole = "player";
    persist();
    emitState();
    let attempt = 0;
    while (!stopped) {
      try {
        await openPeer(hostId);
        wirePeer();
        setStatus(connections.size ? "connected" : "waiting");
        startHeartbeat();
        return;
      } catch (err) {
        attempt += 1;
        setStatus("reconnecting", { error: String(err?.type || err?.message || err), attempt });
        await sleep(Math.min(8000, 1000 * attempt));
      }
    }
  }

  async function start() {
    if (isHost) await startHost();
    else {
      game = (await loadLocalGame?.(hostId)) || null;
      if (game) emitState();
      await connectAsGuest();
      startHeartbeat();
    }
  }

  function act(type, payload) {
    if (isHost) {
      const result = hostApply(game, type, payload, myColor);
      if (!result.ok) return result;
      game = result.game;
      pushState();
      return result;
    }
    const [conn] = [...connections.values()];
    if (!conn?.open) return { ok: false, error: "not connected" };
    sendTo(conn, { type, ...payload });
    return { ok: true, pending: true };
  }

  const api = {
    start,
    stop() {
      stopped = true;
      stopHeartbeat();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      connections.forEach((c) => {
        try {
          c.close();
        } catch {
          /* ignore */
        }
      });
      try {
        peer?.destroy();
      } catch {
        /* ignore */
      }
    },
    move(from, to, promotion) {
      return act(TYPES.MOVE, { from, to, promotion });
    },
    resign() {
      return act(TYPES.RESIGN, {});
    },
    offerDraw() {
      return act(TYPES.OFFER_DRAW, {});
    },
    acceptDraw() {
      return act(TYPES.ACCEPT_DRAW, {});
    },
    declineDraw() {
      return act(TYPES.DECLINE_DRAW, {});
    },
    rematch() {
      return act(TYPES.REMATCH, {});
    },
    sendTalking(on) {
      broadcast({ type: TYPES.TALKING, color: myColor, on });
    },
    sendChat(text) {
      const msg = { type: TYPES.CHAT, text, color: myColor, at: Date.now() };
      broadcast(msg);
      onChat?.(msg);
    },
    getPeer() {
      return peer;
    },
    getRemotePeerId() {
      if (isHost) {
        for (const [id, conn] of connections) {
          if (conn.meta?.color === "b") return id;
        }
      }
      return hostId;
    },
    getColor() {
      return myColor;
    },
    getToken() {
      return myToken;
    },
    getGame() {
      return game;
    },
  };

  return api;
}
