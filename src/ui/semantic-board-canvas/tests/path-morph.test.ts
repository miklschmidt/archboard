// A drawn line turning into another: the arithmetic the transition applies to
// a connection's route, held to what it promises without a browser.
//
// What these catch: a route read wrongly (a relative command taken as
// absolute, a shorthand reflecting the wrong point, a close that draws no leg),
// a morph that is not exact at its ends, an interpolation that bunches its
// anchors, and a length a draw-on dash would be set wrongly from.

import { describe, expect, test } from "bun:test";

import {
	morphPath,
	parsePath,
	pathLength,
	serialise,
} from "@/ui/semantic-board-canvas/transitions";

/**
 * The anchors a route passes through, which is what a reader would check.
 * @param d The route.
 * @returns Its start and each segment's end.
 */
function anchors(d: string): [number, number][] {
	const outline = parsePath(d);
	if (outline === null) {
		throw new Error(`unreadable: ${d}`);
	}
	return [outline.start, ...outline.segments.map((segment) => segment.to)].map((p) => [p.x, p.y]);
}

describe("reading a route", () => {
	test("absolute and relative legs land on the same anchors", () => {
		expect(anchors("M10,20 L30,20 V40 H50")).toEqual([
			[10, 20],
			[30, 20],
			[30, 40],
			[50, 40],
		]);
		expect(anchors("m10,20 l20,0 v20 h20")).toEqual([
			[10, 20],
			[30, 20],
			[30, 40],
			[50, 40],
		]);
	});

	test("pairs after a move are legs, and a close draws the leg back", () => {
		expect(anchors("M0,0 10,0 10,10 Z")).toEqual([
			[0, 0],
			[10, 0],
			[10, 10],
			[0, 0],
		]);
		expect(parsePath("M0,0 10,0 10,10 Z")?.closed).toBe(true);
	});

	test("a rounded corner is read as the cubic the renderer wrote", () => {
		const outline = parsePath("M356,247 L356,328 C356,335.73 362.27,342 370,342 L804,342");
		expect(outline?.segments).toHaveLength(3);
		expect(outline?.segments[1]).toEqual({
			c1: { x: 356, y: 335.73 },
			c2: { x: 362.27, y: 342 },
			to: { x: 370, y: 342 },
		});
	});

	test("smooth shorthands reflect the previous control point", () => {
		const outline = parsePath("M0,0 C0,10 10,10 10,0 S20,-10 20,0");
		expect(outline?.segments[1]?.c1).toEqual({ x: 10, y: -10 });
		const quadratic = parsePath("M0,0 Q5,10 10,0 T20,0");
		expect(quadratic?.segments[1]).toEqual(parsePath("M10,0 Q15,-10 20,0")?.segments[0]);
	});

	test("what is not one line is refused rather than guessed", () => {
		expect(parsePath("M0,0 L10,10 M20,20 L30,30")).toBeNull();
		expect(parsePath("M0,0 A5,5 0 0 1 10,10")).toBeNull();
		expect(parsePath("L10,10")).toBeNull();
		expect(parsePath("M0,0 L10")).toBeNull();
		expect(parsePath("")).toBeNull();
		expect(parsePath("M0,0 Z L5,5")).toBeNull();
	});
});

describe("morphing one route into another", () => {
	test("is exactly the routes it was given at either end", () => {
		const from = "M0,0 L100,0";
		const to = "M0,50 L50,50 C60,50 60,60 60,70 L60,100";
		const morph = morphPath(from, to);
		expect(morph).not.toBeNull();
		expect(morph!(0)).toBe(from);
		expect(morph!(1)).toBe(to);
		expect(morph!(-1)).toBe(from);
		expect(morph!(2)).toBe(to);
	});

	test("halfway, every anchor is halfway between its two routes", () => {
		const morph = morphPath("M0,0 L100,0", "M0,100 L100,100")!;
		expect(anchors(morph(0.5))).toEqual([
			[0, 50],
			[100, 50],
		]);
	});

	test("a route with fewer segments is cut, not stretched, to meet the other", () => {
		const morph = morphPath("M0,0 L100,0", "M0,0 L50,0 L50,50 L100,50")!;
		// One segment against three: the straight line is cut in two, then the
		// longer half again, so the halfway line has the anchors of both.
		expect(anchors(morph(0.5))).toHaveLength(4);
		// Nothing bunches: the cut anchors of the straight line are spread along it.
		expect(anchors(morph(0)).length).toBe(2);
		const [, second, third] = anchors(morph(0.5));
		expect(second![0]).toBeLessThan(third![0]);
	});

	test("the halfway line is written in cubics only, which is what keeps corners round", () => {
		const morph = morphPath("M0,0 L100,0", "M0,50 L50,50 C60,50 60,60 60,70 L60,100")!;
		expect(morph(0.5)).toMatch(/^M[-\d.,]+( C[-\d.,]+ [-\d.,]+ [-\d.,]+)+$/);
	});

	test("a route the morph cannot carry is refused", () => {
		expect(morphPath("M0,0 L10,10", "M0,0 A5,5 0 0 1 10,10")).toBeNull();
		expect(morphPath("M0,0", "M0,0 L10,10")).toBeNull();
	});

	test("writing an outline back reads as the same outline", () => {
		// Anchors whose thirds are exact, since a `d` is written to two decimals.
		const outline = parsePath("M0,0 L9,0 C12,0 15,3 15,6 Z")!;
		expect(parsePath(serialise(outline))).toEqual(outline);
	});
});

describe("measuring a route", () => {
	test("a straight route measures its geometry", () => {
		expect(pathLength("M0,0 L30,40")).toBeCloseTo(50, 6);
		expect(pathLength("M0,0 H30 V40")).toBeCloseTo(70, 6);
	});

	test("a curve measures close to its arc, which a dash is set from", () => {
		// A quarter circle of radius 100 drawn as one cubic is 157.08 long.
		const length = pathLength("M100,0 C100,55.23 55.23,100 0,100");
		expect(length).toBeGreaterThan(156);
		expect(length).toBeLessThan(158);
	});

	test("what cannot be read cannot be measured", () => {
		expect(pathLength("M0,0 A5,5 0 0 1 10,10")).toBeNull();
	});
});
