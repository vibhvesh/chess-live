/**
 * Pure P2P game protocol. The host (White) is authoritative: it validates
 * moves with chess.js and broadcasts the full game state. Easy to unit test
 * without a network.
 */
import {
  applyMove,
  resign,
  offerDraw,
  acceptDraw,
  declineDraw,
  resetForRematch,
  createGame,
} from "../game/logic.js";

export const TYPES = {
  HELLO: "hello",
  WELCOME: "welcome",
  STATE: "state",
  MOVE: "move",
  MOVE_REJECTED: "move-rejected",
  RESIGN: "resign",
  OFFER_DRAW: "offer-draw",
  ACCEPT_DRAW: "accept-draw",
  DECLINE_DRAW: "decline-draw",
  REMATCH: "rematch",
  PING: "ping",
  PONG: "pong",
  TALKING: "talking",
  CHAT: "chat",
};

export function publicState(game) {
  const { whiteToken, blackToken, ...rest } = game;
  return {
    ...rest,
    hasWhite: Boolean(whiteToken),
    hasBlack: Boolean(blackToken),
  };
}

/**
 * Host assigns a seat to a joining peer.
 * Returns { game, color, token, role, already }.
 */
export function hostWelcome(game, { token, peerId } = {}) {
  if (token && token === game.whiteToken) {
    return { game, color: "w", token, role: "player", already: true };
  }
  if (token && token === game.blackToken) {
    return { game, color: "b", token, role: "player", already: true, peerId };
  }
  if (!game.blackToken) {
    const seat = crypto.getRandomValues(new Uint8Array(24));
    const newTok = [...seat].map((b) => b.toString(16).padStart(2, "0")).join("");
    const next = { ...game, blackToken: newTok, status: game.status === "finished" ? game.status : "active" };
    return { game: next, color: "b", token: newTok, role: "player", already: false, peerId };
  }
  return { game, color: null, token: null, role: "spectator", already: false };
}

export function hostApply(game, type, payload, color) {
  if (type === TYPES.MOVE) return applyMove(game, payload, color);
  if (type === TYPES.RESIGN) return resign(game, color);
  if (type === TYPES.OFFER_DRAW) return offerDraw(game, color);
  if (type === TYPES.ACCEPT_DRAW) return acceptDraw(game, color);
  if (type === TYPES.DECLINE_DRAW) return declineDraw(game, color);
  if (type === TYPES.REMATCH) {
    if (color !== "w" && color !== "b") return { ok: false, error: "spectators cannot rematch" };
    return { ok: true, game: resetForRematch(game) };
  }
  return { ok: false, error: `unknown action ${type}` };
}

/**
 * On reconnect, both peers exchange full PGN/state. Prefer the longer
 * game (more plies). If equal length, prefer the one updated later.
 * Finished games beat unfinished of the same length.
 */
export function mergeResync(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const lm = local.moves?.length || 0;
  const rm = remote.moves?.length || 0;
  if (rm > lm) return { ...local, ...remote, whiteToken: local.whiteToken, blackToken: local.blackToken || remote.blackToken };
  if (lm > rm) return local;
  if (remote.status === "finished" && local.status !== "finished") {
    return { ...local, ...remote, whiteToken: local.whiteToken, blackToken: local.blackToken || remote.blackToken };
  }
  const lt = Date.parse(local.updatedAt || 0) || 0;
  const rt = Date.parse(remote.updatedAt || 0) || 0;
  if (rt > lt) {
    return { ...local, ...remote, whiteToken: local.whiteToken, blackToken: local.blackToken || remote.blackToken };
  }
  return local;
}

export function freshHostGame(id) {
  return createGame({ id, mode: "human" });
}

export { createGame };
