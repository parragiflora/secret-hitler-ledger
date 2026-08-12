import { describe, expect, it } from "vitest";
import { assignRoles, getRoleDistribution, isValidPlayerCount } from "../src/roles.js";
import type { Player } from "../src/types.js";
import { seededRng } from "./testUtils.js";

describe("role distribution (section 1 table)", () => {
  it.each([
    [5, 3, 1, true],
    [6, 4, 1, true],
    [7, 4, 2, false],
    [8, 5, 2, false],
    [9, 5, 3, false],
    [10, 6, 3, false],
  ])("player count %i -> %i liberals, %i fascists, hitlerKnowsFascists=%s", (n, libs, fascists, knows) => {
    const dist = getRoleDistribution(n);
    expect(dist.liberals).toBe(libs);
    expect(dist.fascists).toBe(fascists);
    expect(dist.hitler).toBe(1);
    expect(dist.hitlerKnowsFascists).toBe(knows);
    expect(dist.liberals + dist.fascists + dist.hitler).toBe(n);
  });

  it("rejects out-of-range player counts", () => {
    expect(() => getRoleDistribution(4)).toThrow();
    expect(() => getRoleDistribution(11)).toThrow();
    expect(isValidPlayerCount(4)).toBe(false);
    expect(isValidPlayerCount(11)).toBe(false);
    expect(isValidPlayerCount(5)).toBe(true);
    expect(isValidPlayerCount(10)).toBe(true);
  });

  it("assigns exactly one Hitler and the correct team split, roles are stable objects", () => {
    const players: Player[] = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      role: null,
      seatOrder: i,
      isAlive: true,
      isConnected: true,
    }));
    const rng = seededRng(42);
    const withRoles = assignRoles(players, rng);
    expect(withRoles).toHaveLength(9);
    expect(withRoles.filter((p) => p.role === "hitler")).toHaveLength(1);
    expect(withRoles.filter((p) => p.role === "fascist")).toHaveLength(3);
    expect(withRoles.filter((p) => p.role === "liberal")).toHaveLength(5);
    // original players array untouched (pure function)
    expect(players.every((p) => p.role === null)).toBe(true);
  });
});
