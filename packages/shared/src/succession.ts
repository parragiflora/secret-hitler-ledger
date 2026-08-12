// Section 3: presidency succession & term limits.
import type { Player } from "./types.js";

/** Next alive player clockwise (by seatOrder) after the given seat, wrapping around. */
export function nextAlivePlayerClockwise(
  players: Player[],
  afterSeatOrder: number,
): Player | null {
  const alive = players.filter((p) => p.isAlive).sort((a, b) => a.seatOrder - b.seatOrder);
  if (alive.length === 0) return null;
  const next = alive.find((p) => p.seatOrder > afterSeatOrder);
  return next ?? alive[0];
}

export function seatOrderOf(players: Player[], playerId: string): number {
  const p = players.find((pl) => pl.id === playerId);
  if (!p) throw new Error(`Unknown player ${playerId}`);
  return p.seatOrder;
}

/**
 * Whether the President is also term-limited (in addition to the Chancellor
 * always being term-limited). Section 3: only in games of 7+ players.
 */
export function presidentTermLimitApplies(playerCount: number): boolean {
  return playerCount >= 7;
}

/**
 * Is `nomineeId` eligible to be nominated as Chancellor, respecting term
 * limits, but falling back to "eligible" if term limits would leave zero
 * eligible nominees (standard Secret Hitler rule for small end-game player
 * pools after executions -- not explicit in the spec doc but required for a
 * playable end state).
 */
export function eligibleChancellorNominees(
  players: Player[],
  presidentId: string,
  termLimitedChancellorId: string | null,
  termLimitedPresidentId: string | null,
): Player[] {
  const alive = players.filter((p) => p.isAlive);
  const strict = alive.filter(
    (p) =>
      p.id !== presidentId &&
      p.id !== termLimitedChancellorId &&
      p.id !== termLimitedPresidentId,
  );
  if (strict.length > 0) return strict;
  // Fallback: relax term limits (but never allow nominating yourself).
  return alive.filter((p) => p.id !== presidentId);
}
