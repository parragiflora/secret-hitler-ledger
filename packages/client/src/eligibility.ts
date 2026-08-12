import type { PlayerView } from "@interhuman/shared";

/**
 * Mirrors succession.ts's eligibleChancellorNominees for UI purposes only --
 * the server is the actual authority and will reject an ineligible pick.
 */
export function eligibleNomineeIds(view: PlayerView): string[] {
  const alive = view.players.filter((p) => p.isAlive);
  const strict = alive.filter(
    (p) => p.id !== view.presidentId && p.id !== view.termLimitedChancellorId && p.id !== view.termLimitedPresidentId,
  );
  const pool = strict.length > 0 ? strict : alive.filter((p) => p.id !== view.presidentId);
  return pool.map((p) => p.id);
}
