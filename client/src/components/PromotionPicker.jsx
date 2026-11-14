import { PIECE_GLYPH } from "../lib/chessHelpers.js";

const PIECES = ["q", "r", "b", "n"];

export default function PromotionPicker({ color = "w", onPick, onCancel }) {
  return (
    <div className="promo-overlay" onClick={onCancel} role="presentation">
      <div className="promo-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choose promotion piece">
        <p>Promote pawn to</p>
        <div className="promo-row">
          {PIECES.map((p) => (
            <button key={p} className="promo-btn" onClick={() => onPick(p)} type="button">
              {PIECE_GLYPH[color + p]}
            </button>
          ))}
        </div>
        <button type="button" className="linkish" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
