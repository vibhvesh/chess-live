import { Chess } from "chess.js";

function classify(dropCp, isBest) {
  if (isBest || dropCp <= 15) return "best";
  if (dropCp <= 40) return "good";
  if (dropCp <= 90) return "inaccuracy";
  if (dropCp <= 200) return "mistake";
  return "blunder";
}

function cpView(ev) {
  if (!ev) return 0;
  if (ev.mate != null) return ev.mate > 0 ? 10000 : -10000;
  return ev.cp ?? 0;
}

function uciToSan(fen, move) {
  if (!move) return null;
  const c = new Chess(fen);
  const played = c.move({ from: move.from, to: move.to, promotion: move.promotion });
  return played ? played.san : move.raw || null;
}

/**
 * Walk every position with Stockfish and annotate the played move.
 */
export async function analyzeGame(game, engine, { depth = 12, onProgress } = {}) {
  const chess = new Chess();
  const annotations = [];
  const total = game.moves.length;
  let prevWhiteCp = 0;

  for (let i = 0; i < total; i++) {
    const beforeFen = chess.fen();
    const ev = await engine.evaluate(beforeFen, { depth });
    const move = game.moves[i];
    const playedUci = `${move.from}${move.to}${move.promotion || ""}`;
    const bestUci = ev.bestMove?.raw || "";
    const isBest = Boolean(bestUci) && playedUci === bestUci;
    chess.move({ from: move.from, to: move.to, promotion: move.promotion || undefined });
    const after = await engine.evaluate(chess.fen(), { depth: Math.max(8, depth - 2) });
    const beforeCp = cpView(ev);
    const afterCp = cpView(after);
    // Drop from the mover's point of view.
    const sign = move.color === "w" ? 1 : -1;
    const drop = Math.max(0, sign * (beforeCp - afterCp));
    const kind = classify(drop, isBest);
    const alt = isBest ? null : uciToSan(beforeFen, ev.bestMove);
    annotations.push({
      ply: i,
      san: move.san,
      color: move.color,
      fen: beforeFen,
      afterFen: chess.fen(),
      kind,
      dropCp: Math.round(drop),
      evalBefore: ev,
      evalAfter: after,
      bestSan: alt,
      bestUci,
    });
    prevWhiteCp = afterCp;
    onProgress?.({ index: i + 1, total, annotation: annotations[i] });
  }

  const counts = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const a of annotations) counts[a.kind] += 1;
  const scored = annotations.filter((a) => a.kind);
  const accuracy =
    scored.length === 0
      ? 100
      : Math.round(
          (scored.reduce((s, a) => {
            if (a.kind === "best") return s + 100;
            if (a.kind === "good") return s + 90;
            if (a.kind === "inaccuracy") return s + 70;
            if (a.kind === "mistake") return s + 40;
            return s + 10;
          }, 0) /
            scored.length) *
            10,
        ) / 10;

  return { annotations, counts, accuracy, finalEval: prevWhiteCp };
}
