export default function VoiceChat({ enabled, talking, remoteTalking, error, onEnable, onPtt, yourLabel = "You", remoteLabel = "Opponent" }) {
  return (
    <div className="voice-panel">
      <div className="voice-head">Voice (push to talk)</div>
      {!enabled ? (
        <button type="button" onClick={onEnable}>
          Enable microphone
        </button>
      ) : (
        <button
          type="button"
          className={`ptt ${talking ? "hot" : ""}`}
          onMouseDown={() => onPtt(true)}
          onMouseUp={() => onPtt(false)}
          onMouseLeave={() => onPtt(false)}
          onTouchStart={(e) => {
            e.preventDefault();
            onPtt(true);
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            onPtt(false);
          }}
        >
          {talking ? "Talking…" : "Hold to talk (Space)"}
        </button>
      )}
      {error && <div className="error-text">{error}</div>}
      <div className="talk-indicators">
        <span className={talking ? "is-talking" : ""}>{yourLabel}</span>
        <span className={remoteTalking ? "is-talking" : ""}>{remoteLabel}</span>
      </div>
    </div>
  );
}
