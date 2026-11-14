import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePeerGame } from "../hooks/usePeerGame.js";
import { useVoice } from "../hooks/useVoice.js";
import { loadSeat } from "../storage/localStore.js";
import { buildPgn } from "../game/logic.js";
import { reviewHash } from "../review/compressPgn.js";
import { downloadPgn, copyText } from "../lib/pgnDownload.js";
import Board from "../components/Board.jsx";
import MoveList from "../components/MoveList.jsx";
import CapturedPieces from "../components/CapturedPieces.jsx";
import ConnectionStatus from "../components/ConnectionStatus.jsx";
import GameControls from "../components/GameControls.jsx";
import VoiceChat from "../components/VoiceChat.jsx";
import GameOver, { resultText } from "../components/GameOver.jsx";

export default function Game() {
  const { hostId } = useParams();
  const navigate = useNavigate();
  const seat = loadSeat(hostId);
  const isHost = Boolean(seat?.host || seat?.color === "w");
  const peer = usePeerGame(hostId, { isHost, token: seat?.token });
  const voice = useVoice({
    getPeer: peer.getPeer,
    getRemotePeerId: peer.getRemotePeerId,
    sendTalking: peer.sendTalking,
    color: peer.meta.color,
  });
  const [copied, setCopied] = useState(false);

  const game = peer.game;
  const color = peer.meta.color;
  const role = peer.meta.role;
  const canMove =
    role === "player" &&
    game &&
    game.status !== "finished" &&
    game.status !== "waiting" &&
    game.turn === color;

  const orientation = color === "b" ? "black" : "white";
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, [hostId]);

  async function copyLink() {
    const ok = await copyText(shareUrl);
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  }

  function goReview() {
    if (!game) return;
    navigate(reviewHash(game).replace(/^#/, ""));
  }

  const youTalking = voice.talking;
  const remoteTalking = color === "w" ? peer.talking.b : peer.talking.w;

  return (
    <div className="page game-page">
      <header className="topbar">
        <Link to="/" className="brand">
          Chess Live
        </Link>
        <ConnectionStatus status={peer.meta.status} role={role} error={peer.meta.error} />
      </header>

      <div className="game-layout">
        <div className="board-column">
          <div className="player-row opp">
            <strong>{color === "b" ? "White" : "Black"}</strong>
            <CapturedPieces fen={game?.fen} by={color === "b" ? "w" : "b"} />
            {(color === "b" ? peer.talking.w : peer.talking.b) && <span className="is-talking">speaking</span>}
          </div>
          <Board
            fen={game?.fen || "start"}
            orientation={orientation}
            lastMove={game?.lastMove}
            checkSquare={game?.checkSquare}
            canMove={Boolean(canMove)}
            viewOnly={role === "spectator" || !canMove}
            onMove={(from, to, promotion) => peer.move(from, to, promotion)}
          />
          <div className="player-row you">
            <strong>
              {color === "b" ? "Black" : color === "w" ? "White" : "Spectator"} {color ? "(you)" : ""}
            </strong>
            <CapturedPieces fen={game?.fen} by={color === "b" ? "b" : "w"} />
            {youTalking && <span className="is-talking">speaking</span>}
          </div>
        </div>

        <aside className="side">
          <div className="panel">
            <div className="turn-line">
              {game?.status === "finished"
                ? resultText(game)
                : game?.status === "waiting"
                  ? "Share the link and wait for Black to join."
                  : game?.turn === "w"
                    ? "White to move"
                    : "Black to move"}
              {game?.inCheck && game?.status !== "finished" && " · Check"}
            </div>
            <GameOver
              game={game}
              onRematch={role === "player" ? peer.rematch : undefined}
              onReview={goReview}
              onDownload={() => downloadPgn(game)}
            />
            <MoveList moves={game?.moves || []} currentPly={(game?.moves?.length || 1) - 1} />
            <GameControls
              canAct={role === "player"}
              status={game?.status}
              drawOffer={game?.drawOffer}
              yourColor={color}
              onResign={peer.resign}
              onOfferDraw={peer.offerDraw}
              onAcceptDraw={peer.acceptDraw}
              onDeclineDraw={peer.declineDraw}
              onRematch={peer.rematch}
              onCopyLink={copyLink}
              copyLabel={copied ? "Copied!" : "Copy link"}
              onDownloadPgn={() => game && downloadPgn(game)}
              onReview={goReview}
            />
          </div>
          {role !== "spectator" && (
            <VoiceChat
              enabled={voice.enabled}
              talking={youTalking}
              remoteTalking={remoteTalking}
              error={voice.error}
              onEnable={voice.enable}
              onPtt={voice.setPtt}
              yourLabel={color === "b" ? "Black (you)" : "White (you)"}
              remoteLabel={color === "b" ? "White" : "Black"}
            />
          )}
          <p className="fineprint">
            Game id <code>{hostId}</code>. Moves are stored on this device and synced over WebRTC. Refresh is safe — your seat is remembered.
          </p>
        </aside>
      </div>
    </div>
  );
}
