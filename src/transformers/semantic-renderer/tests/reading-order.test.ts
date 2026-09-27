// How the layout choosers compare two layouts (ADR 0039), on layouts weighed
// by hand: each measure decides only between layouts alike on every earlier
// one, fit only between layouts that read alike, a wrap or a fold is taken
// only for fit it gains materially with no more defects, and a choice that
// also weighs two whole drawings as it did before keeps that earlier pick
// wherever the reading order's pick reads worse on some measure. What this
// catches: a rank of the order dropped or moved, fit buying a reading
// measure, and a fold or a guarded choice taking a layout that reads worse.

import { expect, test } from "bun:test";
import { REFERENCE_PANE } from "@/shared/shell-geometry/index";
import { readsBetter, takes, type Weighed } from "@/transformers/semantic-renderer/layout";

/** A layout that fits the reference pane at full scale and reads cleanly. */
const clean: Weighed = {
	width: REFERENCE_PANE.width,
	height: REFERENCE_PANE.height,
	crossings: 4,
	knots: 0,
	tracks: 0,
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
		[{ crossings: 5 }, { tracks: 3, hooks: 3, bends: 40, length: 20_000 }],
		[{ tracks: 1 }, { hooks: 3, bends: 40, length: 20_000 }],
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

test("a crossing on a corner or in a stack counts as one crossing more", () => {
	const knotted: Weighed = { ...clean, crossings: 3, knots: 1 };
	const crossed: Weighed = { ...clean, crossings: 4, bends: 10 };
	// Alike on crossings, so the bends decide.
	expect(readsBetter(crossed, knotted)).toBe(true);
	expect(readsBetter({ ...knotted, knots: 2 }, { ...crossed, bends: 30 })).toBe(false);
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
