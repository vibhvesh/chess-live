/**
 * Narrative summary of a reviewed game. Uses a user-supplied LLM key in
 * the browser if present; otherwise writes template explanations.
 */

const LABELS = {
  best: "Best",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

export function explainMove(annotation) {
  const { kind, san, bestSan, dropCp, color } = annotation;
  const who = color === "w" ? "White" : "Black";
  if (kind === "best") return `${who} played ${san}, matching the engine's first choice.`;
  if (kind === "good") return `${who}'s ${san} is a solid move.${bestSan ? ` The engine slightly prefers ${bestSan}.` : ""}`;
  if (kind === "inaccuracy") {
    return `${who}'s ${san} is a slight inaccuracy (~${dropCp} cp).${bestSan ? ` ${bestSan} was more precise.` : ""}`;
  }
  if (kind === "mistake") {
    return `${who} made a mistake with ${san}, giving up about ${dropCp} centipawns.${bestSan ? ` A better try was ${bestSan}.` : ""}`;
  }
  return `${who} blundered with ${san}, a loss of roughly ${dropCp} cp.${bestSan ? ` ${bestSan} would have been much stronger.` : ""}`;
}

export function templateSummary(game, report) {
  const { counts, accuracy, annotations } = report;
  const result =
    game.winner === "w" ? "White won" : game.winner === "b" ? "Black won" : game.winner === "draw" ? "The game was a draw" : "The game is unfinished";
  const reason = game.endReason ? ` by ${game.endReason}` : "";
  const lines = [
    `${result}${reason} after ${game.moves.length} move${game.moves.length === 1 ? "" : "s"}.`,
    `Estimated accuracy: ${accuracy}%. ` +
      `${counts.best} best, ${counts.good} good, ${counts.inaccuracy} inaccuracies, ${counts.mistake} mistakes, ${counts.blunder} blunders.`,
  ];
  const big = annotations.filter((a) => a.kind === "blunder" || a.kind === "mistake");
  if (big.length) {
    lines.push("Key moments:");
    for (const a of big.slice(0, 6)) lines.push(`• ${explainMove(a)}`);
  } else {
    lines.push("A clean game — no major mistakes were found at this analysis depth.");
  }
  return lines.join("\n");
}

export async function summarizeGame({ game, report, apiKey, endpoint }) {
  if (!apiKey) return { source: "template", text: templateSummary(game, report) };
  const url = endpoint || "https://api.openai.com/v1/chat/completions";
  const notes = report.annotations.map((a, i) => `${i + 1}. ${a.color === "w" ? "W" : "B"} ${a.san} [${LABELS[a.kind]}]${a.bestSan ? ` (better: ${a.bestSan})` : ""}`).join("\n");
  const body = {
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: "You are a chess coach. Write a concise, friendly post-game review (under 200 words) using the move annotations. No preamble.",
      },
      {
        role: "user",
        content: `Result: ${game.winner || "unfinished"} (${game.endReason || "n/a"})\nAccuracy: ${report.accuracy}%\nMoves:\n${notes}`,
      },
    ],
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("empty LLM response");
    return { source: "llm", text };
  } catch (err) {
    return { source: "template", text: templateSummary(game, report), error: err.message };
  }
}
