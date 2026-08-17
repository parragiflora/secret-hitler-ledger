import { describe, expect, it } from "vitest";
import { reduce } from "../src/engine.js";
import { viewForPlayer } from "../src/view.js";
import type { GameState, Role } from "../src/types.js";
import { makeStateWithRoles, seededRng } from "./testUtils.js";

const rng = seededRng(3);

describe("per-player view redaction (section 1 role visibility)", () => {
  const FIVE_P: Role[] = ["liberal", "liberal", "liberal", "fascist", "hitler"];

  it("a Liberal sees no other roles", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const liberalId = ids[0];
    const view = viewForPlayer(state, liberalId);
    expect(view.myRole).toBe("liberal");
    expect(Object.keys(view.knownRoles)).toHaveLength(0);
  });

  it("a Fascist knows all Fascists + Hitler, regardless of player count", () => {
    const NINE_P: Role[] = ["liberal", "liberal", "liberal", "liberal", "liberal", "fascist", "fascist", "fascist", "hitler"];
    const { state, ids } = makeStateWithRoles(NINE_P);
    const fascistId = state.players.find((p) => p.role === "fascist")!.id;
    const view = viewForPlayer(state, fascistId);
    const knownIds = Object.keys(view.knownRoles);
    // Excludes the viewer themselves -- knownRoles is "who else you recognize
    // as a teammate", not a restatement of your own role (see myRole).
    const expectedIds = state.players
      .filter((p) => (p.role === "fascist" || p.role === "hitler") && p.id !== fascistId)
      .map((p) => p.id);
    expect(knownIds.sort()).toEqual(expectedIds.sort());
    expect(knownIds).not.toContain(fascistId);
  });

  it("Hitler knows the Fascist team in 5-6 player games", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const hitlerId = state.players.find((p) => p.role === "hitler")!.id;
    const view = viewForPlayer(state, hitlerId);
    const fascistId = state.players.find((p) => p.role === "fascist")!.id;
    expect(view.knownRoles[fascistId]).toBe("fascist");
  });

  it("Hitler does NOT know the Fascist team in 7+ player games", () => {
    const NINE_P: Role[] = ["liberal", "liberal", "liberal", "liberal", "liberal", "fascist", "fascist", "fascist", "hitler"];
    const { state } = makeStateWithRoles(NINE_P);
    const hitlerId = state.players.find((p) => p.role === "hitler")!.id;
    const view = viewForPlayer(state, hitlerId);
    expect(Object.keys(view.knownRoles)).toHaveLength(0);
  });

  it("votes are withheld from other players until everyone has voted", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    let s: GameState = reduce(state, { type: "NOMINATE_CHANCELLOR", presidentId: ids[0], nomineeId: ids[1] }, rng);
    s = reduce(s, { type: "CAST_VOTE", playerId: ids[0], choice: "ja" }, rng);

    const otherView = viewForPlayer(s, ids[2]);
    expect(otherView.playersWhoHaveVoted).toContain(ids[0]);
    expect(otherView.myVote).toBeNull(); // ids[2] hasn't voted

    const selfView = viewForPlayer(s, ids[0]);
    expect(selfView.myVote).toBe("ja"); // you always know your own vote
  });

  it("only the President sees the drawn policies; only President/Chancellor see the Chancellor's hand", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s: GameState = { ...state, phase: "LEGISLATIVE_PRESIDENT", presidentDrawnPolicies: ["liberal", "fascist", "liberal"] };
    expect(viewForPlayer(s, ids[0]).myPresidentHand).toEqual(["liberal", "fascist", "liberal"]);
    expect(viewForPlayer(s, ids[1]).myPresidentHand).toBeNull();

    const s2: GameState = { ...state, phase: "LEGISLATIVE_CHANCELLOR", chancellorId: ids[1], chancellorHandPolicies: ["liberal", "fascist"] };
    expect(viewForPlayer(s2, ids[1]).myChancellorHand).toEqual(["liberal", "fascist"]); // chancellor
    expect(viewForPlayer(s2, ids[0]).myChancellorHand).toEqual(["liberal", "fascist"]); // president (chose what to pass)
    expect(viewForPlayer(s2, ids[2]).myChancellorHand).toBeNull(); // bystander
  });

  it("investigation results are private to the President", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const fascistId = state.players.find((p) => p.role === "fascist")!.id;
    const s: GameState = {
      ...state,
      phase: "EXECUTIVE_ACTION",
      pendingExecutivePower: "investigate_loyalty",
      pendingExecutiveResult: { team: "fascist" },
    };
    void fascistId;
    expect(viewForPlayer(s, ids[0]).myExecutiveResult).toEqual({ team: "fascist" });
    expect(viewForPlayer(s, ids[1]).myExecutiveResult).toBeNull();
  });

  it("final roles are revealed to everyone only at GAME_END", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    expect(viewForPlayer(state, ids[0]).finalRoles).toBeNull();
    const ended: GameState = { ...state, phase: "GAME_END", winner: "liberal", winReason: "liberal_policies" };
    const view = viewForPlayer(ended, ids[2]);
    expect(view.finalRoles).not.toBeNull();
    expect(view.finalRoles![ids[4]]).toBe("hitler");
  });

  it("ambientTension defaults to calm and reflects whatever the caller injects", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    expect(viewForPlayer(state, ids[0]).ambientTension).toBe("calm");
    expect(viewForPlayer(state, ids[0], { ambientTension: "charged" }).ambientTension).toBe("charged");
    // Every viewer sees the same table-wide reading -- it's explicitly non-specific (section 7).
    expect(viewForPlayer(state, ids[1], { ambientTension: "restless" }).ambientTension).toBe("restless");
  });

  it("exposes the active Special Session (metadata + injected readout text) identically to every viewer", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s: GameState = {
      ...state,
      phase: "SPECIAL_SESSION",
      pendingSpecialSession: {
        triggerReason: "execution",
        roundNumber: 3,
        presidentId: ids[0],
        chancellorId: ids[1],
        resumeAction: { kind: "finalize_execution" },
      },
    };
    const extras = { specialSessionReadouts: { presidentReadout: "President text.", chancellorReadout: "Chancellor text." } };
    const bystanderView = viewForPlayer(s, ids[2], extras);
    const presidentView = viewForPlayer(s, ids[0], extras);
    expect(bystanderView.activeSpecialSession).toEqual({
      triggerReason: "execution",
      roundNumber: 3,
      presidentId: ids[0],
      chancellorId: ids[1],
      presidentReadout: "President text.",
      chancellorReadout: "Chancellor text.",
    });
    // Not viewer-specific -- the full-screen reveal is the same for everyone.
    expect(presidentView.activeSpecialSession).toEqual(bystanderView.activeSpecialSession);
  });

  it("is null outside SPECIAL_SESSION even if stale pendingSpecialSession data exists", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    expect(viewForPlayer(state, ids[0]).activeSpecialSession).toBeNull();
  });

  it("withholds Special Session call vote choices until everyone's voted, like an election", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    const s: GameState = {
      ...state,
      phase: "LEGISLATIVE_PRESIDENT",
      pendingSpecialSessionVote: {
        proposedBy: ids[2],
        votes: [{ round: 1, playerId: ids[0], choice: "ja" }],
      },
    };
    const otherView = viewForPlayer(s, ids[1]);
    expect(otherView.pendingSpecialSessionVote?.votesCast).toContain(ids[0]);
    expect(otherView.pendingSpecialSessionVote?.myVote).toBeNull();
    const selfView = viewForPlayer(s, ids[0]);
    expect(selfView.pendingSpecialSessionVote?.myVote).toBe("ja");
  });

  it("specialSessionAvailable reflects canProposeSpecialSession", () => {
    const { state, ids } = makeStateWithRoles(FIVE_P);
    expect(viewForPlayer(state, ids[0]).specialSessionAvailable).toBe(false); // NOMINATION -- not proposable
    const readyToPropose: GameState = { ...state, phase: "LEGISLATIVE_PRESIDENT" };
    expect(viewForPlayer(readyToPropose, ids[0]).specialSessionAvailable).toBe(true);
    const spent: GameState = { ...readyToPropose, specialSessionResourceSpent: true };
    expect(viewForPlayer(spent, ids[0]).specialSessionAvailable).toBe(false);
  });
});
