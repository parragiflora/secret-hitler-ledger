// Section 6: speech/signal capture moments. Each is tied to a known phase
// transition, so which capture (if any) is active right now can be derived
// purely from GameState -- "no manual detection needed" (section 6 intro).
// Phase 2 scope: start/stop hooks + the speechEvents log only. No clip
// upload, Interhuman proxy, or signal scoring yet (section 9 step 3+).
import type { GameState, SpeechEventType } from "./types.js";

export interface CaptureTrigger {
  eventType: SpeechEventType;
  speakerId: string;
  required: boolean;
  maxDurationSec: number;
}

// Upper bound of each event's "typical length" range in the section 6 table;
// used as the auto-stop ceiling for recording.
const MAX_DURATION_SEC: Record<SpeechEventType, number> = {
  nomination_speech: 45,
  acceptance_speech: 30,
  policy_defense: 45,
  investigation_announcement: 30,
  last_words: 20,
};

// Required vs optional, per the section 6 table.
const REQUIRED: Record<SpeechEventType, boolean> = {
  nomination_speech: true,
  acceptance_speech: false,
  policy_defense: true,
  investigation_announcement: false,
  last_words: false,
};

function trigger(eventType: SpeechEventType, speakerId: string): CaptureTrigger {
  return { eventType, speakerId, required: REQUIRED[eventType], maxDurationSec: MAX_DURATION_SEC[eventType] };
}

/** The single speech-capture moment active right now, if any. */
export function activeCaptureTrigger(state: GameState): CaptureTrigger | null {
  switch (state.phase) {
    case "NOMINATION":
      // President speaks while selecting their Chancellor candidate.
      return state.presidentId ? trigger("nomination_speech", state.presidentId) : null;

    case "ELECTION_VOTE":
      // Chancellor candidate may optionally say a few words while voting proceeds.
      return state.presidentialCandidateId ? trigger("acceptance_speech", state.presidentialCandidateId) : null;

    case "POLICY_DEFENSE":
      return state.chancellorId ? trigger("policy_defense", state.chancellorId) : null;

    case "EXECUTIVE_ACTION":
      if (state.pendingExecutivePower === "investigate_loyalty" && state.pendingExecutiveResult && state.presidentId) {
        return trigger("investigation_announcement", state.presidentId);
      }
      if (state.pendingExecutivePower === "execution" && state.pendingExecutionTargetId) {
        return trigger("last_words", state.pendingExecutionTargetId);
      }
      return null;

    default:
      return null;
  }
}

/** Has the current active trigger's moment already been logged (recorded or skipped) this round? */
export function captureAlreadyLogged(state: GameState, capture: CaptureTrigger): boolean {
  return state.speechEvents.some(
    (e) => e.playerId === capture.speakerId && e.eventType === capture.eventType && e.roundNumber === state.roundNumber,
  );
}

/**
 * Deterministic id for a speech event -- (player, eventType, round) already
 * uniquely identifies a capture moment, so no random id generation is
 * needed. The engine uses this to write speechEvents rows; the client uses
 * the exact same function to predict the id ahead of time so it can
 * correlate an uploaded clip (section 9 step 3) with the right event
 * without waiting on a server round-trip.
 */
export function speechEventId(playerId: string, eventType: SpeechEventType, roundNumber: number): string {
  return `sp_${playerId}_${eventType}_${roundNumber}`;
}
