// Section 7: Special Session trigger eligibility. The actual phase
// transitions live in engine.ts (they need to mutate GameState); this module
// holds the pure "is this trigger allowed right now" checks so they're
// testable in isolation and reused consistently across call sites.
import type { GamePhase, GameState } from "./types.js";

/**
 * Trigger 1 (3rd Fascist policy): fires once, the moment the count hits 3 --
 * whether enacted normally OR via chaos. The one thing that actually gates
 * it is having a confirmed government to report on. That's usually implied
 * by "not chaos", but not always: a vetoed government still had a real
 * President+Chancellor even though the veto's failure is what triggered
 * chaos, so `chancellorId` (not "was this chaos") is the correct gate --
 * it's null exactly when no government was seated this round (a plain
 * failed election ran out the clock), and set whenever one was (including
 * the vetoed-then-chaos case).
 */
export function shouldFirePolicyThresholdTrigger(state: GameState): boolean {
  return state.fascistPoliciesEnacted === 3 && !state.policyThresholdSessionFired && state.chancellorId !== null;
}

// Trigger 3 (player-called): only proposable once a government is seated
// and stable for the round -- i.e. after the election passes, before the
// next one starts. Excludes NOMINATION/ELECTION_VOTE (no confirmed
// Chancellor yet to report on) and SPECIAL_SESSION itself (can't call one
// mid-session).
export const SPECIAL_SESSION_PROPOSABLE_PHASES: GamePhase[] = [
  "LEGISLATIVE_PRESIDENT",
  "LEGISLATIVE_CHANCELLOR",
  "VETO_RESPONSE",
  "POLICY_DEFENSE",
  "EXECUTIVE_ACTION",
];

export function canProposeSpecialSession(state: GameState): boolean {
  return (
    !state.specialSessionResourceSpent &&
    !state.pendingSpecialSessionVote &&
    SPECIAL_SESSION_PROPOSABLE_PHASES.includes(state.phase)
  );
}
