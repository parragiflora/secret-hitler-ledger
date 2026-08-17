// Produces a per-player redacted view of GameState. This is what the server
// sends over the wire -- never the raw GameState -- so that remote players
// can't see each other's roles, hands, or in-progress votes (section 1 role
// visibility rules; "don't reveal votes until all are in", section 2).
import type {
  ExecutivePowerType,
  GamePhase,
  GameState,
  PolicyType,
  Role,
  Team,
  WinReason,
  WinningTeam,
} from "./types.js";
import { teamOf } from "./roles.js";
import { activeCaptureTrigger, captureAlreadyLogged, type CaptureTrigger } from "./capture.js";
import type { AmbientTensionLevel } from "./trustTrajectory.js";

export interface PublicPlayer {
  id: string;
  name: string;
  seatOrder: number;
  isAlive: boolean;
  isConnected: boolean;
}

export interface PlayerView {
  gameId: string;
  code: string;
  phase: GamePhase;
  playerCount: number;
  roundNumber: number;
  players: PublicPlayer[];

  myId: string;
  myRole: Role | null;
  myTeam: Team | null;
  // Ids of players whose role you know beyond your own (section 1):
  // fascists + Hitler know each other always; Hitler also knows the fascist
  // team, but only in 5-6 player games.
  knownRoles: Record<string, Role>;

  presidentId: string | null;
  chancellorId: string | null;
  presidentialCandidateId: string | null;

  electionTracker: number;
  termLimitedChancellorId: string | null;
  termLimitedPresidentId: string | null;

  liberalPoliciesEnacted: number;
  fascistPoliciesEnacted: number;
  drawPileCount: number;
  discardPileCount: number;

  vetoUnlocked: boolean;
  pendingVetoProposal: boolean;

  playersWhoHaveVoted: string[]; // choices withheld until all votes are in
  myVote: "ja" | "nein" | null;
  lastVoteResult: { ja: number; nein: number; passed: boolean } | null;

  myPresidentHand: PolicyType[] | null;
  myChancellorHand: PolicyType[] | null;
  lastEnactedPolicy: PolicyType | null;
  lastEnactedByChaos: boolean;

  pendingExecutivePower: ExecutivePowerType | null;
  pendingExecutionTargetId: string | null; // public: it's a pre-elimination announcement (section 6/7)
  specialElectionNextPresidentId: string | null; // public: who was named as next President
  investigatedPlayerIds: string[]; // public: who has already been investigated this game (not the result)
  myExecutiveResult: { team: Team } | { peeked: PolicyType[] } | null;

  winner: WinningTeam;
  winReason: WinReason | null;
  finalRoles: Record<string, Role> | null; // revealed to everyone only at GAME_END

  // Section 6: the active speech-capture moment, if any, and whether it's
  // already been logged (recorded or skipped) this round. Who's expected to
  // speak is public knowledge (like a spotlight at the table), so this is
  // not redacted.
  activeCapture: CaptureTrigger | null;
  activeCaptureLogged: boolean;

  // Section 9 step 4 / section 7 passive tracking: the ONE surface trust
  // data gets during normal play -- a non-specific, table-wide mood
  // reading. Never names a player or a signal; computed externally (from
  // signalScores, which live outside GameState -- see
  // packages/server/src/trustTrajectory.ts) and injected here rather than
  // derived from state alone.
  ambientTension: AmbientTensionLevel;

  log: string[];
}

function computeKnownRoles(state: GameState, viewerId: string): Record<string, Role> {
  const viewer = state.players.find((p) => p.id === viewerId);
  const known: Record<string, Role> = {};
  if (!viewer || !viewer.role) return known;

  if (viewer.role === "fascist" || viewer.role === "hitler") {
    // Fascists always know each other and Hitler; Hitler knows fascists only in 5-6p games (section 1).
    const hitlerKnowsFascists = state.playerCount <= 6;
    if (viewer.role === "fascist" || hitlerKnowsFascists) {
      for (const p of state.players) {
        // Exclude self -- the viewer already knows their own role via myRole;
        // knownRoles is "who ELSE you recognize as a teammate" (avoids a
        // player seeing themselves listed in their own "your team" list).
        if (p.id === viewerId) continue;
        if (p.role === "fascist" || p.role === "hitler") known[p.id] = p.role;
      }
    } else {
      // Hitler in a 7+ player game: knows no one else's role.
    }
  }
  return known;
}

export function viewForPlayer(state: GameState, viewerId: string, ambientTension: AmbientTensionLevel = "calm"): PlayerView {
  const viewer = state.players.find((p) => p.id === viewerId) ?? null;
  const isPresident = viewer?.id === state.presidentId;
  const isChancellor = viewer?.id === state.chancellorId;

  const votesIn = state.currentVotes;
  const aliveCount = state.players.filter((p) => p.isAlive).length;
  const allIn = votesIn.length === aliveCount && aliveCount > 0;
  const myVoteRecord = votesIn.find((v) => v.playerId === viewerId) ?? null;

  const finalRoles =
    state.phase === "GAME_END"
      ? Object.fromEntries(state.players.map((p) => [p.id, p.role as Role]))
      : null;

  const activeCapture = activeCaptureTrigger(state);

  return {
    gameId: state.id,
    code: state.code,
    phase: state.phase,
    playerCount: state.playerCount,
    roundNumber: state.roundNumber,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatOrder: p.seatOrder,
      isAlive: p.isAlive,
      isConnected: p.isConnected,
    })),

    myId: viewerId,
    myRole: viewer?.role ?? null,
    myTeam: viewer?.role ? teamOf(viewer.role) : null,
    knownRoles: computeKnownRoles(state, viewerId),

    presidentId: state.presidentId,
    chancellorId: state.chancellorId,
    presidentialCandidateId: state.presidentialCandidateId,

    electionTracker: state.electionTracker,
    termLimitedChancellorId: state.termLimitedChancellorId,
    termLimitedPresidentId: state.termLimitedPresidentId,

    liberalPoliciesEnacted: state.liberalPoliciesEnacted,
    fascistPoliciesEnacted: state.fascistPoliciesEnacted,
    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.length,

    vetoUnlocked: state.vetoUnlocked,
    pendingVetoProposal: state.pendingVetoProposal,

    // Withhold individual choices until everyone's voted -- once `allIn` is
    // true the round has already resolved server-side and currentVotes was
    // cleared, so there's nothing left to withhold at that point anyway.
    playersWhoHaveVoted: allIn ? [] : votesIn.map((v) => v.playerId),
    myVote: allIn ? null : (myVoteRecord?.choice ?? null),
    lastVoteResult: state.lastVoteResult,

    myPresidentHand: isPresident ? state.presidentDrawnPolicies : null,
    myChancellorHand: isChancellor || isPresident ? state.chancellorHandPolicies : null,
    lastEnactedPolicy: state.lastEnactedPolicy,
    lastEnactedByChaos: state.lastEnactedByChaos,

    pendingExecutivePower: state.pendingExecutivePower,
    pendingExecutionTargetId: state.pendingExecutionTargetId,
    specialElectionNextPresidentId: state.specialElectionNextPresidentId,
    investigatedPlayerIds: state.investigatedPlayerIds,
    myExecutiveResult: isPresident ? state.pendingExecutiveResult : null,

    winner: state.winner,
    winReason: state.winReason,
    finalRoles,

    activeCapture,
    activeCaptureLogged: activeCapture ? captureAlreadyLogged(state, activeCapture) : false,

    ambientTension,

    log: state.log,
  };
}
