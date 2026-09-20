import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	corridorPoints,
	routeCrosses,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";

test("a flank label clears an unrelated corridor without bending away from its route", async () => {
	// Reduced from the actual 25px label detour: the new parallel route's label
	// overlaps the palette's older lane, although the rest of its flank is clear.
	const content = orderedFixture({
		nodes: [
			{
				id: "Y0smyqtZ",
				name: "Architecture layout",
				kind: "function",
			},
			{
				id: "u1OXg3Yy",
				name: "Theme palette",
				kind: "function",
			},
			{
				id: "J7mPrUeP",
				name: "SVG painters",
				kind: "function",
			},
			{
				id: "L51bfquE",
				name: "Edge routing",
				kind: "function",
			},
		],
		edges: [
			{
				id: "I1lGjMES",
				from: "u1OXg3Yy",
				to: "J7mPrUeP",
				kind: "data",
				label: "literal colors",
			},
			{
				id: "6zcjVgzh",
				from: "Y0smyqtZ",
				to: "J7mPrUeP",
				kind: "data",
				label: "complete placed drawing",
			},
			{
				id: "qJrkH2Qg",
				from: "Y0smyqtZ",
				to: "L51bfquE",
				kind: "call",
				label: "route relationships",
			},
			{
				id: "SIdU2g2Q",
				from: "Y0smyqtZ",
				to: "J7mPrUeP",
				kind: "data",
				label: "placed architecture",
			},
			{
				id: "0s8raCUw",
				from: "L51bfquE",
				to: "J7mPrUeP",
				kind: "data",
				label: "routed edges",
			},
		],
	});
	const drawing = await renderArchitecture({ content, theme: "light" });
	const points = routePoints(drawing.svg).get("6zcjVgzh")!;
	// How the added route is attached is chosen by the whole drawing's cost,
	// not fixed to a flank for it; what a reader needs is the label on a
	// straight run of its own route, no card crossed, and the drawing's turns
	// within the wide-board bound. Bridges are removed before counting bends.
	const corridors = corridorPoints(drawing.svg);
	expect(onStraightRun(corridors.get("6zcjVgzh")!, drawing, "6zcjVgzh")).toBe(true);
	const turns = [...corridors.values()].reduce((total, route) => total + bendsOf(route), 0);
	expect(turns / corridors.size, "bends per route").toBeLessThanOrEqual(3);
	for (const card of Object.values(drawing.atlas.nodes))
		expect(routeCrosses(points, card)).toBe(false);
});

test("flank label allocation keeps an outer corridor clear of an adjacent card", async () => {
	// Reduced from the literal-colors route: another labeled flank starts farther
	// inside, and will move outward. Clearing it first must not push this route
	// into the adjacent card and force a detour below that card.
	const content = orderedFixture({
		nodes: [
			{
				id: "Y0smyqtZ",
				name: "Architecture layout",
				kind: "function",
			},
			{
				id: "wLF1X11D",
				name: "Data-flow layout",
				kind: "function",
			},
			{
				id: "u1OXg3Yy",
				name: "Theme palette",
				kind: "function",
			},
			{
				id: "J7mPrUeP",
				name: "SVG painters",
				kind: "function",
			},
		],
		edges: [
			{
				id: "I1lGjMES",
				from: "u1OXg3Yy",
				to: "J7mPrUeP",
				kind: "data",
				label: "literal colors",
			},
			{
				id: "SIdU2g2Q",
				from: "Y0smyqtZ",
				to: "J7mPrUeP",
				kind: "data",
				label: "placed architecture",
			},
		],
	});
	const drawing = await renderArchitecture({ content, theme: "light" });
	const points = corridorPoints(drawing.svg).get("I1lGjMES")!;
	// The route keeps its label on a straight run, with few bends and no card crossed.
	expect(onStraightRun(points, drawing, "I1lGjMES")).toBe(true);
	expect(
		bendsOf(points),
		"a route that detours around its own label is a snake",
	).toBeLessThanOrEqual(4);
	for (const card of Object.values(drawing.atlas.nodes))
		expect(routeCrosses(routePoints(drawing.svg).get("I1lGjMES")!, card)).toBe(false);
});

test("a skip keeps its label on its own run and clears every card", async () => {
	const content = orderedFixture({
		nodes: [
			{
				id: "Y0smyqtZ",
				name: "Architecture layout",
				kind: "function",
			},
			{
				id: "J3yMo4ag",
				name: "Measured text",
				kind: "function",
			},
			{
				id: "J7mPrUeP",
				name: "SVG painters",
				kind: "function",
			},
			{
				id: "L51bfquE",
				name: "Edge routing",
				kind: "function",
			},
		],
		edges: [
			{
				id: "6zcjVgzh",
				from: "Y0smyqtZ",
				to: "J7mPrUeP",
				kind: "data",
				label: "complete placed drawing",
			},
			{
				id: "qJrkH2Qg",
				from: "Y0smyqtZ",
				to: "L51bfquE",
				kind: "call",
			},
			{
				id: "Wn0XA35I",
				from: "Y0smyqtZ",
				to: "J3yMo4ag",
				kind: "call",
			},
			{
				id: "0s8raCUw",
				from: "L51bfquE",
				to: "J7mPrUeP",
				kind: "data",
			},
		],
	});
	const drawing = await renderArchitecture({ content, theme: "light" });
	// Route geometry follows the complete current dependency graph.
	const points = corridorPoints(drawing.svg).get("6zcjVgzh")!;
	expect(onStraightRun(points, drawing, "6zcjVgzh")).toBe(true);
	expect(
		bendsOf(points),
		"a route that detours around its own label is a snake",
	).toBeLessThanOrEqual(4);
	for (const card of Object.values(drawing.atlas.nodes))
		expect(routeCrosses(routePoints(drawing.svg).get("6zcjVgzh")!, card)).toBe(false);
});

/**
 * How many times a route changes axis.
 * @param points The route without its bridges.
 * @returns Its bends.
 */
function bendsOf(points: readonly { x: number; y: number }[]): number {
	return points.slice(2).filter((point, index) => {
		const previous = points[index]!,
			middle = points[index + 1]!;
		return (previous.x === middle.x) !== (middle.x === point.x);
	}).length;
}

/**
 * Whether a route's label lies on one straight axis-aligned run of that route.
 * @param points The route without its bridges.
 * @param drawing The drawing holding the label.
 * @param id The relationship.
 * @returns True when one run carries the whole label.
 */
function onStraightRun(
	points: readonly { x: number; y: number }[],
	drawing: { svg: string },
	id: string,
): boolean {
	const label = routeLabels(drawing.svg).get(id)!;
	const centre = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
	// ELK centres an inline label at ceil(width) / 2 while the measured box
	// uses width / 2, so a label on its run can sit up to half a unit off it.
	const snap = 0.5;
	return points.slice(1).some((end, index) => {
		const start = points[index]!;
		const horizontal = start.y === end.y && Math.abs(start.y - centre.y) <= snap;
		const vertical = start.x === end.x && Math.abs(start.x - centre.x) <= snap;
		return (
			(horizontal &&
				Math.min(start.x, end.x) <= label.x &&
				Math.max(start.x, end.x) >= label.x + label.width) ||
			(vertical &&
				Math.min(start.y, end.y) <= label.y &&
				Math.max(start.y, end.y) >= label.y + label.height)
		);
	});
}
