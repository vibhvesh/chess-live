import { useEffect, useRef, useState, useCallback } from "react";
import { createPeerSession } from "../net/peerSync.js";
import { loadGame, saveGame, loadSeat, saveSeat } from "../storage/localStore.js";

export function usePeerGame(hostId, { isHost, token } = {}) {
  const [game, setGame] = useState(null);
  const [meta, setMeta] = useState({
    status: "connecting",
    color: isHost ? "w" : null,
    role: isHost ? "player" : null,
  });
  const [talking, setTalking] = useState({ w: false, b: false });
  const [chat, setChat] = useState([]);
  const sessionRef = useRef(null);
  const remotePeerIdRef = useRef(null);

  useEffect(() => {
    if (!hostId) return undefined;
    const seat = loadSeat(hostId);
    const host = Boolean(isHost || seat?.color === "w" || seat?.role === "host");
    const startToken = token || seat?.token || null;

    const session = createPeerSession({
      hostId,
      isHost: host,
      token: startToken,
      loadLocalGame: loadGame,
      saveLocalGame: saveGame,
      onState(next, info) {
        setGame({ ...next });
        if (info?.token) {
          saveSeat(hostId, { color: info.color, token: info.token, role: info.role, host: host });
        }
      },
      onStatus(s) {
        setMeta((m) => ({ ...m, ...s }));
        if (s.token) saveSeat(hostId, { color: s.color, token: s.token, role: s.role, host });
      },
      onTalking({ color, on }) {
        if (color === "w" || color === "b") setTalking((t) => ({ ...t, [color]: on }));
      },
      onRemotePeerId(id) {
        remotePeerIdRef.current = id;
      },
      onChat(msg) {
        setChat((c) => [...c, msg].slice(-80));
      },
    });
    sessionRef.current = session;
    session.start();
    return () => {
      session.stop();
      sessionRef.current = null;
    };
  }, [hostId, isHost, token]);

  const move = useCallback((from, to, promotion) => sessionRef.current?.move(from, to, promotion), []);
  const resign = useCallback(() => sessionRef.current?.resign(), []);
  const offerDraw = useCallback(() => sessionRef.current?.offerDraw(), []);
  const acceptDraw = useCallback(() => sessionRef.current?.acceptDraw(), []);
  const declineDraw = useCallback(() => sessionRef.current?.declineDraw(), []);
  const rematch = useCallback(() => sessionRef.current?.rematch(), []);
  const sendTalking = useCallback((on) => sessionRef.current?.sendTalking(on), []);
  const sendChat = useCallback((text) => sessionRef.current?.sendChat(text), []);

  return {
    game,
    meta,
    talking,
    chat,
    move,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw,
    rematch,
    sendTalking,
    sendChat,
    getPeer: () => sessionRef.current?.getPeer() || null,
    getRemotePeerId: () => remotePeerIdRef.current || sessionRef.current?.getRemotePeerId(),
  };
}
