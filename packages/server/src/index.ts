import { randomUUID } from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import multer from "multer";
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
import { analyzeClip } from "./interhuman.js";

// Load packages/server/.env (gitignored) regardless of invocation cwd, so
// INTERHUMAN_API_KEY works whether run via `npm run dev` from this package
// or `npm run dev:server` from the repo root.
try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"));
} catch {
  // No .env present -- interhuman.ts falls back to mock mode.
}

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

// Section 9 step 3: upload a captured speech clip for analysis. The
// RECORD_SPEECH_EVENT game action (over WS) is the source of truth for the
// event existing at all; this REST call attaches the actual clip to it and
// is fire-and-forget from the client's perspective -- it never blocks game
// progression. Deliberately does not echo back the analyzed scores: per
// section 7, signal data stays invisible to every player until a Special
// Session's templated readout reveals it (a later phase).
const clipUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 32 * 1024 * 1024 } });
app.post("/api/games/:code/speech-events/:eventId/clip", clipUpload.single("clip"), async (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "No such game." });

  const event = room.state.speechEvents.find((e) => e.id === req.params.eventId);
  if (!event) return res.status(404).json({ error: "No such speech event." });

  const auth = req.header("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!token || room.tokens.get(event.playerId) !== token) {
    return res.status(403).json({ error: "Not authorized to upload this clip." });
  }

  if (!req.file) return res.status(400).json({ error: "No clip uploaded." });

  try {
    const scores = await analyzeClip(req.file.buffer, req.file.originalname || "clip.webm", event.durationMs ?? undefined);
    room.signalScores.set(event.id, scores);
    res.json({ ok: true, mocked: scores.mocked });
  } catch (err) {
    console.error("[clip upload] analysis failed:", err);
    res.status(500).json({ error: "Failed to analyze clip." });
  }
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

export { app, server };

// Only auto-listen when run directly (`tsx watch src/index.ts`, `node dist/index.js`)
// -- not when imported as a module, e.g. by tests that want the app/server
// without binding the real port.
if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => {
    console.log(`The Registrar's server is listening on :${PORT}`);
  });
}
