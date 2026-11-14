import { useEffect, useState } from "react";
import {
  connectSanketPtt,
  disconnectSanketPtt,
  getPttState,
  setPttChannel,
  setPttName,
  startTalk,
  stopTalk,
  subscribePtt,
} from "../voice/ptt.js";

export default function PttButton() {
  const [st, setSt] = useState(getPttState);
  const [channelDraft, setChannelDraft] = useState(st.channel);
  const [nameDraft, setNameDraft] = useState(st.name);
  const [channelErr, setChannelErr] = useState("");

  useEffect(() => subscribePtt(setSt), []);

  function applyChannel() {
    const r = setPttChannel(channelDraft);
    setChannelErr(r.ok ? "" : r.error);
  }

  function applyName() {
    setPttName(nameDraft);
  }

  async function onConnect(e) {
    e.preventDefault();
    applyName();
    const r = setPttChannel(channelDraft);
    if (!r.ok) {
      setChannelErr(r.error);
      return;
    }
    await connectSanketPtt({ channel: r.channel, name: nameDraft });
  }

  const floorLabel = st.floor ? st.floor.name : "—";
  const statusLabel =
    st.status === "connected" && st.broker
      ? `● ${st.broker}`
      : st.status === "connecting"
        ? "Connecting…"
        : st.status === "reconnecting"
          ? "○ Reconnecting…"
          : st.status === "error"
            ? "Connection issue"
            : "○ Offline";

  return (
    <div className="ptt-panel" data-testid="ptt-panel">
      <div className="ptt-head">Sanket PTT</div>
      <p className="fineprint">Talk on the Sanket radio network. Default channel is <code>chess</code> (plaintext).</p>
      <div className="ptt-fields">
        <label>
          Channel
          <input
            data-testid="ptt-channel"
            value={channelDraft}
            onChange={(e) => setChannelDraft(e.target.value)}
            onBlur={applyChannel}
            spellCheck={false}
            autoComplete="off"
            maxLength={40}
          />
        </label>
        <label>
          Name
          <input
            data-testid="ptt-name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={applyName}
            maxLength={40}
            autoComplete="off"
          />
        </label>
      </div>
      {channelErr && <div className="error-text">{channelErr}</div>}
      <div className="ptt-status" data-testid="ptt-broker">
        {statusLabel}
        {st.connected && (
          <>
            {" · "}
            <span data-testid="ptt-online-count">{Math.max(0, st.online.length)} online</span>
            {" · floor: "}
            <span data-testid="ptt-floor">{floorLabel}</span>
          </>
        )}
      </div>
      {st.connected && (
        <div className="ptt-online" data-testid="ptt-online">
          {st.online.length ? st.online.join(", ") : "Just you so far"}
        </div>
      )}
      {st.error && <div className="error-text">{st.error}</div>}
      {st.receiving && !st.talking && <div className="is-talking">Incoming audio</div>}
      <div className="ptt-actions">
        {!st.connected ? (
          <button type="button" className="primary" data-testid="ptt-connect" onClick={onConnect}>
            Connect PTT
          </button>
        ) : (
          <>
            <button
              type="button"
              data-testid="ptt-button"
              className={`ptt ${st.talking ? "hot" : ""}`}
              onPointerDown={(e) => {
                e.preventDefault();
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  /* synthetic events (tests) may have no pointer id */
                }
                startTalk();
              }}
              onPointerUp={stopTalk}
              onPointerCancel={stopTalk}
              onLostPointerCapture={stopTalk}
            >
              {st.talking ? "Talking…" : "PTT"}
            </button>
            <button type="button" data-testid="ptt-disconnect" onClick={disconnectSanketPtt}>
              Disconnect
            </button>
          </>
        )}
      </div>
      {st.connected && <div className="fineprint">Hold PTT or Space (when not typing) to talk.</div>}
    </div>
  );
}
