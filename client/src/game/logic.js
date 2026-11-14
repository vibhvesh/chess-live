import { Chess } from "chess.js";
import { nanoid } from "nanoid";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newGameId() {
  return nanoid(10);
}

export function createGame({
  id,
  mode = "human",
  computer,
  whiteToken,
  blackToken,
} = {}) {
  const now = new Date().toISOString();
  const chess = new Chess();
  return {
    id: id || newGameId(),
    mode,
    fen: chess.fen(),
    pgn: "",
    moves: [],
    status: mode === "computer" ? "active" : "waiting",
    winner: null,
    endReason: null,
    lastMove: null,
    inCheck: false,
    checkSquare: null,
    turn: "w",
    whiteToken: whiteToken || (mode === "computer" ? newToken() : newToken()),
    blackToken: blackToken || (mode === "computer" ? null : null),
    drawOffer: null,
    rematchId: null,
    computer: mode === "computer" ? computer || { level: 4, humanColor: "w" } : null,
    createdAt: now,
    updatedAt: now,
  };
}

export function toPublic(game, { color = null } = {}) {
  return {
    id: game.id,
    mode: game.mode,
    fen: game.fen,
    pgn: game.pgn,
    moves: game.moves,
    status: game.status,
    winner: game.winner,
    endReason: game.endReason,
    lastMove: game.lastMove,
    inCheck: game.inCheck,
    checkSquare: game.checkSquare,
    turn: game.turn,
    hasWhite: Boolean(game.whiteToken),
    hasBlack: Boolean(game.blackToken),
    drawOffer: game.drawOffer,
    rematchId: game.rematchId,
    computer: game.computer,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    you: color,
  };
}

export function findKingSquare(chess, color) {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.type === "k" && piece.color === color) {
        return "abcdefgh"[c] + String(8 - r);
      }
    }
  }
  return null;
}

export function annotatePosition(game, chess = new Chess(game.fen)) {
  const inCheck = chess.inCheck();
  return {
    fen: chess.fen(),
    pgn: chess.pgn(),
    turn: chess.turn(),
    inCheck,
    checkSquare: inCheck ? findKingSquare(chess, chess.turn()) : null,
  };
}

export function endReasonFrom(chess) {
  if (chess.isCheckmate()) return "checkmate";
  if (chess.isStalemate()) return "stalemate";
  if (chess.isThreefoldRepetition()) return "threefold";
  if (chess.isInsufficientMaterial()) return "insufficient";
  if (chess.isDraw()) return "draw";
  return null;
}

export function finishIfOver(game, chess) {
  if (!chess.isGameOver()) return game;
  const reason = endReasonFrom(chess);
  const winner = reason === "checkmate" ? (chess.turn() === "w" ? "b" : "w") : "draw";
  return { ...game, status: "finished", winner, endReason: reason };
}

export function applyMove(game, { from, to, promotion }, color) {
  if (game.status === "finished") return { ok: false, error: "game is over" };
  if (game.mode === "human" && game.status === "waiting") {
    return { ok: false, error: "waiting for opponent" };
  }
  if (color !== "w" && color !== "b") {
    return { ok: false, error: "spectators cannot move" };
  }
  let chess;
  try {
    chess = new Chess(game.fen);
  } catch {
    return { ok: false, error: "invalid position" };
  }
  if (chess.turn() !== color) return { ok: false, error: "not your turn" };
  let move;
  try {
    move = chess.move({ from, to, promotion: promotion || undefined });
  } catch {
    move = null;
  }
  if (!move) return { ok: false, error: "illegal move" };
  const record = {
    san: move.san,
    from: move.from,
    to: move.to,
    promotion: move.promotion || null,
    color: move.color,
    fen: chess.fen(),
    at: new Date().toISOString(),
  };
  let next = {
    ...game,
    ...annotatePosition(game, chess),
    moves: [...game.moves, record],
    lastMove: { from: move.from, to: move.to },
    drawOffer: null,
    status: "active",
    updatedAt: record.at,
  };
  next = finishIfOver(next, chess);
  return { ok: true, game: next, move: record };
}

export function resign(game, color) {
  if (game.status === "finished") return { ok: false, error: "game is over" };
  if (color !== "w" && color !== "b") return { ok: false, error: "spectators cannot resign" };
  return {
    ok: true,
    game: {
      ...game,
      status: "finished",
      winner: color === "w" ? "b" : "w",
      endReason: "resign",
      drawOffer: null,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function offerDraw(game, color) {
  if (game.status !== "active") return { ok: false, error: "game is not active" };
  if (color !== "w" && color !== "b") return { ok: false, error: "spectators cannot offer a draw" };
  if (game.drawOffer && game.drawOffer !== color) return acceptDraw(game, color);
  return { ok: true, game: { ...game, drawOffer: color, updatedAt: new Date().toISOString() } };
}

export function acceptDraw(game, color) {
  if (game.status !== "active") return { ok: false, error: "game is not active" };
  if (!game.drawOffer || game.drawOffer === color) {
    return { ok: false, error: "no draw offer to accept" };
  }
  return {
    ok: true,
    game: {
      ...game,
      status: "finished",
      winner: "draw",
      endReason: "agree",
      drawOffer: null,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function declineDraw(game, color) {
  if (!game.drawOffer || game.drawOffer === color) {
    return { ok: false, error: "no draw offer to decline" };
  }
  return { ok: true, game: { ...game, drawOffer: null, updatedAt: new Date().toISOString() } };
}

export function resetForRematch(game) {
  const fresh = createGame({
    id: game.id,
    mode: game.mode,
    computer: game.computer,
    whiteToken: game.whiteToken,
    blackToken: game.blackToken,
  });
  if (fresh.mode === "human" && fresh.whiteToken && fresh.blackToken) {
    fresh.status = "active";
  }
  return { ...fresh, rematchOf: game.createdAt };
}

export function buildPgn(game) {
  const chess = new Chess();
  try {
    for (const m of game.moves || []) {
      chess.move({ from: m.from, to: m.to, promotion: m.promotion || undefined });
    }
  } catch {
    /* use whatever was applied */
  }
  const result =
    game.winner === "w" ? "1-0" : game.winner === "b" ? "0-1" : game.winner === "draw" ? "1/2-1/2" : "*";
  const event = game.mode === "computer" ? "Chess Live vs Computer" : "Chess Live";
  const white =
    game.mode === "computer"
      ? game.computer?.humanColor === "b"
        ? `Computer (Lv ${game.computer?.level ?? "?"})`
        : "Player"
      : "White";
  const black =
    game.mode === "computer"
      ? game.computer?.humanColor === "w"
        ? `Computer (Lv ${game.computer?.level ?? "?"})`
        : "Player"
      : "Black";
  const date = (game.createdAt || "").slice(0, 10).replace(/-/g, ".") || "????.??.??";
  const headers = [
    `[Event "${event}"]`,
    `[Site "Chess Live"]`,
    `[Date "${date}"]`,
    `[Round "1"]`,
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${result}"]`,
  ];
  if (game.endReason) headers.push(`[Termination "${game.endReason}"]`);
  const body = chess.pgn({ maxWidth: 80, newline: "\n" }) || "";
  let movetext = body.replace(/\[.*\]\n?/g, "").trim();
  // chess.js leaves "*" when the game ended by resign/agreement; don't also append the result.
  movetext = movetext.replace(/\s*(\*|1-0|0-1|1\/2-1\/2)\s*$/g, "").trim();
  const line = movetext ? `${movetext} ${result}` : result;
  return `${headers.join("\n")}\n\n${line}\n`;
}

export function gameFromPgn(pgn, extra = {}) {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    throw new Error("invalid PGN");
  }
  const verbose = chess.history({ verbose: true });
  const moves = [];
  const walk = new Chess();
  for (const m of verbose) {
    walk.move(m);
    moves.push({
      san: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion || null,
      color: m.color,
      fen: walk.fen(),
      at: null,
    });
  }
  const header = chess.header();
  let winner = null;
  let endReason = extra.endReason || null;
  const result = header.Result || extra.result || "*";
  if (result === "1-0") winner = "w";
  else if (result === "0-1") winner = "b";
  else if (result === "1/2-1/2") winner = "draw";
  const finished = winner != null;
  return {
    ...createGame({ id: extra.id, mode: extra.mode || "human", computer: extra.computer }),
    ...annotatePosition({}, walk),
    pgn: chess.pgn(),
    moves,
    lastMove: moves.length ? { from: moves[moves.length - 1].from, to: moves[moves.length - 1].to } : null,
    status: finished ? "finished" : moves.length ? "active" : "waiting",
    winner,
    endReason: finished ? endReason || (walk.isGameOver() ? endReasonFrom(walk) : "unknown") : null,
    createdAt: extra.createdAt || new Date().toISOString(),
  };
}

export { START_FEN };
