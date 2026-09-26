// Which of two crossing lines rises, and what a hop keeps clear of, on fixed
// route geometry.
import { expect, test } from "bun:test";
import { across, bridged, down, drawing, hops } from "./fixed-routes";

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
test("a solid line rises over a dashed one, and a dashed line never rises over a solid one", () => {
	// The dashed line is painted later and would rise between equals.
	const over = bridged(drawing([down(50), across(50)], [{}, { kind: "event" }]));
	expect(over.bridges).toHaveLength(1);
	expect(over.bridges[0]).toMatchObject({ edgeId: "0", under: ["1"] });
	expect(hops(over.bridges[0]!)).toBe(true);
	// Where the solid line has no room to rise, the dashed one is cut beneath it.
	const turning = [
		{ x: 50, y: 0 },
		{ x: 50, y: 58 },
		{ x: 100, y: 58 },
	];
	const cut = bridged(drawing([turning, across(50)], [{}, { kind: "event" }]));
	expect(cut.bridges).toHaveLength(1);
	expect(cut.bridges[0]).toMatchObject({ edgeId: "0", under: ["1"] });
	expect(hops(cut.bridges[0]!)).toBe(false);
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
test("a hop stands only where the line beneath runs straight well past its crest", () => {
	for (const [turn, hopped] of [
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
		expect(hops(result.bridges[0]!), `turn at ${turn}`).toBe(hopped);
	}
});

// Archboard server (graphviz): an arc stood five points from a label's edge.
test("a hop keeps a card's or a label's clearance from it", () => {
	const plain = drawing([down(50), across(50)]);
	const label = { x: 62, y: 40, width: 30, height: 8 };
	const edges = [
		{ ...plain.edges[0]!, label: { box: label, measured: { width: 30, height: 8, runs: [] } } },
		plain.edges[1]!,
	];
	const result = bridged({ ...plain, edges });
	expect(result.bridges.some(hops)).toBe(false);
});

// Archboard server (graphviz): an arc stood fifteen points from the tip of the
// arrowhead of the line it crossed.
test("a hop keeps clear of another line's arrowhead", () => {
	const result = bridged(drawing([down(50, 0, 200), across(100, 150, 35)]));
	expect(result.bridges).toHaveLength(1);
	expect(hops(result.bridges[0]!)).toBe(false);
});

// Agent workbench (blocks): a solid line hopped a dashed one a few points past
// its own bend, where the dashed line cut beneath it reads as well.
test("a solid line hops a dashed one only with a bend's room past its feet", () => {
	const turning = [
		{ x: 50, y: 0 },
		{ x: 50, y: 72 },
		{ x: 100, y: 72 },
	];
	const result = bridged(drawing([turning, across(50)], [{}, { kind: "event" }]));
	expect(result.bridges).toHaveLength(1);
	expect(hops(result.bridges[0]!)).toBe(false);
	// With a solid line beneath it, it rises with less.
	const solid = bridged(drawing([turning, across(50)]));
	expect(solid.bridges.some(hops)).toBe(true);
});
