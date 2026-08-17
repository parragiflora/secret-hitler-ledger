import { useGame } from "./useGame";
import { JoinScreen } from "./components/JoinScreen";
import { BoardHeader, EventLog, PlayerRoster, YourRolePanel } from "./components/Board";
import {
  ElectionVote,
  ExecutiveActionPanel,
  GameEndPanel,
  LegislativeChancellorPanel,
  LegislativePresidentPanel,
  Nomination,
  PolicyDefensePanel,
  RoleReveal,
  VetoResponsePanel,
  WaitingRoom,
} from "./components/GamePhases";
import { SpecialSessionCallControl, SpecialSessionOverlay } from "./components/SpecialSession";

function PhasePanel({ view, send }: { view: NonNullable<ReturnType<typeof useGame>["view"]>; send: ReturnType<typeof useGame>["sendAction"] }) {
  switch (view.phase) {
    case "LOBBY":
      return <WaitingRoom view={view} send={send} />;
    case "ROLE_REVEAL":
      return <RoleReveal view={view} send={send} />;
    case "NOMINATION":
      return <Nomination view={view} send={send} />;
    case "ELECTION_VOTE":
      return <ElectionVote view={view} send={send} />;
    case "LEGISLATIVE_PRESIDENT":
      return <LegislativePresidentPanel view={view} send={send} />;
    case "LEGISLATIVE_CHANCELLOR":
      return <LegislativeChancellorPanel view={view} send={send} />;
    case "VETO_RESPONSE":
      return <VetoResponsePanel view={view} send={send} />;
    case "POLICY_DEFENSE":
      return <PolicyDefensePanel view={view} send={send} />;
    case "EXECUTIVE_ACTION":
      return <ExecutiveActionPanel view={view} send={send} />;
    case "GAME_END":
      return <GameEndPanel view={view} />;
    default:
      return null;
  }
}

export default function App() {
  const { view, error, connecting, reconnecting, connect, sendAction, leaveSession } = useGame();

  if (!view) {
    if (reconnecting) {
      return (
        <div className="app-shell">
          <div className="join-screen">
            <p className="hint">Reconnecting to your game...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="app-shell">
        <JoinScreen connecting={connecting} error={error} onJoin={connect} />
      </div>
    );
  }

  // Section 7: a Special Session takes over the whole screen while it's up --
  // no roster/log/board underneath, just the Registrar's findings.
  if (view.phase === "SPECIAL_SESSION") {
    return (
      <div className="app-shell in-game">
        <SpecialSessionOverlay view={view} send={sendAction} />
      </div>
    );
  }

  return (
    <div className="app-shell in-game">
      <BoardHeader view={view} />
      <div className="layout">
        <PlayerRoster view={view} />
        <main className="main-panel">
          <YourRolePanel view={view} />
          <SpecialSessionCallControl view={view} send={sendAction} />
          <PhasePanel view={view} send={sendAction} />
          {error && <p className="error">{error}</p>}
        </main>
        <EventLog view={view} />
      </div>
      <footer className="app-footer">
        <button className="link" onClick={() => leaveSession(view.code)}>
          Leave game
        </button>
      </footer>
    </div>
  );
}
