// Section 2 (CHECK_WIN_CONDITIONS) win condition checks.
import type { Player, WinReason, WinningTeam } from "./types.js";

export interface WinCheckResult {
  winner: WinningTeam;
  reason: WinReason | null;
}

const NO_WIN: WinCheckResult = { winner: null, reason: null };

/**
 * Checked after every policy enactment and every executive action.
 * - Liberal win: 5 Liberal policies enacted, OR Hitler is executed.
 * - Fascist win: 6 Fascist policies enacted.
 * (The "Hitler elected Chancellor" fascist win is a distinct, earlier check
 * that happens at ELECTION_VOTE resolution -- see isHitlerChancellorWin below
 * -- since it fires before the legislative phase even runs.)
 */
export function checkPolicyAndExecutionWin(
  liberalPoliciesEnacted: number,
  fascistPoliciesEnacted: number,
  players: Player[],
): WinCheckResult {
  if (liberalPoliciesEnacted >= 5) return { winner: "liberal", reason: "liberal_policies" };
  const hitler = players.find((p) => p.role === "hitler");
  if (hitler && !hitler.isAlive) return { winner: "liberal", reason: "hitler_executed" };
  if (fascistPoliciesEnacted >= 6) return { winner: "fascist", reason: "fascist_policies" };
  return NO_WIN;
}

/**
 * Section 2, ELECTION_VOTE special rule: if the 3rd (or later) Fascist policy
 * has already been enacted AND the confirmed Chancellor-elect is Hitler AND
 * the election vote passes -> immediate Fascist win, skipping the
 * legislative phase entirely.
 */
export function isHitlerChancellorWin(
  fascistPoliciesEnacted: number,
  chancellorElect: Player | undefined,
): boolean {
  return fascistPoliciesEnacted >= 3 && chancellorElect?.role === "hitler";
}
