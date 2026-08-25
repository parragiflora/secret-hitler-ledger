import { describe, expect, it } from "vitest";
import { reduce, type GameState, type SpeechEvent } from "@interhuman/shared";
import {
  computeGameRecap,
  computePlayerSignalSeries,
  computePlayerTrustTrajectory,
  computeRoomAmbientTension,
} from "../src/trustTrajectory.js";
import { createRoom } from "../src/rooms.js";
import type { SignalScores } from "../src/interhuman.js";

function twoPlayerState(): GameState {
  const room = createRoom();
  let state = reduce(room.state, { type: "JOIN_GAME", playerId: "alice", name: "Alice" });
  state = reduce(state, { type: "JOIN_GAME", playerId: "bob", name: "Bob" });
  return state;
}

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
  return { confidence: 0.5, stress: 0.5, skepticism: 0.5, hesitation: 0.5, rawResponseJson: null, ...overrides };
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

describe("computePlayerSignalSeries", () => {
  it("returns one point per scored event, in capture order, with all 4 signals and the round number", () => {
    const events = [makeEvent("e1", "alice", 1), makeEvent("e2", "bob", 1), makeEvent("e3", "alice", 3)];
    const scores = new Map<string, SignalScores>([
      ["e1", makeScores({ confidence: 0.2, stress: 0.3, skepticism: 0.4, hesitation: 0.5 })],
      ["e2", makeScores({ confidence: 0.99 })], // bob's -- must not leak into alice's series
      ["e3", makeScores({ confidence: 0.6, stress: 0.7, skepticism: 0.8, hesitation: 0.9 })],
    ]);

    expect(computePlayerSignalSeries(events, scores, "alice")).toEqual([
      { round: 1, confidence: 0.2, stress: 0.3, skepticism: 0.4, hesitation: 0.5 },
      { round: 3, confidence: 0.6, stress: 0.7, skepticism: 0.8, hesitation: 0.9 },
    ]);
  });

  it("excludes events with no matching signalScores", () => {
    const events = [makeEvent("e1", "alice", 1, true), makeEvent("e2", "alice", 2)];
    const scores = new Map<string, SignalScores>([["e2", makeScores()]]);
    expect(computePlayerSignalSeries(events, scores, "alice")).toHaveLength(1);
  });

  it("is empty for a player with no speech events", () => {
    expect(computePlayerSignalSeries([], new Map(), "alice")).toEqual([]);
  });
});

describe("computeGameRecap", () => {
  it("assembles every player's series alongside their name and role", () => {
    const state: GameState = {
      ...twoPlayerState(),
      speechEvents: [makeEvent("e1", "alice", 1), makeEvent("e2", "bob", 1)],
    };
    // Roles are normally assigned by START_GAME; set directly here since the
    // recap doesn't care how they got there, only that it reports whatever's
    // on the player record.
    const withRoles: GameState = {
      ...state,
      players: state.players.map((p) => ({ ...p, role: p.id === "alice" ? "liberal" : "fascist" })) as GameState["players"],
    };
    const scores = new Map<string, SignalScores>([
      ["e1", makeScores({ confidence: 0.7 })],
      ["e2", makeScores({ confidence: 0.2 })],
    ]);

    const recap = computeGameRecap(withRoles, scores);
    expect(recap.players).toEqual([
      { playerId: "alice", name: "Alice", role: "liberal", points: [{ round: 1, confidence: 0.7, stress: 0.5, skepticism: 0.5, hesitation: 0.5 }] },
      { playerId: "bob", name: "Bob", role: "fascist", points: [{ round: 1, confidence: 0.2, stress: 0.5, skepticism: 0.5, hesitation: 0.5 }] },
    ]);
  });

  it("gives every player an empty series in a fresh room with no speech yet", () => {
    const recap = computeGameRecap(twoPlayerState(), new Map());
    expect(recap.players.map((p) => p.points)).toEqual([[], []]);
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
