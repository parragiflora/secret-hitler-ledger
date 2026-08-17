// Section 2-5: the core rules-engine state machine. Pure reducer: (state, action, rng) -> state.
// No I/O, no AI, no video -- per section 9 build order, this is Phase 1 in isolation.
import type { GameAction, GameState, Player, SpeechEvent, VoteRecord, WinReason } from "./types.js";
import { GameRuleError } from "./types.js";
import { assignRoles, teamOf } from "./roles.js";
import { freshDeck, drawPolicies } from "./deck.js";
import { powerForSlot } from "./powers.js";
import { shouldUnlockVeto } from "./veto.js";
import { activeCaptureTrigger, captureAlreadyLogged, speechEventId } from "./capture.js";
import {
  eligibleChancellorNominees,
  nextAlivePlayerClockwise,
  presidentTermLimitApplies,
  seatOrderOf,
} from "./succession.js";
import { checkPolicyAndExecutionWin, isHitlerChancellorWin } from "./winConditions.js";
import { canProposeSpecialSession, shouldFirePolicyThresholdTrigger } from "./specialSession.js";

export function createGame(id: string, code: string): GameState {
  return {
    id,
    code,
    phase: "LOBBY",
    playerCount: 0,
    players: [],
    roundNumber: 0,
    presidentId: null,
    chancellorId: null,
    presidentialCandidateId: null,
    previousPresidentId: null,
    previousChancellorId: null,
    succeedFromPlayerId: null,
    electionTracker: 0,
    termLimitedChancellorId: null,
    termLimitedPresidentId: null,
    drawPile: [],
    discardPile: [],
    liberalPoliciesEnacted: 0,
    fascistPoliciesEnacted: 0,
    vetoUnlocked: false,
    vetoAttempts: [],
    pendingVetoProposal: false,
    currentVotes: [],
    voteHistory: [],
    lastVoteResult: null,
    presidentDrawnPolicies: null,
    chancellorHandPolicies: null,
    lastEnactedPolicy: null,
    lastEnactedByChaos: false,
    pendingExecutivePower: null,
    pendingExecutionTargetId: null,
    specialElectionNextPresidentId: null,
    executiveActions: [],
    investigatedPlayerIds: [],
    acknowledgedRoles: [],
    pendingExecutiveResult: null,
    winner: null,
    winReason: null,
    speechEvents: [],
    pendingSpecialSession: null,
    policyThresholdSessionFired: false,
    pendingSpecialSessionVote: null,
    specialSessionResourceSpent: false,
    log: [],
  };
}

function withLog(state: GameState, entry: string): GameState {
  return { ...state, log: [...state.log, entry] };
}

function requirePlayer(state: GameState, playerId: string): Player {
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) throw new GameRuleError(`No such player: ${playerId}`);
  return p;
}

function setWin(state: GameState, winner: "liberal" | "fascist", reason: WinReason, note: string): GameState {
  return withLog({ ...state, phase: "GAME_END", winner, winReason: reason }, note);
}

/** Starts the next round: resets round-transient fields, applies succession (section 3). */
function beginNextRound(state: GameState, presidentOverride?: string): GameState {
  let nextPresidentId: string;
  let succeedFromPlayerId = state.succeedFromPlayerId;

  if (presidentOverride) {
    nextPresidentId = presidentOverride;
    // succeedFromPlayerId was set by the special-election action and is
    // consumed on the round AFTER this special round, not this one.
  } else if (succeedFromPlayerId) {
    nextPresidentId = succeedFromPlayerId;
    succeedFromPlayerId = null;
  } else {
    const current = state.presidentId ? state.players.find((p) => p.id === state.presidentId) : null;
    const afterSeat = current ? current.seatOrder : -1;
    const next = nextAlivePlayerClockwise(state.players, afterSeat);
    if (!next) throw new GameRuleError("No alive players remain to hold the presidency.");
    nextPresidentId = next.id;
  }

  return {
    ...state,
    phase: "NOMINATION",
    roundNumber: state.roundNumber + 1,
    previousPresidentId: state.presidentId,
    previousChancellorId: state.chancellorId,
    presidentId: nextPresidentId,
    chancellorId: null,
    presidentialCandidateId: null,
    currentVotes: [],
    succeedFromPlayerId,
  };
}

/**
 * Every path that would otherwise call beginNextRound() routes through here
 * first (section 7 trigger 1). If the 3rd Fascist policy just landed and a
 * government is seated to report on, the round doesn't actually advance yet
 * -- the game pauses in SPECIAL_SESSION, and beginNextRound is deferred into
 * resumeAction until CONTINUE_SPECIAL_SESSION runs.
 */
function proceedToNextRoundOrSpecialSession(state: GameState, presidentOverride: string | null): GameState {
  if (shouldFirePolicyThresholdTrigger(state)) {
    return withLog(
      {
        ...state,
        phase: "SPECIAL_SESSION",
        policyThresholdSessionFired: true,
        pendingSpecialSession: {
          triggerReason: "policy_threshold",
          roundNumber: state.roundNumber,
          presidentId: state.presidentId!,
          chancellorId: state.chancellorId!,
          resumeAction: { kind: "advance_round", presidentOverride },
        },
      },
      "The Registrar calls a Special Session.",
    );
  }
  return beginNextRound(state, presidentOverride ?? undefined);
}

/** Section 2 CHAOS_POLICY: election tracker hit 3. Auto-enacts top policy, resets tracker + term limits. */
function runChaosPolicy(state: GameState, rng: () => number): GameState {
  const { drawn, drawPile, discardPile } = drawPolicies(state.drawPile, state.discardPile, 1, rng);
  const tile = drawn[0];
  let next: GameState = {
    ...state,
    drawPile,
    discardPile,
    lastEnactedPolicy: tile ?? null,
    lastEnactedByChaos: true,
    electionTracker: 0,
    termLimitedChancellorId: null,
    termLimitedPresidentId: null,
  };
  if (tile === "liberal") next.liberalPoliciesEnacted += 1;
  if (tile === "fascist") {
    next.fascistPoliciesEnacted += 1;
    next.vetoUnlocked = next.vetoUnlocked || shouldUnlockVeto(next.playerCount, next.fascistPoliciesEnacted);
  }
  next = withLog(next, `Chaos! Election tracker maxed out -- top policy (${tile}) auto-enacted. Term limits reset.`);
  return next;
}

/** Shared tail for a failed/vetoed government: increment tracker, maybe chaos, check win, advance. */
function resolveGovernmentFailure(state: GameState, rng: () => number): GameState {
  let next: GameState = { ...state, electionTracker: state.electionTracker + 1 };
  if (next.electionTracker >= 3) {
    next = runChaosPolicy(next, rng);
    const winCheck = checkPolicyAndExecutionWin(next.liberalPoliciesEnacted, next.fascistPoliciesEnacted, next.players);
    if (winCheck.winner) return setWin(next, winCheck.winner, winCheck.reason!, `Game over: ${winCheck.reason}.`);
    // A chaos-enacted 3rd Fascist policy can still have a real government to
    // report on -- e.g. a Chancellor who was elected, then vetoed, and that
    // veto's failure is what triggered chaos. shouldFirePolicyThresholdTrigger
    // checks chancellorId, not "was this chaos", so this still fires
    // correctly either way (and correctly stays silent for a plain
    // 3-failed-elections chaos, where chancellorId is null).
  }
  return proceedToNextRoundOrSpecialSession(next, null);
}

// Actions still allowed while a Special Session (or its trigger-3 call vote)
// has the floor. Deliberately narrow: connection bookkeeping always works,
// last_words capture stays open through an execution's Special Session
// (section 6), and each pause has exactly one action that can end it.
const ALLOWED_DURING_SPECIAL_SESSION = new Set<GameAction["type"]>([
  "SET_CONNECTED",
  "LEAVE_GAME",
  "RECORD_SPEECH_EVENT",
  "CONTINUE_SPECIAL_SESSION",
]);
const ALLOWED_DURING_SPECIAL_SESSION_VOTE = new Set<GameAction["type"]>([
  "SET_CONNECTED",
  "LEAVE_GAME",
  "RECORD_SPEECH_EVENT",
  "CAST_SPECIAL_SESSION_VOTE",
]);

export function reduce(state: GameState, action: GameAction, rng: () => number = Math.random): GameState {
  if (state.phase === "SPECIAL_SESSION" && !ALLOWED_DURING_SPECIAL_SESSION.has(action.type)) {
    throw new GameRuleError("The Registrar has the floor -- wait for the Special Session to end.");
  }
  if (state.pendingSpecialSessionVote && !ALLOWED_DURING_SPECIAL_SESSION_VOTE.has(action.type)) {
    throw new GameRuleError("A Special Session vote is underway -- wait for it to resolve.");
  }

  switch (action.type) {
    case "JOIN_GAME": {
      if (state.phase !== "LOBBY") throw new GameRuleError("Cannot join a game that has already started.");
      if (state.players.some((p) => p.id === action.playerId)) return state;
      if (state.players.length >= 10) throw new GameRuleError("Lobby is full (max 10 players).");
      const player: Player = {
        id: action.playerId,
        name: action.name,
        role: null,
        seatOrder: state.players.length,
        isAlive: true,
        isConnected: true,
      };
      return withLog({ ...state, players: [...state.players, player] }, `${action.name} joined.`);
    }

    case "LEAVE_GAME": {
      if (state.phase !== "LOBBY") throw new GameRuleError("Cannot leave after the game has started.");
      const remaining = state.players.filter((p) => p.id !== action.playerId);
      // Re-sequence seat order to stay contiguous.
      const reseated = remaining.map((p, i) => ({ ...p, seatOrder: i }));
      return { ...state, players: reseated };
    }

    case "SET_CONNECTED": {
      return {
        ...state,
        players: state.players.map((p) => (p.id === action.playerId ? { ...p, isConnected: action.isConnected } : p)),
      };
    }

    case "START_GAME": {
      if (state.phase !== "LOBBY") throw new GameRuleError("Game already started.");
      if (state.players.length < 5 || state.players.length > 10) {
        throw new GameRuleError("Secret Hitler requires 5-10 players to start.");
      }
      const playersWithRoles = assignRoles(state.players, rng);
      const drawPile = freshDeck(rng);
      const firstPresident = playersWithRoles[Math.floor(rng() * playersWithRoles.length)];
      return withLog(
        {
          ...state,
          phase: "ROLE_REVEAL",
          playerCount: playersWithRoles.length,
          players: playersWithRoles,
          drawPile,
          discardPile: [],
          roundNumber: 0,
          presidentId: firstPresident.id,
        },
        "Game started. Roles assigned.",
      );
    }

    case "ACKNOWLEDGE_ROLE": {
      if (state.phase !== "ROLE_REVEAL") throw new GameRuleError("Not in role reveal.");
      requirePlayer(state, action.playerId);
      const acknowledgedRoles = state.acknowledgedRoles.includes(action.playerId)
        ? state.acknowledgedRoles
        : [...state.acknowledgedRoles, action.playerId];
      if (acknowledgedRoles.length === state.players.length) {
        return beginNextRound({ ...state, acknowledgedRoles }, state.presidentId ?? undefined);
      }
      return { ...state, acknowledgedRoles };
    }

    case "NOMINATE_CHANCELLOR": {
      if (state.phase !== "NOMINATION") throw new GameRuleError("Not in nomination phase.");
      if (action.presidentId !== state.presidentId) throw new GameRuleError("Only the President may nominate.");
      const nominee = requirePlayer(state, action.nomineeId);
      const eligible = eligibleChancellorNominees(
        state.players,
        state.presidentId!,
        state.termLimitedChancellorId,
        state.termLimitedPresidentId,
      );
      if (!eligible.some((p) => p.id === nominee.id)) {
        throw new GameRuleError(`${nominee.name} is not eligible for nomination (dead or term-limited).`);
      }
      return withLog(
        { ...state, phase: "ELECTION_VOTE", presidentialCandidateId: nominee.id, currentVotes: [] },
        `${requirePlayer(state, action.presidentId).name} nominates ${nominee.name} for Chancellor.`,
      );
    }

    case "CAST_VOTE": {
      if (state.phase !== "ELECTION_VOTE") throw new GameRuleError("Not in an election vote.");
      const voter = requirePlayer(state, action.playerId);
      if (!voter.isAlive) throw new GameRuleError("Dead players cannot vote.");
      if (state.currentVotes.some((v) => v.playerId === action.playerId)) {
        throw new GameRuleError("Player has already voted this round.");
      }
      const currentVotes = [...state.currentVotes, { round: state.roundNumber, playerId: action.playerId, choice: action.choice }];
      const aliveCount = state.players.filter((p) => p.isAlive).length;
      if (currentVotes.length < aliveCount) {
        return { ...state, currentVotes }; // votes stay hidden until all are in (section 2)
      }

      // All votes are in -- resolve.
      const ja = currentVotes.filter((v) => v.choice === "ja").length;
      const nein = currentVotes.length - ja;
      const passed = ja > nein; // ties fail
      const voteHistory = [...state.voteHistory, ...currentVotes];
      const nominee = requirePlayer(state, state.presidentialCandidateId!);

      let next: GameState = withLog(
        { ...state, currentVotes: [], voteHistory, lastVoteResult: { ja, nein, passed } },
        `Election result: ${ja} Ja - ${nein} Nein. Government ${passed ? "elected" : "fails"}.`,
      );

      if (!passed) {
        return resolveGovernmentFailure(next, rng);
      }

      // Immediate Fascist win: 3rd+ Fascist policy already on board and the elected Chancellor is Hitler.
      if (isHitlerChancellorWin(next.fascistPoliciesEnacted, nominee)) {
        return setWin(
          next,
          "fascist",
          "hitler_elected_chancellor",
          `${nominee.name} (Hitler) was elected Chancellor after the 3rd Fascist policy. Fascists win.`,
        );
      }

      const { drawn, drawPile, discardPile } = drawPolicies(next.drawPile, next.discardPile, 3, rng);
      return {
        ...next,
        phase: "LEGISLATIVE_PRESIDENT",
        chancellorId: nominee.id,
        electionTracker: 0,
        termLimitedChancellorId: nominee.id,
        termLimitedPresidentId: presidentTermLimitApplies(next.playerCount) ? next.presidentId : null,
        drawPile,
        discardPile,
        presidentDrawnPolicies: drawn,
      };
    }

    case "PRESIDENT_DISCARD": {
      if (state.phase !== "LEGISLATIVE_PRESIDENT") throw new GameRuleError("Not in the President's legislative phase.");
      if (action.presidentId !== state.presidentId) throw new GameRuleError("Only the President may discard here.");
      const hand = state.presidentDrawnPolicies;
      if (!hand || hand.length !== 3) throw new GameRuleError("President has no policies to discard from.");
      const discarded = hand[action.discardIndex];
      const passedToChancellor = hand.filter((_, i) => i !== action.discardIndex);
      return withLog(
        {
          ...state,
          phase: "LEGISLATIVE_CHANCELLOR",
          presidentDrawnPolicies: null,
          chancellorHandPolicies: passedToChancellor,
          discardPile: [...state.discardPile, discarded],
        },
        "President passes 2 policies to the Chancellor.",
      );
    }

    case "CHANCELLOR_PROPOSE_VETO": {
      if (state.phase !== "LEGISLATIVE_CHANCELLOR") throw new GameRuleError("Not in the Chancellor's legislative phase.");
      if (!state.vetoUnlocked) throw new GameRuleError("Veto power is not unlocked.");
      if (action.chancellorId !== state.chancellorId) throw new GameRuleError("Only the Chancellor may propose a veto.");
      if (!state.chancellorHandPolicies || state.chancellorHandPolicies.length !== 2) {
        throw new GameRuleError("Chancellor has no policies to veto.");
      }
      return withLog(
        { ...state, phase: "VETO_RESPONSE", pendingVetoProposal: true },
        `${requirePlayer(state, action.chancellorId).name} proposes a veto.`,
      );
    }

    case "PRESIDENT_VETO_RESPONSE": {
      if (state.phase !== "VETO_RESPONSE") throw new GameRuleError("No veto proposal pending.");
      if (action.presidentId !== state.presidentId) throw new GameRuleError("Only the President may respond to a veto.");
      const vetoAttempts = [
        ...state.vetoAttempts,
        { round: state.roundNumber, proposedBy: state.chancellorId!, presidentResponse: action.accept ? ("accepted" as const) : ("rejected" as const) },
      ];

      if (action.accept) {
        const discardPile = [...state.discardPile, ...(state.chancellorHandPolicies ?? [])];
        const next = withLog(
          {
            ...state,
            discardPile,
            chancellorHandPolicies: null,
            pendingVetoProposal: false,
            vetoAttempts,
          },
          "President accepts the veto. Both policies discarded; no policy enacted.",
        );
        return resolveGovernmentFailure(next, rng);
      }

      return withLog(
        { ...state, phase: "LEGISLATIVE_CHANCELLOR", pendingVetoProposal: false, vetoAttempts },
        "President rejects the veto. Chancellor must enact a policy.",
      );
    }

    case "CHANCELLOR_ENACT": {
      if (state.phase !== "LEGISLATIVE_CHANCELLOR") throw new GameRuleError("Not in the Chancellor's legislative phase.");
      if (action.chancellorId !== state.chancellorId) throw new GameRuleError("Only the Chancellor may enact.");
      const hand = state.chancellorHandPolicies;
      if (!hand || hand.length !== 2) throw new GameRuleError("Chancellor has no policies to enact from.");
      const enacted = hand[action.enactIndex];
      const discarded = hand[action.enactIndex === 0 ? 1 : 0];
      let next: GameState = {
        ...state,
        chancellorHandPolicies: null,
        discardPile: [...state.discardPile, discarded],
        lastEnactedPolicy: enacted,
        lastEnactedByChaos: false,
      };
      if (enacted === "liberal") next.liberalPoliciesEnacted += 1;
      if (enacted === "fascist") {
        next.fascistPoliciesEnacted += 1;
        next.vetoUnlocked = next.vetoUnlocked || shouldUnlockVeto(next.playerCount, next.fascistPoliciesEnacted);
      }
      next = { ...next, phase: "POLICY_DEFENSE" };
      return withLog(next, `Chancellor enacts a ${enacted} policy.`);
    }

    case "ACKNOWLEDGE_POLICY_DEFENSE": {
      if (state.phase !== "POLICY_DEFENSE") throw new GameRuleError("Not in policy defense.");
      if (action.chancellorId !== state.chancellorId) throw new GameRuleError("Only the Chancellor can continue from here.");

      const winCheck = checkPolicyAndExecutionWin(state.liberalPoliciesEnacted, state.fascistPoliciesEnacted, state.players);
      if (winCheck.winner) return setWin(state, winCheck.winner, winCheck.reason!, `Game over: ${winCheck.reason}.`);

      if (state.lastEnactedPolicy === "fascist") {
        const power = powerForSlot(state.playerCount, state.fascistPoliciesEnacted);
        if (power) {
          return withLog(
            { ...state, phase: "EXECUTIVE_ACTION", pendingExecutivePower: power },
            `Executive power triggered: ${power}.`,
          );
        }
      }
      // In practice every player-count bracket has a power at fascist slot 3
      // (see section 5's table), so the 3rd-Fascist-policy trigger always
      // routes through EXECUTIVE_ACTION above, never this path -- but route
      // through the same gate anyway for defensive consistency.
      return proceedToNextRoundOrSpecialSession(state, null);
    }

    case "EXECUTIVE_INVESTIGATE": {
      assertExecutivePower(state, action.presidentId, "investigate_loyalty");
      const target = requirePlayer(state, action.targetId);
      if (target.id === action.presidentId) throw new GameRuleError("The President cannot investigate themselves.");
      if (!target.isAlive) throw new GameRuleError("Cannot investigate a dead player.");
      if (state.investigatedPlayerIds.includes(target.id)) throw new GameRuleError("That player has already been investigated.");
      const result = { team: teamOf(target.role!) };
      return withLog(
        {
          ...state,
          investigatedPlayerIds: [...state.investigatedPlayerIds, target.id],
          pendingExecutiveResult: result,
          executiveActions: [
            ...state.executiveActions,
            { round: state.roundNumber, powerType: "investigate_loyalty", actorId: action.presidentId, targetId: target.id, privateResult: result },
          ],
        },
        `The President investigates ${target.name}.`,
      );
    }

    case "EXECUTIVE_POLICY_PEEK": {
      assertExecutivePower(state, action.presidentId, "policy_peek");
      const peeked = state.drawPile.slice(0, 3);
      const result = { peeked };
      return withLog(
        {
          ...state,
          pendingExecutiveResult: result,
          executiveActions: [
            ...state.executiveActions,
            { round: state.roundNumber, powerType: "policy_peek", actorId: action.presidentId, targetId: null, privateResult: result },
          ],
        },
        "The President peeks at the top of the draw pile.",
      );
    }

    case "EXECUTIVE_SPECIAL_ELECTION": {
      assertExecutivePower(state, action.presidentId, "special_election");
      const target = requirePlayer(state, action.targetId);
      if (target.id === action.presidentId) throw new GameRuleError("The President must choose someone else.");
      if (!target.isAlive) throw new GameRuleError("Cannot hand the presidency to a dead player.");
      const current = requirePlayer(state, action.presidentId);
      const wouldHaveBeen = nextAlivePlayerClockwise(state.players, current.seatOrder);
      return withLog(
        {
          ...state,
          specialElectionNextPresidentId: target.id,
          succeedFromPlayerId: wouldHaveBeen ? wouldHaveBeen.id : null,
          pendingExecutiveResult: null,
          executiveActions: [
            ...state.executiveActions,
            { round: state.roundNumber, powerType: "special_election", actorId: action.presidentId, targetId: target.id, privateResult: null },
          ],
        },
        `The President names ${target.name} as the next President (Special Election).`,
      );
    }

    case "EXECUTIVE_EXECUTION": {
      assertExecutivePower(state, action.presidentId, "execution");
      const target = requirePlayer(state, action.targetId);
      if (target.id === action.presidentId) throw new GameRuleError("The President cannot execute themselves.");
      if (!target.isAlive) throw new GameRuleError("That player is already out of the game.");
      let next: GameState = withLog(
        {
          ...state,
          pendingExecutionTargetId: target.id,
          executiveActions: [
            ...state.executiveActions,
            { round: state.roundNumber, powerType: "execution", actorId: action.presidentId, targetId: target.id, privateResult: null },
          ],
        },
        // Deliberately says "is about to be executed" (not "was executed") --
        // the target is still alive here, for last_words capture (section 6).
        `The President chooses ${target.name} to be executed.`,
      );
      // Section 7 trigger 2: fires automatically, every time, before the
      // elimination itself -- see CONTINUE_SPECIAL_SESSION's
      // finalize_execution handling for where the elimination actually happens.
      return withLog(
        {
          ...next,
          phase: "SPECIAL_SESSION",
          pendingSpecialSession: {
            triggerReason: "execution",
            roundNumber: next.roundNumber,
            presidentId: next.presidentId!,
            chancellorId: next.chancellorId!,
            resumeAction: { kind: "finalize_execution" },
          },
        },
        "The Registrar calls a Special Session.",
      );
    }

    case "ACKNOWLEDGE_EXECUTIVE_ACTION": {
      if (state.phase !== "EXECUTIVE_ACTION") throw new GameRuleError("Not in an executive action.");
      if (action.presidentId !== state.presidentId) throw new GameRuleError("Only the President can continue from here.");
      if (!state.pendingExecutivePower) throw new GameRuleError("No executive power to resolve.");

      const power = state.pendingExecutivePower;
      // Execution never reaches this action -- EXECUTIVE_EXECUTION transitions
      // straight to SPECIAL_SESSION, and CONTINUE_SPECIAL_SESSION's
      // finalize_execution resumeAction does what this used to do.
      if (power === "execution") {
        throw new GameRuleError("Execution resolves via its Special Session, not this action.");
      }
      if (power === "special_election" && !state.specialElectionNextPresidentId) {
        throw new GameRuleError("No special election target chosen yet.");
      }

      let next: GameState = {
        ...state,
        pendingExecutivePower: null,
        pendingExecutionTargetId: null,
        pendingExecutiveResult: null,
      };

      const winCheck = checkPolicyAndExecutionWin(next.liberalPoliciesEnacted, next.fascistPoliciesEnacted, next.players);
      if (winCheck.winner) return setWin(next, winCheck.winner, winCheck.reason!, `Game over: ${winCheck.reason}.`);

      if (power === "special_election") {
        const target = next.specialElectionNextPresidentId!;
        next = { ...next, specialElectionNextPresidentId: null };
        return proceedToNextRoundOrSpecialSession(next, target);
      }
      return proceedToNextRoundOrSpecialSession(next, null);
    }

    case "RECORD_SPEECH_EVENT": {
      const capture = activeCaptureTrigger(state);
      if (!capture) throw new GameRuleError("No active speech-capture moment right now.");
      if (capture.eventType !== action.eventType) {
        throw new GameRuleError(`Active capture moment is ${capture.eventType}, not ${action.eventType}.`);
      }
      if (capture.speakerId !== action.playerId) {
        throw new GameRuleError("You are not the speaker for this capture moment.");
      }
      if (captureAlreadyLogged(state, capture)) {
        throw new GameRuleError("This speech moment has already been recorded.");
      }
      const speaker = requirePlayer(state, action.playerId);
      const event: SpeechEvent = {
        id: speechEventId(action.playerId, action.eventType, state.roundNumber),
        playerId: action.playerId,
        roundNumber: state.roundNumber,
        eventType: action.eventType,
        capturedAt: new Date().toISOString(),
        durationMs: action.skipped ? null : action.durationMs,
        skipped: action.skipped,
        clipRef: null, // no clip upload yet -- see section 9 step 3 (Interhuman proxy)
      };
      const label = action.eventType.replace(/_/g, " ");
      return withLog(
        { ...state, speechEvents: [...state.speechEvents, event] },
        action.skipped ? `${speaker.name} skipped their ${label}.` : `${speaker.name} recorded a ${label} clip.`,
      );
    }

    case "PROPOSE_SPECIAL_SESSION": {
      if (!canProposeSpecialSession(state)) {
        throw new GameRuleError("Cannot call a Special Session right now.");
      }
      const proposer = requirePlayer(state, action.playerId);
      return withLog(
        { ...state, pendingSpecialSessionVote: { proposedBy: action.playerId, votes: [] } },
        `${proposer.name} calls for a Special Session.`,
      );
    }

    case "CAST_SPECIAL_SESSION_VOTE": {
      if (!state.pendingSpecialSessionVote) throw new GameRuleError("No Special Session vote underway.");
      const voter = requirePlayer(state, action.playerId);
      if (!voter.isAlive) throw new GameRuleError("Dead players cannot vote.");
      if (state.pendingSpecialSessionVote.votes.some((v) => v.playerId === action.playerId)) {
        throw new GameRuleError("Player has already voted on this Special Session call.");
      }
      const votes: VoteRecord[] = [
        ...state.pendingSpecialSessionVote.votes,
        { round: state.roundNumber, playerId: action.playerId, choice: action.choice },
      ];
      const aliveCount = state.players.filter((p) => p.isAlive).length;
      if (votes.length < aliveCount) {
        return { ...state, pendingSpecialSessionVote: { ...state.pendingSpecialSessionVote, votes } };
      }

      const ja = votes.filter((v) => v.choice === "ja").length;
      const nein = votes.length - ja;
      const passed = ja > nein; // ties fail -- same threshold as an election vote (section 7)
      const next: GameState = withLog(
        { ...state, pendingSpecialSessionVote: null },
        `Special Session call: ${ja} Ja - ${nein} Nein. ${passed ? "The table calls a Special Session." : "The call fails."}`,
      );

      if (!passed) return next; // a failed call does NOT spend the resource (section 10)

      return {
        ...next,
        phase: "SPECIAL_SESSION",
        specialSessionResourceSpent: true,
        pendingSpecialSession: {
          triggerReason: "player_called",
          roundNumber: next.roundNumber,
          presidentId: next.presidentId!,
          chancellorId: next.chancellorId!,
          // `phase` never left the interrupted phase during the vote (see the
          // top-of-reduce guard), so it's exactly what to resume afterward.
          resumeAction: { kind: "return_to_phase", phase: state.phase },
        },
      };
    }

    case "CONTINUE_SPECIAL_SESSION": {
      if (state.phase !== "SPECIAL_SESSION" || !state.pendingSpecialSession) {
        throw new GameRuleError("No Special Session to continue.");
      }
      if (action.presidentId !== state.pendingSpecialSession.presidentId) {
        throw new GameRuleError("Only the President can continue from a Special Session.");
      }
      const { resumeAction } = state.pendingSpecialSession;
      const cleared: GameState = { ...state, pendingSpecialSession: null };

      if (resumeAction.kind === "finalize_execution") {
        const targetId = cleared.pendingExecutionTargetId;
        if (!targetId) throw new GameRuleError("No execution target to finalize.");
        const next: GameState = withLog(
          {
            ...cleared,
            players: cleared.players.map((p) => (p.id === targetId ? { ...p, isAlive: false } : p)),
            pendingExecutivePower: null,
            pendingExecutionTargetId: null,
            pendingExecutiveResult: null,
          },
          `${requirePlayer(cleared, targetId).name} is executed.`,
        );
        const winCheck = checkPolicyAndExecutionWin(next.liberalPoliciesEnacted, next.fascistPoliciesEnacted, next.players);
        if (winCheck.winner) return setWin(next, winCheck.winner, winCheck.reason!, `Game over: ${winCheck.reason}.`);
        return beginNextRound(next);
      }

      if (resumeAction.kind === "advance_round") {
        return beginNextRound(cleared, resumeAction.presidentOverride ?? undefined);
      }

      // return_to_phase: trigger 3 interrupted mid-phase -- nothing about the
      // round was advancing, so just hand control back to that same phase.
      return { ...cleared, phase: resumeAction.phase };
    }

    default:
      return state;
  }
}

function assertExecutivePower(
  state: GameState,
  presidentId: string,
  power: "investigate_loyalty" | "policy_peek" | "special_election" | "execution",
): void {
  if (state.phase !== "EXECUTIVE_ACTION") throw new GameRuleError("Not in an executive action.");
  if (presidentId !== state.presidentId) throw new GameRuleError("Only the President may use this power.");
  if (state.pendingExecutivePower !== power) throw new GameRuleError(`Pending power is not ${power}.`);
  requirePlayer(state, presidentId);
}
