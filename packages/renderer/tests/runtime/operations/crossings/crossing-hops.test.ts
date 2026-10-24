// Which line rises where two lines cross, and where a hop may stand, on fixed
// route geometry.
import { expect, test } from "bun:test";
import type { bridgeCrossings } from "#shared/rules/layout/routes/crossings.ts";
import { curveBounds } from "#shared/rules/layout/routes/curves.ts";
import { sharedInk } from "#shared/rules/layout/routes/drawn-lines.ts";
import { bridged, drawing } from "#tests/runtime/support/fixed-routes.ts";

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
		const result = bridged(before);
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
	const result = bridged(
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
	const result = bridged(
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
		const result = bridged(
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
	const result = bridged(
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

// Blocks: a line crossed a trunk of joined lines, and only the route that drew
// the trunk's ink hopped it. The others ran straight under the arc, so their
// traffic rode through the crossing instead of over it.
test("every route of a trunk hops with it, and the trunk draws each hop once", () => {
	const result = bridged(
		drawing([
			[
				{ x: 100, y: 0 },
				{ x: 100, y: 100 },
			],
			[
				{ x: 0, y: 50 },
				{ x: 200, y: 50 },
			],
			// The same line one unit lower, run the other way.
			[
				{ x: 200, y: 51 },
				{ x: 0, y: 51 },
			],
		]),
	);
	expect(result.bridges).toHaveLength(1);
	expect(result.bridges[0]).toMatchObject({ edgeId: "1", under: ["0"] });
	const crest = curveBounds(result.bridges[0]!.curve).y;
	for (const [index, line] of [
		[1, 50],
		[2, 51],
	] as const) {
		const { curve } = result.edges[index]!;
		expect(curveBounds(curve).y, `route ${index}`).toBe(crest + line - 50);
		expect(curve.segments.at(-1)!.to.y, `route ${index}`).toBe(line);
	}
	// The route that does not draw the trunk hides its own arc under the drawer's.
	const hidden = sharedInk(result.edges).get(2) ?? [];
	expect(hidden.some((piece) => curveBounds(piece).y <= crest + 1)).toBe(true);
});
