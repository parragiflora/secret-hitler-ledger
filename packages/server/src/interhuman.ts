// Server-side proxy to the Interhuman API (section 9 step 3: "reuse Signal
// Game / Moonrise proxy pattern"). Turns a captured speech clip into exactly
// the 4 signals this build tracks (section 7a / section 8's signal_scores
// schema): confidence, stress, skepticism, hesitation.
//
// Contract confirmed against the official docs (linked from the API's own
// error responses): https://docs.interhuman.ai/api-reference/upload-analyze
//   POST /v1/upload/analyze, multipart `file` (mp4/avi/mov/mkv/mpeg-ts/webm,
//   3s-32MB), Authorization: Bearer <key>, optional include[] of
//   "conversation_quality_overall" | "conversation_quality_timeline".
//   Response: { signals: [{ type, probability, rationale, ... }], ... }
//   where `type` is one of 13 enum values (confidence, stress, skepticism,
//   and hesitation among them -- exactly the 4 this build tracks) and
//   `probability` is ALWAYS the string enum "high" | "medium" | "low", never
//   numeric. Parsing still tolerates a numeric probability defensively (in
//   case that ever changes).
//
// The Interhuman API is a hard requirement, not an optional enhancement --
// there is no mock-data fallback anywhere in this module. A missing key,
// a failed call, a non-OK response, or a response missing one of our 4
// tracked signals all throw rather than substituting fabricated numbers.
// The server refuses to even start without a key (see index.ts); a capture
// moment whose analysis fails simply gets no signal_scores entry for that
// event (the same "insufficient data" path an intentionally-skipped speech
// already takes), rather than a fake reading standing in for a real one.

import { SIGNAL_KEYS, type SignalKey } from "@interhuman/shared";

export interface SignalScores {
  confidence: number; // 0-1
  stress: number;
  skepticism: number;
  hesitation: number;
  rawResponseJson: unknown;
}

const API_URL = "https://api.interhuman.ai/v1/upload/analyze";
const PROB_MAP: Record<string, number> = { high: 0.85, medium: 0.6, low: 0.35 };

// The API rejects clips shorter than this outright (ih5xxx content error) --
// skip the network round-trip for a moment too short to have been worth
// sending.
const MIN_CLIP_DURATION_MS = 3000;

function normalizeProbability(raw: unknown): number | null {
  if (typeof raw === "string") {
    const mapped = PROB_MAP[raw.toLowerCase()];
    if (mapped !== undefined) return mapped;
  }
  // Defensive fallback only -- the confirmed contract is always the string
  // enum above, never numeric.
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.min(1, raw));
  return null;
}

/** Picks our 4 tracked signals out of Interhuman's 13-value `signals` list. */
export function parseSignalsResponse(data: unknown): Partial<Record<SignalKey, number>> {
  const out: Partial<Record<SignalKey, number>> = {};
  const signals = (data as { signals?: unknown } | null)?.signals;
  if (!Array.isArray(signals)) return out;
  for (const entry of signals) {
    if (!entry || typeof entry !== "object") continue;
    const typeRaw = String((entry as { type?: unknown }).type ?? "")
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
    const key = SIGNAL_KEYS.find((k) => k === typeRaw);
    if (!key) continue;
    const prob = normalizeProbability((entry as { probability?: unknown }).probability);
    if (prob !== null) out[key] = prob;
  }
  return out;
}

/** Throws (never returns fabricated scores) if the key is missing, the call fails, or the response doesn't cover all 4 tracked signals. */
export async function analyzeClip(buffer: Buffer, filename: string, durationMs?: number): Promise<SignalScores> {
  const apiKey = process.env.INTERHUMAN_API_KEY;
  if (!apiKey) {
    // Startup already refuses to run without a key (index.ts) -- this is
    // just a defensive backstop, should be unreachable in practice.
    throw new Error("INTERHUMAN_API_KEY is not set.");
  }
  if (durationMs !== undefined && durationMs < MIN_CLIP_DURATION_MS) {
    throw new Error(`Clip is too short to analyze (${durationMs}ms, minimum ${MIN_CLIP_DURATION_MS}ms).`);
  }

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "video/webm" }), filename);
  form.append("include[]", "conversation_quality_overall");
  form.append("include[]", "conversation_quality_timeline");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Interhuman API responded ${res.status}`);
  const data: unknown = await res.json();
  const parsed = parseSignalsResponse(data);

  const missing = SIGNAL_KEYS.filter((k) => parsed[k] === undefined);
  if (missing.length > 0) {
    throw new Error(`Interhuman response was missing tracked signal(s): ${missing.join(", ")}.`);
  }

  return {
    confidence: parsed.confidence!,
    stress: parsed.stress!,
    skepticism: parsed.skepticism!,
    hesitation: parsed.hesitation!,
    rawResponseJson: data,
  };
}
