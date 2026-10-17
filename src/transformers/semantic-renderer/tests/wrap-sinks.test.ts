// Whether a wrap sinks a card rather than wrapping it, on wraps laid by hand.
// What this catches: a group region the wrap lowers whole refused, because
// its topmost cards stand under cards of the fan rather than of the region,
// so the region stands on a row of its own above the fan's other cards
// (Starting a workhorse, Track); and a lowered card under no card at all
// taken.

import { expect, test } from "bun:test";
import { sinks } from "@/transformers/semantic-renderer/layout";

/** Where the wrap lays each card: a fan of two over the two cards of one region, and one card astray. */
const boxes = new Map(
	(
		[
			["hub", 0],
			["peer", 300],
			["first", 0],
			["second", 300],
			["astray", 900],
		] as const
	).map(([card, x]) => [card, { x, y: 0, width: 200, height: 80 }]),
);

/**
 * The cluster round a card: the region's two cards stand in one.
 * @param card The card.
 * @returns The region, or nothing.
 */
function around(card: string): string | undefined {
	return card === "first" || card === "second" ? "region" : undefined;
}

test("a region the wrap lowers whole may stand under any card of the row above", () => {
	const plan = new Map([
		["hub", 0],
		["peer", 0],
		["first", 1],
		["second", 1],
	]);
	expect(sinks(plan, boxes, around)).toBe(false);
});

test("a lowered card under no card of the row above sinks", () => {
	const plan = new Map([
		["hub", 0],
		["peer", 0],
		["astray", 1],
	]);
	expect(sinks(plan, boxes, around)).toBe(true);
});
