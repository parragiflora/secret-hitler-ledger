import type { GameState, Player, PolicyType, Role } from "../src/types.js";
import { createGame } from "../src/engine.js";

/** Deterministic PRNG (mulberry32) so tests are reproducible. */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a game already past LOBBY/ROLE_REVEAL, sitting at NOMINATION for
 * round 1, with EXACT roles/seating as given (bypassing random assignment)
 * so edge-case tests can control who is Hitler/fascist/liberal.
 */
export function makeStateWithRoles(roles: Role[], deckOverride?: PolicyType[]): { state: GameState; ids: string[] } {
  const ids = roles.map((_, i) => `p${i}`);
  const players: Player[] = roles.map((role, i) => ({
    id: ids[i],
    name: `Player${i}`,
    role,
    seatOrder: i,
    isAlive: true,
    isConnected: true,
  }));
  let state = createGame("g1", "CODE1");
  state = {
    ...state,
    phase: "NOMINATION",
    playerCount: players.length,
    players,
    roundNumber: 1,
    presidentId: ids[0],
    drawPile: deckOverride ?? defaultDeckFavoring("fascist"),
  };
  return { state, ids };
}

/** A deck ordered to draw a particular policy type first, for deterministic legislative tests. */
export function defaultDeckFavoring(type: PolicyType, length = 17): PolicyType[] {
  const other: PolicyType = type === "fascist" ? "liberal" : "fascist";
  return Array.from({ length }, (_, i) => (i < length - 3 ? type : other));
}
