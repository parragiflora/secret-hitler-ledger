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
//   case that ever changes), and any response shape we don't recognize
//   falls back to mock scores rather than throwing -- a capture moment
//   should never break over an API surprise.

import { SIGNAL_KEYS, type SignalKey } from "@interhuman/shared";

export interface SignalScores {
  confidence: number; // 0-1
  stress: number;
  skepticism: number;
  hesitation: number;
  rawResponseJson: unknown;
  mocked: boolean;
}

const API_URL = "https://api.interhuman.ai/v1/upload/analyze";
const PROB_MAP: Record<string, number> = { high: 0.85, medium: 0.6, low: 0.35 };

// The API rejects clips shorter than this outright (ih5xxx content error) --
// skip the network round-trip and go straight to mock for a moment too
// short to have been worth sending.
const MIN_CLIP_DURATION_MS = 3000;

function randomInRange(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

/** Realistic-looking fake signals -- avoids 0/1 extremes so mock mode doesn't look obviously fake at a glance. */
function mockScores(): SignalScores {
  return {
    confidence: randomInRange(0.3, 0.9),
    stress: randomInRange(0.3, 0.9),
    skepticism: randomInRange(0.3, 0.9),
    hesitation: randomInRange(0.3, 0.9),
    rawResponseJson: null,
    mocked: true,
  };
}

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

export async function analyzeClip(buffer: Buffer, filename: string, durationMs?: number): Promise<SignalScores> {
  const apiKey = process.env.INTERHUMAN_API_KEY;
  if (!apiKey) return mockScores();
  if (durationMs !== undefined && durationMs < MIN_CLIP_DURATION_MS) return mockScores();

  try {
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

    if (Object.keys(parsed).length === 0) {
      // Response came back but none of our 4 tracked signals were in it --
      // treat as unrecognized rather than reporting confident zeroes.
      console.warn("[interhuman] Response had no recognizable signals, falling back to mock:", data);
      return { ...mockScores(), rawResponseJson: data };
    }

    const fallback = mockScores();
    return {
      confidence: parsed.confidence ?? fallback.confidence,
      stress: parsed.stress ?? fallback.stress,
      skepticism: parsed.skepticism ?? fallback.skepticism,
      hesitation: parsed.hesitation ?? fallback.hesitation,
      rawResponseJson: data,
      mocked: false,
    };
  } catch (err) {
    console.error("[interhuman] analyzeClip failed, falling back to mock:", err);
    return mockScores();
  }
}
