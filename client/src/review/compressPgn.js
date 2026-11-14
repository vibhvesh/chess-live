import LZString from "lz-string";
import { buildPgn, gameFromPgn } from "../game/logic.js";

export function encodeReviewPayload(game) {
  const pgn = buildPgn(game);
  const compact = {
    v: 1,
    pgn,
    end: game.endReason || null,
    mode: game.mode || "human",
    computer: game.computer || null,
  };
  return LZString.compressToEncodedURIComponent(JSON.stringify(compact));
}

export function decodeReviewPayload(payload) {
  if (!payload) return null;
  const raw = LZString.decompressFromEncodedURIComponent(decodeURIComponent(payload));
  if (!raw) {
    // Allow a raw PGN pasted into the hash as a fallback.
    try {
      return gameFromPgn(decodeURIComponent(payload));
    } catch {
      return null;
    }
  }
  try {
    const data = JSON.parse(raw);
    if (data?.pgn) return gameFromPgn(data.pgn, { endReason: data.end, mode: data.mode, computer: data.computer });
  } catch {
    try {
      return gameFromPgn(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function reviewHash(game) {
  return `#/r/${encodeReviewPayload(game)}`;
}
