import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { reduce } from "@interhuman/shared";
import { createRoom, getRoom } from "../src/rooms.js";
import { server } from "../src/index.js";

// Exercises the POST /api/games/:code/speech-events/:eventId/clip route
// end-to-end (multer parsing, auth, room/event lookup, analyzeClip wiring)
// against the real (but not auto-listening -- see index.ts's direct-execution
// guard) HTTP server, without touching the real Interhuman API (mocked via
// analyzeClip's own no-API-key fallback).

let baseUrl: string;
const originalKey = process.env.INTERHUMAN_API_KEY;

beforeEach(async () => {
  delete process.env.INTERHUMAN_API_KEY; // force mock mode -- no network calls in tests
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  if (originalKey === undefined) delete process.env.INTERHUMAN_API_KEY;
  else process.env.INTERHUMAN_API_KEY = originalKey;
  await new Promise((resolve) => server.close(resolve));
});

function makeClipUploadUrl(code: string, eventId: string): string {
  return `${baseUrl}/api/games/${code}/speech-events/${eventId}/clip`;
}

describe("POST /api/games/:code/speech-events/:eventId/clip", () => {
  function setUpRoomWithSpeechEvent() {
    const room = createRoom();
    const playerId = randomUUID();
    const token = randomUUID();
    room.tokens.set(playerId, token);
    room.state = reduce(room.state, { type: "JOIN_GAME", playerId, name: "Alice" });
    // Manually seed a speechEvents row (bypassing the full game flow, which
    // isn't the concern of this route-level test).
    room.state = {
      ...room.state,
      speechEvents: [
        {
          id: "sp_test_1",
          playerId,
          roundNumber: 1,
          eventType: "nomination_speech",
          capturedAt: new Date().toISOString(),
          durationMs: 5000,
          skipped: false,
          clipRef: null,
        },
      ],
    };
    return { room, playerId, token };
  }

  it("404s for an unknown room", async () => {
    const res = await fetch(makeClipUploadUrl("ZZZZZ", "sp_test_1"), { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("404s for an unknown speech event", async () => {
    const room = createRoom();
    const res = await fetch(makeClipUploadUrl(room.code, "sp_nope"), { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("403s without a matching bearer token", async () => {
    const { room } = setUpRoomWithSpeechEvent();
    const res = await fetch(makeClipUploadUrl(room.code, "sp_test_1"), { method: "POST" });
    expect(res.status).toBe(403);

    const wrongToken = await fetch(makeClipUploadUrl(room.code, "sp_test_1"), {
      method: "POST",
      headers: { Authorization: "Bearer not-the-right-token" },
    });
    expect(wrongToken.status).toBe(403);
  });

  it("400s with no file attached", async () => {
    const { room, token } = setUpRoomWithSpeechEvent();
    const res = await fetch(makeClipUploadUrl(room.code, "sp_test_1"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(400);
  });

  it("accepts a valid upload, stores mock signal scores, and never echoes the scores back", async () => {
    const { room, token } = setUpRoomWithSpeechEvent();

    const form = new FormData();
    form.append("clip", new Blob([Buffer.from("fake clip bytes")], { type: "video/webm" }), "clip.webm");

    const res = await fetch(makeClipUploadUrl(room.code, "sp_test_1"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, mocked: true });
    // No confidence/stress/skepticism/hesitation fields leaked in the response.
    expect(Object.keys(body).sort()).toEqual(["mocked", "ok"]);

    const stored = getRoom(room.code)?.signalScores.get("sp_test_1");
    expect(stored).toBeDefined();
    expect(stored?.mocked).toBe(true);
    for (const key of ["confidence", "stress", "skepticism", "hesitation"] as const) {
      expect(stored![key]).toBeGreaterThanOrEqual(0);
      expect(stored![key]).toBeLessThanOrEqual(1);
    }
  });
});
