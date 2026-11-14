import { buildPgn } from "../game/logic.js";

export function downloadPgn(game) {
  const pgn = buildPgn(game);
  const blob = new Blob([pgn], { type: "application/x-chess-pgn" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chess-live-${game.id}.pgn`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
