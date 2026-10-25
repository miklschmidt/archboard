// Which of two crossing lines rises, and what a hop keeps clear of, on fixed
// route geometry.
import { expect, test } from "bun:test";
import {
	across,
	bridged,
	bulgeOf,
	down,
	drawing,
	hops,
} from "#tests/runtime/support/fixed-routes.ts";

// Archboard server (blocks): a muted line rose over a hero one and broke it.
test("the more emphasised line rises, wherever it is painted", () => {
	for (const [hero, other] of [
		[0, 1],
		[1, 0],
	] as const) {
		const routes = [down(50), across(50)];
		const looks = [{}, {}];
		looks[hero] = { emphasis: "hero" as const };
		looks[other] = { emphasis: "muted" as const };
		const result = bridged(drawing(routes, looks));
		expect(result.bridges).toHaveLength(1);
		expect(result.bridges[0]!.edgeId).toBe(String(hero));
		expect(hops(result.bridges[0]!)).toBe(true);
	}
});

// Archboard server (blocks): a dotted line rose over a solid one; its arc barely
// showed, and the solid line read as broken.
test("a solid line rises over a dashed one, and where no hop fits the two cross plainly", () => {
	// The dashed line is painted later and would rise between equals.
	const over = bridged(drawing([down(50), across(50)], [{}, { kind: "event" }]));
	expect(over.bridges).toHaveLength(1);
	expect(over.bridges[0]).toMatchObject({ edgeId: "0", under: ["1"] });
	expect(hops(over.bridges[0]!)).toBe(true);
	// The solid line turns just past the crossing: neither line has room to rise,
	// and a gap with no arc over it would read as a break (TASK-408).
	const turning = [
		{ x: 50, y: 0 },
		{ x: 50, y: 58 },
		{ x: 100, y: 58 },
	];
	expect(bridged(drawing([turning, across(50)], [{}, { kind: "event" }])).bridges).toEqual([]);
});

// Every engine: between two lines that both have all the room a hop wants,
// the longer one rose, and hops moved about with every edit far away.
test("between two lines with all the room a hop wants, the later-painted rises", () => {
	const result = bridged(drawing([down(50, 0, 300), across(100)]));
	expect(result.bridges).toHaveLength(1);
	expect(result.bridges[0]).toMatchObject({ edgeId: "1", under: ["0"] });
});

// Every engine: a hop stood over a line that turned onto its crest's side a
// few points past it, and the two drew one knot.
test("a hop bulges up only where the line beneath runs straight well past its crest, else down", () => {
	for (const [turn, up] of [
		[28, true],
		[31, false],
	] as const) {
		const beneath = [
			{ x: 50, y: 100 },
			{ x: 50, y: turn },
			{ x: 100, y: turn },
		];
		const result = bridged(drawing([beneath, across(50)]));
		expect(result.bridges).toHaveLength(1);
		expect(hops(result.bridges[0]!), `turn at ${turn}`).toBe(true);
		const { least, most } = bulgeOf(result.bridges[0]!);
		expect(up ? most : Math.abs(least), `turn at ${turn}`).toBe(0);
	}
});

// Archboard server (graphviz): an arc stood five points from a label's edge.
test("a hop keeps a card's or a label's clearance from it, bulging away where it must", () => {
	const plain = drawing([down(50), across(50)]);
	const label = { x: 62, y: 40, width: 30, height: 8 };
	const edges = [
		{
			...plain.edges[0]!,
			label: {
				box: label,
				measured: { width: 30, height: 8, runs: [], chips: [{ y: 0, height: 8 }] },
			},
		},
		plain.edges[1]!,
	];
	const result = bridged({ ...plain, edges });
	const hop = result.bridges.find(hops);
	// The line down hops, to its left, away from the label on its right.
	expect(hop).toMatchObject({ edgeId: "0" });
	expect(bulgeOf(hop!).most).toBe(0);
});

// Archboard server (graphviz): an arc stood fifteen points from the tip of the
// arrowhead of the line it crossed; and a crossing past the head, but still on
// its approach, was refused a hop and cut (the user, 2026-09-27).
test("a hop keeps clear of another line's arrowhead, and stands across its approach past the head", () => {
	const near = bridged(drawing([down(50, 0, 200), across(100, 150, 35)]));
	expect(near.bridges).toEqual([]);
	const past = bridged(drawing([down(50, 0, 200), across(100, 150, 28)]));
	expect(past.bridges).toHaveLength(1);
	expect(hops(past.bridges[0]!)).toBe(true);
});

// A dashed line cut beneath a solid one shows no gap among its own, and read
// as not crossed at all (the user, 2026-09-27): a solid line hops it a few
// points past its own bend, as it hops a solid one.
test("a solid line hops a dashed one with the least room past its feet, as it hops a solid one", () => {
	const turning = [
		{ x: 50, y: 0 },
		{ x: 50, y: 72 },
		{ x: 100, y: 72 },
	];
	const dashed = bridged(drawing([turning, across(50)], [{}, { kind: "event" }]));
	expect(dashed.bridges).toHaveLength(1);
	expect(dashed.bridges[0]).toMatchObject({ edgeId: "0", under: ["1"] });
	expect(hops(dashed.bridges[0]!)).toBe(true);
	// Between two solid lines, one of them hops.
	expect(bridged(drawing([turning, across(50)])).bridges.some(hops)).toBe(true);
});
