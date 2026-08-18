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
  SpecialSessionTriggerReason,
  Team,
  VoteChoice,
  WinReason,
  WinningTeam,
} from "./types.js";
import { teamOf } from "./roles.js";
import { activeCaptureTrigger, captureAlreadyLogged, type CaptureTrigger } from "./capture.js";
import type { AmbientTensionLevel } from "./trustTrajectory.js";
import { canProposeSpecialSession } from "./specialSession.js";

export interface PublicPlayer {
  id: string;
  name: string;
  seatOrder: number;
  isAlive: boolean;
  isConnected: boolean;
}

export interface ActiveSpecialSessionView {
  triggerReason: SpecialSessionTriggerReason;
  roundNumber: number;
  presidentId: string;
  chancellorId: string;
  presidentReadout: string;
  chancellorReadout: string;
}

export interface PendingSpecialSessionVoteView {
  proposedBy: string;
  votesCast: string[]; // choices withheld until everyone's voted, like an election
  myVote: VoteChoice | null;
}

// Section 9 step 6: the end-game recap. One point per scored speech event
// (chronological, not bucketed by round -- a player can speak more than
// once in a round), so the client can plot each signal as a simple line.
export interface SignalSeriesPoint {
  round: number;
  confidence: number;
  stress: number;
  skepticism: number;
  hesitation: number;
}

export interface PlayerRecapEntry {
  playerId: string;
  name: string;
  role: Role;
  points: SignalSeriesPoint[];
}

export interface GameRecap {
  players: PlayerRecapEntry[];
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
  myVote: VoteChoice | null;
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

  // Section 9 step 6: the full trust_trajectory history for every player,
  // shown only once the game has ended -- the payoff moment, contrasted
  // against what was revealed piecemeal in Special Sessions. Computed
  // server-side (needs signalScores, outside GameState) and injected via
  // ViewExtras, same as ambientTension/specialSessionReadouts.
  recap: GameRecap | null;

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

  // Section 7: who's under discussion and their two readout sentences are
  // public -- broadcast to the whole table as a full-screen reveal, not
  // redacted per viewer. The readout TEXT itself is generated server-side
  // (needs signalScores, outside GameState) and injected via ViewExtras.
  activeSpecialSession: ActiveSpecialSessionView | null;
  pendingSpecialSessionVote: PendingSpecialSessionVoteView | null;
  specialSessionAvailable: boolean; // whether trigger 3 could be proposed right now

  log: string[];
}

/** Server-computed data that doesn't live in GameState -- see the fields' own doc comments above. */
export interface ViewExtras {
  ambientTension?: AmbientTensionLevel;
  specialSessionReadouts?: { presidentReadout: string; chancellorReadout: string } | null;
  recap?: GameRecap | null;
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

export function viewForPlayer(state: GameState, viewerId: string, extras: ViewExtras = {}): PlayerView {
  const viewer = state.players.find((p) => p.id === viewerId) ?? null;
  const isPresident = viewer?.id === state.presidentId;
  const isChancellor = viewer?.id === state.chancellorId;
  const ambientTension = extras.ambientTension ?? "calm";

  const votesIn = state.currentVotes;
  const aliveCount = state.players.filter((p) => p.isAlive).length;
  const allIn = votesIn.length === aliveCount && aliveCount > 0;
  const myVoteRecord = votesIn.find((v) => v.playerId === viewerId) ?? null;

  const finalRoles =
    state.phase === "GAME_END"
      ? Object.fromEntries(state.players.map((p) => [p.id, p.role as Role]))
      : null;

  const activeCapture = activeCaptureTrigger(state);

  const activeSpecialSession: ActiveSpecialSessionView | null =
    state.phase === "SPECIAL_SESSION" && state.pendingSpecialSession
      ? {
          triggerReason: state.pendingSpecialSession.triggerReason,
          roundNumber: state.pendingSpecialSession.roundNumber,
          presidentId: state.pendingSpecialSession.presidentId,
          chancellorId: state.pendingSpecialSession.chancellorId,
          // Generation is synchronous server-side the moment the phase
          // changes, so this gap is only ever hit by tests calling
          // viewForPlayer directly without extras.
          presidentReadout: extras.specialSessionReadouts?.presidentReadout ?? "The Registrar is composing findings...",
          chancellorReadout: extras.specialSessionReadouts?.chancellorReadout ?? "The Registrar is composing findings...",
        }
      : null;

  const svote = state.pendingSpecialSessionVote;
  const svoteAliveCount = state.players.filter((p) => p.isAlive).length;
  const svoteAllIn = svote ? svote.votes.length === svoteAliveCount && svoteAliveCount > 0 : false;
  const pendingSpecialSessionVote: PendingSpecialSessionVoteView | null = svote
    ? {
        proposedBy: svote.proposedBy,
        votesCast: svoteAllIn ? [] : svote.votes.map((v) => v.playerId),
        myVote: svoteAllIn ? null : (svote.votes.find((v) => v.playerId === viewerId)?.choice ?? null),
      }
    : null;

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
    recap: state.phase === "GAME_END" ? (extras.recap ?? null) : null,

    activeCapture,
    activeCaptureLogged: activeCapture ? captureAlreadyLogged(state, activeCapture) : false,

    ambientTension,

    activeSpecialSession,
    pendingSpecialSessionVote,
    specialSessionAvailable: canProposeSpecialSession(state),

    log: state.log,
  };
}
