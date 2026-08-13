import { describe, expect, it } from "vitest";
import { activeCaptureTrigger, captureAlreadyLogged } from "../src/capture.js";
import type { GameState, Role, SpeechEvent } from "../src/types.js";
import { makeStateWithRoles } from "./testUtils.js";

const FIVE_P: Role[] = ["liberal", "liberal", "liberal", "fascist", "hitler"];

describe("activeCaptureTrigger (section 6)", () => {
  it("NOMINATION: required nomination_speech for the President", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const trigger = activeCaptureTrigger(state);
    expect(trigger).toEqual({ eventType: "nomination_speech", speakerId: ids[0], required: true, maxDurationSec: 45 });
  });

  it("ELECTION_VOTE: optional acceptance_speech for the nominee", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s: GameState = { ...state, phase: "ELECTION_VOTE", presidentialCandidateId: ids[1] };
    expect(activeCaptureTrigger(s)).toEqual({
      eventType: "acceptance_speech",
      speakerId: ids[1],
      required: false,
      maxDurationSec: 30,
    });
  });

  it("POLICY_DEFENSE: required policy_defense for the Chancellor", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s: GameState = { ...state, phase: "POLICY_DEFENSE", chancellorId: ids[1] };
    expect(activeCaptureTrigger(s)).toEqual({
      eventType: "policy_defense",
      speakerId: ids[1],
      required: true,
      maxDurationSec: 45,
    });
  });

  it("EXECUTIVE_ACTION investigate: optional investigation_announcement for the President, only once a result exists", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const beforeResult: GameState = { ...state, phase: "EXECUTIVE_ACTION", pendingExecutivePower: "investigate_loyalty" };
    expect(activeCaptureTrigger(beforeResult)).toBeNull(); // no result yet -- nothing to announce

    const afterResult: GameState = { ...beforeResult, pendingExecutiveResult: { team: "fascist" } };
    expect(activeCaptureTrigger(afterResult)).toEqual({
      eventType: "investigation_announcement",
      speakerId: ids[0],
      required: false,
      maxDurationSec: 30,
    });
  });

  it("EXECUTIVE_ACTION execution: optional last_words for the target, only once chosen", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const beforeTarget: GameState = { ...state, phase: "EXECUTIVE_ACTION", pendingExecutivePower: "execution" };
    expect(activeCaptureTrigger(beforeTarget)).toBeNull();

    const afterTarget: GameState = { ...beforeTarget, pendingExecutionTargetId: ids[4] };
    expect(activeCaptureTrigger(afterTarget)).toEqual({
      eventType: "last_words",
      speakerId: ids[4],
      required: false,
      maxDurationSec: 20,
    });
  });

  it("EXECUTIVE_ACTION special_election / policy_peek: no capture moment", () => {
    const { state } = makeStateWithRoles(FIVE_P);
    const specialElection: GameState = { ...state, phase: "EXECUTIVE_ACTION", pendingExecutivePower: "special_election" };
    expect(activeCaptureTrigger(specialElection)).toBeNull();
    const policyPeek: GameState = { ...state, phase: "EXECUTIVE_ACTION", pendingExecutivePower: "policy_peek" };
    expect(activeCaptureTrigger(policyPeek)).toBeNull();
  });

  it("no capture moment during legislative/veto/lobby/role-reveal/game-end phases", () => {
    const { state } = makeStateWithRoles(FIVE_P);
    for (const phase of ["LOBBY", "ROLE_REVEAL", "LEGISLATIVE_PRESIDENT", "LEGISLATIVE_CHANCELLOR", "VETO_RESPONSE", "GAME_END"] as const) {
      expect(activeCaptureTrigger({ ...state, phase })).toBeNull();
    }
  });

  it("vote_moment capture was deliberately cut (section 6 note) -- no per-vote trigger exists", () => {
    // Sanity check that ELECTION_VOTE's only trigger is the nominee's optional
    // acceptance_speech, not a per-voter trigger for every Ja/Nein cast.
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s: GameState = { ...state, phase: "ELECTION_VOTE", presidentialCandidateId: ids[1] };
    const trigger = activeCaptureTrigger(s);
    expect(trigger?.eventType).not.toBe("vote_moment" as never);
    expect(trigger?.speakerId).toBe(ids[1]); // only the nominee, not every voter
  });
});

describe("captureAlreadyLogged", () => {
  it("is false with no matching speechEvents row, true once one exists", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const trigger = activeCaptureTrigger(state)!;
    expect(captureAlreadyLogged(state, trigger)).toBe(false);

    const event: SpeechEvent = {
      id: "sp_1",
      playerId: ids[0],
      roundNumber: state.roundNumber,
      eventType: "nomination_speech",
      capturedAt: new Date().toISOString(),
      durationMs: 12000,
      skipped: false,
      clipRef: null,
    };
    const s: GameState = { ...state, speechEvents: [event] };
    expect(captureAlreadyLogged(s, trigger)).toBe(true);
  });
});
