# Voice module

1. **In-game WebRTC** (`client/src/voice/webrtcPtt.js`) — PeerJS push-to-talk between the two chess players.

2. **Sanket PTT** (`voice/pttAdapter.js` + `client/src/voice/ptt.js`) — official SuperPTT client over public MQTT/WSS.
   Default channel: `chess`. Audio is raw 12 kHz mono Int16 LE PCM in `[len][id][PCM]` frames (~1024 samples).
   SuperPTT is loaded from https://vibhvesh.github.io/sanketptt/superptt/superptt.js (vendored fallback in `client/public/vendor/`).
