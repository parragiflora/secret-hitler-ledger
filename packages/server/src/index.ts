import { randomUUID } from "node:crypto";
import http from "node:http";
import express from "express";
import cors from "cors";
import { WebSocketServer, type WebSocket } from "ws";
import {
  GameRuleError,
  reduce,
  viewForPlayer,
  type ClientMessage,
  type ServerMessage,
} from "@interhuman/shared";
import { createRoom, getRoom, type Room } from "./rooms.js";
import { actorIdOf } from "./actionAuth.js";

const PORT = Number(process.env.PORT ?? 8787);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Creates a new lobby and returns its room code; players then connect over
// WebSocket and send HELLO with this code to join.
app.post("/api/games", (_req, res) => {
  const room = createRoom();
  res.status(201).json({ code: room.code });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(room: Room): void {
  for (const [playerId, socket] of room.sockets) {
    send(socket, { type: "STATE", view: viewForPlayer(room.state, playerId) });
  }
}

wss.on("connection", (ws) => {
  let room: Room | undefined;
  let playerId: string | undefined;

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "ERROR", message: "Malformed message." });
      return;
    }

    try {
      if (msg.type === "HELLO") {
        const target = getRoom(msg.code);
        if (!target) throw new GameRuleError(`No game with code ${msg.code}.`);
        room = target;

        if (msg.playerId && msg.token) {
          // Reconnect to an existing player slot.
          if (room.tokens.get(msg.playerId) !== msg.token) {
            throw new GameRuleError("Invalid reconnect token.");
          }
          playerId = msg.playerId;
          room.sockets.set(playerId, ws);
          room.state = reduce(room.state, { type: "SET_CONNECTED", playerId, isConnected: true });
          send(ws, { type: "WELCOME", playerId, token: msg.token, view: viewForPlayer(room.state, playerId) });
          broadcast(room);
          return;
        }

        // New player joining the lobby.
        if (!msg.name || !msg.name.trim()) throw new GameRuleError("Name is required to join.");
        playerId = randomUUID();
        const token = randomUUID();
        room.state = reduce(room.state, { type: "JOIN_GAME", playerId, name: msg.name.trim() });
        room.tokens.set(playerId, token);
        room.sockets.set(playerId, ws);
        send(ws, { type: "WELCOME", playerId, token, view: viewForPlayer(room.state, playerId) });
        broadcast(room);
        return;
      }

      if (msg.type === "ACTION") {
        if (!room || !playerId) throw new GameRuleError("Send HELLO before sending actions.");
        const requiredActor = actorIdOf(msg.action);
        if (requiredActor !== null && requiredActor !== playerId) {
          throw new GameRuleError("You cannot act on another player's behalf.");
        }
        room.state = reduce(room.state, msg.action);
        broadcast(room);
        return;
      }
    } catch (err) {
      const message = err instanceof GameRuleError ? err.message : "Unexpected server error.";
      if (!(err instanceof GameRuleError)) console.error(err);
      send(ws, { type: "ERROR", message });
    }
  });

  ws.on("close", () => {
    if (!room || !playerId) return;
    room.sockets.delete(playerId);
    try {
      room.state = reduce(room.state, { type: "SET_CONNECTED", playerId, isConnected: false });
      broadcast(room);
    } catch {
      // Room may have been torn down; nothing to do.
    }
  });
});

server.listen(PORT, () => {
  console.log(`The Registrar's server is listening on :${PORT}`);
});
