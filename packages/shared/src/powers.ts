// Section 5: executive powers by fascist policy slot, keyed by player-count bracket.
import type { ExecutivePowerType } from "./types.js";

export type PlayerCountBracket = "5-6" | "7-8" | "9-10";

export function bracketFor(playerCount: number): PlayerCountBracket {
  if (playerCount <= 6) return "5-6";
  if (playerCount <= 8) return "7-8";
  return "9-10";
}

// Row index = fascist policy slot (1-6), matching the table in section 5.
const POWER_TABLE: Record<PlayerCountBracket, (ExecutivePowerType | null)[]> = {
  //                    slot1 slot2                  slot3               slot4        slot5        slot6
  "5-6": [null, null, "policy_peek", "execution", "execution", null],
  "7-8": [null, "investigate_loyalty", "special_election", "execution", "execution", null],
  "9-10": ["investigate_loyalty", "investigate_loyalty", "special_election", "execution", "execution", null],
};

/**
 * `fascistSlot` is 1-indexed (the Nth fascist policy enacted this game,
 * matching the fascist track's slot numbering in section 5).
 */
export function powerForSlot(
  playerCount: number,
  fascistSlot: number,
): ExecutivePowerType | null {
  const bracket = bracketFor(playerCount);
  const row = POWER_TABLE[bracket];
  if (fascistSlot < 1 || fascistSlot > row.length) return null;
  return row[fascistSlot - 1];
}
