// How the layout choosers compare two layouts (ADR 0039), on layouts weighed
// by hand: each measure decides only between layouts alike on every earlier
// one, fit only between layouts that read alike, and a chooser keeps its
// earlier pick wherever its reading pick reads worse on some measure. What
// this catches: a rank of the order dropped or moved, fit buying a reading
// measure, and a guarded choice taking a layout that reads worse.

import { expect, test } from "bun:test";
import { REFERENCE_PANE } from "#shared/constants/shell-geometry.ts";
import { readsBetter, takes, type Weighed } from "#shared/rules/track/scene/score.ts";
import { weighedPlaced } from "#shared/rules/blocks/tree/weighing.ts";

/** A layout that fits the reference pane at full scale and reads cleanly. */
const clean: Weighed = {
	width: REFERENCE_PANE.width,
	height: REFERENCE_PANE.height,
	crossings: 4,
	hooks: 0,
	bends: 20,
	length: 10_000,
};

/**
 * The clean layout on a page as many times the pane's height, fitting it that much worse.
 * @param times How many times taller.
 * @returns The page.
 */
function taller(times: number): Pick<Weighed, "width" | "height"> {
	return { width: REFERENCE_PANE.width, height: REFERENCE_PANE.height * times };
}

test("each reading measure decides before every later one and before fit", () => {
	// A layout worse by one on a measure, against one alike up to it and
	// worse on every later measure and on fit.
	const ranks: readonly [Partial<Weighed>, Partial<Weighed>][] = [
		[{ crossings: 5 }, { hooks: 3, bends: 40, length: 20_000 }],
		[{ hooks: 1 }, { bends: 40, length: 20_000 }],
		[{ bends: 21 }, { length: 20_000 }],
		[{ length: 11_000 }, {}],
	];
	for (const [here, later] of ranks) {
		const worse: Weighed = { ...clean, ...here };
		const cramped: Weighed = { ...clean, ...taller(2), ...later };
		expect(readsBetter(cramped, worse), JSON.stringify(here)).toBe(true);
		expect(readsBetter(worse, cramped), JSON.stringify(here)).toBe(false);
	}
});

test("route lengths within a twentieth of each other are alike, and fit decides", () => {
	const longer: Weighed = { ...clean, length: 10_400 };
	const cramped: Weighed = { ...clean, ...taller(1.5) };
	expect(readsBetter(longer, cramped)).toBe(true);
	expect(readsBetter({ ...longer, length: 10_600 }, cramped)).toBe(false);
});

test("a guarded choice takes the reading order's pick only where it is nowhere worse", () => {
	const fewer: Weighed = { ...clean, crossings: 2, bends: 28, length: 13_000 };
	// The reading order takes the drawing with fewer crossings ...
	expect(readsBetter(fewer, clean)).toBe(true);
	// ... but it turns more and runs longer, so the earlier pick stands.
	expect(takes(fewer, clean, false)).toBe(false);
	expect(takes(clean, fewer, true)).toBe(true);
	// Nowhere worse, it is taken over the earlier pick.
	const cleaner: Weighed = { ...clean, crossings: 2 };
	expect(takes(cleaner, clean, false)).toBe(true);
	expect(takes(clean, cleaner, true)).toBe(false);
	// Where the two agree, that pick is taken.
	expect(takes(fewer, clean, true)).toBe(true);
});

/**
 * A card 200 wide and 80 high.
 * @param id Its id.
 * @param x Its left wall.
 * @param y Its top wall.
 * @returns The card.
 */
function card(id: string, x: number, y: number) {
	return { id, box: { x, y, width: 200, height: 80 } };
}

/**
 * Four cards with two relationships drawn: one straight down between the two
 * middle cards, and one from the left card to the right card along a route.
 * @param across The route from the left card to the right card.
 * @returns How the drawing weighs.
 */
function weighedAcross(across: readonly (readonly [number, number])[]): Weighed {
	const cards = [
		card("from", 0, 300),
		card("to", 600, 300),
		card("above", 300, 0),
		card("below", 300, 700),
	];
	const edges = [
		{
			id: "down",
			points: [
				{ x: 400, y: 80 },
				{ x: 400, y: 700 },
			],
		},
		{ id: "across", points: across.map(([x, y]) => ({ x, y })) },
	];
	const projections = [
		{ edge: { id: "across", sources: ["from"], targets: ["to"] } },
		{ edge: { id: "down", sources: ["above"], targets: ["below"] } },
	];
	return weighedPlaced({ width: 800, height: 800, cards, edges }, projections);
}

test("a line run away from its ends round the picture reads worse than a crossing", () => {
	// The line from the left card to the right card either hops the line
	// between them, or loops round over the top of the picture to miss it.
	const hopping = weighedAcross([
		[200, 340],
		[600, 340],
	]);
	const looping = weighedAcross([
		[100, 300],
		[100, -40],
		[700, -40],
		[700, 300],
	]);
	expect(hopping.crossings).toBe(1);
	expect(looping.crossings).toBe(0);
	expect(readsBetter(hopping, looping)).toBe(true);
	expect(readsBetter(looping, hopping)).toBe(false);
});
