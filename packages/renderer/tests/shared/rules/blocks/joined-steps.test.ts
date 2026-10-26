// Steps a joined line need not take, taken out (steps.ts). What this catches:
// a line joined from pieces routed in different blocks that steps sideways
// and on, or doubles back, where one turn would do, alone or on a trunk; and
// a slide that takes a step out by moving part of a trunk, by carrying a
// trunk's line the long way round, by moving a line's end run or its run
// through its label, by turning the line within a bend of its label, or by
// running a new stretch into a card or past it nearer than the router keeps
// lines, a title band, a wall it did not cross, along a wall, onto another
// line's axis, beside it, across it where it did not cross or where that
// line turns, or into a jog too short for its bends,
// or that leaves the last run too short for its bend and its arrowhead;
// and a step left in place because a line that slides away later stood in
// its way.
import { expect, test } from "bun:test";
import { unstepped } from "#shared/rules/blocks/lines/steps.ts";
import { type Point } from "#shared/rules/geometry.ts";

/** Right, down, right, back up and right again: a line that doubles back. */
const DOUBLING: Point[] = [
	{ x: 0, y: 50 },
	{ x: 100, y: 50 },
	{ x: 100, y: 150 },
	{ x: 200, y: 150 },
	{ x: 200, y: 100 },
	{ x: 300, y: 100 },
];
/** It unstepped onto its first row. */
const ON_FIRST = [
	{ x: 0, y: 50 },
	{ x: 200, y: 50 },
	{ x: 200, y: 100 },
	{ x: 300, y: 100 },
];
/** It unstepped onto its last row. */
const ON_LAST = [
	{ x: 0, y: 50 },
	{ x: 100, y: 50 },
	{ x: 100, y: 100 },
	{ x: 300, y: 100 },
];
const NOTHING = { boxes: [], walls: [], bands: [] };

/**
 * A line as a list of points.
 * @param points Its corners, as x, y pairs.
 * @returns The points.
 */
function line(...points: [number, number][]): Point[] {
	return points.map(([x, y]) => ({ x, y }));
}

test("a staircase between blocks climbs with one turn each way", () => {
	const stairs = line([100, 0], [100, 100], [300, 100], [300, 200], [500, 200], [500, 300]);
	const [drawn] = unstepped([{ points: stairs }], NOTHING);
	expect(drawn).toHaveLength(4);
	expect([drawn![0], drawn!.at(-1)]).toEqual([stairs[0], stairs.at(-1)]);
});

test("a line that doubles back at a wall runs on without the loop", () => {
	expect(unstepped([{ points: DOUBLING }], NOTHING)[0]).toEqual(ON_FIRST);
});

test.each([
	["a card where either slide would run", { boxes: [{ x: 120, y: 40, width: 60, height: 70 }] }],
	["a wall either slide would cross", { walls: [{ x: 130, y: 0, width: 40, height: 120 }] }],
])("a step stays where %s", (_, around) => {
	expect(unstepped([{ points: DOUBLING }], { ...NOTHING, ...around })[0]).toEqual(DOUBLING);
});

test("a step stays where either slide crosses a line it did not", () => {
	const across = { points: line([150, 0], [150, 130]) };
	expect(unstepped([{ points: DOUBLING }, across], NOTHING)[0]).toEqual(DOUBLING);
});

test("a step stays where either slide leaves a run too short for its two bends", () => {
	const shallow = line([0, 50], [100, 50], [100, 150], [200, 150], [200, 60], [300, 60]);
	expect(unstepped([{ points: shallow }], NOTHING)[0]).toEqual(shallow);
});

test("a step stays where the slide leaves the last run too short for its bend and its arrowhead", () => {
	// Reduced from Board viewer's TASK-365 comparison under blocks (TASK-403):
	// the slide left 16 units, a bend of 8 and 8 of straight, under a head
	// whose ink reaches 8.8 back.
	const rising = line([0, 0], [100, 0], [100, 26], [200, 26], [200, -16]);
	expect(unstepped([{ points: rising }], NOTHING)[0]).toEqual(rising);
});

test("a step stays where it is the line's run through its label", () => {
	const label = { x: 130, y: 140, width: 40, height: 20 };
	expect(unstepped([{ points: DOUBLING, label }], NOTHING)[0]).toEqual(DOUBLING);
});

test("a step stays where the slide would turn the line within a bend of its label", () => {
	// Reduced from Codex workhorse under blocks (TASK-536): the slide kept the
	// run through the label but turned it 7.5 units short of the label, so the
	// rounded bend ran under the label's end.
	const step = line([300, 20], [250, 20], [250, 0], [0, 0], [0, 120]);
	const label = { x: -20, y: 26, width: 40, height: 46 };
	expect(unstepped([{ points: step, label }], NOTHING)[0]).toEqual(step);
});

test("a step another line held is taken out once that line has slid away", () => {
	// Its middle run crosses one of the doubling line's slides and runs beside
	// the other, until it slides onto the column of its first run.
	const later = line([350, -100], [350, -60], [150, -60], [150, 90], [450, 90], [450, 300]);
	expect(unstepped([{ points: DOUBLING }, { points: later }], NOTHING)[0]).toEqual(ON_FIRST);
});

test("lines that share a step's whole run between two turns slide it together", () => {
	const branch = [...DOUBLING, { x: 300, y: 200 }];
	const [one, other] = unstepped([{ points: DOUBLING }, { points: branch }], NOTHING);
	expect(one).toEqual(ON_FIRST);
	expect(other).toEqual([...ON_FIRST, { x: 300, y: 200 }]);
});

test("a step another line shares only part of stays", () => {
	const trunk = { points: line([100, 150], [200, 150]) };
	expect(unstepped([{ points: DOUBLING }, trunk], NOTHING)[0]).toEqual(DOUBLING);
});

test("a slide runs level no nearer a container's title band than a lane", () => {
	const bands = [{ x: 0, y: 0, width: 300, height: 80 }];
	expect(unstepped([{ points: DOUBLING }], { ...NOTHING, bands })[0]).toEqual(ON_LAST);
});

test("a slide passes a card no nearer than the router keeps lines from it", () => {
	const boxes = [{ x: 120, y: 0, width: 60, height: 40 }];
	expect(unstepped([{ points: DOUBLING }], { ...NOTHING, boxes })[0]).toEqual(ON_LAST);
});

test("a slide runs along a wall no nearer than a lane and a half", () => {
	const walls = [{ x: -50, y: -100, width: 450, height: 140 }];
	expect(unstepped([{ points: DOUBLING }], { ...NOTHING, walls })[0]).toEqual(ON_LAST);
});

test.each([
	["beside another line nearer than a lane", line([120, 60], [180, 60])],
	["onto another line's axis end to end with it", line([230, 50], [400, 50])],
	["across another line beside where it turns", line([150, 40], [150, 170])],
])("a slide keeps off a new stretch %s", (_, other) => {
	expect(unstepped([{ points: DOUBLING }, { points: other }], NOTHING)[0]).toEqual(ON_LAST);
});

test("a slide carries no line of a trunk the long way round", () => {
	const far = line([0, 0], [0, 100], [1000, 100], [1000, 200], [1200, 200], [1200, 300]);
	const near = line([1100, 0], [1100, 100], [1000, 100], [1000, 200], [1200, 200], [1200, 300]);
	const boxes = [{ x: 1150, y: 120, width: 100, height: 60 }];
	const drawn = unstepped([{ points: far }, { points: near }], { ...NOTHING, boxes });
	expect(drawn.map(reach)).toSatisfy(([one, other]) => one! <= reach(far) && other! <= reach(near));
});

test("a slide carries a trunk's line a little further to take its step out", () => {
	const jog = line([950, 0], [950, 100], [1000, 100], [1000, 200], [1200, 200], [1200, 300]);
	const near = line([1100, 0], [1100, 100], [1000, 100], [1000, 200], [1200, 200], [1200, 300]);
	const boxes = [{ x: 1150, y: 120, width: 100, height: 60 }];
	const [drawn] = unstepped([{ points: jog }, { points: near }], { ...NOTHING, boxes });
	expect(drawn!.length).toBeLessThan(jog.length);
});

/**
 * How far a line runs.
 * @param points The line.
 * @returns Its length.
 */
function reach(points: readonly Point[]): number {
	return points
		.slice(1)
		.reduce(
			(sum, to, at) => sum + Math.abs(to.x - points[at]!.x) + Math.abs(to.y - points[at]!.y),
			0,
		);
}

test("a small offset between joined runs never stretches into a diagonal", () => {
	// Reduced from Board persistence: a quarter-point offset at a block port
	// looked upright when projected onto an axis. Sliding its lower run made
	// the run above diagonal, which that projection hid from clearance tests.
	const points = [
		{ x: 1648, y: 650 },
		{ x: 1648, y: 682 },
		{ x: 1882, y: 682 },
		{ x: 1881.75, y: 1583 },
		{ x: 1881.75, y: 1647 },
		{ x: 2038, y: 1647 },
		{ x: 2038, y: 2833 },
		{ x: 1813, y: 2833 },
		{ x: 1813, y: 2877 },
	];
	const label = { x: 1808, y: 726, width: 148, height: 31 };
	const walls = [{ x: 201, y: 197, width: 2012, height: 1386 }];
	const [drawn] = unstepped([{ points, label }], { ...NOTHING, walls });
	expect(
		drawn!.slice(1).every((to, index) => {
			const from = drawn![index]!;
			return Math.abs(to.x - from.x) < 0.5 || Math.abs(to.y - from.y) < 0.5;
		}),
	).toBe(true);
});
