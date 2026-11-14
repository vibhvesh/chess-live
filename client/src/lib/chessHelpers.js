import { Chess } from "chess.js";
import { findKingSquare } from "../game/logic.js";

const START = {
  w: { p: 8, n: 2, b: 2, r: 2, q: 1 },
  b: { p: 8, n: 2, b: 2, r: 2, q: 1 },
};

export function countsOnBoard(fen) {
  const chess = new Chess(fen);
  const counts = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } };
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece) counts[piece.color][piece.type] += 1;
    }
  }
  return counts;
}

export function capturedPieces(fen) {
  const counts = countsOnBoard(fen);
  const captured = { w: [], b: [] };
  for (const color of ["w", "b"]) {
    for (const type of ["q", "r", "b", "n", "p"]) {
      const missing = START[color][type] - counts[color][type];
      for (let i = 0; i < missing; i++) captured[color].push(type);
    }
  }
  return captured;
}

export function isPromotionMove(chess, from, to) {
  const piece = chess.get(from);
  if (!piece || piece.type !== "p") return false;
  const rank = to?.[1];
  return (piece.color === "w" && rank === "8") || (piece.color === "b" && rank === "1");
}

export function legalDests(chess, from) {
  return chess.moves({ square: from, verbose: true });
}

export function checkSquareFromFen(fen) {
  const chess = new Chess(fen);
  if (!chess.inCheck()) return null;
  return findKingSquare(chess, chess.turn());
}

export const PIECE_GLYPH = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚",
};
