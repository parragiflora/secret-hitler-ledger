import { describe, expect, it } from "vitest";
import { reduce, type GameState, type PendingSpecialSession } from "@interhuman/shared";
import { createRoom } from "../src/rooms.js";
import { generateSpecialSessionReadouts } from "../src/specialSession.js";
import type { SignalScores } from "../src/interhuman.js";

function makeScores(overrides: Partial<SignalScores> = {}): SignalScores {
  return { confidence: 0.5, stress: 0.5, skepticism: 0.5, hesitation: 0.5, rawResponseJson: null, mocked: true, ...overrides };
}

describe("generateSpecialSessionReadouts", () => {
  it("produces readouts for both government players and logs the session", () => {
    const room = createRoom();
    let state: GameState = reduce(room.state, { type: "JOIN_GAME", playerId: "alice", name: "Alice" });
    state = reduce(state, { type: "JOIN_GAME", playerId: "bob", name: "Bob" });
    room.state = state;

    room.state = {
      ...room.state,
      speechEvents: [
        { id: "e1", playerId: "alice", roundNumber: 1, eventType: "nomination_speech", capturedAt: "", durationMs: 5000, skipped: false, clipRef: null },
        { id: "e2", playerId: "alice", roundNumber: 2, eventType: "nomination_speech", capturedAt: "", durationMs: 5000, skipped: false, clipRef: null },
        { id: "e3", playerId: "alice", roundNumber: 3, eventType: "nomination_speech", capturedAt: "", durationMs: 5000, skipped: false, clipRef: null },
      ],
    };
    room.signalScores.set("e1", makeScores({ skepticism: 0.1 }));
    room.signalScores.set("e2", makeScores({ skepticism: 0.1 }));
    room.signalScores.set("e3", makeScores({ skepticism: 0.9 })); // sharp rise

    const pending: PendingSpecialSession = {
      triggerReason: "execution",
      roundNumber: 3,
      presidentId: "alice",
      chancellorId: "bob",
      resumeAction: { kind: "finalize_execution" },
    };

    const result = generateSpecialSessionReadouts(room, pending);

    expect(result.presidentReadout).toContain("Alice");
    expect(result.presidentReadout.toLowerCase()).toMatch(/skeptic|doubtful/);
    // Bob has no speechEvents at all -- insufficient data fallback.
    expect(result.chancellorReadout).toContain("Bob");
    expect(result.chancellorReadout.toLowerCase()).toMatch(/not yet gathered|too thin/);

    expect(room.specialSessions).toHaveLength(1);
    expect(room.specialSessions[0]).toMatchObject({
      roundNumber: 3,
      triggerReason: "execution",
      presidentId: "alice",
      chancellorId: "bob",
      presidentReadout: result.presidentReadout,
      chancellorReadout: result.chancellorReadout,
    });
  });

  it("persists rotation history across multiple sessions in the same room", () => {
    const room = createRoom();
    room.state = reduce(room.state, { type: "JOIN_GAME", playerId: "alice", name: "Alice" });
    room.state = reduce(room.state, { type: "JOIN_GAME", playerId: "bob", name: "Bob" });
    room.state = {
      ...room.state,
      speechEvents: [
        { id: "e1", playerId: "alice", roundNumber: 1, eventType: "nomination_speech", capturedAt: "", durationMs: 5000, skipped: false, clipRef: null },
        { id: "e2", playerId: "alice", roundNumber: 2, eventType: "nomination_speech", capturedAt: "", durationMs: 5000, skipped: false, clipRef: null },
      ],
    };
    room.signalScores.set("e1", makeScores({ stress: 0.1 }));
    room.signalScores.set("e2", makeScores({ stress: 0.6 })); // notable rise

    const pending: PendingSpecialSession = {
      triggerReason: "policy_threshold",
      roundNumber: 2,
      presidentId: "alice",
      chancellorId: "bob",
      resumeAction: { kind: "advance_round", presidentOverride: null },
    };

    expect(room.readoutVariantHistory).toEqual({});
    generateSpecialSessionReadouts(room, pending);
    expect(Object.keys(room.readoutVariantHistory).length).toBeGreaterThan(0);
    expect(room.specialSessions).toHaveLength(1);

    generateSpecialSessionReadouts(room, { ...pending, roundNumber: 3 });
    expect(room.specialSessions).toHaveLength(2);
  });
});
