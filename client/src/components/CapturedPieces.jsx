import { capturedPieces, PIECE_GLYPH } from "../lib/chessHelpers.js";

export default function CapturedPieces({ fen, by = "w" }) {
  if (!fen) return null;
  const cap = capturedPieces(fen);
  // Pieces captured BY `by` are the opponent's missing pieces.
  const got = cap[by === "w" ? "b" : "w"];
  return (
    <div className="captured" aria-label="Captured pieces">
      {got.map((t, i) => (
        <span key={`${t}${i}`}>{PIECE_GLYPH[(by === "w" ? "b" : "w") + t]}</span>
      ))}
    </div>
  );
}
