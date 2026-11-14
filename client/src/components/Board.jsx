import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { isPromotionMove, legalDests } from "../lib/chessHelpers.js";
import PromotionPicker from "./PromotionPicker.jsx";

export default function Board({
  fen,
  orientation = "white",
  lastMove,
  checkSquare,
  canMove = true,
  onMove,
  viewOnly = false,
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(480);
  const [from, setFrom] = useState(null);
  const [pending, setPending] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const w = Math.floor(el.clientWidth);
      setWidth(Math.max(240, Math.min(w, 640)));
    });
    ro.observe(el);
    setWidth(Math.max(240, Math.min(Math.floor(el.clientWidth) || 480, 640)));
    return () => ro.disconnect();
  }, []);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const optionStyles = useMemo(() => {
    const styles = {};
    if (lastMove?.from) styles[lastMove.from] = { backgroundColor: "rgba(253, 230, 80, 0.55)" };
    if (lastMove?.to) styles[lastMove.to] = { backgroundColor: "rgba(253, 230, 80, 0.70)" };
    if (checkSquare) {
      styles[checkSquare] = {
        background: "radial-gradient(circle, rgba(220, 38, 38, 0.65) 0%, rgba(220, 38, 38, 0.15) 70%)",
      };
    }
    if (from) {
      styles[from] = { ...(styles[from] || {}), backgroundColor: "rgba(98, 178, 255, 0.55)" };
      for (const m of legalDests(chess, from)) {
        styles[m.to] = {
          background:
            "radial-gradient(circle, rgba(20,20,20,0.25) 22%, transparent 24%)",
        };
      }
    }
    return styles;
  }, [lastMove, checkSquare, from, chess]);

  function tryMove(source, target) {
    if (viewOnly || !canMove) return false;
    if (isPromotionMove(chess, source, target)) {
      setPending({ from: source, to: target });
      return false;
    }
    const result = onMove?.(source, target);
    setFrom(null);
    return Boolean(result?.ok ?? result);
  }

  function onPieceDrop(sourceSquare, targetSquare) {
    return tryMove(sourceSquare, targetSquare);
  }

  function onSquareClick(square) {
    if (viewOnly || !canMove) return;
    if (from) {
      if (from === square) {
        setFrom(null);
        return;
      }
      const dests = legalDests(chess, from);
      if (dests.some((m) => m.to === square)) {
        tryMove(from, square);
        return;
      }
    }
    const piece = chess.get(square);
    if (piece) setFrom(square);
    else setFrom(null);
  }

  function pickPromotion(piece) {
    if (!pending) return;
    onMove?.(pending.from, pending.to, piece);
    setPending(null);
    setFrom(null);
  }

  return (
    <div className="board-wrap" ref={wrapRef}>
      <Chessboard
        id="chess-live-board"
        position={fen}
        onPieceDrop={onPieceDrop}
        onSquareClick={onSquareClick}
        boardOrientation={orientation}
        customSquareStyles={optionStyles}
        arePiecesDraggable={!viewOnly && canMove}
        animationDuration={200}
        boardWidth={width}
        customBoardStyle={{
          borderRadius: "8px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        }}
        customDarkSquareStyle={{ backgroundColor: "#739552" }}
        customLightSquareStyle={{ backgroundColor: "#ebecd0" }}
      />
      {pending && (
        <PromotionPicker
          color={chess.get(pending.from)?.color || "w"}
          onPick={pickPromotion}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
