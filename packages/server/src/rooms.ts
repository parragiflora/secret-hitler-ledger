import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { createGame, type GameState, type ReadoutVariantHistory, type SpecialSessionTriggerReason } from "@interhuman/shared";
import type { SignalScores } from "./interhuman.js";

// Avoid visually ambiguous characters (0/O, 1/I) in room codes.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Section 8's special_sessions log entry, minus the id/game_id (implicit --
// this array already lives on that one game's Room).
export interface SpecialSessionLogEntry {
  id: string;
  roundNumber: number;
  triggerReason: SpecialSessionTriggerReason;
  presidentId: string;
  chancellorId: string;
  presidentReadout: string;
  chancellorReadout: string;
  createdAt: string;
}

export interface Room {
  code: string;
  state: GameState;
  tokens: Map<string, string>; // playerId -> reconnect token
  sockets: Map<string, WebSocket>; // playerId -> live socket
  // Section 9 step 3: analyzed signal scores per speechEvent id. Kept outside
  // GameState/the engine reducer on purpose -- analysis is async I/O against
  // an external API, not deterministic game-rule state, so it doesn't belong
  // in the pure, synchronous, unit-testable reducer.
  signalScores: Map<string, SignalScores>;
  // Section 7: readouts for the CURRENTLY open Special Session (cached so
  // repeat views -- e.g. a reconnecting player -- see the identical text
  // rather than re-rolling variant rotation), cleared once it's dismissed.
  currentSpecialSessionReadouts: { presidentReadout: string; chancellorReadout: string } | null;
  // Section 7a step 3's "avoid repeating the exact same sentence twice in
  // one game" rotation memory, keyed by e.g. "skepticism_rising".
  readoutVariantHistory: ReadoutVariantHistory;
  // Full history for the eventual end-game recap (section 9 step 6, not
  // built yet) -- section 8's special_sessions table.
  specialSessions: SpecialSessionLogEntry[];
}

const rooms = new Map<string, Room>();

function generateCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

export function createRoom(): Room {
  const code = generateCode();
  const room: Room = {
    code,
    state: createGame(randomUUID(), code),
    tokens: new Map(),
    sockets: new Map(),
    signalScores: new Map(),
    currentSpecialSessionReadouts: null,
    readoutVariantHistory: {},
    specialSessions: [],
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function deleteRoom(code: string): void {
  rooms.delete(code.toUpperCase());
}
