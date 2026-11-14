import LZString from "lz-string";
import { buildPgn, gameFromPgn } from "../game/logic.js";

export function encodeReviewPayload(game) {
  const pgn = buildPgn(game);
  const compact = {
    v: 1,
    pgn,
    moves: game.moves || [],
    end: game.endReason || null,
    winner: game.winner || null,
    mode: game.mode || "human",
    computer: game.computer || null,
  };
  return LZString.compressToEncodedURIComponent(JSON.stringify(compact));
}

function tryFromPgn(pgn, extra) {
  try {
    return gameFromPgn(pgn, extra);
  } catch {
    return null;
  }
}

function tryDecompress(payload) {
  const candidates = [payload];
  try {
    candidates.push(decodeURIComponent(payload));
  } catch {
    /* already decoded */
  }
  for (const c of candidates) {
    if (!c) continue;
    const raw = LZString.decompressFromEncodedURIComponent(c);
    if (raw) return raw;
  }
  return null;
}

function gameFromMoves(moves, extra = {}) {
  if (!Array.isArray(moves) || !moves.length) return null;
  const last = moves[moves.length - 1];
  const finished = Boolean(extra.winner || extra.endReason);
  return {
    id: extra.id || "review",
    mode: extra.mode || "human",
    computer: extra.computer || null,
    moves,
    fen: last?.fen,
    lastMove: last ? { from: last.from, to: last.to } : null,
    status: finished ? "finished" : "active",
    winner: extra.winner || null,
    endReason: extra.endReason || null,
    pgn: extra.pgn || "",
    turn: last?.fen ? last.fen.split(" ")[1] : "w",
  };
}

export function decodeReviewPayload(payload) {
  if (!payload) return null;
  const raw = tryDecompress(payload);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      const extra = {
        endReason: data.end,
        mode: data.mode,
        computer: data.computer,
        winner: data.winner,
      };
      if (data?.pgn) {
        const fromPgn = tryFromPgn(data.pgn, extra);
        if (fromPgn) return fromPgn;
      }
      const fromMoves = gameFromMoves(data?.moves, { ...extra, pgn: data?.pgn });
      if (fromMoves) return fromMoves;
    } catch {
      const fromRaw = tryFromPgn(raw);
      if (fromRaw) return fromRaw;
    }
  }
  let text = payload;
  try {
    text = decodeURIComponent(payload);
  } catch {
    /* keep */
  }
  return tryFromPgn(text);
}

export function reviewHash(game) {
  return `#/r/${encodeReviewPayload(game)}`;
}
