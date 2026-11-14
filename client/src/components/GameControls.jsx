export default function GameControls({
  canAct,
  status,
  drawOffer,
  yourColor,
  onResign,
  onOfferDraw,
  onAcceptDraw,
  onDeclineDraw,
  onRematch,
  onCopyLink,
  onDownloadPgn,
  onReview,
  copyLabel = "Copy link",
}) {
  const offerAgainstYou = drawOffer && drawOffer !== yourColor;
  return (
    <div className="controls">
      {onCopyLink && (
        <button type="button" onClick={onCopyLink}>
          {copyLabel}
        </button>
      )}
      {onDownloadPgn && (
        <button type="button" onClick={onDownloadPgn}>
          Download PGN
        </button>
      )}
      {canAct && status !== "finished" && (
        <>
          <button type="button" className="danger" onClick={onResign} disabled={!canAct || status === "waiting"}>
            Resign
          </button>
          {offerAgainstYou ? (
            <>
              <button type="button" className="good" onClick={onAcceptDraw}>
                Accept draw
              </button>
              <button type="button" onClick={onDeclineDraw}>
                Decline
              </button>
            </>
          ) : (
            <button type="button" onClick={onOfferDraw} disabled={status !== "active" || drawOffer === yourColor}>
              {drawOffer === yourColor ? "Draw offered" : "Offer draw"}
            </button>
          )}
        </>
      )}
      {status === "finished" && (
        <>
          {onRematch && (
            <button type="button" className="good" onClick={onRematch}>
              Rematch
            </button>
          )}
          {onReview && (
            <button type="button" onClick={onReview}>
              Review game
            </button>
          )}
        </>
      )}
    </div>
  );
}
