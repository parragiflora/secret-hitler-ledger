import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { reduce } from "@interhuman/shared";
import { createRoom, getRoom } from "../src/rooms.js";
import { server } from "../src/index.js";

// Exercises the POST /api/games/:code/speech-events/:eventId/clip route
// end-to-end (multer parsing, auth, room/event lookup, analyzeClip wiring)
// against the real (but not auto-listening -- see index.ts's direct-execution
// guard) HTTP server. Interhuman itself is never actually called: `fetch` is
// wrapped so requests to api.interhuman.ai get a canned response while
// everything else (the test's own requests to its local server) passes
// through to the real fetch untouched.
const originalKey = process.env.INTERHUMAN_API_KEY;
const originalFetch = globalThis.fetch;

let baseUrl: string;
let interhumanResponse: () => Promise<Response>;

beforeEach(async () => {
  process.env.INTERHUMAN_API_KEY = "test-key"; // required now -- analyzeClip throws without one

  // Default: a complete, successful response. Individual tests can
  // reassign `interhumanResponse` to exercise failure paths.
  interhumanResponse = async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        signals: [
          { type: "confidence", probability: 0.6 },
          { type: "stress", probability: 0.4 },
          { type: "skepticism", probability: 0.3 },
          { type: "hesitation", probability: 0.2 },
        ],
      }),
    }) as Response;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (href.startsWith("https://api.interhuman.ai/")) return interhumanResponse();
    return originalFetch(url, init);
  }) as typeof fetch;

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  if (originalKey === undefined) delete process.env.INTERHUMAN_API_KEY;
  else process.env.INTERHUMAN_API_KEY = originalKey;
  globalThis.fetch = originalFetch;
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

  it("accepts a valid upload, stores the real analyzed scores, and never echoes them back", async () => {
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
    expect(body).toEqual({ ok: true });
    // No confidence/stress/skepticism/hesitation fields leaked in the response.
    expect(Object.keys(body)).toEqual(["ok"]);

    const stored = getRoom(room.code)?.signalScores.get("sp_test_1");
    expect(stored).toEqual({ confidence: 0.6, stress: 0.4, skepticism: 0.3, hesitation: 0.2, rawResponseJson: expect.anything() });
  });

  it("500s (with the real error message) when analysis fails, and stores no signal_scores entry", async () => {
    const { room, token } = setUpRoomWithSpeechEvent();
    interhumanResponse = async () => ({ ok: false, status: 503 }) as Response;

    const form = new FormData();
    form.append("clip", new Blob([Buffer.from("fake clip bytes")], { type: "video/webm" }), "clip.webm");

    const res = await fetch(makeClipUploadUrl(room.code, "sp_test_1"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/503/);
    expect(getRoom(room.code)?.signalScores.has("sp_test_1")).toBe(false);
  });
});
