import type { PlayerView } from "@interhuman/shared";

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
