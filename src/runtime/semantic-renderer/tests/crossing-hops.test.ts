// Which line rises where two lines cross, and where a hop may stand, on fixed
// route geometry.
import { expect, test } from "bun:test";
import { bridgeCrossings, type Point } from "@/runtime/semantic-renderer/layout";
import { drawing } from "./fixed-routes";

// Every engine: a line that turned just past a crossing was cut beneath the
// straight line, which read as a missing arc, though the turn lay on the side
// the arc does not reach.
test("a straight line hops a line that turns just past the crossing, away from its crest", () => {
	for (const routes of [
		// The other route turns seven units below the crossing.
		[
			[
				{ x: 0, y: 50 },
				{ x: 100, y: 50 },
			],
			[
				{ x: 50, y: 0 },
				{ x: 50, y: 65 },
				{ x: 100, y: 65 },
			],
		],
		// ... or four units below it, turning back.
		[
			[
				{ x: 0, y: 50 },
				{ x: 100, y: 50 },
			],
			[
				{ x: 50, y: 0 },
				{ x: 50, y: 62 },
				{ x: 0, y: 62 },
			],
		],
	]) {
		const before = drawing(routes);
		const result = bridgeCrossings(before);
		expect(result.bridges).toHaveLength(1);
		expect(result.bridges[0]).toMatchObject({ edgeId: "0", under: ["1"] });
		expect(result.bridges[0]!.curve.segments.length).toBeGreaterThan(1);
		// The turning route keeps its shape.
		expect(result.edges[1]).toEqual(before.edges[1]!);
	}
});

// Every engine: where neither line had a bend's room past a hop, the
// later-painted line rose, however close to its own turn.
test("where neither line has a bend's room past a hop, the one with more room rises", () => {
	const result = bridgeCrossings(
		drawing([
			// Straight for eighteen units below the crossing.
			[
				{ x: 50, y: 0 },
				{ x: 50, y: 76 },
				{ x: 0, y: 76 },
			],
			// Straight for fifteen units past it, painted later.
			[
				{ x: 0, y: 50 },
				{ x: 73, y: 50 },
				{ x: 73, y: 100 },
			],
		]),
	);
	expect(result.bridges).toHaveLength(1);
	expect(result.bridges[0]).toMatchObject({ edgeId: "0", under: ["1"] });
	expect(result.bridges[0]!.curve.segments.length).toBeGreaterThan(1);
});

// Browser application and Agent workbench: a branch bent off its trunk and
// hopped a line a few points later, the turn and the hop one squiggle.
test("a line that turns just before a crossing does not hop it; the line it crosses does", () => {
	const result = bridgeCrossings(
		drawing([
			[
				{ x: 0, y: 50 },
				{ x: 200, y: 50 },
			],
			[
				{ x: 40, y: 27 },
				{ x: 90, y: 27 },
				{ x: 90, y: 120 },
			],
		]),
	);
	expect(result.bridges).toHaveLength(1);
	expect(result.bridges[0]!.edgeId).toBe("0");
	expect(result.bridges[0]!.under).toEqual(["1"]);
	expect(result.bridges[0]!.curve.segments.length).toBeGreaterThan(1);
});

// Archboard server (graphviz): a line crossed a fan-in trunk where one of its
// routes joined it, and the trunk was cut there, so the line ran straight
// through the join's mark and read as a four-way join. Beside the join, the
// line hops the trunk instead.
test("a line hops a trunk beside a join, and at the join the trunk stays whole, the line cut clear of it", () => {
	for (const [x, joined] of [
		[160, true],
		[164.8, false],
		[168, false],
	] as const) {
		const result = bridgeCrossings(
			drawing([
				[
					{ x: 0, y: 100 },
					{ x: 200, y: 100 },
				],
				[
					{ x: 152, y: 0 },
					{ x: 152, y: 100 },
					{ x: 200, y: 100 },
				],
				[
					{ x, y: 0 },
					{ x, y: 200 },
				],
			]),
		);
		const cut = result.bridges.find(({ under }) => under.includes("2"));
		expect(cut?.edgeId === "0" && cut.join === true, `x=${x}`).toBe(joined);
		const hop = result.bridges.find(({ edgeId }) => edgeId === "2");
		expect(hop !== undefined && hop.curve.segments.length > 1, `x=${x}`).toBe(!joined);
	}
});

/**
 * Whether every hop bulges the one way: up from a line across, right of a
 * line down, so no two face each other.
 * @param bridges A drawing's bridges.
 * @returns True when they do.
 */
function bulgeOneWay(bridges: ReturnType<typeof bridgeCrossings>["bridges"]): boolean {
	return bridges
		.filter((bridge) => bridge.curve.segments.length > 1)
		.every(({ curve }) => {
			const crest = curve.segments[0]!.to;
			return curve.segments.at(-1)!.to.y === curve.from.y
				? crest.y < curve.from.y
				: crest.x > curve.from.x;
		});
}

// Browser application and Command interface: two lines twelve apart hopped one
// line with arcs bulging toward each other, drawing a closed ring around it.
test("a crossing with room on both lines hops, centred, and every hop bulges the same way", () => {
	const result = bridgeCrossings(
		drawing([
			[
				{ x: 50, y: 0 },
				{ x: 50, y: 100 },
			],
			[
				{ x: 0, y: 50 },
				{ x: 100, y: 50 },
			],
		]),
	);
	// The later line rises over the earlier one, its crest on the crossing.
	expect(result.bridges).toHaveLength(1);
	expect(result.bridges[0]).toMatchObject({ edgeId: "1", under: ["0"] });
	expect(result.bridges[0]!.curve.segments[0]!.to).toEqual({ x: 50, y: 43 });
	expect(bulgeOneWay(result.bridges)).toBe(true);
});

/**
 * A straight route across at one height.
 * @param y The height.
 * @returns Its points.
 */
function across(y: number): Point[] {
	return [
		{ x: 0, y },
		{ x: 100, y },
	];
}

// Archboard server, Browser application and Skill evaluation: a line crossed
// two lines sixteen apart; one of them hopped it and the other, whose hop
// would have touched the first, was cut.
test("a line crossing two close lines rises over both under one crest", () => {
	const down = [
		{ x: 50, y: 0 },
		{ x: 50, y: 150 },
	];
	// Whether the crossing line is painted first or between the two.
	for (const routes of [
		[down, across(50), across(62)],
		[across(50), down, across(66)],
	]) {
		const result = bridgeCrossings(drawing(routes));
		const line = String(routes.indexOf(down));
		expect(result.bridges).toHaveLength(1);
		expect(result.bridges[0]!.edgeId).toBe(line);
		expect(result.bridges[0]!.under.toSorted()).toEqual(
			["0", "1", "2"].filter((id) => id !== line),
		);
		expect(bulgeOneWay(result.bridges)).toBe(true);
	}
});

// Every engine: a line crossing another route's corner was cut beneath the
// corner, though the corner turned on into a line leading away from it.
test("a straight line hops a rounded corner that turns away on the side its crest bulges to", () => {
	const before = drawing([
		[
			{ x: 50, y: 0 },
			{ x: 50, y: 200 },
		],
		[
			{ x: 150, y: 100 },
			{ x: 46, y: 100 },
			{ x: 46, y: 200 },
		],
	]);
	const result = bridgeCrossings(before);
	expect(result.bridges).toHaveLength(1);
	expect(result.bridges[0]).toMatchObject({ edgeId: "0", under: ["1"] });
	expect(result.bridges[0]!.curve.segments.length).toBeGreaterThan(1);
	expect(bulgeOneWay(result.bridges)).toBe(true);
	// The crest stands on the corner, not on the line it turns onto.
	const crest = result.bridges[0]!.curve.segments[0]!.to;
	expect(crest.y).toBeGreaterThan(100);
	expect(result.edges[1]).toEqual(before.edges[1]!);
});
