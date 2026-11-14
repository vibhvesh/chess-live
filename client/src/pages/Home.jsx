import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { LEVELS } from "../engine/stockfishEngine.js";
import { createGame } from "../game/logic.js";
import { saveGame, saveSeat, listGames } from "../storage/localStore.js";

export default function Home() {
  const navigate = useNavigate();
  const [level, setLevel] = useState(4);
  const [color, setColor] = useState("w");
  const [recent, setRecent] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    listGames().then((g) => setRecent(g.slice(0, 6)));
  }, []);

  async function playFriend() {
    const id = `cl${nanoid(12)}`;
    const game = createGame({ id, mode: "human" });
    saveSeat(id, { color: "w", token: game.whiteToken, role: "player", host: true });
    await saveGame(game);
    navigate(`/g/${id}`);
  }

  async function playComputer(e) {
    e?.preventDefault();
    const id = `cp${nanoid(10)}`;
    let humanColor = color;
    if (color === "random") humanColor = Math.random() < 0.5 ? "w" : "b";
    const game = createGame({ id, mode: "computer", computer: { level: Number(level), humanColor } });
    game.computer.humanColor = humanColor;
    saveSeat(id, { color: humanColor, token: game.whiteToken, role: "player", host: true });
    await saveGame(game);
    navigate(`/c/${id}`);
  }

  return (
    <div className="page home">
      <header className="hero">
        <h1>Chess Live</h1>
        <p className="lede">
          Play a friend over a shareable link, or take on Stockfish in your browser. No accounts.
          Moves, voice, and review all run on your devices — this site is a static page.
        </p>
      </header>

      <div className="home-grid">
        <section className="panel">
          <h2>Play a friend</h2>
          <p>You are White. A link is created instantly — send it to your opponent. They become Black. Anyone else who opens it can watch.</p>
          <button type="button" className="primary big" onClick={playFriend}>
            Create a game &amp; share link
          </button>
        </section>

        <section className="panel">
          <h2>Play vs Computer</h2>
          <form onSubmit={playComputer}>
            <label>
              Your color
              <select value={color} onChange={(e) => setColor(e.target.value)}>
                <option value="w">White</option>
                <option value="b">Black</option>
                <option value="random">Random</option>
              </select>
            </label>
            <label>
              Difficulty
              <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                {Object.entries(LEVELS).map(([n, cfg]) => (
                  <option key={n} value={n}>
                    {n} — {cfg.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="primary big">
              Start game
            </button>
          </form>
        </section>
      </div>

      {recent.length > 0 && (
        <section className="panel recent">
          <h2>Recent games on this device</h2>
          <ul>
            {recent.map((g) => (
              <li key={g.id}>
                <Link to={g.mode === "computer" ? `/c/${g.id}` : `/g/${g.id}`}>
                  {g.mode === "computer" ? "vs Computer" : "vs Friend"} · {g.moves?.length || 0} moves ·{" "}
                  {g.status}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="fineprint">
        Voice is push-to-talk over WebRTC (PeerJS). A Sanket PTT adapter stub lives in{" "}
        <code>voice/pttAdapter.js</code> if you want to point it at your PTT server later.
        {copied ? " Link copied." : null}
      </p>
    </div>
  );
}
