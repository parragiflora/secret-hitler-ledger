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
  type GameRecap,
  type GameState,
  type Role,
  type SignalSeriesPoint,
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

/**
 * Section 9 step 6: one player's full signal history, chronological, for
 * the end-game recap chart. Unlike computePlayerTrustTrajectory (a
 * summarized direction/magnitude), this keeps every scored data point --
 * the whole point of the recap is showing the complete picture that was
 * only ever revealed piecemeal (via Special Sessions) during play. Same
 * exclusion rule as the trend version: an event with no matching
 * signalScores (skipped, still analyzing, upload never landed) is left out
 * rather than counted as zero.
 */
export function computePlayerSignalSeries(
  speechEvents: SpeechEvent[],
  signalScores: Map<string, SignalScores>,
  playerId: string,
): SignalSeriesPoint[] {
  const points: SignalSeriesPoint[] = [];
  for (const event of speechEvents) {
    if (event.playerId !== playerId) continue;
    const scores = signalScores.get(event.id);
    if (!scores) continue;
    points.push({
      round: event.roundNumber,
      confidence: scores.confidence,
      stress: scores.stress,
      skepticism: scores.skepticism,
      hesitation: scores.hesitation,
    });
  }
  return points;
}

/** Assembles the full end-game recap -- every player's signal history alongside their revealed role. GAME_END only; roles are secret before that. */
export function computeGameRecap(state: GameState, signalScores: Map<string, SignalScores>): GameRecap {
  return {
    players: state.players.map((p) => ({
      playerId: p.id,
      name: p.name,
      role: p.role as Role,
      points: computePlayerSignalSeries(state.speechEvents, signalScores, p.id),
    })),
  };
}
