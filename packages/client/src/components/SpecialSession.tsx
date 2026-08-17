import { useState } from "react";
import type { GameAction, PlayerView } from "@interhuman/shared";

type Send = (action: GameAction) => void;

function nameOf(view: PlayerView, id: string | null): string {
  if (!id) return "?";
  return view.players.find((p) => p.id === id)?.name ?? "?";
}

const TRIGGER_LABEL: Record<string, string> = {
  policy_threshold: "The 3rd Fascist policy has been enacted.",
  execution: "An execution is about to take place.",
  player_called: "The table called for a Special Session.",
};

/**
 * Section 7: the full-screen "Registrar's findings" reveal. Takes over the
 * whole screen (no roster/log/board underneath) while it's up -- everyone
 * sees the identical two sentences; only the President can dismiss it.
 */
export function SpecialSessionOverlay({ view, send }: { view: PlayerView; send: Send }) {
  const session = view.activeSpecialSession;
  if (!session) return null;
  const isPresident = view.myId === session.presidentId;

  return (
    <div className="special-session-overlay">
      <div className="special-session-card">
        <span className="special-session-mark">☙</span>
        <h1>The Registrar's Findings</h1>
        <p className="hint">
          Round {session.roundNumber} · {TRIGGER_LABEL[session.triggerReason] ?? ""}
        </p>

        <div className="readouts">
          <div className="readout">
            <span className="readout-role">President -- {nameOf(view, session.presidentId)}</span>
            <p>{session.presidentReadout}</p>
          </div>
          <div className="readout">
            <span className="readout-role">Chancellor -- {nameOf(view, session.chancellorId)}</span>
            <p>{session.chancellorReadout}</p>
          </div>
        </div>

        {isPresident ? (
          <button onClick={() => send({ type: "CONTINUE_SPECIAL_SESSION", presidentId: view.myId })}>
            Continue
          </button>
        ) : (
          <p className="hint">Waiting for {nameOf(view, session.presidentId)} to continue...</p>
        )}
      </div>
    </div>
  );
}

/**
 * Section 7 trigger 3: a persistent, non-full-screen control -- a "Call
 * Special Session" button when available, or the live vote once someone's
 * proposed one. Rendered alongside the normal phase panel, not instead of it.
 */
export function SpecialSessionCallControl({ view, send }: { view: PlayerView; send: Send }) {
  const [confirming, setConfirming] = useState(false);
  const vote = view.pendingSpecialSessionVote;

  if (vote) {
    const voted = vote.myVote !== null;
    return (
      <div className="special-session-call-banner">
        <p>
          <strong>{nameOf(view, vote.proposedBy)}</strong> calls for a Special Session.
        </p>
        {!voted ? (
          <div className="vote-buttons">
            <button className="ja" onClick={() => send({ type: "CAST_SPECIAL_SESSION_VOTE", playerId: view.myId, choice: "ja" })}>
              Ja!
            </button>
            <button className="nein" onClick={() => send({ type: "CAST_SPECIAL_SESSION_VOTE", playerId: view.myId, choice: "nein" })}>
              Nein!
            </button>
          </div>
        ) : (
          <p className="hint">You voted {vote.myVote}. Waiting for the rest of the table...</p>
        )}
        <p className="hint">
          {vote.votesCast.length}/{view.players.filter((p) => p.isAlive).length} votes cast (choices hidden until everyone's in).
        </p>
      </div>
    );
  }

  if (!view.specialSessionAvailable) return null;

  if (!confirming) {
    return (
      <button className="secondary special-session-call-button" onClick={() => setConfirming(true)}>
        Call a Special Session
      </button>
    );
  }

  return (
    <div className="special-session-call-banner">
      <p className="hint">Call for a table-wide vote on a Special Session now? This is a one-time resource for the whole game.</p>
      <div className="capture-actions">
        <button onClick={() => send({ type: "PROPOSE_SPECIAL_SESSION", playerId: view.myId })}>Yes, propose it</button>
        <button className="secondary" onClick={() => setConfirming(false)}>
          Never mind
        </button>
      </div>
    </div>
  );
}
