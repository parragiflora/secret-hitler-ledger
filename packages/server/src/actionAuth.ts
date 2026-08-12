import type { GameAction } from "@interhuman/shared";

/**
 * The player id who must be the authenticated sender of this action, or null
 * if any connected player in the room may send it (e.g. starting the game).
 */
export function actorIdOf(action: GameAction): string | null {
  switch (action.type) {
    case "JOIN_GAME":
    case "LEAVE_GAME":
    case "SET_CONNECTED":
    case "ACKNOWLEDGE_ROLE":
    case "CAST_VOTE":
      return action.playerId;
    case "NOMINATE_CHANCELLOR":
    case "PRESIDENT_DISCARD":
    case "PRESIDENT_VETO_RESPONSE":
    case "EXECUTIVE_INVESTIGATE":
    case "EXECUTIVE_SPECIAL_ELECTION":
    case "EXECUTIVE_POLICY_PEEK":
    case "EXECUTIVE_EXECUTION":
    case "ACKNOWLEDGE_EXECUTIVE_ACTION":
      return action.presidentId;
    case "CHANCELLOR_ENACT":
    case "CHANCELLOR_PROPOSE_VETO":
    case "ACKNOWLEDGE_POLICY_DEFENSE":
      return action.chancellorId;
    case "START_GAME":
      return null;
    default:
      return null;
  }
}
