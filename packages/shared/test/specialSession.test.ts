import { describe, expect, it } from "vitest";
import { reduce } from "../src/engine.js";
import type { GameState, Role } from "../src/types.js";
import { GameRuleError } from "../src/types.js";
import { makeStateWithRoles, seededRng } from "./testUtils.js";

const rng = seededRng(1);
const FIVE_P: Role[] = ["liberal", "liberal", "liberal", "fascist", "hitler"];
const EIGHT_P: Role[] = ["liberal", "liberal", "liberal", "liberal", "liberal", "fascist", "fascist", "hitler"];

describe("Special Session trigger 1: 3rd Fascist policy (section 7)", () => {
  it("fires when the 3rd Fascist policy lands via normal enactment, and defers the round advance", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    // 5p slot 3 power is policy_peek -- enact the 3rd fascist tile via a normal Chancellor action.
    const s0: GameState = {
      ...state,
      fascistPoliciesEnacted: 2,
      phase: "LEGISLATIVE_CHANCELLOR",
      chancellorId: ids[1],
      chancellorHandPolicies: ["fascist", "liberal"],
    };
    let s = reduce(s0, { type: "CHANCELLOR_ENACT", chancellorId: ids[1], enactIndex: 0 }, rng);
    expect(s.fascistPoliciesEnacted).toBe(3);
    s = reduce(s, { type: "ACKNOWLEDGE_POLICY_DEFENSE", chancellorId: ids[1] }, rng);
    expect(s.phase).toBe("EXECUTIVE_ACTION");
    expect(s.pendingExecutivePower).toBe("policy_peek");

    s = reduce(s, { type: "EXECUTIVE_POLICY_PEEK", presidentId: ids[0] }, rng);
    s = reduce(s, { type: "ACKNOWLEDGE_EXECUTIVE_ACTION", presidentId: ids[0] }, rng);

    // The round hasn't advanced -- it's paused in the Special Session instead.
    expect(s.phase).toBe("SPECIAL_SESSION");
    expect(s.pendingSpecialSession).toMatchObject({
      triggerReason: "policy_threshold",
      presidentId: ids[0],
      chancellorId: ids[1],
    });
    expect(s.policyThresholdSessionFired).toBe(true);
    expect(s.roundNumber).toBe(state.roundNumber); // not yet advanced

    s = reduce(s, { type: "CONTINUE_SPECIAL_SESSION", presidentId: ids[0] }, rng);
    expect(s.phase).toBe("NOMINATION");
    expect(s.roundNumber).toBe(state.roundNumber + 1); // now it advances
  });

  it("never fires twice, even as later Fascist policies land", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s0: GameState = { ...state, fascistPoliciesEnacted: 3, policyThresholdSessionFired: true };
    const s: GameState = {
      ...s0,
      phase: "LEGISLATIVE_CHANCELLOR",
      chancellorId: ids[1],
      chancellorHandPolicies: ["fascist", "liberal"],
    };
    let next = reduce(s, { type: "CHANCELLOR_ENACT", chancellorId: ids[1], enactIndex: 0 }, rng);
    expect(next.fascistPoliciesEnacted).toBe(4);
    next = reduce(next, { type: "ACKNOWLEDGE_POLICY_DEFENSE", chancellorId: ids[1] }, rng);
    // Slot 4 is execution, not policy_threshold -- no Special Session from this trigger.
    expect(next.phase).toBe("EXECUTIVE_ACTION");
    expect(next.pendingExecutivePower).toBe("execution");
  });

  it("does NOT fire for a plain 3-failed-elections chaos policy (no government seated)", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    // Force the 3rd fascist tile to be drawn by chaos: rig the draw pile.
    const rigged: GameState = {
      ...state,
      fascistPoliciesEnacted: 2,
      drawPile: ["fascist", "liberal", "liberal"],
      electionTracker: 2,
      chancellorId: null, // no government -- a plain failed election, not a veto
      phase: "ELECTION_VOTE",
      presidentialCandidateId: ids[1],
      // Mirrors what NOMINATE_CHANCELLOR itself would have seeded -- this
      // state is hand-rigged rather than built via the reducer, so it has to
      // be seeded by hand too, or the vote never reaches aliveCount.
      currentVotes: [{ round: state.roundNumber, playerId: ids[1], choice: "ja" }],
    };
    let s = rigged;
    for (const p of s.players.filter((pl) => pl.id !== ids[1])) {
      s = reduce(s, { type: "CAST_VOTE", playerId: p.id, choice: "nein" }, rng);
    }
    expect(s.fascistPoliciesEnacted).toBe(3);
    expect(s.lastEnactedByChaos).toBe(true);
    expect(s.phase).toBe("NOMINATION"); // advanced normally, no Special Session
    expect(s.pendingSpecialSession).toBeNull();
    expect(s.policyThresholdSessionFired).toBe(false);
  });

  it("DOES fire for a chaos policy triggered by a vetoed (but seated) government", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s0: GameState = {
      ...state,
      fascistPoliciesEnacted: 2,
      drawPile: ["fascist", "liberal", "liberal"],
      electionTracker: 2, // one more failure triggers chaos
      phase: "LEGISLATIVE_CHANCELLOR",
      presidentId: ids[0],
      chancellorId: ids[1], // a real, seated government
      chancellorHandPolicies: ["liberal", "liberal"],
      vetoUnlocked: true,
    };
    let s = reduce(s0, { type: "CHANCELLOR_PROPOSE_VETO", chancellorId: ids[1] }, rng);
    s = reduce(s, { type: "PRESIDENT_VETO_RESPONSE", presidentId: ids[0], accept: true }, rng);

    expect(s.fascistPoliciesEnacted).toBe(3);
    expect(s.lastEnactedByChaos).toBe(true);
    expect(s.phase).toBe("SPECIAL_SESSION"); // fired, unlike the no-government case above
    expect(s.pendingSpecialSession).toMatchObject({ triggerReason: "policy_threshold", presidentId: ids[0], chancellorId: ids[1] });
  });

  it("correctly defers a special-election president override through the Special Session", () => {
    const { state, ids } = makeStateWithRoles(EIGHT_P);
    // 8p slot 3 power is special_election.
    const s0: GameState = {
      ...state,
      fascistPoliciesEnacted: 2,
      phase: "LEGISLATIVE_CHANCELLOR",
      presidentId: ids[0],
      chancellorId: ids[1],
      chancellorHandPolicies: ["fascist", "liberal"],
    };
    let s = reduce(s0, { type: "CHANCELLOR_ENACT", chancellorId: ids[1], enactIndex: 0 }, rng);
    s = reduce(s, { type: "ACKNOWLEDGE_POLICY_DEFENSE", chancellorId: ids[1] }, rng);
    expect(s.pendingExecutivePower).toBe("special_election");

    s = reduce(s, { type: "EXECUTIVE_SPECIAL_ELECTION", presidentId: ids[0], targetId: ids[5] }, rng);
    s = reduce(s, { type: "ACKNOWLEDGE_EXECUTIVE_ACTION", presidentId: ids[0] }, rng);

    expect(s.phase).toBe("SPECIAL_SESSION");
    expect(s.pendingSpecialSession?.resumeAction).toEqual({ kind: "advance_round", presidentOverride: ids[5] });

    s = reduce(s, { type: "CONTINUE_SPECIAL_SESSION", presidentId: ids[0] }, rng);
    expect(s.phase).toBe("NOMINATION");
    expect(s.presidentId).toBe(ids[5]); // the special-election target, not clockwise-next
  });
});

describe("Special Session trigger 2: Execution (section 7)", () => {
  function setupExecutionReady() {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s0: GameState = { ...state, phase: "EXECUTIVE_ACTION", chancellorId: ids[1], pendingExecutivePower: "execution" };
    return { s0, ids };
  }

  it("fires unconditionally, pausing before the elimination", () => {
    const { s0, ids } = setupExecutionReady();
    const s = reduce(s0, { type: "EXECUTIVE_EXECUTION", presidentId: ids[0], targetId: ids[4] }, rng);
    expect(s.phase).toBe("SPECIAL_SESSION");
    expect(s.pendingSpecialSession).toMatchObject({ triggerReason: "execution", presidentId: ids[0], chancellorId: ids[1] });
    expect(s.pendingSpecialSession?.resumeAction).toEqual({ kind: "finalize_execution" });
    expect(s.players.find((p) => p.id === ids[4])!.isAlive).toBe(true); // not eliminated yet
  });

  it("only the President can continue from it", () => {
    const { s0, ids } = setupExecutionReady();
    const s = reduce(s0, { type: "EXECUTIVE_EXECUTION", presidentId: ids[0], targetId: ids[4] }, rng);
    expect(() => reduce(s, { type: "CONTINUE_SPECIAL_SESSION", presidentId: ids[1] }, rng)).toThrow(GameRuleError);
  });

  it("finalizes the elimination and advances the round on continue", () => {
    const { s0, ids } = setupExecutionReady();
    // ids[2] is a plain Liberal in FIVE_P -- executing them shouldn't end the game.
    let s = reduce(s0, { type: "EXECUTIVE_EXECUTION", presidentId: ids[0], targetId: ids[2] }, rng);
    s = reduce(s, { type: "CONTINUE_SPECIAL_SESSION", presidentId: ids[0] }, rng);
    expect(s.players.find((p) => p.id === ids[2])!.isAlive).toBe(false);
    expect(s.phase).toBe("NOMINATION");
  });

  it("ACKNOWLEDGE_EXECUTIVE_ACTION can no longer resolve an execution directly", () => {
    const { s0, ids } = setupExecutionReady();
    expect(() => reduce(s0, { type: "ACKNOWLEDGE_EXECUTIVE_ACTION", presidentId: ids[0] }, rng)).toThrow(GameRuleError);
  });
});

describe("Special Session trigger 3: player-called (section 7 + section 10)", () => {
  it("can be proposed once a government is seated, and requires a majority Ja to actually fire", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s0: GameState = { ...state, phase: "LEGISLATIVE_PRESIDENT", chancellorId: ids[1], presidentDrawnPolicies: ["liberal", "liberal", "fascist"] };
    let s = reduce(s0, { type: "PROPOSE_SPECIAL_SESSION", playerId: ids[2] }, rng);
    expect(s.pendingSpecialSessionVote).toMatchObject({ proposedBy: ids[2] });
    expect(s.phase).toBe("LEGISLATIVE_PRESIDENT"); // unchanged while the vote is pending

    for (const p of s.players) {
      s = reduce(s, { type: "CAST_SPECIAL_SESSION_VOTE", playerId: p.id, choice: "ja" }, rng);
    }
    expect(s.phase).toBe("SPECIAL_SESSION");
    expect(s.specialSessionResourceSpent).toBe(true);
    expect(s.pendingSpecialSession?.resumeAction).toEqual({ kind: "return_to_phase", phase: "LEGISLATIVE_PRESIDENT" });

    // Continuing resumes the EXACT interrupted phase, with its data intact.
    s = reduce(s, { type: "CONTINUE_SPECIAL_SESSION", presidentId: ids[0] }, rng);
    expect(s.phase).toBe("LEGISLATIVE_PRESIDENT");
    expect(s.presidentDrawnPolicies).toEqual(["liberal", "liberal", "fascist"]);
  });

  it("a failed vote does NOT spend the resource and simply resumes the interrupted phase", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s0: GameState = { ...state, phase: "POLICY_DEFENSE", chancellorId: ids[1], lastEnactedPolicy: "liberal" };
    let s = reduce(s0, { type: "PROPOSE_SPECIAL_SESSION", playerId: ids[2] }, rng);
    for (const p of s.players) {
      s = reduce(s, { type: "CAST_SPECIAL_SESSION_VOTE", playerId: p.id, choice: "nein" }, rng);
    }
    expect(s.phase).toBe("POLICY_DEFENSE"); // never left
    expect(s.specialSessionResourceSpent).toBe(false);
    expect(s.pendingSpecialSessionVote).toBeNull();
  });

  it("cannot be proposed during NOMINATION or ELECTION_VOTE (no confirmed Chancellor yet)", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const nomination: GameState = { ...state, phase: "NOMINATION" };
    expect(() => reduce(nomination, { type: "PROPOSE_SPECIAL_SESSION", playerId: ids[2] }, rng)).toThrow(GameRuleError);
    const electionVote: GameState = { ...state, phase: "ELECTION_VOTE", presidentialCandidateId: ids[1] };
    expect(() => reduce(electionVote, { type: "PROPOSE_SPECIAL_SESSION", playerId: ids[2] }, rng)).toThrow(GameRuleError);
  });

  it("cannot be proposed twice at once, or after the resource is already spent", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s0: GameState = { ...state, phase: "EXECUTIVE_ACTION", chancellorId: ids[1], pendingExecutivePower: "investigate_loyalty" };
    const s1 = reduce(s0, { type: "PROPOSE_SPECIAL_SESSION", playerId: ids[2] }, rng);
    expect(() => reduce(s1, { type: "PROPOSE_SPECIAL_SESSION", playerId: ids[3] }, rng)).toThrow(GameRuleError);

    const spent: GameState = { ...state, phase: "EXECUTIVE_ACTION", chancellorId: ids[1], pendingExecutivePower: "investigate_loyalty", specialSessionResourceSpent: true };
    expect(() => reduce(spent, { type: "PROPOSE_SPECIAL_SESSION", playerId: ids[2] }, rng)).toThrow(GameRuleError);
  });
});

describe("Special Session guards block normal play while paused", () => {
  it("rejects unrelated actions during a pending call vote", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s0: GameState = { ...state, phase: "LEGISLATIVE_PRESIDENT", chancellorId: ids[1], presidentDrawnPolicies: ["liberal", "liberal", "fascist"] };
    const s = reduce(s0, { type: "PROPOSE_SPECIAL_SESSION", playerId: ids[2] }, rng);
    expect(() => reduce(s, { type: "PRESIDENT_DISCARD", presidentId: ids[0], discardIndex: 0 }, rng)).toThrow(GameRuleError);
  });

  it("rejects unrelated actions during an active Special Session, but still allows speech capture", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s0: GameState = { ...state, phase: "EXECUTIVE_ACTION", chancellorId: ids[1], pendingExecutivePower: "execution" };
    const s = reduce(s0, { type: "EXECUTIVE_EXECUTION", presidentId: ids[0], targetId: ids[4] }, rng);
    expect(() => reduce(s, { type: "NOMINATE_CHANCELLOR", presidentId: ids[0], nomineeId: ids[1] }, rng)).toThrow(GameRuleError);

    // last_words capture (section 6) still works mid-Special-Session.
    const captured = reduce(s, { type: "RECORD_SPEECH_EVENT", playerId: ids[4], eventType: "last_words", durationMs: 5000, skipped: false }, rng);
    expect(captured.speechEvents).toHaveLength(1);
  });
});
