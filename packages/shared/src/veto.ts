// Section 4: veto power unlock thresholds by player count.
export function vetoUnlockThreshold(playerCount: number): number | null {
  if (playerCount <= 6) return null; // never unlocks
  if (playerCount <= 8) return 5; // 7-8 players: unlocks at 5 fascist policies
  return 4; // 9-10 players: unlocks at 4 fascist policies
}

export function shouldUnlockVeto(
  playerCount: number,
  fascistPoliciesEnacted: number,
): boolean {
  const threshold = vetoUnlockThreshold(playerCount);
  return threshold !== null && fascistPoliciesEnacted >= threshold;
}
