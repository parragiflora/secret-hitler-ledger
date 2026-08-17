import { describe, expect, it } from "vitest";
import type { SpeechEvent } from "@interhuman/shared";
import { computePlayerTrustTrajectory, computeRoomAmbientTension } from "../src/trustTrajectory.js";
import type { SignalScores } from "../src/interhuman.js";

function makeEvent(id: string, playerId: string, round: number, skipped = false): SpeechEvent {
  return {
    id,
    playerId,
    roundNumber: round,
    eventType: "nomination_speech",
    capturedAt: new Date().toISOString(),
    durationMs: skipped ? null : 10000,
    skipped,
    clipRef: null,
  };
}

function makeScores(overrides: Partial<SignalScores> = {}): SignalScores {
  return { confidence: 0.5, stress: 0.5, skepticism: 0.5, hesitation: 0.5, rawResponseJson: null, mocked: true, ...overrides };
}

describe("computePlayerTrustTrajectory", () => {
  it("only includes the requested player's events, in capture order", () => {
    const events = [
      makeEvent("e1", "alice", 1),
      makeEvent("e2", "bob", 1),
      makeEvent("e3", "alice", 2),
      makeEvent("e4", "alice", 3),
    ];
    const scores = new Map<string, SignalScores>([
      ["e1", makeScores({ confidence: 0.1 })],
      ["e2", makeScores({ confidence: 0.99 })], // bob's -- must not leak into alice's trajectory
      ["e3", makeScores({ confidence: 0.1 })],
      ["e4", makeScores({ confidence: 0.9 })],
    ]);

    // Alice's history (order preserved, bob's e2 excluded) = [e1: 0.1, e3: 0.1, e4: 0.9].
    // last 2 = [e3, e4] avg 0.5; earlier = [e1] avg 0.1; delta 0.4 -> sharp rise.
    const trajectory = computePlayerTrustTrajectory(events, scores, "alice");
    expect(trajectory.confidence).toEqual({ direction: "rising", magnitude: "sharp" });
  });

  it("excludes events with no matching signalScores (skipped, still analyzing, or failed upload)", () => {
    const events = [makeEvent("e1", "alice", 1, true), makeEvent("e2", "alice", 2)];
    const scores = new Map<string, SignalScores>([["e2", makeScores()]]); // e1 (skipped) never got scored

    const trajectory = computePlayerTrustTrajectory(events, scores, "alice");
    // Only 1 usable data point -- insufficient, not "1 skip counted as a zero".
    expect(trajectory.confidence).toEqual({ insufficientData: true });
  });

  it("reports insufficient data for a player with no speech events at all", () => {
    const trajectory = computePlayerTrustTrajectory([], new Map(), "alice");
    expect(trajectory.confidence).toEqual({ insufficientData: true });
    expect(trajectory.stress).toEqual({ insufficientData: true });
    expect(trajectory.skepticism).toEqual({ insufficientData: true });
    expect(trajectory.hesitation).toEqual({ insufficientData: true });
  });
});

describe("computeRoomAmbientTension", () => {
  it("aggregates across every player in the room", () => {
    const events = [
      makeEvent("e1", "alice", 1),
      makeEvent("e2", "alice", 2),
      makeEvent("e3", "alice", 3),
      makeEvent("e4", "alice", 4),
    ];
    const scores = new Map<string, SignalScores>([
      ["e1", makeScores({ confidence: 0.1, stress: 0.1, skepticism: 0.1, hesitation: 0.1 })],
      ["e2", makeScores({ confidence: 0.1, stress: 0.1, skepticism: 0.1, hesitation: 0.1 })],
      ["e3", makeScores({ confidence: 0.9, stress: 0.9, skepticism: 0.9, hesitation: 0.9 })],
      ["e4", makeScores({ confidence: 0.9, stress: 0.9, skepticism: 0.9, hesitation: 0.9 })],
    ]);

    // Alice alone has 4 sharp swings (restless); adding a second player with
    // no data shouldn't push it to charged.
    expect(computeRoomAmbientTension(events, scores, ["alice", "bob"])).toBe("restless");
  });

  it("is calm for a fresh room with no speech events yet", () => {
    expect(computeRoomAmbientTension([], new Map(), ["alice", "bob", "carol"])).toBe("calm");
  });
});
