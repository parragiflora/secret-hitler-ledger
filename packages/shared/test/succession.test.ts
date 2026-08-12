import { describe, expect, it } from "vitest";
import { eligibleChancellorNominees, nextAlivePlayerClockwise, presidentTermLimitApplies } from "../src/succession.js";
import type { Player } from "../src/types.js";

function makePlayers(n: number, deadSeats: number[] = []): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    role: "liberal",
    seatOrder: i,
    isAlive: !deadSeats.includes(i),
    isConnected: true,
  }));
}

describe("presidency succession (section 3)", () => {
  it("passes clockwise and wraps around", () => {
    const players = makePlayers(5);
    expect(nextAlivePlayerClockwise(players, 0)?.id).toBe("p1");
    expect(nextAlivePlayerClockwise(players, 4)?.id).toBe("p0"); // wraps
  });

  it("skips dead players", () => {
    const players = makePlayers(5, [1, 2]);
    expect(nextAlivePlayerClockwise(players, 0)?.id).toBe("p3");
  });

  it("returns null if nobody is alive", () => {
    const players = makePlayers(3, [0, 1, 2]);
    expect(nextAlivePlayerClockwise(players, 0)).toBeNull();
  });

  it("president term limit only applies at 7+ players", () => {
    expect(presidentTermLimitApplies(5)).toBe(false);
    expect(presidentTermLimitApplies(6)).toBe(false);
    expect(presidentTermLimitApplies(7)).toBe(true);
    expect(presidentTermLimitApplies(10)).toBe(true);
  });

  it("excludes the term-limited chancellor and (7+p) term-limited president from nominees", () => {
    const players = makePlayers(7);
    const eligible = eligibleChancellorNominees(players, "p0", "p1", "p2");
    const ids = eligible.map((p) => p.id);
    expect(ids).not.toContain("p0"); // can't nominate self
    expect(ids).not.toContain("p1"); // term-limited chancellor
    expect(ids).not.toContain("p2"); // term-limited president (7+p)
    expect(ids).toEqual(["p3", "p4", "p5", "p6"]);
  });

  it("falls back to ignoring term limits when they'd leave zero eligible nominees", () => {
    // Tiny alive pool where strict term limits would exclude everyone but the president.
    const players = makePlayers(3, []); // 3 alive: p0 (president), p1 (TL chancellor), p2 (TL president)
    const eligible = eligibleChancellorNominees(players, "p0", "p1", "p2");
    const ids = eligible.map((p) => p.id);
    expect(ids).toEqual(["p1", "p2"]); // term limits relaxed, self still excluded
  });
});
