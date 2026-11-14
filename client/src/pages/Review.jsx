import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { decodeReviewPayload } from "../review/compressPgn.js";
import { analyzeGame } from "../review/analyze.js";
import { explainMove, summarizeGame } from "../review/summarize.js";
import { createStockfishEngine } from "../engine/stockfishEngine.js";
import { loadSettings, saveSettings } from "../storage/localStore.js";
import { downloadPgn } from "../lib/pgnDownload.js";
import Board from "../components/Board.jsx";
import MoveList from "../components/MoveList.jsx";
import { resultText } from "../components/GameOver.jsx";

const KIND_CLASS = {
  best: "tag-best",
  good: "tag-good",
  inaccuracy: "tag-inacc",
  mistake: "tag-miss",
  blunder: "tag-blunder",
};

export default function Review() {
  const params = useParams();
  const payload = params["*"] || params.payload || "";
  const game = useMemo(() => decodeReviewPayload(payload), [payload]);
  const [ply, setPly] = useState((game?.moves?.length || 1) - 1);
  const [report, setReport] = useState(null);
  const [progress, setProgress] = useState(null);
  const [summary, setSummary] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const settings = loadSettings();
  const [apiKey, setApiKey] = useState(settings.llmKey || "");
  const [showKey, setShowKey] = useState(false);

  const position = useMemo(() => {
    if (!game) return null;
    if (ply < 0) return { fen: "start", lastMove: null, checkSquare: null };
    const m = game.moves[ply];
    return { fen: m.fen, lastMove: { from: m.from, to: m.to }, checkSquare: null };
  }, [game, ply]);

  async function runAnalysis() {
    if (!game) return;
    setAnalyzing(true);
    setError(null);
    const engine = createStockfishEngine();
    try {
      const result = await analyzeGame(game, engine, {
        depth: 10,
        onProgress: (p) => setProgress(p),
      });
      setReport(result);
      const sum = await summarizeGame({
        game,
        report: result,
        apiKey: apiKey || undefined,
        endpoint: settings.llmEndpoint || undefined,
      });
      setSummary(sum);
    } catch (err) {
      setError(err.message);
    } finally {
      engine.destroy();
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    if (game) setPly(game.moves.length - 1);
  }, [game]);

  if (!game) {
    return (
      <div className="page">
        <header className="topbar">
          <Link to="/" className="brand">
            Chess Live
          </Link>
        </header>
        <div className="panel">
          <h2>Could not read this review link</h2>
          <p>The PGN in the URL may be incomplete. Open a finished game and click Review again.</p>
        </div>
      </div>
    );
  }

  const annotation = report?.annotations?.[ply];

  return (
    <div className="page game-page">
      <header className="topbar">
        <Link to="/" className="brand">
          Chess Live
        </Link>
        <span className="muted">Game review</span>
      </header>
      <div className="game-layout">
        <div className="board-column">
          <Board
            fen={position?.fen || "start"}
            lastMove={position?.lastMove}
            viewOnly
            canMove={false}
          />
          <div className="review-nav">
            <button type="button" onClick={() => setPly(-1)} disabled={ply < 0}>
              «
            </button>
            <button type="button" onClick={() => setPly((p) => Math.max(-1, p - 1))}>
              ‹
            </button>
            <span>
              {ply + 1} / {game.moves.length}
            </span>
            <button type="button" onClick={() => setPly((p) => Math.min(game.moves.length - 1, p + 1))}>
              ›
            </button>
            <button type="button" onClick={() => setPly(game.moves.length - 1)}>
              »
            </button>
          </div>
        </div>
        <aside className="side">
          <div className="panel">
            <div className="turn-line">{resultText(game) || "Unfinished game"}</div>
            <MoveList moves={game.moves} currentPly={ply} onSelect={setPly} />
            <div className="controls">
              <button type="button" className="primary" onClick={runAnalysis} disabled={analyzing}>
                {analyzing ? `Analyzing… ${progress ? `${progress.index}/${progress.total}` : ""}` : "Analyze with Stockfish"}
              </button>
              <button type="button" onClick={() => downloadPgn(game)}>
                Download PGN
              </button>
            </div>
            {error && <div className="error-text">{error}</div>}
            {report && (
              <div className="review-stats">
                <div>
                  Accuracy <strong>{report.accuracy}%</strong>
                </div>
                <div className="counts">
                  {Object.entries(report.counts).map(([k, n]) => (
                    <span key={k} className={KIND_CLASS[k]}>
                      {k} {n}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {annotation && (
              <p className="explain">
                <span className={KIND_CLASS[annotation.kind]}>{annotation.kind}</span> {explainMove(annotation)}
              </p>
            )}
            {summary && (
              <div className="summary">
                <h3>Summary {summary.source === "llm" ? "(AI)" : "(template)"}</h3>
                <pre>{summary.text}</pre>
                {summary.error && <div className="error-text">LLM fallback: {summary.error}</div>}
              </div>
            )}
            <details className="llm-settings">
              <summary>Optional LLM key (stays in this browser)</summary>
              <p className="fineprint">If you paste an OpenAI-compatible API key, the summary is written by that model. Otherwise we use template explanations. The key never leaves your browser except to the endpoint you set.</p>
              <label>
                API key
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="inline">
                <input type="checkbox" checked={showKey} onChange={(e) => setShowKey(e.target.checked)} /> Show
              </label>
              <button
                type="button"
                onClick={() => {
                  saveSettings({ llmKey: apiKey });
                }}
              >
                Save key on this device
              </button>
            </details>
          </div>
        </aside>
      </div>
    </div>
  );
}
