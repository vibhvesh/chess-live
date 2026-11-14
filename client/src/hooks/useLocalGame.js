import { useCallback, useEffect, useState } from "react";
import { applyMove, createGame, resign, offerDraw, acceptDraw, declineDraw, resetForRematch, newGameId } from "../game/logic.js";
import { saveGame, loadGame, saveSeat, loadSeat } from "../storage/localStore.js";

export function useLocalGame({ gameId, computer } = {}) {
  const [game, setGame] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (gameId) {
        const existing = await loadGame(gameId);
        if (cancelled) return;
        if (existing) {
          setGame(existing);
          return;
        }
      }
      const id = gameId || newGameId();
      const g = createGame({ id, mode: "computer", computer });
      const seatColor = g.computer?.humanColor === "random" ? (Math.random() < 0.5 ? "w" : "b") : g.computer?.humanColor || "w";
      g.computer = { ...g.computer, humanColor: seatColor };
      saveSeat(id, { color: seatColor, token: g.whiteToken, role: "player", host: true });
      await saveGame(g);
      if (!cancelled) setGame(g);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const commit = useCallback(async (next) => {
    setGame(next);
    await saveGame(next);
    return next;
  }, []);

  const move = useCallback(
    (from, to, promotion, color) => {
      if (!game) return { ok: false, error: "no game" };
      const result = applyMove(game, { from, to, promotion }, color);
      if (result.ok) commit(result.game);
      return result;
    },
    [game, commit],
  );

  return {
    game,
    setGame: commit,
    move,
    resign: (color) => {
      const r = resign(game, color);
      if (r.ok) commit(r.game);
      return r;
    },
    offerDraw: (color) => {
      const r = offerDraw(game, color);
      if (r.ok) commit(r.game);
      return r;
    },
    acceptDraw: (color) => {
      const r = acceptDraw(game, color);
      if (r.ok) commit(r.game);
      return r;
    },
    declineDraw: (color) => {
      const r = declineDraw(game, color);
      if (r.ok) commit(r.game);
      return r;
    },
    rematch: async () => {
      const next = resetForRematch(game);
      await commit(next);
      return next;
    },
    humanColor: game?.computer?.humanColor || loadSeat(gameId || "")?.color || "w",
  };
}
