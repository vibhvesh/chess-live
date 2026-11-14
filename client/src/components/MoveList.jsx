import { useEffect, useRef } from "react";

export default function MoveList({ moves = [], currentPly, onSelect }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [moves.length]);

  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({ n: i / 2 + 1, w: moves[i], b: moves[i + 1], wi: i, bi: i + 1 });
  }

  return (
    <div className="move-list" role="log" aria-label="Move list">
      {rows.length === 0 && <div className="muted empty-moves">No moves yet</div>}
      {rows.map((row) => (
        <div className="move-row" key={row.n}>
          <span className="move-num">{row.n}.</span>
          <button
            type="button"
            className={`san ${currentPly === row.wi ? "current" : ""}`}
            onClick={() => onSelect?.(row.wi)}
          >
            {row.w?.san}
          </button>
          {row.b && (
            <button
              type="button"
              className={`san ${currentPly === row.bi ? "current" : ""}`}
              onClick={() => onSelect?.(row.bi)}
            >
              {row.b.san}
            </button>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
