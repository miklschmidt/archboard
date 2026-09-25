// Where routes join a shared lane (TASK-337).
//
// What is guarded: a route that joins another's lane is marked where it joins,
// even when routing nudged the two lanes a unit apart; two routes that only
// share a corner they turn together, or only the point they both end at, or
// lanes far enough apart to draw as two lines, are not marked.

import { expect, test } from "bun:test";
import { junctionsOf } from "@/transformers/semantic-renderer/layout";

/** A line as thick as an ordinary relationship's. */
const WIDTH = 1.4;

/**
 * One route through its corners.
 * @param corners Its ends and corners, as x,y pairs.
 * @returns The route.
 */
function route(...corners: readonly (readonly [number, number])[]) {
	return { corners: corners.map(([x, y]) => ({ x, y })), width: WIDTH };
}

test("a route joining another's lane is marked where it joins, and only there", () => {
	// Both end on one card at the bottom left. The second joins the first's
	// lane half way down, a unit and a bit to the side, which still draws as
	// one line; from there they run together and turn into the card together.
	const joins = junctionsOf([
		route([500, 0], [0, 0], [0, 400], [-40, 400]),
		route([500, 200], [1.2, 200], [1.2, 400], [-40, 400]),
	]);
	expect(joins).toHaveLength(1);
	expect(joins[0]!.point.x).toBeCloseTo(0.6, 1);
	expect(joins[0]!.point.y).toBeCloseTo(200, 1);
});

// Platform Phone API: a merge dot drawn at the corner a route's bend cut, eight
// units from where its ink met the lane, read as a spur.
test("a route turning off a lane is marked where its bend leaves the lane", () => {
	const joins = junctionsOf([
		route([0, 0], [0, 400]),
		{ ...route([0, 0], [0, 200], [100, 200]), bends: [0, 8, 0] },
	]);
	expect(joins).toHaveLength(1);
	expect(joins[0]!.point).toEqual({ x: 0, y: 192 });
});

// Board rasterizer and Command dispatch: three branches leaving one trunk six
// units apart drew three overlapping dots, a lumpy blob.
test("joins a few units apart along one lane are marked once, from the first to the last", () => {
	const joins = junctionsOf([
		route([0, 0], [0, 400]),
		route([0, 0], [0, 200], [100, 200]),
		route([0, 0], [0, 206], [-100, 206]),
	]);
	expect(joins).toHaveLength(1);
	expect(joins[0]!.point).toEqual({ x: 0, y: 200 });
	expect(joins[0]!.until).toEqual({ x: 0, y: 206 });
});

test("routes that only arrive at one point, or run apart, are not marked", () => {
	// One point both end at, from different sides.
	expect(junctionsOf([route([0, 0], [0, 100]), route([100, 100], [0, 100])])).toEqual([]);
	// Two lanes far enough apart to draw as two lines.
	expect(junctionsOf([route([0, 0], [0, 100]), route([6, 0], [6, 100])])).toEqual([]);
	// One lane from end to end, corners and all.
	expect(
		junctionsOf([route([0, 0], [0, 100], [50, 100]), route([1, 0], [1, 100], [51, 100])]),
	).toEqual([]);
});
