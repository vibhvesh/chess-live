import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLocalGame } from "../hooks/useLocalGame.js";
import { createStockfishEngine, LEVELS } from "../engine/stockfishEngine.js";
import { reviewHash } from "../review/compressPgn.js";
import { downloadPgn } from "../lib/pgnDownload.js";
import Board from "../components/Board.jsx";
import MoveList from "../components/MoveList.jsx";
import CapturedPieces from "../components/CapturedPieces.jsx";
import ConnectionStatus from "../components/ConnectionStatus.jsx";
import GameControls from "../components/GameControls.jsx";
import GameOver, { resultText } from "../components/GameOver.jsx";
import PttButton from "../components/PttButton.jsx";

export default function ComputerGame() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { game, move, resign, rematch, humanColor } = useLocalGame({ gameId });
  const engineRef = useRef(null);
  const moveRef = useRef(move);
  moveRef.current = move;
  const [thinking, setThinking] = useState(false);
  const [engineError, setEngineError] = useState(null);
  const busy = useRef(false);

  const color = game?.computer?.humanColor || humanColor || "w";
  const level = game?.computer?.level || 4;
  const computerColor = color === "w" ? "b" : "w";

  useEffect(() => {
    const engine = createStockfishEngine();
    engineRef.current = engine;
    engine.init().catch((err) => setEngineError(err.message));
    return () => engine.destroy();
  }, []);

  useEffect(() => {
    if (!game || game.status === "finished") return undefined;
    if (game.turn !== computerColor) return undefined;
    if (busy.current) return undefined;
    let cancelled = false;
    busy.current = true;
    setThinking(true);
    (async () => {
      try {
        const best = await engineRef.current.getBestMove(game.fen, { level });
        if (cancelled || !best) return;
        moveRef.current(best.from, best.to, best.promotion, computerColor);
      } catch (err) {
        if (!cancelled) setEngineError(err.message);
      } finally {
        busy.current = false;
        if (!cancelled) setThinking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game?.fen, game?.status, game?.turn, computerColor, level]);

  function onHumanMove(from, to, promotion) {
    if (thinking || game?.turn !== color) return { ok: false };
    return move(from, to, promotion, color);
  }

  function goReview() {
    if (!game) return;
    navigate(reviewHash(game).replace(/^#/, ""));
  }

  const canMove = game && game.status !== "finished" && game.turn === color && !thinking;

  return (
    <div className="page game-page">
      <header className="topbar">
        <Link to="/" className="brand">
          Chess Live
        </Link>
        <ConnectionStatus status="local" />
      </header>

      <div className="game-layout">
        <div className="board-column">
          <div className="player-row opp">
            <strong>
              Computer · Lv {level} {LEVELS[level] ? `(${LEVELS[level].label})` : ""}
            </strong>
            <CapturedPieces fen={game?.fen} by={computerColor} />
            {thinking && <span className="thinking">thinking…</span>}
          </div>
          <Board
            fen={game?.fen || "start"}
            orientation={color === "b" ? "black" : "white"}
            lastMove={game?.lastMove}
            checkSquare={game?.checkSquare}
            canMove={Boolean(canMove)}
            onMove={onHumanMove}
          />
          <div className="player-row you">
            <strong>{color === "b" ? "Black" : "White"} (you)</strong>
            <CapturedPieces fen={game?.fen} by={color} />
          </div>
        </div>

        <aside className="side">
          <div className="panel">
            <div className="turn-line">
              {game?.status === "finished"
                ? resultText(game)
                : thinking
                  ? "Computer is thinking…"
                  : game?.turn === color
                    ? "Your move"
                    : "Computer to move"}
              {game?.inCheck && game?.status !== "finished" && " · Check"}
            </div>
            {engineError && <div className="error-text">Engine: {engineError}</div>}
            <GameOver game={game} onRematch={rematch} onReview={goReview} onDownload={() => downloadPgn(game)} />
            <MoveList moves={game?.moves || []} currentPly={(game?.moves?.length || 1) - 1} />
            <GameControls
              canAct
              status={game?.status}
              yourColor={color}
              onResign={() => resign(color)}
              onDownloadPgn={() => game && downloadPgn(game)}
              onRematch={rematch}
              onReview={goReview}
            />
          </div>
          <PttButton />
        </aside>
      </div>
    </div>
  );
}
