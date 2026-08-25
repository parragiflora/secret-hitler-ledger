import { describe, expect, it } from "vitest";
import { reduce } from "../src/engine.js";
import type { GameState, Role, VoteChoice } from "../src/types.js";
import { GameRuleError } from "../src/types.js";
import { defaultDeckFavoring, makeStateWithRoles, seededRng } from "./testUtils.js";

const rng = seededRng(1);

function castAllJa(state: GameState, choice: VoteChoice = "ja"): GameState {
  let s = state;
  // The nominee's vote is automatic (seeded by NOMINATE_CHANCELLOR itself) --
  // casting it again would throw, so only the rest of the table votes here.
  for (const p of s.players.filter((pl) => pl.isAlive && pl.id !== s.presidentialCandidateId)) {
    s = reduce(s, { type: "CAST_VOTE", playerId: p.id, choice }, rng);
  }
  return s;
}

const FIVE_P: Role[] = ["liberal", "liberal", "liberal", "fascist", "hitler"];

describe("full round happy path", () => {
  it("nomination -> vote pass -> legislative -> policy defense -> next round", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P, defaultDeckFavoring("liberal"));
    let s = reduce(state, { type: "NOMINATE_CHANCELLOR", presidentId: ids[0], nomineeId: ids[1] }, rng);
    expect(s.phase).toBe("ELECTION_VOTE");

    s = castAllJa(s);
    expect(s.phase).toBe("LEGISLATIVE_PRESIDENT");
    expect(s.chancellorId).toBe(ids[1]);
    expect(s.presidentDrawnPolicies).toHaveLength(3);
    expect(s.termLimitedChancellorId).toBe(ids[1]);
    expect(s.termLimitedPresidentId).toBeNull(); // 5p game: only chancellor term-limited

    s = reduce(s, { type: "PRESIDENT_DISCARD", presidentId: ids[0], discardIndex: 0 }, rng);
    expect(s.phase).toBe("LEGISLATIVE_CHANCELLOR");
    expect(s.chancellorHandPolicies).toHaveLength(2);

    s = reduce(s, { type: "CHANCELLOR_ENACT", chancellorId: ids[1], enactIndex: 0 }, rng);
    expect(s.phase).toBe("POLICY_DEFENSE");
    expect(s.liberalPoliciesEnacted).toBe(1);

    s = reduce(s, { type: "ACKNOWLEDGE_POLICY_DEFENSE", chancellorId: ids[1] }, rng);
    expect(s.phase).toBe("NOMINATION");
    expect(s.roundNumber).toBe(2);
    expect(s.presidentId).toBe(ids[1]); // clockwise from p0
  });

  it("rejects nominating a term-limited chancellor", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const limited: GameState = { ...state, termLimitedChancellorId: ids[1] };
    expect(() =>
      reduce(limited, { type: "NOMINATE_CHANCELLOR", presidentId: ids[0], nomineeId: ids[1] }, rng),
    ).toThrow(GameRuleError);
  });
});

describe("the Chancellor nominee's vote is automatic (always Ja)", () => {
  it("is seeded the instant NOMINATE_CHANCELLOR runs, before anyone else votes", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s = reduce(state, { type: "NOMINATE_CHANCELLOR", presidentId: ids[0], nomineeId: ids[1] }, rng);
    expect(s.currentVotes).toEqual([{ round: 1, playerId: ids[1], choice: "ja" }]);
  });

  it("the nominee cannot cast a separate vote of their own", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s = reduce(state, { type: "NOMINATE_CHANCELLOR", presidentId: ids[0], nomineeId: ids[1] }, rng);
    expect(() => reduce(s, { type: "CAST_VOTE", playerId: ids[1], choice: "ja" }, rng)).toThrow(GameRuleError);
    expect(() => reduce(s, { type: "CAST_VOTE", playerId: ids[1], choice: "nein" }, rng)).toThrow(GameRuleError);
  });

  it("only the other 4 alive players need to vote for the election to resolve", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P, defaultDeckFavoring("liberal"));
    let s = reduce(state, { type: "NOMINATE_CHANCELLOR", presidentId: ids[0], nomineeId: ids[1] }, rng);
    for (const id of [ids[0], ids[2], ids[3]]) {
      s = reduce(s, { type: "CAST_VOTE", playerId: id, choice: "ja" }, rng);
      expect(s.phase).toBe("ELECTION_VOTE"); // still short one vote
    }
    // 4th and final real vote (the nominee's was automatic) resolves it.
    s = reduce(s, { type: "CAST_VOTE", playerId: ids[4], choice: "ja" }, rng);
    expect(s.phase).toBe("LEGISLATIVE_PRESIDENT");
    expect(s.lastVoteResult).toEqual({ ja: 5, nein: 0, passed: true });
  });

  it("still counts toward a failed election if the rest of the table votes it down", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    let s = reduce(state, { type: "NOMINATE_CHANCELLOR", presidentId: ids[0], nomineeId: ids[1] }, rng);
    for (const id of [ids[0], ids[2], ids[3], ids[4]]) {
      s = reduce(s, { type: "CAST_VOTE", playerId: id, choice: "nein" }, rng);
    }
    // Nominee's auto-Ja (1) vs. 4 Nein -- still fails (ties/minority both fail).
    expect(s.lastVoteResult).toEqual({ ja: 1, nein: 4, passed: false });
    expect(s.phase).toBe("NOMINATION"); // government failure -> next round
  });
});

describe("election tracker and chaos policy (section 2 CHAOS_POLICY)", () => {
  it("3 failed elections trigger a chaos policy, reset the tracker, and reset term limits", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P, defaultDeckFavoring("fascist"));
    let s: GameState = { ...state, termLimitedChancellorId: ids[4], termLimitedPresidentId: ids[3] };

    for (let round = 0; round < 3; round++) {
      expect(s.phase).toBe("NOMINATION");
      const eligibleNominee = s.players.find((p) => p.id !== s.presidentId && p.id !== s.termLimitedChancellorId)!;
      s = reduce(s, { type: "NOMINATE_CHANCELLOR", presidentId: s.presidentId!, nomineeId: eligibleNominee.id }, rng);
      s = castAllJa(s, "nein");
    }

    expect(s.electionTracker).toBe(0); // reset by chaos
    expect(s.lastEnactedByChaos).toBe(true);
    expect(s.termLimitedChancellorId).toBeNull(); // reset by chaos (section 3)
    expect(s.termLimitedPresidentId).toBeNull();
    expect(s.liberalPoliciesEnacted + s.fascistPoliciesEnacted).toBe(1);
    expect(s.phase === "NOMINATION" || s.phase === "GAME_END").toBe(true);
  });
});

describe("win conditions (section 2 CHECK_WIN_CONDITIONS)", () => {
  it("Fascists win immediately if Hitler is elected Chancellor after the 3rd Fascist policy", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const hitlerId = state.players.find((p) => p.role === "hitler")!.id;
    const s0: GameState = { ...state, fascistPoliciesEnacted: 3 };
    let s = reduce(s0, { type: "NOMINATE_CHANCELLOR", presidentId: ids[0], nomineeId: hitlerId }, rng);
    s = castAllJa(s);
    expect(s.phase).toBe("GAME_END");
    expect(s.winner).toBe("fascist");
    expect(s.winReason).toBe("hitler_elected_chancellor");
    expect(s.presidentDrawnPolicies).toBeNull(); // legislative phase skipped entirely
  });

  it("Liberals win when the 5th Liberal policy is enacted", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    let s: GameState = {
      ...state,
      liberalPoliciesEnacted: 4,
      phase: "LEGISLATIVE_CHANCELLOR",
      chancellorId: ids[1],
      chancellorHandPolicies: ["liberal", "fascist"],
    };
    s = reduce(s, { type: "CHANCELLOR_ENACT", chancellorId: ids[1], enactIndex: 0 }, rng);
    s = reduce(s, { type: "ACKNOWLEDGE_POLICY_DEFENSE", chancellorId: ids[1] }, rng);
    expect(s.winner).toBe("liberal");
    expect(s.winReason).toBe("liberal_policies");
    expect(s.phase).toBe("GAME_END");
  });

  it("Fascists win when the 6th Fascist policy is enacted", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    let s: GameState = {
      ...state,
      fascistPoliciesEnacted: 5,
      phase: "LEGISLATIVE_CHANCELLOR",
      chancellorId: ids[1],
      chancellorHandPolicies: ["fascist", "liberal"],
    };
    s = reduce(s, { type: "CHANCELLOR_ENACT", chancellorId: ids[1], enactIndex: 0 }, rng);
    s = reduce(s, { type: "ACKNOWLEDGE_POLICY_DEFENSE", chancellorId: ids[1] }, rng);
    expect(s.winner).toBe("fascist");
    expect(s.winReason).toBe("fascist_policies");
  });

  it("Liberals win when Hitler is executed", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const hitlerId = state.players.find((p) => p.role === "hitler")!.id;
    // A real execution power can only fire off a normal (non-chaos)
    // enactment, so a Chancellor is always seated -- reflect that here too.
    const s0: GameState = { ...state, phase: "EXECUTIVE_ACTION", chancellorId: ids[1], pendingExecutivePower: "execution" };
    let s = reduce(s0, { type: "EXECUTIVE_EXECUTION", presidentId: ids[0], targetId: hitlerId }, rng);
    // Section 7 trigger 2: choosing the target pauses the game for a Special
    // Session before the elimination itself -- Hitler is still alive here.
    expect(s.phase).toBe("SPECIAL_SESSION");
    expect(s.players.find((p) => p.id === hitlerId)!.isAlive).toBe(true);

    s = reduce(s, { type: "CONTINUE_SPECIAL_SESSION", presidentId: ids[0] }, rng);
    expect(s.players.find((p) => p.id === hitlerId)!.isAlive).toBe(false);
    expect(s.winner).toBe("liberal");
    expect(s.winReason).toBe("hitler_executed");
    expect(s.phase).toBe("GAME_END");
  });
});

describe("veto power (section 4)", () => {
  const SEVEN_P: Role[] = ["liberal", "liberal", "liberal", "liberal", "fascist", "fascist", "hitler"];

  it("cannot be proposed before it is unlocked", () => {
    const { state, ids } = makeStateWithRoles(SEVEN_P);
    const s: GameState = {
      ...state,
      vetoUnlocked: false,
      phase: "LEGISLATIVE_CHANCELLOR",
      chancellorId: ids[1],
      chancellorHandPolicies: ["liberal", "fascist"],
    };
    expect(() => reduce(s, { type: "CHANCELLOR_PROPOSE_VETO", chancellorId: ids[1] }, rng)).toThrow(GameRuleError);
  });

  it("accepted veto discards both policies and counts as a failed government (no policy enacted)", () => {
    const { state, ids } = makeStateWithRoles(SEVEN_P);
    let s: GameState = {
      ...state,
      vetoUnlocked: true,
      phase: "LEGISLATIVE_CHANCELLOR",
      chancellorId: ids[1],
      chancellorHandPolicies: ["liberal", "fascist"],
      electionTracker: 0,
    };
    s = reduce(s, { type: "CHANCELLOR_PROPOSE_VETO", chancellorId: ids[1] }, rng);
    expect(s.phase).toBe("VETO_RESPONSE");
    s = reduce(s, { type: "PRESIDENT_VETO_RESPONSE", presidentId: ids[0], accept: true }, rng);
    expect(s.liberalPoliciesEnacted).toBe(0);
    expect(s.fascistPoliciesEnacted).toBe(0);
    expect(s.chancellorHandPolicies).toBeNull();
    expect(s.electionTracker).toBe(1); // failed government
    expect(s.vetoAttempts).toHaveLength(1);
    expect(s.vetoAttempts[0].presidentResponse).toBe("accepted");
    expect(s.phase).toBe("NOMINATION"); // advanced to next round
  });

  it("rejected veto forces the Chancellor to enact one of the two policies", () => {
    const { state, ids } = makeStateWithRoles(SEVEN_P);
    let s: GameState = {
      ...state,
      vetoUnlocked: true,
      phase: "LEGISLATIVE_CHANCELLOR",
      chancellorId: ids[1],
      chancellorHandPolicies: ["liberal", "fascist"],
    };
    s = reduce(s, { type: "CHANCELLOR_PROPOSE_VETO", chancellorId: ids[1] }, rng);
    s = reduce(s, { type: "PRESIDENT_VETO_RESPONSE", presidentId: ids[0], accept: false }, rng);
    expect(s.phase).toBe("LEGISLATIVE_CHANCELLOR");
    expect(s.chancellorHandPolicies).toEqual(["liberal", "fascist"]);
    s = reduce(s, { type: "CHANCELLOR_ENACT", chancellorId: ids[1], enactIndex: 0 }, rng);
    expect(s.phase).toBe("POLICY_DEFENSE");
    expect(s.liberalPoliciesEnacted).toBe(1);
  });
});

describe("special election succession override (section 3 gotcha)", () => {
  it("resumes clockwise from the player who would have been President, not from the special President", () => {
    const EIGHT_P: Role[] = [
      "liberal",
      "liberal",
      "liberal",
      "liberal",
      "liberal",
      "fascist",
      "fascist",
      "hitler",
    ];
    const { state, ids } = makeStateWithRoles(EIGHT_P);
    // Current president is seat 2 (ids[2]). Normal clockwise next would be seat 3 (ids[3]).
    let s: GameState = {
      ...state,
      presidentId: ids[2],
      phase: "EXECUTIVE_ACTION",
      pendingExecutivePower: "special_election",
    };
    s = reduce(s, { type: "EXECUTIVE_SPECIAL_ELECTION", presidentId: ids[2], targetId: ids[5] }, rng);
    expect(s.specialElectionNextPresidentId).toBe(ids[5]);
    expect(s.succeedFromPlayerId).toBe(ids[3]); // "would have been" president, saved

    s = reduce(s, { type: "ACKNOWLEDGE_EXECUTIVE_ACTION", presidentId: ids[2] }, rng);
    expect(s.phase).toBe("NOMINATION");
    expect(s.presidentId).toBe(ids[5]); // special President takes office for this one round
    expect(s.succeedFromPlayerId).toBe(ids[3]); // not consumed yet

    // Run the special round to completion via a failed vote (simplest path back to NOMINATION).
    s = reduce(s, { type: "NOMINATE_CHANCELLOR", presidentId: ids[5], nomineeId: ids[6] }, rng);
    s = castAllJa(s, "nein");

    expect(s.phase).toBe("NOMINATION");
    expect(s.presidentId).toBe(ids[3]); // resumed from the saved "would have been" player...
    expect(s.presidentId).not.toBe(ids[6]); // ...NOT clockwise from the special President (ids[5])
    expect(s.succeedFromPlayerId).toBeNull(); // now consumed
  });
});

describe("investigate loyalty (section 5)", () => {
  it("returns the target's team and cannot be used twice on the same player", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const fascistId = state.players.find((p) => p.role === "fascist")!.id;
    let s: GameState = { ...state, phase: "EXECUTIVE_ACTION", pendingExecutivePower: "investigate_loyalty" };
    s = reduce(s, { type: "EXECUTIVE_INVESTIGATE", presidentId: ids[0], targetId: fascistId }, rng);
    expect(s.pendingExecutiveResult).toEqual({ team: "fascist" });
    expect(s.investigatedPlayerIds).toContain(fascistId);

    const s2: GameState = { ...s, phase: "EXECUTIVE_ACTION", pendingExecutivePower: "investigate_loyalty" };
    expect(() =>
      reduce(s2, { type: "EXECUTIVE_INVESTIGATE", presidentId: ids[0], targetId: fascistId }, rng),
    ).toThrow(GameRuleError);
  });
});

describe("RECORD_SPEECH_EVENT (section 6 capture hooks)", () => {
  it("logs a completed recording from the correct speaker", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P); // NOMINATION -> nomination_speech, speaker = ids[0]
    const s = reduce(
      state,
      { type: "RECORD_SPEECH_EVENT", playerId: ids[0], eventType: "nomination_speech", durationMs: 21000, skipped: false },
      rng,
    );
    expect(s.speechEvents).toHaveLength(1);
    expect(s.speechEvents[0]).toMatchObject({
      playerId: ids[0],
      eventType: "nomination_speech",
      roundNumber: state.roundNumber,
      durationMs: 21000,
      skipped: false,
      clipRef: null,
    });
  });

  it("logs a skip with durationMs forced to null", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s = reduce(
      state,
      { type: "RECORD_SPEECH_EVENT", playerId: ids[0], eventType: "nomination_speech", durationMs: 9999, skipped: true },
      rng,
    );
    expect(s.speechEvents[0].skipped).toBe(true);
    expect(s.speechEvents[0].durationMs).toBeNull();
  });

  it("rejects a recording from anyone other than the required speaker", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P); // President is ids[0]; ids[1] is not the speaker
    expect(() =>
      reduce(
        state,
        { type: "RECORD_SPEECH_EVENT", playerId: ids[1], eventType: "nomination_speech", durationMs: 5000, skipped: false },
        rng,
      ),
    ).toThrow(GameRuleError);
  });

  it("rejects an eventType that doesn't match the currently active capture moment", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P); // active moment is nomination_speech, not policy_defense
    expect(() =>
      reduce(
        state,
        { type: "RECORD_SPEECH_EVENT", playerId: ids[0], eventType: "policy_defense", durationMs: 5000, skipped: false },
        rng,
      ),
    ).toThrow(GameRuleError);
  });

  it("rejects recording when there is no active capture moment (e.g. LEGISLATIVE_PRESIDENT)", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s: GameState = { ...state, phase: "LEGISLATIVE_PRESIDENT", presidentDrawnPolicies: ["liberal", "liberal", "fascist"] };
    expect(() =>
      reduce(
        s,
        { type: "RECORD_SPEECH_EVENT", playerId: ids[0], eventType: "nomination_speech", durationMs: 5000, skipped: false },
        rng,
      ),
    ).toThrow(GameRuleError);
  });

  it("rejects a duplicate recording for the same moment", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const once = reduce(
      state,
      { type: "RECORD_SPEECH_EVENT", playerId: ids[0], eventType: "nomination_speech", durationMs: 5000, skipped: false },
      rng,
    );
    expect(() =>
      reduce(
        once,
        { type: "RECORD_SPEECH_EVENT", playerId: ids[0], eventType: "nomination_speech", durationMs: 5000, skipped: false },
        rng,
      ),
    ).toThrow(GameRuleError);
  });

  it("doesn't block the underlying game action -- capture is a parallel, non-gating log", () => {
    // Section 6: nomination_speech is "required (prompt if skipped)" -- a UX
    // nudge, not a hard engine-level gate. The President can still nominate
    // without ever sending RECORD_SPEECH_EVENT.
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s = reduce(state, { type: "NOMINATE_CHANCELLOR", presidentId: ids[0], nomineeId: ids[1] }, rng);
    expect(s.phase).toBe("ELECTION_VOTE");
    expect(s.speechEvents).toHaveLength(0);
  });
});
