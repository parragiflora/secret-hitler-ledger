// Core domain types for the Secret Hitler rules engine.
// Mirrors the data model in section 8 of secret-hitler-ledger-spec.md, scoped to
// Phase 1 (sections 1-5: full rules engine, no AI/video). Fields that exist purely
// to support later phases (speech capture, signal scores, trust trajectory,
// special sessions) are intentionally NOT modeled yet — see section 9 build order.

export type Role = "liberal" | "fascist" | "hitler";
export type Team = "liberal" | "fascist";
export type PolicyType = "liberal" | "fascist";
export type VoteChoice = "ja" | "nein";

export type PlayerCount = 5 | 6 | 7 | 8 | 9 | 10;

export interface Player {
  id: string;
  name: string;
  role: Role | null; // assigned at START_GAME, never changes after (section 1)
  seatOrder: number; // join order; presidency passes clockwise by this order
  isAlive: boolean;
  isConnected: boolean;
}

export type GamePhase =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "NOMINATION"
  | "ELECTION_VOTE"
  | "LEGISLATIVE_PRESIDENT"
  | "LEGISLATIVE_CHANCELLOR"
  | "VETO_RESPONSE" // President accepting/rejecting a proposed veto
  | "POLICY_DEFENSE"
  | "EXECUTIVE_ACTION"
  | "GAME_END";

export type ExecutivePowerType =
  | "investigate_loyalty"
  | "special_election"
  | "policy_peek"
  | "execution";

export interface ExecutiveActionRecord {
  round: number;
  powerType: ExecutivePowerType;
  actorId: string;
  targetId: string | null;
  // Only meaningful for investigate_loyalty / policy_peek; kept out of the
  // public log and redacted in views (section 5: "no public reveal required").
  privateResult: { team: Team } | { peeked: PolicyType[] } | null;
}

export interface VoteRecord {
  round: number;
  playerId: string;
  choice: VoteChoice;
}

export interface VetoAttempt {
  round: number;
  proposedBy: string; // chancellor id
  presidentResponse: "accepted" | "rejected" | null;
}

export type WinningTeam = Team | null;

export type WinReason =
  | "liberal_policies"
  | "hitler_executed"
  | "fascist_policies"
  | "hitler_elected_chancellor";

export interface GameState {
  id: string;
  code: string;
  phase: GamePhase;
  playerCount: number; // locked in at START_GAME
  players: Player[];
  roundNumber: number;

  presidentId: string | null;
  chancellorId: string | null;
  presidentialCandidateId: string | null; // current nominee, set during NOMINATION

  previousPresidentId: string | null;
  previousChancellorId: string | null;
  // Player who *would* have been president if a special election hadn't
  // intervened. Section 3: after the one special-election round, clockwise
  // succession resumes from here, not from the special president.
  succeedFromPlayerId: string | null;

  electionTracker: number; // 0-3
  termLimitedChancellorId: string | null;
  termLimitedPresidentId: string | null; // only enforced in 7+ player games (section 3)

  drawPile: PolicyType[];
  discardPile: PolicyType[];
  liberalPoliciesEnacted: number;
  fascistPoliciesEnacted: number;

  vetoUnlocked: boolean;
  vetoAttempts: VetoAttempt[];
  pendingVetoProposal: boolean;

  currentVotes: VoteRecord[]; // in-progress election's votes; cleared each round
  voteHistory: VoteRecord[];
  lastVoteResult: { ja: number; nein: number; passed: boolean } | null;

  presidentDrawnPolicies: PolicyType[] | null; // 3 drawn, President holding
  chancellorHandPolicies: PolicyType[] | null; // 2 passed to Chancellor
  lastEnactedPolicy: PolicyType | null;
  lastEnactedByChaos: boolean;

  pendingExecutivePower: ExecutivePowerType | null;
  pendingExecutionTargetId: string | null; // set when chosen, before elimination
  // Set by EXECUTIVE_SPECIAL_ELECTION; consumed when the executive action is
  // acknowledged and the special round's president takes office (section 3).
  specialElectionNextPresidentId: string | null;
  executiveActions: ExecutiveActionRecord[];
  investigatedPlayerIds: string[]; // each player may only be investigated once

  acknowledgedRoles: string[]; // player ids who've dismissed ROLE_REVEAL
  pendingExecutiveResult: { team: Team } | { peeked: PolicyType[] } | null; // last result, for the acting president's view only

  winner: WinningTeam;
  winReason: WinReason | null;

  log: string[]; // human-readable public event log (drives the "simple buttons/text" UI)
}

export type GameAction =
  | { type: "JOIN_GAME"; playerId: string; name: string }
  | { type: "LEAVE_GAME"; playerId: string }
  | { type: "SET_CONNECTED"; playerId: string; isConnected: boolean }
  | { type: "START_GAME"; rngSeed?: number }
  | { type: "ACKNOWLEDGE_ROLE"; playerId: string }
  | { type: "NOMINATE_CHANCELLOR"; presidentId: string; nomineeId: string }
  | { type: "CAST_VOTE"; playerId: string; choice: VoteChoice }
  | { type: "PRESIDENT_DISCARD"; presidentId: string; discardIndex: 0 | 1 | 2 }
  | { type: "CHANCELLOR_ENACT"; chancellorId: string; enactIndex: 0 | 1 }
  | { type: "CHANCELLOR_PROPOSE_VETO"; chancellorId: string }
  | { type: "PRESIDENT_VETO_RESPONSE"; presidentId: string; accept: boolean }
  | { type: "ACKNOWLEDGE_POLICY_DEFENSE"; chancellorId: string }
  | { type: "EXECUTIVE_INVESTIGATE"; presidentId: string; targetId: string }
  | { type: "EXECUTIVE_SPECIAL_ELECTION"; presidentId: string; targetId: string }
  | { type: "EXECUTIVE_POLICY_PEEK"; presidentId: string }
  | { type: "EXECUTIVE_EXECUTION"; presidentId: string; targetId: string }
  | { type: "ACKNOWLEDGE_EXECUTIVE_ACTION"; presidentId: string };

export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameRuleError";
  }
}
