// WebSocket message shapes shared between server and client.
import type { GameAction } from "./types.js";
import type { PlayerView } from "./view.js";

export type ClientMessage =
  // First message on a fresh connection. Omit playerId/token to join as a
  // new player; include both to reconnect as an existing one (e.g. after a
  // dropped connection -- important since this is remote-capable, section
  // "How should players connect" decision).
  | { type: "HELLO"; code: string; name?: string; playerId?: string; token?: string }
  | { type: "ACTION"; action: GameAction };

export type ServerMessage =
  | { type: "WELCOME"; playerId: string; token: string; view: PlayerView }
  | { type: "STATE"; view: PlayerView }
  | { type: "ERROR"; message: string };
