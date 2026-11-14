const REASON = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  threefold: "Draw by threefold repetition",
  insufficient: "Draw by insufficient material",
  draw: "Draw",
  agree: "Draw agreed",
  resign: "Resignation",
};

export function resultText(game) {
  if (!game || game.status !== "finished") return null;
  const reason = REASON[game.endReason] || "Game over";
  if (game.winner === "draw") return `${reason}`;
  const who = game.winner === "w" ? "White" : "Black";
  if (game.endReason === "resign") {
    const loser = game.winner === "w" ? "Black" : "White";
    return `${loser} resigned — ${who} wins`;
  }
  return `${reason} — ${who} wins`;
}

export default function GameOver({ game, onRematch, onReview, onDownload }) {
  if (!game || game.status !== "finished") return null;
  return (
    <div className="game-over-banner">
      <strong>{resultText(game)}</strong>
      <div className="controls">
        {onRematch && (
          <button type="button" className="good" onClick={onRematch}>
            Rematch
          </button>
        )}
        {onReview && (
          <button type="button" onClick={onReview}>
            Review
          </button>
        )}
        {onDownload && (
          <button type="button" onClick={onDownload}>
            Download PGN
          </button>
        )}
      </div>
    </div>
  );
}
