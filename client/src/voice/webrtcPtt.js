/**
 * Push-to-talk voice over a PeerJS media call. The guest calls the host
 * once a mic is available; the host answers. Audio tracks stay muted
 * until the user holds the PTT button or Space.
 */
export function createVoiceSession({ getPeer, getRemotePeerId, onTalking, sendTalking }) {
  let localStream = null;
  let remoteStream = null;
  let call = null;
  let enabled = false;
  let talking = false;
  let remoteAudio = null;

  function setTracksEnabled(on) {
    localStream?.getAudioTracks().forEach((t) => {
      t.enabled = on;
    });
  }

  function attachRemote(stream) {
    remoteStream = stream;
    if (!remoteAudio) {
      remoteAudio = new Audio();
      remoteAudio.autoplay = true;
    }
    remoteAudio.srcObject = stream;
    remoteAudio.play().catch(() => {});
  }

  function hookCall(mediaCall) {
    call = mediaCall;
    mediaCall.on("stream", attachRemote);
    mediaCall.on("close", () => {
      if (call === mediaCall) call = null;
    });
  }

  async function ensureMic() {
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    setTracksEnabled(false);
    const peer = getPeer?.();
    if (peer) {
      peer.on("call", (incoming) => {
        incoming.answer(localStream);
        hookCall(incoming);
      });
    }
    return localStream;
  }

  async function startCall() {
    const peer = getPeer?.();
    const remoteId = getRemotePeerId?.();
    if (!peer || !remoteId || !localStream) return;
    if (call && call.open) return;
    try {
      const mediaCall = peer.call(remoteId, localStream);
      if (mediaCall) hookCall(mediaCall);
    } catch {
      /* the other side may already be calling */
    }
  }

  return {
    async enable() {
      await ensureMic();
      enabled = true;
      await startCall();
      return true;
    },
    disable() {
      this.setTalking(false);
      enabled = false;
      try {
        call?.close();
      } catch {
        /* ignore */
      }
      call = null;
      localStream?.getTracks().forEach((t) => t.stop());
      localStream = null;
      if (remoteAudio) {
        remoteAudio.srcObject = null;
      }
    },
    setTalking(on) {
      if (on && !enabled) return false;
      talking = Boolean(on) && enabled;
      setTracksEnabled(talking);
      sendTalking?.(talking);
      onTalking?.({ local: talking });
      return talking;
    },
    isEnabled() {
      return enabled;
    },
    isTalking() {
      return talking;
    },
    refresh() {
      if (enabled) startCall();
    },
  };
}
