# Chess Live

A free, no-account chess site for two players (share a link) or vs Stockfish in the browser. Hosted as a static app on GitHub Pages — there is no backend to time out.

Live (after Pages is enabled): **https://vibhvesh.github.io/chess-live/**

## What you get

- **Play a friend.** Opening the home page and choosing “Create a game” makes you White and gives you a shareable link (`#/g/<host-id>`). The first person to open that link is Black. Extra visitors spectate. Your seat is stored in `localStorage`, so a refresh or reconnect puts you back in the same chair.
- **Live board.** Drag or click-to-move, last-move and check highlights, a promotion picker, the board flipped for Black, captured pieces, a SAN move list, checkmate / stalemate / draw detection, resign, offer draw, rematch, copy-link, and a connection status.
- **Moves are recorded** on both devices (IndexedDB, with a `localStorage` fallback). Download a PGN at any time.
- **The page does not time out.** Peers send a heartbeat every 20 seconds over the WebRTC data channel, auto-reconnect to the PeerJS broker, and exchange the full PGN/game state on reconnect.
- **Voice.** Push-to-talk over WebRTC (hold the button or Space). Who is talking is shown to both players. Signalling uses the same PeerJS connection as the moves.
- **Play vs Computer.** Stockfish 16 (WASM, Web Worker) with difficulty 1–8, and you can choose White, Black, or random. Those games are recorded too, with PGN download.
- **Review.** After a game, open a review link that encodes the PGN in the URL (`#/r/<compressed-pgn>`) so it can be shared with no server. Stockfish annotates the moves in your browser. An LLM summary runs only if you paste an API key in this browser; otherwise you get template explanations.

## How two-player sync works

GitHub Pages is static, so there is no socket server. The host (White) opens a PeerJS peer whose id is in the share link. The guest (Black) connects to that id through the free public PeerJS broker (`0.peerjs.com`). Moves, chat-style game state, heartbeats, and voice signalling all go peer-to-peer. The host validates every move with [chess.js](https://github.com/jhlywa/chess.js) and broadcasts the new position.

If a NAT blocks a direct connection, a move or voice session may fail; you can later point PeerJS at your own broker with `VITE_PEERJS_HOST`.

## Sanket PTT (web)

A **PTT** button on the home, live-game, and vs-computer pages talks on the Sanket radio network over public MQTT/WSS (same protocol as SuperPTT). Default channel is `chess` (editable, `a-z0-9_-`, 1–40 chars). Hold the PTT button or Space (when not typing). In-game WebRTC voice between the two chess players is unchanged.

The official client is loaded from `https://vibhvesh.github.io/sanketptt/superptt/superptt.js` (`window.SuperPTT`), with a vendored fallback. See [`voice/pttAdapter.js`](voice/pttAdapter.js) and [`client/src/voice/ptt.js`](client/src/voice/ptt.js).

## Project layout

```
client/src/game/       chess.js rules, PGN, resign/draw
client/src/net/        PeerJS session + pure protocol (easy to test)
client/src/storage/    localStorage seats + IndexedDB games
client/src/engine/     Stockfish worker wrapper, levels 1–8
client/src/voice/      WebRTC push-to-talk
client/src/review/     PGN URL compression, analysis, summaries
client/src/components  board, move list, controls, voice UI
client/src/pages       home, live game, vs computer, review
voice/pttAdapter.js    Sanket PTT stub (PTT_URL)
scripts/test-sync.mjs  move sync, illegal moves, persistence, review links
```

## Develop

```bash
npm install
npm test
npm run dev
```

Then open the printed local URL. Create a game in one tab, paste the share link in another (or a private window) to play as Black.

```bash
npm run build
npm run preview
```

For a GitHub Pages–style build locally: `VITE_BASE=/chess-live/ npm run build`.

## Deploy

Pushes to `main` run [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml), which tests, builds with `VITE_BASE=/chess-live/`, and deploys to GitHub Pages. The repo must be **public** (free Pages) and Pages must use the **GitHub Actions** source.
