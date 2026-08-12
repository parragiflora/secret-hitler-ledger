import { describe, expect, it } from "vitest";
import { shouldUnlockVeto, vetoUnlockThreshold } from "../src/veto.js";

describe("veto unlock thresholds (section 4)", () => {
  it("never unlocks for 5-6 players", () => {
    expect(vetoUnlockThreshold(5)).toBeNull();
    expect(vetoUnlockThreshold(6)).toBeNull();
    expect(shouldUnlockVeto(5, 11)).toBe(false);
  });

  it("unlocks at 5 fascist policies for 7-8 players", () => {
    expect(vetoUnlockThreshold(7)).toBe(5);
    expect(shouldUnlockVeto(7, 4)).toBe(false);
    expect(shouldUnlockVeto(7, 5)).toBe(true);
  });

  it("unlocks at 4 fascist policies for 9-10 players", () => {
    expect(vetoUnlockThreshold(9)).toBe(4);
    expect(shouldUnlockVeto(10, 3)).toBe(false);
    expect(shouldUnlockVeto(10, 4)).toBe(true);
  });
});
