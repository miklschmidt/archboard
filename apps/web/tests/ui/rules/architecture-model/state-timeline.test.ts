// Where each state of a model sits on its timeline: the adopted line newest first, a draft one
// deeper than the state it came from, a draft off a draft deeper again, siblings side by side, and
// a shelved proposal on its branch. The page only lists them, so a wrong depth would draw a wrong
// branch silently.

import { expect, test } from "bun:test";

import { stateTimeline } from "#ui/rules/architecture-model/state-timeline.ts";

type State = Parameters<typeof stateTimeline>[0][number];

/**
 * One state as the record reads, named by its identity.
 * @param id Its identity and name.
 * @param lifecycle Where it stands.
 * @param predecessor The state it came from, if any.
 * @param adoptedAt When it became current, if it did.
 * @returns The state.
 */
function state(
	id: string,
	lifecycle: State["lifecycle"],
	predecessor?: string,
	adoptedAt?: string,
): State {
	return { id, name: id, lifecycle, predecessor, adoptedAt } as State;
}

test("a draft branches one deeper than the state it came from, and a draft off a draft deeper again", () => {
	const timeline = stateTimeline([
		state("first", "historical", undefined, "2026-08-01T00:00:00.000Z"),
		state("now", "current", "first", "2026-09-01T00:00:00.000Z"),
		state("lean", "draft", "now"),
		state("leaner", "draft", "lean"),
		state("wide", "draft", "now"),
		state("dropped", "shelved", "now"),
	]);
	expect(timeline.built).toBe(true);
	expect(timeline.entries.map((entry) => [entry.state.id, entry.depth, entry.from])).toEqual([
		["now", 0, "first"],
		["lean", 1, "now"],
		["leaner", 2, "lean"],
		["wide", 1, "now"],
		["dropped", 1, "now"],
		["first", 0, undefined],
	]);
});

test("a model with no current state stands the drafts that came from nothing on the line", () => {
	const timeline = stateTimeline([
		state("sketch", "draft"),
		state("refined", "draft", "sketch"),
		state("other", "draft"),
	]);
	expect(timeline.built).toBe(false);
	expect(timeline.entries.map((entry) => [entry.state.id, entry.depth])).toEqual([
		["sketch", 0],
		["refined", 1],
		["other", 0],
	]);
});

test("a state joined to nothing above keeps its place at the end", () => {
	const timeline = stateTimeline([
		state("now", "current", undefined, "2026-09-01T00:00:00.000Z"),
		state("orphan", "draft", "gone"),
	]);
	expect(timeline.entries.map((entry) => [entry.state.id, entry.depth])).toEqual([
		["now", 0],
		["orphan", 0],
	]);
});
