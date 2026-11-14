import { useEffect, useRef, useState, useCallback } from "react";
import { createVoiceSession } from "../voice/webrtcPtt.js";
import { isSanketPttConnected } from "../voice/ptt.js";

export function useVoice({ getPeer, getRemotePeerId, sendTalking, enabled: wantEnabled, color }) {
  const voiceRef = useRef(null);
  const [enabled, setEnabled] = useState(false);
  const [talking, setTalking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const session = createVoiceSession({
      getPeer,
      getRemotePeerId,
      sendTalking,
      onTalking({ local }) {
        setTalking(Boolean(local));
      },
    });
    voiceRef.current = session;
    return () => session.disable();
  }, [getPeer, getRemotePeerId, sendTalking]);

  const enable = useCallback(async () => {
    try {
      await voiceRef.current.enable();
      setEnabled(true);
      setError(null);
    } catch (err) {
      setError(err.message || "Microphone permission was denied.");
      setEnabled(false);
    }
  }, []);

  const setPtt = useCallback((on) => {
    voiceRef.current?.setTalking(on);
  }, []);

  useEffect(() => {
    function down(e) {
      if (e.code !== "Space" && e.key !== " ") return;
      if (e.repeat) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      if (isSanketPttConnected()) return; // Sanket PTT owns Space while connected
      e.preventDefault();
      if (!voiceRef.current?.isEnabled()) return;
      setPtt(true);
    }
    function up(e) {
      if (e.code !== "Space" && e.key !== " ") return;
      setPtt(false);
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => setPtt(false));
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [setPtt]);

  useEffect(() => {
    if (enabled) voiceRef.current?.refresh();
  }, [enabled, color]);

  return { enabled, talking, error, enable, disable: () => { voiceRef.current?.disable(); setEnabled(false); }, setPtt };
}
