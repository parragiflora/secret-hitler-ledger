import { describe, expect, it } from "vitest";
import { generatePlayerReadout, generateSessionReadouts, pickTopSignal, type ReadoutVariantHistory } from "../src/readout.js";
import type { TrustTrajectory } from "../src/trustTrajectory.js";
import { seededRng } from "./testUtils.js";

const insufficient: TrustTrajectory = {
  confidence: { insufficientData: true },
  stress: { insufficientData: true },
  skepticism: { insufficientData: true },
  hesitation: { insufficientData: true },
};

describe("pickTopSignal (section 7a step 2)", () => {
  it("returns null when every signal is insufficient data", () => {
    expect(pickTopSignal(insufficient)).toBeNull();
  });

  it("picks the highest-magnitude signal", () => {
    const trajectory: TrustTrajectory = {
      ...insufficient,
      confidence: { direction: "rising", magnitude: "slight" },
      stress: { direction: "falling", magnitude: "sharp" },
    };
    expect(pickTopSignal(trajectory)).toEqual({ signal: "stress", trend: { direction: "falling", magnitude: "sharp" } });
  });

  it("tie-breaks equal magnitudes by priority: skepticism > stress > confidence > hesitation", () => {
    const trajectory: TrustTrajectory = {
      confidence: { direction: "rising", magnitude: "notable" },
      stress: { direction: "rising", magnitude: "notable" },
      skepticism: { direction: "rising", magnitude: "notable" },
      hesitation: { direction: "rising", magnitude: "notable" },
    };
    expect(pickTopSignal(trajectory)!.signal).toBe("skepticism");

    const withoutSkepticism: TrustTrajectory = { ...trajectory, skepticism: { insufficientData: true } };
    expect(pickTopSignal(withoutSkepticism)!.signal).toBe("stress");
  });
});

describe("generatePlayerReadout (section 7a steps 2-4)", () => {
  const rng = seededRng(42);

  it("falls back to a generic line when there's no data at all", () => {
    const result = generatePlayerReadout("Alice", insufficient, {}, rng);
    expect(result.text).toContain("Alice");
    expect(result.text.toLowerCase()).toMatch(/not yet gathered|too thin/);
  });

  it("falls back to a generic line when the top signal is flat", () => {
    const flat: TrustTrajectory = { ...insufficient, confidence: { direction: "flat", magnitude: "slight" } };
    const result = generatePlayerReadout("Bob", flat, {}, rng);
    expect(result.text).toContain("Bob");
    expect(result.text.toLowerCase()).toMatch(/not yet gathered|too thin/);
  });

  it("uses the rising template family and substitutes the name", () => {
    const trajectory: TrustTrajectory = { ...insufficient, skepticism: { direction: "rising", magnitude: "notable" } };
    const result = generatePlayerReadout("Carol", trajectory, {}, rng);
    expect(result.text).toContain("Carol");
    expect(result.text.toLowerCase()).toMatch(/skeptic|doubtful/);
    expect(result.text).not.toContain("{name}");
  });

  it("uses the falling template family", () => {
    const trajectory: TrustTrajectory = { ...insufficient, confidence: { direction: "falling", magnitude: "notable" } };
    const result = generatePlayerReadout("Dave", trajectory, {}, rng);
    expect(result.text.toLowerCase()).toMatch(/certainty|conviction/);
  });

  it("prepends a qualifier only for sharp magnitude, never slight/notable", () => {
    const sharp: TrustTrajectory = { ...insufficient, stress: { direction: "rising", magnitude: "sharp" } };
    const notable: TrustTrajectory = { ...insufficient, stress: { direction: "rising", magnitude: "notable" } };
    const sharpResult = generatePlayerReadout("Eve", sharp, {}, rng);
    const notableResult = generatePlayerReadout("Eve", notable, {}, rng);
    expect(["Sharply, ", "Markedly, ", "A stark shift -- "].some((q) => sharpResult.text.startsWith(q))).toBe(true);
    expect(["Sharply, ", "Markedly, ", "A stark shift -- "].some((q) => notableResult.text.startsWith(q))).toBe(false);
  });

  it("avoids repeating the exact same sentence twice in a row for the same signal+direction", () => {
    const trajectory: TrustTrajectory = { ...insufficient, skepticism: { direction: "rising", magnitude: "notable" } };
    let history: ReadoutVariantHistory = {};
    let previousText: string | null = null;
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const result = generatePlayerReadout("Frank", trajectory, history, rng);
      if (previousText !== null) expect(result.text).not.toBe(previousText);
      previousText = result.text;
      history = result.updatedHistory;
      seen.add(result.text);
    }
    // With 2 variants and rotation avoiding immediate repeats, both should get used.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("generateSessionReadouts", () => {
  it("produces both players' text and threads rotation history between them", () => {
    const trajectory: TrustTrajectory = { ...insufficient, skepticism: { direction: "rising", magnitude: "notable" } };
    const result = generateSessionReadouts("President Alice", trajectory, "Chancellor Bob", trajectory, {}, seededRng(7));
    expect(result.presidentText).toContain("President Alice");
    expect(result.chancellorText).toContain("Chancellor Bob");
    // Same signal+direction bucket for both -- history threading should mean
    // they don't necessarily land on the same variant (can't assert which,
    // but the returned history must reflect the SECOND (Chancellor) pick).
    expect(result.updatedHistory.skepticism_rising).toBeDefined();
  });
});
