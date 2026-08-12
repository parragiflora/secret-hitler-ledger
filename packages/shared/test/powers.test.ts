import { describe, expect, it } from "vitest";
import { powerForSlot } from "../src/powers.js";

describe("executive powers by fascist slot (section 5)", () => {
  it("5-6 players", () => {
    expect(powerForSlot(5, 1)).toBeNull();
    expect(powerForSlot(6, 2)).toBeNull();
    expect(powerForSlot(5, 3)).toBe("policy_peek");
    expect(powerForSlot(6, 4)).toBe("execution");
    expect(powerForSlot(5, 5)).toBe("execution");
    expect(powerForSlot(6, 6)).toBeNull();
  });

  it("7-8 players", () => {
    expect(powerForSlot(7, 1)).toBeNull();
    expect(powerForSlot(8, 2)).toBe("investigate_loyalty");
    expect(powerForSlot(7, 3)).toBe("special_election");
    expect(powerForSlot(8, 4)).toBe("execution");
    expect(powerForSlot(7, 5)).toBe("execution");
    expect(powerForSlot(8, 6)).toBeNull();
  });

  it("9-10 players", () => {
    expect(powerForSlot(9, 1)).toBe("investigate_loyalty");
    expect(powerForSlot(10, 2)).toBe("investigate_loyalty");
    expect(powerForSlot(9, 3)).toBe("special_election");
    expect(powerForSlot(10, 4)).toBe("execution");
    expect(powerForSlot(9, 5)).toBe("execution");
    expect(powerForSlot(10, 6)).toBeNull();
  });
});
