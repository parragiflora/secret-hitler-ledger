import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeClip, parseSignalsResponse } from "../src/interhuman.js";

describe("parseSignalsResponse", () => {
  it("picks out our 4 tracked signals and ignores everything else Interhuman returns", () => {
    const data = {
      signals: [
        { type: "confidence", probability: 0.72, rationale: "steady tone" },
        { type: "Stress", probability: 0.4 },
        { type: "agreement", probability: 0.9 }, // not one of our 4 -- must be ignored
        { type: "hesitation", probability: 0.15 },
      ],
    };
    expect(parseSignalsResponse(data)).toEqual({ confidence: 0.72, stress: 0.4, hesitation: 0.15 });
  });

  it("maps high/medium/low probability strings to numbers", () => {
    const data = { signals: [{ type: "skepticism", probability: "high" }, { type: "stress", probability: "low" }] };
    expect(parseSignalsResponse(data)).toEqual({ skepticism: 0.85, stress: 0.35 });
  });

  it("normalizes underscored/spaced/mixed-case type names", () => {
    const data = { signals: [{ type: "Confidence", probability: 0.5 }] };
    expect(parseSignalsResponse(data)).toEqual({ confidence: 0.5 });
  });

  it("returns {} for a missing or malformed signals array", () => {
    expect(parseSignalsResponse({})).toEqual({});
    expect(parseSignalsResponse({ signals: "not an array" })).toEqual({});
    expect(parseSignalsResponse(null)).toEqual({});
    expect(parseSignalsResponse(undefined)).toEqual({});
  });

  it("skips entries with an unparseable probability", () => {
    const data = { signals: [{ type: "confidence", probability: "not a number" }] };
    expect(parseSignalsResponse(data)).toEqual({});
  });
});

// Section 9 step 3, revised: the Interhuman API is a hard requirement, not
// an optional enhancement -- there is no mock-data fallback anywhere in
// analyzeClip. Every failure mode throws instead of substituting fabricated
// scores; the caller (index.ts's clip-upload route) is responsible for
// turning that into "no signal_scores entry for this event," the same
// place a skipped speech already ends up.
describe("analyzeClip", () => {
  const originalKey = process.env.INTERHUMAN_API_KEY;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.INTERHUMAN_API_KEY;
    else process.env.INTERHUMAN_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("throws if no API key is configured", async () => {
    delete process.env.INTERHUMAN_API_KEY;
    await expect(analyzeClip(Buffer.from("fake clip"), "clip.webm")).rejects.toThrow(/INTERHUMAN_API_KEY/);
  });

  it("throws for a clip shorter than the minimum duration, without calling the API", async () => {
    process.env.INTERHUMAN_API_KEY = "test-key";
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(analyzeClip(Buffer.from("fake clip"), "clip.webm", 1000)).rejects.toThrow(/too short/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the real API and returns parsed scores when a key is present", async () => {
    process.env.INTERHUMAN_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        signals: [
          { type: "confidence", probability: 0.9 },
          { type: "stress", probability: 0.2 },
          { type: "skepticism", probability: 0.5 },
          { type: "hesitation", probability: 0.1 },
        ],
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await analyzeClip(Buffer.from("fake clip"), "clip.webm");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.interhuman.ai/v1/upload/analyze");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");

    expect(result).toMatchObject({ confidence: 0.9, stress: 0.2, skepticism: 0.5, hesitation: 0.1 });
  });

  it("throws if the API call itself throws (network error)", async () => {
    process.env.INTERHUMAN_API_KEY = "test-key";
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    await expect(analyzeClip(Buffer.from("fake clip"), "clip.webm")).rejects.toThrow("network down");
  });

  it("throws if the API responds with a non-OK status", async () => {
    process.env.INTERHUMAN_API_KEY = "test-key";
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

    await expect(analyzeClip(Buffer.from("fake clip"), "clip.webm")).rejects.toThrow(/500/);
  });

  it("throws if the response has none of our 4 tracked signals", async () => {
    process.env.INTERHUMAN_API_KEY = "test-key";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ signals: [{ type: "agreement", probability: 0.9 }] }),
    }) as unknown as typeof fetch;

    await expect(analyzeClip(Buffer.from("fake clip"), "clip.webm")).rejects.toThrow(/missing tracked signal/);
  });

  it("throws if the response is missing even one of our 4 tracked signals", async () => {
    process.env.INTERHUMAN_API_KEY = "test-key";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        signals: [
          { type: "confidence", probability: 0.9 },
          { type: "stress", probability: 0.2 },
          { type: "skepticism", probability: 0.5 },
          // hesitation missing
        ],
      }),
    }) as unknown as typeof fetch;

    await expect(analyzeClip(Buffer.from("fake clip"), "clip.webm")).rejects.toThrow(/hesitation/);
  });
});
