// Section 1: policy deck (17 tiles: 6 Liberal, 11 Fascist), draw/discard/reshuffle.
import type { PolicyType } from "./types.js";
import { shuffle } from "./roles.js";

export const LIBERAL_TILE_COUNT = 6;
export const FASCIST_TILE_COUNT = 11;

export function freshDeck(rng: () => number): PolicyType[] {
  const tiles: PolicyType[] = [
    ...Array(LIBERAL_TILE_COUNT).fill("liberal"),
    ...Array(FASCIST_TILE_COUNT).fill("fascist"),
  ];
  return shuffle(tiles, rng);
}

export interface DrawResult {
  drawn: PolicyType[];
  drawPile: PolicyType[];
  discardPile: PolicyType[];
}

/**
 * Draws `count` tiles from the draw pile, reshuffling the discard pile back in
 * mid-draw if the pile runs out (section 1: "When the draw pile runs out
 * mid-round, reshuffle all discarded ... tiles and continue").
 */
export function drawPolicies(
  drawPile: PolicyType[],
  discardPile: PolicyType[],
  count: number,
  rng: () => number,
): DrawResult {
  let draw = drawPile.slice();
  let discard = discardPile.slice();
  const drawn: PolicyType[] = [];

  while (drawn.length < count) {
    if (draw.length === 0) {
      if (discard.length === 0) {
        // Only possible if the deck (17) is smaller than a requested draw,
        // which never happens in-game (max draw is 3), but guard anyway.
        break;
      }
      draw = shuffle(discard, rng);
      discard = [];
    }
    drawn.push(draw.shift()!);
  }

  return { drawn, drawPile: draw, discardPile: discard };
}
