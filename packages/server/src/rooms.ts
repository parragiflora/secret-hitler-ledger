import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { createGame, type GameState } from "@interhuman/shared";
import type { SignalScores } from "./interhuman.js";

// Avoid visually ambiguous characters (0/O, 1/I) in room codes.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
