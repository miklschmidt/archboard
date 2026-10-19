// How far a part reaches along its relationships.
//
// What these catch: a trace that stops at the first hop, one that walks the
// wrong way along a relationship, one that never ends on a cycle, and one that
// counts a relationship, or the part itself, as a part reached.

import { describe, expect, test } from "bun:test";

import { reachOf } from "#ui/rules/semantic-board-canvas/board/reach.ts";

// a -> b -> c -> d, a second route a -> c, a cycle d -> b, and a -> e. The shop holds a and e.
const NODES = [
	{ id: "shop" },
	{ id: "a", parent: "shop" },
	{ id: "e", parent: "shop" },
	{ id: "b" },
	{ id: "c" },
	{ id: "d" },
];
const EDGES = [
	{ id: "ab", from: "a", to: "b" },
	{ id: "bc", from: "b", to: "c" },
	{ id: "cd", from: "c", to: "d" },
	{ id: "ac", from: "a", to: "c" },
	{ id: "db", from: "d", to: "b" },
	{ id: "ae", from: "a", to: "e" },
];
const WIRING = { nodes: NODES, edges: EDGES };

/**
 * How far each subject is, in a stable order.
 * @param id The part walked from.
 * @param way Which way.
 * @returns The subjects with their hops, sorted by id.
 */
function hopsFrom(id: string, way: "onward" | "back"): [string, number][] {
	return [...reachOf(WIRING, id, way).hops].toSorted(([one], [other]) => one.localeCompare(other));
}

describe("a trace onward", () => {
	test("names every part that can be reached, and how many relationships away each is", () => {
		expect(hopsFrom("a", "onward")).toEqual([
			["a", 0],
			["ab", 1],
			["ac", 1],
			["ae", 1],
			["b", 1],
			["bc", 2],
			["c", 1],
			["cd", 2],
			["d", 2],
			["db", 3],
			["e", 1],
		]);
		// b, c, d and e: a relationship is not a part, and neither is the part itself.
		expect(reachOf(WIRING, "a", "onward").parts).toBe(4);
	});

	test("ends on a cycle", () => {
		expect(reachOf(WIRING, "b", "onward").parts).toBe(2);
	});

	test("walks a container as the whole of what it holds", () => {
		const reach = reachOf(WIRING, "shop", "onward");
		expect(reach.hops.get("ae")).toBe(0);
		expect(reach.hops.get("ab")).toBe(1);
		expect(reach.parts).toBe(3);
	});
});

describe("a trace back", () => {
	test("goes against the relationships and reaches only what sends to the part", () => {
		expect(hopsFrom("d", "back")).toEqual([
			["a", 2],
			["ab", 3],
			["ac", 2],
			["b", 2],
			["bc", 2],
			["c", 1],
			["cd", 1],
			["d", 0],
			["db", 3],
		]);
		// c, b and a, and not the relationship from d to b, which closes the cycle.
		expect(reachOf(WIRING, "d", "back").parts).toBe(3);
	});

	test("reaches nothing from a part nothing sends to", () => {
		expect(reachOf(WIRING, "a", "back").parts).toBe(0);
	});
});
