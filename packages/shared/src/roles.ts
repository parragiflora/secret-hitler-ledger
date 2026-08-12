// Section 1: player count -> role distribution.
import type { Player, PlayerCount, Role } from "./types.js";
import { GameRuleError } from "./types.js";

export interface RoleDistribution {
  liberals: number;
  fascists: number; // non-Hitler fascists
  hitler: 1;
  hitlerKnowsFascists: boolean;
}

const ROLE_TABLE: Record<PlayerCount, RoleDistribution> = {
  5: { liberals: 3, fascists: 1, hitler: 1, hitlerKnowsFascists: true },
  6: { liberals: 4, fascists: 1, hitler: 1, hitlerKnowsFascists: true },
  7: { liberals: 4, fascists: 2, hitler: 1, hitlerKnowsFascists: false },
  8: { liberals: 5, fascists: 2, hitler: 1, hitlerKnowsFascists: false },
  9: { liberals: 5, fascists: 3, hitler: 1, hitlerKnowsFascists: false },
  10: { liberals: 6, fascists: 3, hitler: 1, hitlerKnowsFascists: false },
};

export function isValidPlayerCount(n: number): n is PlayerCount {
  return Number.isInteger(n) && n >= 5 && n <= 10;
}

export function getRoleDistribution(playerCount: number): RoleDistribution {
  if (!isValidPlayerCount(playerCount)) {
    throw new GameRuleError(
      `Invalid player count ${playerCount}: Secret Hitler requires 5-10 players.`,
    );
  }
  return ROLE_TABLE[playerCount];
}

/** Fisher-Yates shuffle using a supplied PRNG (for deterministic tests). */
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Assigns roles to players in place order, returning new Player objects. Roles never change after this (section 1). */
export function assignRoles(players: Player[], rng: () => number): Player[] {
  const dist = getRoleDistribution(players.length);
  const roles: Role[] = [
    ...Array(dist.liberals).fill("liberal"),
    ...Array(dist.fascists).fill("fascist"),
    "hitler",
  ];
  const shuffled = shuffle(roles, rng);
  return players.map((p, i) => ({ ...p, role: shuffled[i] }));
}

/** Team each role belongs to for win-condition purposes. */
export function teamOf(role: Role): "liberal" | "fascist" {
  return role === "liberal" ? "liberal" : "fascist";
}
