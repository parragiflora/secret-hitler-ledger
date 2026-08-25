import { useState } from "react";
import type { GameAction, PlayerView, PolicyType } from "@interhuman/shared";
import { eligibleNomineeIds } from "../eligibility";
import { CapturePanel } from "./CapturePanel";
import { GameRecapSection } from "./Recap";

type Send = (action: GameAction) => void;

// Mid-sentence reference to a player -- "you" (lowercase) when it's the
// viewer themselves, so "President Alice nominates you for Chancellor"
// reads naturally instead of naming yourself in the third person. Sentences
// where the substituted name is the GRAMMATICAL SUBJECT (verb agreement,
// e.g. "X is" vs "you are", or sentence-initial capitalization) can't use
// this directly -- those are special-cased at the call site instead.
function nameOf(view: PlayerView, id: string | null): string {
  if (!id) return "?";
  if (id === view.myId) return "you";
  return view.players.find((p) => p.id === id)?.name ?? "?";
}

function PolicyCard({ type }: { type: PolicyType }) {
  return <div className={`policy-card ${type}`}>{type === "liberal" ? "Liberal" : "Fascist"}</div>;
}

export function WaitingRoom({ view, send }: { view: PlayerView; send: Send }) {
  const canStart = view.players.length >= 5 && view.players.length <= 10;
  return (
    <div className="panel">
      <h2>Lobby</h2>
      <p>
        Share the room code <strong>{view.code}</strong> with 4-9 other players.
      </p>
      <p className="hint">{view.players.length}/10 players joined (5-10 required to start).</p>
      <button disabled={!canStart} onClick={() => send({ type: "START_GAME" })}>
        Start Game
      </button>
      {!canStart && <p className="hint">Need at least 5 players.</p>}
    </div>
  );
}

export function RoleReveal({ view, send }: { view: PlayerView; send: Send }) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <div className="panel role-reveal">
      <h2>Your Role</h2>
      <div className={`role-badge ${view.myRole}`}>{view.myRole?.toUpperCase()}</div>
      {Object.keys(view.knownRoles).length > 0 && (
        <p>
          {view.myRole === "hitler" ? "You know your fascists: " : "Your fellow fascists: "}
          {Object.keys(view.knownRoles)
            .map((id) => nameOf(view, id))
            .join(", ")}
        </p>
      )}
      {view.myRole === "hitler" && Object.keys(view.knownRoles).length === 0 && (
        <p>You do not know who the other Fascists are.</p>
      )}
      <button
        disabled={acknowledged}
        onClick={() => {
          setAcknowledged(true);
          send({ type: "ACKNOWLEDGE_ROLE", playerId: view.myId });
        }}
      >
        {acknowledged ? "Waiting for the rest of the table..." : "I understand my role"}
      </button>
    </div>
  );
}

export function Nomination({ view, send }: { view: PlayerView; send: Send }) {
  const isPresident = view.myId === view.presidentId;
  const eligible = eligibleNomineeIds(view);
  // nomination_speech is required (section 6) -- prompt for it by holding off
  // the nominee picker until it's recorded or explicitly skipped.
  const captureBlocking = Boolean(view.activeCapture?.required) && !view.activeCaptureLogged;

  if (!isPresident) {
    return (
      <div className="panel">
        <h2>Nomination</h2>
        <p>President {nameOf(view, view.presidentId)} is nominating a Chancellor...</p>
        <CapturePanel view={view} send={send} />
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Nominate a Chancellor</h2>
      <CapturePanel view={view} send={send} />
      {captureBlocking ? (
        <p className="hint">Record (or skip) your nomination speech to continue.</p>
      ) : (
        <div className="choice-grid">
          {eligible.map((id) => (
            <button
              key={id}
              onClick={() => send({ type: "NOMINATE_CHANCELLOR", presidentId: view.myId, nomineeId: id })}
            >
              {nameOf(view, id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ElectionVote({ view, send }: { view: PlayerView; send: Send }) {
  const voted = view.myVote !== null;
  const isPresident = view.myId === view.presidentId;
  const isNominee = view.myId === view.presidentialCandidateId;
  return (
    <div className="panel">
      <h2>Election Vote</h2>
      <p>
        {isPresident ? (
          <>You nominate {nameOf(view, view.presidentialCandidateId)} for Chancellor.</>
        ) : (
          <>
            President {nameOf(view, view.presidentId)} nominates {nameOf(view, view.presidentialCandidateId)} for
            Chancellor.
          </>
        )}
      </p>
      {isNominee ? (
        <p className="hint">You're on the ballot -- automatically counted as Ja.</p>
      ) : !voted ? (
        <div className="vote-buttons">
          <button className="ja" onClick={() => send({ type: "CAST_VOTE", playerId: view.myId, choice: "ja" })}>
            Ja!
          </button>
          <button className="nein" onClick={() => send({ type: "CAST_VOTE", playerId: view.myId, choice: "nein" })}>
            Nein!
          </button>
        </div>
      ) : (
        <p>You voted {view.myVote}. Waiting for the rest of the table...</p>
      )}
      <p className="hint">
        {view.playersWhoHaveVoted.length}/{view.players.filter((p) => p.isAlive).length} votes cast (choices hidden
        until everyone's in).
      </p>
      {view.lastVoteResult && (
        <p className="hint">
          Last result: {view.lastVoteResult.ja} Ja - {view.lastVoteResult.nein} Nein (
          {view.lastVoteResult.passed ? "passed" : "failed"})
        </p>
      )}
      <CapturePanel view={view} send={send} />
    </div>
  );
}

export function LegislativePresidentPanel({ view, send }: { view: PlayerView; send: Send }) {
  const isPresident = view.myId === view.presidentId;
  if (!isPresident || !view.myPresidentHand) {
    return (
      <div className="panel">
        <h2>Legislative Session</h2>
        <p>President {nameOf(view, view.presidentId)} is reviewing 3 policies and discarding 1...</p>
      </div>
    );
  }
  return (
    <div className="panel">
      <h2>Choose 1 Policy to Discard</h2>
      <p className="hint">The remaining 2 go to Chancellor {nameOf(view, view.chancellorId)}.</p>
      <div className="policy-row">
        {view.myPresidentHand.map((type, i) => (
          <div key={i} className="policy-choice">
            <PolicyCard type={type} />
            <button onClick={() => send({ type: "PRESIDENT_DISCARD", presidentId: view.myId, discardIndex: i as 0 | 1 | 2 })}>
              Discard
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LegislativeChancellorPanel({ view, send }: { view: PlayerView; send: Send }) {
  const isChancellor = view.myId === view.chancellorId;
  if (!isChancellor || !view.myChancellorHand) {
    return (
      <div className="panel">
        <h2>Legislative Session</h2>
        <p>Chancellor {nameOf(view, view.chancellorId)} is choosing which policy to enact...</p>
      </div>
    );
  }
  return (
    <div className="panel">
      <h2>Choose 1 Policy to Enact</h2>
      <div className="policy-row">
        {view.myChancellorHand.map((type, i) => (
          <div key={i} className="policy-choice">
            <PolicyCard type={type} />
            <button onClick={() => send({ type: "CHANCELLOR_ENACT", chancellorId: view.myId, enactIndex: i as 0 | 1 })}>
              Enact
            </button>
          </div>
        ))}
      </div>
      {view.vetoUnlocked && (
        <button className="secondary" onClick={() => send({ type: "CHANCELLOR_PROPOSE_VETO", chancellorId: view.myId })}>
          Propose Veto Instead
        </button>
      )}
    </div>
  );
}

export function VetoResponsePanel({ view, send }: { view: PlayerView; send: Send }) {
  const isPresident = view.myId === view.presidentId;
  const isChancellor = view.myId === view.chancellorId;
  return (
    <div className="panel">
      <h2>Veto Proposed</h2>
      <p>
        {isChancellor ? (
          <>You propose vetoing both policies.</>
        ) : (
          <>Chancellor {nameOf(view, view.chancellorId)} proposes vetoing both policies.</>
        )}
      </p>
      {isPresident ? (
        <div className="vote-buttons">
          <button className="ja" onClick={() => send({ type: "PRESIDENT_VETO_RESPONSE", presidentId: view.myId, accept: true })}>
            Accept Veto
          </button>
          <button className="nein" onClick={() => send({ type: "PRESIDENT_VETO_RESPONSE", presidentId: view.myId, accept: false })}>
            Reject Veto
          </button>
        </div>
      ) : (
        <p>President {nameOf(view, view.presidentId)} is deciding whether to accept...</p>
      )}
    </div>
  );
}

export function PolicyDefensePanel({ view, send }: { view: PlayerView; send: Send }) {
  const isChancellor = view.myId === view.chancellorId;
  const captureBlocking = Boolean(view.activeCapture?.required) && !view.activeCaptureLogged;
  return (
    <div className="panel">
      <h2>Policy Enacted</h2>
      <PolicyCard type={view.lastEnactedPolicy!} />
      <p className="hint">
        {isChancellor ? "You defend the decision." : <>Chancellor {nameOf(view, view.chancellorId)} defends the decision.</>}
      </p>
      <CapturePanel view={view} send={send} />
      {isChancellor && (
        <button disabled={captureBlocking} onClick={() => send({ type: "ACKNOWLEDGE_POLICY_DEFENSE", chancellorId: view.myId })}>
          Continue
        </button>
      )}
    </div>
  );
}

export function ExecutiveActionPanel({ view, send }: { view: PlayerView; send: Send }) {
  const isPresident = view.myId === view.presidentId;
  const power = view.pendingExecutivePower;
  const [peekOnly, setPeekOnly] = useState(false);

  const targetable = view.players.filter((p) => p.isAlive && p.id !== view.myId);

  if (power === "investigate_loyalty") {
    const investigatable = targetable.filter((p) => !view.investigatedPlayerIds.includes(p.id));
    if (view.myExecutiveResult && "team" in view.myExecutiveResult) {
      return (
        <div className="panel">
          <h2>Investigation Result</h2>
          <p>Party membership: <strong>{view.myExecutiveResult.team}</strong></p>
          <p className="hint">Only you can see this. You may report it truthfully -- or lie.</p>
          <CapturePanel view={view} send={send} />
          {isPresident && (
            <button onClick={() => send({ type: "ACKNOWLEDGE_EXECUTIVE_ACTION", presidentId: view.myId })}>Continue</button>
          )}
        </div>
      );
    }
    return (
      <div className="panel">
        <h2>Investigate Loyalty</h2>
        {isPresident ? (
          <div className="choice-grid">
            {investigatable.map((p) => (
              <button key={p.id} onClick={() => send({ type: "EXECUTIVE_INVESTIGATE", presidentId: view.myId, targetId: p.id })}>
                {p.name}
              </button>
            ))}
          </div>
        ) : (
          <p>President {nameOf(view, view.presidentId)} is investigating a player's loyalty...</p>
        )}
      </div>
    );
  }

  if (power === "policy_peek") {
    if (view.myExecutiveResult && "peeked" in view.myExecutiveResult) {
      return (
        <div className="panel">
          <h2>Policy Peek</h2>
          <div className="policy-row">
            {view.myExecutiveResult.peeked.map((t, i) => (
              <PolicyCard key={i} type={t} />
            ))}
          </div>
          <p className="hint">Top of the draw pile, order preserved. Only you can see this.</p>
          {isPresident && (
            <button onClick={() => send({ type: "ACKNOWLEDGE_EXECUTIVE_ACTION", presidentId: view.myId })}>Continue</button>
          )}
        </div>
      );
    }
    return (
      <div className="panel">
        <h2>Policy Peek</h2>
        {isPresident ? (
          !peekOnly ? (
            <button
              onClick={() => {
                setPeekOnly(true);
                send({ type: "EXECUTIVE_POLICY_PEEK", presidentId: view.myId });
              }}
            >
              Peek at the next 3 policies
            </button>
          ) : (
            <p>Peeking...</p>
          )
        ) : (
          <p>President {nameOf(view, view.presidentId)} is peeking at the draw pile...</p>
        )}
      </div>
    );
  }

  if (power === "special_election") {
    if (view.specialElectionNextPresidentId) {
      return (
        <div className="panel">
          <h2>Special Election</h2>
          <p>
            {view.specialElectionNextPresidentId === view.myId
              ? "You will be the next President."
              : <>{nameOf(view, view.specialElectionNextPresidentId)} will be the next President.</>}
          </p>
          {isPresident && (
            <button onClick={() => send({ type: "ACKNOWLEDGE_EXECUTIVE_ACTION", presidentId: view.myId })}>Continue</button>
          )}
        </div>
      );
    }
    return (
      <div className="panel">
        <h2>Special Election</h2>
        {isPresident ? (
          <div className="choice-grid">
            {targetable.map((p) => (
              <button key={p.id} onClick={() => send({ type: "EXECUTIVE_SPECIAL_ELECTION", presidentId: view.myId, targetId: p.id })}>
                {p.name}
              </button>
            ))}
          </div>
        ) : (
          <p>President {nameOf(view, view.presidentId)} is naming the next President...</p>
        )}
      </div>
    );
  }

  if (power === "execution") {
    if (view.pendingExecutionTargetId) {
      return (
        <div className="panel">
          <h2>Execution</h2>
          <p>
            {view.pendingExecutionTargetId === view.myId
              ? "You are about to be executed."
              : <>{nameOf(view, view.pendingExecutionTargetId)} is about to be executed.</>}
          </p>
          <CapturePanel view={view} send={send} />
          {isPresident && (
            <button onClick={() => send({ type: "ACKNOWLEDGE_EXECUTIVE_ACTION", presidentId: view.myId })}>Confirm</button>
          )}
        </div>
      );
    }
    return (
      <div className="panel">
        <h2>Execution</h2>
        {isPresident ? (
          <div className="choice-grid">
            {targetable.map((p) => (
              <button key={p.id} className="danger" onClick={() => send({ type: "EXECUTIVE_EXECUTION", presidentId: view.myId, targetId: p.id })}>
                {p.name}
              </button>
            ))}
          </div>
        ) : (
          <p>President {nameOf(view, view.presidentId)} is choosing who to execute...</p>
        )}
      </div>
    );
  }

  return <div className="panel">Awaiting executive action...</div>;
}

export function GameEndPanel({ view }: { view: PlayerView }) {
  return (
    <div className="panel">
      <h2>{view.winner === "liberal" ? "Liberals Win" : "Fascists Win"}</h2>
      <p className="hint">{view.winReason}</p>
      {view.finalRoles && (
        <ul className="final-roles">
          {view.players.map((p) => (
            <li key={p.id}>
              {p.name}: <strong>{view.finalRoles![p.id]}</strong>
            </li>
          ))}
        </ul>
      )}
      {view.recap && <GameRecapSection recap={view.recap} />}
    </div>
  );
}
