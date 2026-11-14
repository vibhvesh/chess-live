/**
 * Stockfish WASM in a Web Worker. Single-thread build (no COOP/COEP).
 * Difficulty 1–8 maps to Skill Level + search depth / movetime.
 */

export const LEVELS = {
  1: { skill: 0, depth: 1, movetime: 80, elo: 800, label: "Beginner" },
  2: { skill: 3, depth: 2, movetime: 120, elo: 1000, label: "Easy" },
  3: { skill: 6, depth: 3, movetime: 200, elo: 1200, label: "Casual" },
  4: { skill: 10, depth: 5, movetime: 350, elo: 1400, label: "Intermediate" },
  5: { skill: 13, depth: 8, movetime: 500, elo: 1600, label: "Advanced" },
  6: { skill: 16, depth: 10, movetime: 800, elo: 1800, label: "Hard" },
  7: { skill: 18, depth: 12, movetime: 1200, elo: 2000, label: "Expert" },
  8: { skill: 20, depth: 15, movetime: 2000, elo: 2200, label: "Master" },
};

function engineUrl() {
  const base = import.meta.env.BASE_URL || "/";
  return new URL("engine/stockfish.js", base.endsWith("/") ? base : base + "/").toString();
}

export function createStockfishEngine() {
  let worker = null;
  let queue = Promise.resolve();
  let listeners = new Set();

  function send(cmd) {
    worker?.postMessage(cmd);
  }

  function onMessage(ev) {
    const line = typeof ev.data === "string" ? ev.data : ev.data?.data ?? ev.data;
    if (typeof line !== "string") return;
    for (const fn of listeners) fn(line);
  }

  function waitFor(predicate, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(handler);
        reject(new Error("engine timeout"));
      }, timeoutMs);
      function handler(line) {
        if (predicate(line)) {
          clearTimeout(timer);
          listeners.delete(handler);
          resolve(line);
        }
      }
      listeners.add(handler);
    });
  }

  function enqueue(fn) {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  }

  return {
    async init() {
      if (worker) return;
      worker = new Worker(engineUrl());
      worker.onmessage = onMessage;
      send("uci");
      await waitFor((l) => l.includes("uciok"));
      // Classical eval — we do not ship the 39MB NNUE net.
      send("setoption name Use NNUE value false");
      send("isready");
      await waitFor((l) => l.includes("readyok"));
    },
    async getBestMove(fen, { level = 4, depth, movetime } = {}) {
      return enqueue(async () => {
        await this.init();
        const cfg = LEVELS[level] || LEVELS[4];
        send(`setoption name Skill Level value ${cfg.skill}`);
        send("ucinewgame");
        send("isready");
        await waitFor((l) => l.includes("readyok"));
        send(`position fen ${fen}`);
        const d = depth ?? cfg.depth;
        const t = movetime ?? cfg.movetime;
        send(`go depth ${d} movetime ${t}`);
        const line = await waitFor((l) => l.startsWith("bestmove"), 30000);
        const parts = line.split(/\s+/);
        const best = parts[1];
        if (!best || best === "(none)") return null;
        return {
          from: best.slice(0, 2),
          to: best.slice(2, 4),
          promotion: best.length > 4 ? best[4] : undefined,
          raw: best,
        };
      });
    },
    /**
     * Return a centipawn eval and best move from the side to move.
     * Score is in white-pawn units (positive = White better).
     */
    async evaluate(fen, { depth = 12 } = {}) {
      return enqueue(async () => {
        await this.init();
        send("setoption name Skill Level value 20");
        send("ucinewgame");
        send("isready");
        await waitFor((l) => l.includes("readyok"));
        send(`position fen ${fen}`);
        send(`go depth ${depth}`);
        let lastEval = { cp: 0, mate: null };
        const unsub = (line) => {
          if (!line.startsWith("info")) return;
          const mate = / score mate (-?\d+)/.exec(line);
          const cp = / score cp (-?\d+)/.exec(line);
          if (mate) lastEval = { cp: null, mate: Number(mate[1]) };
          else if (cp) lastEval = { cp: Number(cp[1]), mate: null };
        };
        listeners.add(unsub);
        try {
          const line = await waitFor((l) => l.startsWith("bestmove"), 30000);
          const parts = line.split(/\s+/);
          const best = parts[1] && parts[1] !== "(none)" ? parts[1] : null;
          const turn = fen.split(" ")[1] || "w";
          // Stockfish scores from the side to move. Convert to White's view.
          const sign = turn === "w" ? 1 : -1;
          return {
            bestMove: best
              ? { from: best.slice(0, 2), to: best.slice(2, 4), promotion: best.length > 4 ? best[4] : undefined, raw: best }
              : null,
            cp: lastEval.cp == null ? null : lastEval.cp * sign,
            mate: lastEval.mate == null ? null : lastEval.mate * sign,
          };
        } finally {
          listeners.delete(unsub);
        }
      });
    },
    destroy() {
      try {
        worker?.terminate();
      } catch {
        /* ignore */
      }
      worker = null;
      listeners = new Set();
    },
  };
}
