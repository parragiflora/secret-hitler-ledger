import { describe, expect, it } from "vitest";
import { drawPolicies, freshDeck, FASCIST_TILE_COUNT, LIBERAL_TILE_COUNT } from "../src/deck.js";
import { seededRng } from "./testUtils.js";

describe("policy deck (section 1)", () => {
  it("fresh deck has 6 liberal + 11 fascist = 17 tiles", () => {
    const deck = freshDeck(seededRng(1));
    expect(deck).toHaveLength(17);
    expect(deck.filter((t) => t === "liberal")).toHaveLength(LIBERAL_TILE_COUNT);
    expect(deck.filter((t) => t === "fascist")).toHaveLength(FASCIST_TILE_COUNT);
  });

  it("draws without touching discard when the draw pile has enough", () => {
    const draw = ["liberal", "fascist", "fascist", "liberal"] as const;
    const result = drawPolicies([...draw], ["fascist"], 3, seededRng(1));
    expect(result.drawn).toEqual(["liberal", "fascist", "fascist"]);
    expect(result.drawPile).toEqual(["liberal"]);
    expect(result.discardPile).toEqual(["fascist"]);
  });

  it("reshuffles the discard pile back in when the draw pile runs out mid-draw", () => {
    const result = drawPolicies(["liberal"], ["fascist", "fascist", "liberal"], 3, seededRng(7));
    expect(result.drawn).toHaveLength(3);
    // all 4 tiles accounted for across drawn + remaining piles
    const total = [...result.drawn, ...result.drawPile, ...result.discardPile];
    expect(total).toHaveLength(4);
    expect(total.filter((t) => t === "liberal")).toHaveLength(2);
    expect(total.filter((t) => t === "fascist")).toHaveLength(2);
    // discard pile was fully consumed into the reshuffled draw pile
    expect(result.discardPile).toHaveLength(0);
  });
});
