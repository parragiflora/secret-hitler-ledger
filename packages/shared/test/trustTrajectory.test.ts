import { describe, expect, it } from "vitest";
import {
  computeAmbientTension,
  computeSignalTrend,
  computeTrustTrajectory,
  type TrustTrajectory,
} from "../src/trustTrajectory.js";

describe("computeSignalTrend (section 7a step 1)", () => {
  it("reports insufficient data with 0 or 1 values", () => {
    expect(computeSignalTrend([])).toEqual({ insufficientData: true });
    expect(computeSignalTrend([0.5])).toEqual({ insufficientData: true });
  });

  it("with exactly 2 values (no earlier baseline), reads as flat", () => {
    expect(computeSignalTrend([0.9, 0.1])).toEqual({ direction: "flat", magnitude: "slight" });
  });

  it("detects a rising trend", () => {
    // earlier avg 0.2, recent avg 0.8 -> big rise
    expect(computeSignalTrend([0.2, 0.2, 0.8, 0.8])).toEqual({ direction: "rising", magnitude: "sharp" });
  });

  it("detects a falling trend", () => {
    expect(computeSignalTrend([0.8, 0.8, 0.2, 0.2])).toEqual({ direction: "falling", magnitude: "sharp" });
  });

  it("reads a small delta as flat", () => {
    // earlier avg 0.5, recent avg 0.55 -> delta 0.05, within ±10%
    expect(computeSignalTrend([0.5, 0.5, 0.5, 0.6])).toEqual({ direction: "flat", magnitude: "slight" });
  });

  it("buckets magnitude: slight / notable / sharp", () => {
    // earlier avg 0.5, recent avg 0.65 -> delta 0.15 -> notable (upper bound inclusive)
    expect(computeSignalTrend([0.5, 0.5, 0.6, 0.7])).toEqual({ direction: "rising", magnitude: "notable" });
    // earlier avg 0.5, recent avg 0.86 -> delta 0.36 -> sharp
    expect(computeSignalTrend([0.5, 0.5, 0.82, 0.9])).toEqual({ direction: "rising", magnitude: "sharp" });
  });

  it("only compares the last 2 against everything earlier, not just the immediately preceding value", () => {
    // earlier = [0.1, 0.1, 0.1] avg 0.1; recent = [0.9, 0.9] avg 0.9 -> sharp rise
    expect(computeSignalTrend([0.1, 0.1, 0.1, 0.9, 0.9])).toEqual({ direction: "rising", magnitude: "sharp" });
  });
});

describe("computeTrustTrajectory", () => {
  it("computes all 4 signals independently", () => {
    const trajectory = computeTrustTrajectory({
      confidence: [0.2, 0.2, 0.9, 0.9], // rising
      stress: [0.9, 0.9, 0.2, 0.2], // falling
      skepticism: [0.5], // insufficient
      hesitation: [0.5, 0.5, 0.5, 0.52], // flat
    });
    expect(trajectory.confidence).toEqual({ direction: "rising", magnitude: "sharp" });
    expect(trajectory.stress).toEqual({ direction: "falling", magnitude: "sharp" });
    expect(trajectory.skepticism).toEqual({ insufficientData: true });
    expect(trajectory.hesitation).toEqual({ direction: "flat", magnitude: "slight" });
  });
});

describe("computeAmbientTension (section 7 passive tracking)", () => {
  const insufficient: TrustTrajectory = {
    confidence: { insufficientData: true },
    stress: { insufficientData: true },
    skepticism: { insufficientData: true },
    hesitation: { insufficientData: true },
  };
  const oneSwing: TrustTrajectory = {
    ...insufficient,
    confidence: { direction: "rising", magnitude: "notable" },
  };
  const allSharp: TrustTrajectory = {
    confidence: { direction: "rising", magnitude: "sharp" },
    stress: { direction: "falling", magnitude: "sharp" },
    skepticism: { direction: "rising", magnitude: "sharp" },
    hesitation: { direction: "falling", magnitude: "sharp" },
  };

  it("is calm with no or few notable/sharp swings, and ignores insufficient-data and slight entries", () => {
    expect(computeAmbientTension([])).toBe("calm");
    expect(computeAmbientTension([insufficient, insufficient])).toBe("calm");
    expect(computeAmbientTension([oneSwing])).toBe("calm"); // only 1 swing, below the restless threshold
  });

  it("becomes restless at 2+ notable/sharp swings across the table", () => {
    expect(computeAmbientTension([oneSwing, oneSwing])).toBe("restless"); // 2 swings total
  });

  it("becomes charged at 5+ notable/sharp swings across the table", () => {
    expect(computeAmbientTension([allSharp])).toBe("restless"); // 4 swings from one player -- still under 5
    expect(computeAmbientTension([allSharp, oneSwing])).toBe("charged"); // 5 swings total
  });

  it("never reveals which player or signal drove the reading -- callers only get the aggregate level", () => {
    const level = computeAmbientTension([allSharp]);
    expect(["calm", "restless", "charged"]).toContain(level);
  });
});
