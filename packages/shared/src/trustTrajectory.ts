// Section 7a step 1 + section 9 step 4: the trust_trajectory rollup. Turns a
// player's chronological signal_scores history into a per-signal
// direction/magnitude trend. Section 8 explicitly allows computing this
// on-the-fly instead of maintaining a separate persisted table, which is
// what this module does -- it's pure and stateless, fed a value history by
// the caller (packages/server glues speechEvents + signalScores into that
// history, since GameState alone doesn't have the analyzed scores).
import { SIGNAL_KEYS, type SignalKey } from "./signals.js";

export type TrendDirection = "rising" | "falling" | "flat";
export type TrendMagnitude = "slight" | "notable" | "sharp";

export interface SignalTrend {
  direction: TrendDirection;
  magnitude: TrendMagnitude;
}

/** `insufficientData: true` when a player has fewer than 2 scored speech events for this signal (section 7a: "skip trend language ... use a 'not enough data yet' fallback"). */
export type SignalTrendResult = SignalTrend | { insufficientData: true };

export type TrustTrajectory = Record<SignalKey, SignalTrendResult>;

// Section 7a: "flat if the delta is within a small threshold, e.g. ±10%" and
// "slight <15%, notable 15-35%, sharp >35%". Interpreted as absolute
// differences on the signals' native 0-1 probability scale. The doc calls
// these playtesting-tunable, not fixed -- adjust here if they read wrong at
// the table.
const FLAT_THRESHOLD = 0.1;
const SLIGHT_MAX = 0.15;
const NOTABLE_MAX = 0.35;

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * `valuesInOrder` is one signal's scores across a player's speech events, in
 * the order they were captured. Compares the average of the last 2 against
 * the average of everything earlier (section 7a step 1).
 */
export function computeSignalTrend(valuesInOrder: number[]): SignalTrendResult {
  if (valuesInOrder.length < 2) return { insufficientData: true };

  const recent = valuesInOrder.slice(-2);
  const earlier = valuesInOrder.slice(0, -2);
  const recentAvg = average(recent);
  // Exactly 2 data points means there's no earlier baseline to compare
  // against -- read as flat rather than an undefined swing.
  const earlierAvg = earlier.length > 0 ? average(earlier) : recentAvg;

  // Rounded to avoid floating-point noise (e.g. 0.6+0.7 averaging to
  // 0.6499999999999999) landing a delta on the wrong side of a bucket
  // boundary that it should exactly hit.
  const delta = Math.round((recentAvg - earlierAvg) * 10000) / 10000;
  const absDelta = Math.abs(delta);

  const direction: TrendDirection = delta > FLAT_THRESHOLD ? "rising" : delta < -FLAT_THRESHOLD ? "falling" : "flat";
  const magnitude: TrendMagnitude = absDelta < SLIGHT_MAX ? "slight" : absDelta <= NOTABLE_MAX ? "notable" : "sharp";

  return { direction, magnitude };
}

export interface SignalHistory {
  confidence: number[];
  stress: number[];
  skepticism: number[];
  hesitation: number[];
}

export function computeTrustTrajectory(history: SignalHistory): TrustTrajectory {
  return {
    confidence: computeSignalTrend(history.confidence),
    stress: computeSignalTrend(history.stress),
    skepticism: computeSignalTrend(history.skepticism),
    hesitation: computeSignalTrend(history.hesitation),
  };
}

// Section 7 passive tracking: "Nothing is shown to any player during normal
// play except the ambient tension indicator (a non-specific, low-info UI
// element -- does not name players or scores)." This aggregates every
// player's trajectory into one table-wide, anonymous mood reading.
export type AmbientTensionLevel = "calm" | "restless" | "charged";

const RESTLESS_AT = 2;
const CHARGED_AT = 5;

export function computeAmbientTension(allTrajectories: TrustTrajectory[]): AmbientTensionLevel {
  let notableOrSharpSwings = 0;
  for (const trajectory of allTrajectories) {
    for (const key of SIGNAL_KEYS) {
      const result = trajectory[key as SignalKey];
      if (!("insufficientData" in result) && (result.magnitude === "notable" || result.magnitude === "sharp")) {
        notableOrSharpSwings++;
      }
    }
  }
  if (notableOrSharpSwings >= CHARGED_AT) return "charged";
  if (notableOrSharpSwings >= RESTLESS_AT) return "restless";
  return "calm";
}
