// Section 9 step 4: glues a room's speechEvents (in GameState, part of the
// pure engine) together with its signalScores (external/async, kept on Room
// -- see rooms.ts) into the per-player and table-wide trust_trajectory data.
// The actual trend math is pure and lives in @interhuman/shared; this module
// is just the ordering/filtering step only the server can do, since only it
// has both data sources.
import {
  computeAmbientTension,
  computeTrustTrajectory,
  type AmbientTensionLevel,
  type SpeechEvent,
  type TrustTrajectory,
} from "@interhuman/shared";
import type { SignalScores } from "./interhuman.js";

/**
 * `speechEvents` must be in capture order (true of GameState.speechEvents,
 * which is only ever appended to). Events with no matching signalScores
 * entry (skipped, still analyzing, or the upload never landed) are simply
 * excluded from that signal's history, not counted as zero.
 */
export function computePlayerTrustTrajectory(
  speechEvents: SpeechEvent[],
  signalScores: Map<string, SignalScores>,
  playerId: string,
): TrustTrajectory {
  const history = { confidence: [] as number[], stress: [] as number[], skepticism: [] as number[], hesitation: [] as number[] };
  for (const event of speechEvents) {
    if (event.playerId !== playerId) continue;
    const scores = signalScores.get(event.id);
    if (!scores) continue;
    history.confidence.push(scores.confidence);
    history.stress.push(scores.stress);
    history.skepticism.push(scores.skepticism);
    history.hesitation.push(scores.hesitation);
  }
  return computeTrustTrajectory(history);
}

/** The one thing shown during normal play (section 7): a non-specific, table-wide mood reading. */
export function computeRoomAmbientTension(
  speechEvents: SpeechEvent[],
  signalScores: Map<string, SignalScores>,
  playerIds: string[],
): AmbientTensionLevel {
  const trajectories = playerIds.map((id) => computePlayerTrustTrajectory(speechEvents, signalScores, id));
  return computeAmbientTension(trajectories);
}
