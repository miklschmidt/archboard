// Where each variant of a board sits on its timeline: the adopted line newest
// first, a draft one deeper than the variant it came from, a draft off a draft
// deeper again, siblings side by side, and a shelved proposal on its branch.
// The page only lists them, so a wrong depth would draw a wrong branch silently.

import { expect, test } from "bun:test";

import { variantTimeline } from "#ui/rules/semantic-board-canvas/board/variant-timeline.ts";

/**
 * One variant as the board reads it, named by its id.
 * @param id Its id and name.
 * @param lifecycle Where it stands.
 * @param parent The variant it came from, if any.
 * @returns The variant.
 */
function variant(
	id: string,
	lifecycle: "current" | "draft" | "historical" | "shelved",
	parent?: string,
): Parameters<typeof variantTimeline>[0][number] {
	return { id, name: id, lifecycle, parent, summary: undefined };
}

test("a draft branches one deeper than the variant it came from, and a draft off a draft deeper again", () => {
	const timeline = variantTimeline(
		[
			variant("first", "historical"),
			variant("now", "current", "first"),
			variant("lean", "draft", "now"),
			variant("leaner", "draft", "lean"),
			variant("wide", "draft", "now"),
			variant("dropped", "shelved", "now"),
		],
		[{ variant: "now", from: "first", at: "2026-09-01T00:00:00.000Z" }],
		[{ variant: "dropped", at: "2026-09-02T00:00:00.000Z", reason: "Too costly." }],
	);
	expect(timeline.built).toBe(true);
	expect(timeline.entries.map((entry) => [entry.variant.id, entry.depth, entry.from])).toEqual([
		["now", 0, "first"],
		["lean", 1, "now"],
		["leaner", 2, "lean"],
		["wide", 1, "now"],
		["dropped", 1, "now"],
		["first", 0, undefined],
	]);
	expect(timeline.entries.find((entry) => entry.variant.id === "dropped")?.shelved?.at).toBe(
		"2026-09-02T00:00:00.000Z",
	);
});

test("a board with no current variant stands the drafts that came from nothing on the line", () => {
	const timeline = variantTimeline(
		[variant("sketch", "draft"), variant("refined", "draft", "sketch"), variant("other", "draft")],
		[],
		[],
	);
	expect(timeline.built).toBe(false);
	expect(timeline.entries.map((entry) => [entry.variant.id, entry.depth])).toEqual([
		["sketch", 0],
		["refined", 1],
		["other", 0],
	]);
});
