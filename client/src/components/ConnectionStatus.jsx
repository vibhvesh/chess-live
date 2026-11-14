const LABELS = {
  connecting: "Connecting…",
  waiting: "Waiting for opponent",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  error: "Connection issue",
  offline: "Offline",
  spectator: "Spectating",
  local: "Vs computer",
};

export default function ConnectionStatus({ status, role, error }) {
  const label = role === "spectator" && status === "connected" ? LABELS.spectator : LABELS[status] || status;
  return (
    <div className={`conn-status is-${status || "connecting"}`} title={error || ""}>
      <span className="dot" />
      <span>{label}</span>
    </div>
  );
}
