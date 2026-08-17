import type { AmbientTensionLevel, PlayerView } from "@interhuman/shared";

// Section 7 passive tracking: the one surface trust data gets during normal
// play. Deliberately vague -- no player names, no signal names, no scores.
const TENSION_COPY: Record<AmbientTensionLevel, string> = {
  calm: "The room feels calm.",
  restless: "Something's stirring.",
  charged: "The air is charged.",
};

function AmbientTensionIndicator({ level }: { level: AmbientTensionLevel }) {
  return (
    <span
      className={`tension-indicator tension-${level}`}
      title="The Registrar's ambient read on the table."
    >
      <span className="tension-dot" />
      {TENSION_COPY[level]}
    </span>
  );
}

function PolicyTrack({ label, count, total }: { label: string; count: number; total: number }) {
  return (
    <div className="track">
      <span className="track-label">{label}</span>
      <div className="track-slots">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`slot ${i < count ? "filled" : ""}`} />
        ))}
      </div>
    </div>
  );
}

export function BoardHeader({ view }: { view: PlayerView }) {
  return (
    <header className="board-header">
      <div className="brand">
        <span className="brand-mark">☙</span> The Registrar's Ledger
        <span className="room-code">Room {view.code}</span>
      </div>
      <div className="tracks">
        <PolicyTrack label="Liberal" count={view.liberalPoliciesEnacted} total={5} />
        <PolicyTrack label="Fascist" count={view.fascistPoliciesEnacted} total={6} />
        <div className="track">
          <span className="track-label">Election Tracker</span>
          <div className="track-slots">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className={`dot ${i < view.electionTracker ? "filled" : ""}`} />
            ))}
          </div>
        </div>
      </div>
      <div className="meta">
        Round {view.roundNumber} · Draw pile {view.drawPileCount} · Discard {view.discardPileCount}
        {view.vetoUnlocked && <span className="badge">Veto unlocked</span>}
        {view.phase !== "LOBBY" && view.phase !== "ROLE_REVEAL" && <AmbientTensionIndicator level={view.ambientTension} />}
      </div>
    </header>
  );
}

export function PlayerRoster({ view }: { view: PlayerView }) {
  return (
    <aside className="roster">
      <h3>Table</h3>
      <ul>
        {view.players.map((p) => {
          const known = view.knownRoles[p.id];
          return (
            <li key={p.id} className={!p.isAlive ? "dead" : ""}>
              <span className="name">{p.name}</span>
              {p.id === view.myId && <span className="you">(you)</span>}
              {p.id === view.presidentId && <span title="President">👑</span>}
              {p.id === view.chancellorId && <span title="Chancellor">🎖</span>}
              {!p.isConnected && <span className="offline">offline</span>}
              {!p.isAlive && <span className="dead-label">executed</span>}
              {known && <span className={`known-role ${known}`}>{known}</span>}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export function YourRolePanel({ view }: { view: PlayerView }) {
  if (!view.myRole) return null;
  const allies = Object.entries(view.knownRoles);
  return (
    <div className="your-role">
      <strong>Your role:</strong> {view.myRole}
      {allies.length > 0 && (
        <div className="allies">
          {view.myRole === "hitler" ? "Your fascists: " : "Your team: "}
          {allies.map(([id]) => view.players.find((p) => p.id === id)?.name).join(", ")}
        </div>
      )}
    </div>
  );
}

export function EventLog({ view }: { view: PlayerView }) {
  return (
    <div className="event-log">
      <h3>The Registrar's Record</h3>
      <ol>
        {view.log
          .slice(-25)
          .reverse()
          .map((entry, i) => (
            <li key={i}>{entry}</li>
          ))}
      </ol>
    </div>
  );
}
