// Section 7a: templated readout generation -- "The Registrar's voice". Turns
// a player's TrustTrajectory into one short, deterministic sentence, with no
// LLM call. Pure and stateless: variant-rotation history is threaded through
// as data (in/out) rather than mutated, so the caller (server-side, since
// that's where signalScores live) owns persisting it across a game.
import type { SignalKey } from "./signals.js";
import type { SignalTrend, TrendMagnitude, TrustTrajectory } from "./trustTrajectory.js";

// Section 7a step 2: rank the 4 signals by magnitude, tie-break in this
// order -- "skepticism and stress read as the most 'damning' and make for
// better drama; confidence/hesitation are more neutral."
const SIGNAL_PRIORITY: SignalKey[] = ["skepticism", "stress", "confidence", "hesitation"];
const MAGNITUDE_RANK: Record<TrendMagnitude, number> = { sharp: 3, notable: 2, slight: 1 };

// Section 7a step 3's example bank, filled out (falling variants mirror the
// rising set with inverse phrasing, per the doc's own instruction) and each
// with 2 variants so "avoid repeating the exact same sentence twice in one
// game" (step 3) has somewhere to rotate to.
const TEMPLATE_BANK: Record<SignalKey, { rising: string[]; falling: string[] }> = {
  confidence: {
    rising: [
      "{name} has grown steadily more assured with each address.",
      "The Registrar notes a firmer conviction in {name}'s recent words.",
    ],
    falling: [
      "{name} spoke with far less certainty than in previous sessions.",
      "A noticeable dip in conviction, according to the Registrar's notes on {name}.",
    ],
  },
  stress: {
    rising: [
      "{name}'s composure has visibly thinned across their recent statements.",
      "The Registrar records a marked increase in strain in {name}'s delivery.",
    ],
    falling: [
      "{name} has settled considerably since their last turn at the podium.",
      "The Registrar notes {name}'s composure steadying in recent remarks.",
    ],
  },
  skepticism: {
    rising: [
      "The Registrar notes a growing skepticism in {name}'s recent remarks.",
      "{name}'s tone has turned notably more doubtful since their last turn at the podium.",
    ],
    falling: [
      "{name}'s doubts appear to have eased in recent remarks.",
      "The Registrar records a softening skepticism in {name}'s recent words.",
    ],
  },
  hesitation: {
    rising: [
      "{name} has grown measurably slower to commit to their words.",
      "The Registrar notes a lengthening pause before {name} speaks.",
    ],
    falling: [
      "{name} has grown noticeably quicker to commit to their words.",
      "The Registrar records {name} answering with newfound ease.",
    ],
  },
};

// Section 7a: covers both "flat" (the top-ranked signal has no real trend --
// which per the trend math always means "slight" magnitude too) and
// "insufficient data" (fewer than 2 scored speech events, e.g. a Chancellor
// nominated for the first time).
const FALLBACK_LINES = [
  "The Registrar has not yet gathered enough on {name} to report a trend.",
  "The Registrar's notes on {name} remain too thin to read.",
];

// Section 7a step 3: "Optionally prepend a magnitude qualifier for sharp
// swings only... Leave slight/notable unqualified so the sharp ones stand out."
const SHARP_QUALIFIERS = ["Sharply, ", "Markedly, ", "A stark shift -- "];

/** Which variant (by index) was last used per rotation bucket, keyed by e.g. "skepticism_rising" or "fallback"/"qualifier". */
export type ReadoutVariantHistory = Record<string, number>;

function pickVariant(
  variants: string[],
  key: string,
  history: ReadoutVariantHistory,
  rng: () => number,
): { text: string; index: number } {
  if (variants.length === 1) return { text: variants[0], index: 0 };
  const lastIndex = history[key];
  let index = Math.floor(rng() * variants.length);
  if (lastIndex !== undefined) {
    let attempts = 0;
    while (index === lastIndex && attempts < 10) {
      index = Math.floor(rng() * variants.length);
      attempts++;
    }
    if (index === lastIndex) index = (lastIndex + 1) % variants.length; // guaranteed-different fallback
  }
  return { text: variants[index], index };
}

/** Section 7a step 2: the single most notable signal, or null if the player has no scored signals at all. */
export function pickTopSignal(trajectory: TrustTrajectory): { signal: SignalKey; trend: SignalTrend } | null {
  let best: { signal: SignalKey; trend: SignalTrend } | null = null;
  for (const signal of SIGNAL_PRIORITY) {
    const result = trajectory[signal];
    if ("insufficientData" in result) continue;
    if (!best || MAGNITUDE_RANK[result.magnitude] > MAGNITUDE_RANK[best.trend.magnitude]) {
      best = { signal, trend: result };
    }
    // Equal magnitude keeps the earlier (higher-priority) pick, since
    // SIGNAL_PRIORITY is iterated in tie-break order already.
  }
  return best;
}

/** Section 7a steps 2-3: the full sentence for one player, plus the updated rotation history to persist. */
export function generatePlayerReadout(
  name: string,
  trajectory: TrustTrajectory,
  history: ReadoutVariantHistory,
  rng: () => number = Math.random,
): { text: string; updatedHistory: ReadoutVariantHistory } {
  const top = pickTopSignal(trajectory);

  if (top && (top.trend.direction === "rising" || top.trend.direction === "falling")) {
    const { signal, trend } = top;
    // Safe: the `if` above already confirmed direction is one of these two.
    const direction = trend.direction as "rising" | "falling";
    const key = `${signal}_${direction}`;
    const variants = TEMPLATE_BANK[signal][direction];
    const picked = pickVariant(variants, key, history, rng);
    let updatedHistory = { ...history, [key]: picked.index };
    let finalText = picked.text.replace("{name}", name);

    if (trend.magnitude === "sharp") {
      const q = pickVariant(SHARP_QUALIFIERS, "qualifier", updatedHistory, rng);
      updatedHistory = { ...updatedHistory, qualifier: q.index };
      finalText = q.text + finalText;
    }
    return { text: finalText, updatedHistory };
  }

  // Flat direction or no data at all -- same fallback line either way (section 7a step 3).
  const fallback = pickVariant(FALLBACK_LINES, "fallback", history, rng);
  return { text: fallback.text.replace("{name}", name), updatedHistory: { ...history, fallback: fallback.index } };
}

/** Convenience: both government players' readouts in one call, threading the rotation history between them. */
export function generateSessionReadouts(
  presidentName: string,
  presidentTrajectory: TrustTrajectory,
  chancellorName: string,
  chancellorTrajectory: TrustTrajectory,
  history: ReadoutVariantHistory,
  rng: () => number = Math.random,
): { presidentText: string; chancellorText: string; updatedHistory: ReadoutVariantHistory } {
  const pres = generatePlayerReadout(presidentName, presidentTrajectory, history, rng);
  const chan = generatePlayerReadout(chancellorName, chancellorTrajectory, pres.updatedHistory, rng);
  return { presidentText: pres.text, chancellorText: chan.text, updatedHistory: chan.updatedHistory };
}
