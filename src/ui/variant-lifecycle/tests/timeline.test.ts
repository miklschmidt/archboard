import { expect, test } from "bun:test";

import { timelineLanes } from "@/ui/variant-lifecycle";

test("the main line runs past a variant's branches to its history, and each branch leaves the line it comes off", () => {
	// The current variant, a draft off it, a draft off that draft, a second draft
	// off the current one, a shelved one off it, and the first variant last.
	expect(timelineLanes([0, 1, 2, 1, 1, 0])).toEqual([
		{ depth: 0, through: [], above: false, below: true, from: null },
		{ depth: 1, through: [0], above: false, below: true, from: 0 },
		{ depth: 2, through: [0], above: false, below: false, from: 1 },
		{ depth: 1, through: [0], above: false, below: false, from: 0 },
		{ depth: 1, through: [0], above: false, below: false, from: 0 },
		{ depth: 0, through: [], above: true, below: false, from: null },
	]);
});

test("a branch's line runs past a deeper branch to the next variant that comes off it", () => {
	// Two drafts off one draft, with a draft off the first of them between them:
	// the line of the draft they come off runs past both rows to the second.
	expect(timelineLanes([0, 1, 2, 3, 2]).map((lane) => lane.through)).toEqual([
		[],
		[],
		[1],
		[1],
		[],
	]);
});
