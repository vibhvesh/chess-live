# Voice module

Two implementations share the same idea (push-to-talk, show who is talking):

1. **Default — WebRTC via PeerJS** (`client/src/voice/webrtcPtt.js`)
   Signalling rides the same PeerJS connection used for moves. Hold the mic
   button or Space to talk. Works on the free public PeerJS broker; no server
   of ours is required (GitHub Pages is static).

2. **Sanket PTT adapter stub** (`voice/pttAdapter.js`)
   Set `VITE_PTT_URL` (default `https://ptt.bowlinger.net`) and implement
   `connectPtt()` when you want games to use the Sanket PTT backend instead
   of the in-page WebRTC path.
