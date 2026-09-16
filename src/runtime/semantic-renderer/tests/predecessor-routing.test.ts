import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	corridorPoints,
	routeCrosses,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";

test("a direct route label follows the current attachments after a branch is added", async () => {
	const before = VariantContentSchema.parse({
		nodes: ["source", "target"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [{ id: "direct", from: "source", to: "target", kind: "call", label: "compound graph" }],
	});
	const content = VariantContentSchema.parse({
		nodes: [...before.nodes, { id: "branch", name: "Branch", kind: "module" }],
		edges: [
			...before.edges,
			{ id: "branch1", from: "source", to: "branch", kind: "call" },
			{ id: "branch2", from: "branch", to: "target", kind: "call" },
		],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const points = routePoints(drawing.svg).get("direct")!;
	expect(points[0]!.x).toBe(points.at(-1)!.x);
	for (const point of points) expect(point.x).toBe(points[0]!.x);
});

test("a new labeled branch keeps an inherited direct route between its attachments", async () => {
	const before = VariantContentSchema.parse({
		nodes: ["a", "c"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [{ id: "ac", from: "a", to: "c", kind: "call" }],
	});
	const content = VariantContentSchema.parse({
		nodes: [...before.nodes, { id: "b", name: "Additional branch", kind: "module" }],
		edges: [
			...before.edges,
			{ id: "bc", from: "b", to: "c", kind: "call", label: "additional branch" },
		],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const points = routePoints(drawing.svg).get("ac")!;
	const minimum = Math.min(points[0]!.x, points.at(-1)!.x);
	const maximum = Math.max(points[0]!.x, points.at(-1)!.x);
	for (const point of points) {
		expect(point.x).toBeGreaterThanOrEqual(minimum);
		expect(point.x).toBeLessThanOrEqual(maximum);
	}
});

test("an additional flank connection keeps the predecessor cards in one column", async () => {
	const before = VariantContentSchema.parse({
		nodes: ["a", "b", "c", "d"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "ab", from: "a", to: "b", kind: "call" },
			{ id: "bc", from: "b", to: "c", kind: "call" },
			{ id: "cd", from: "c", to: "d", kind: "call" },
			{ id: "skip", from: "a", to: "d", kind: "call" },
		],
	});
	const content = VariantContentSchema.parse({
		...before,
		edges: [...before.edges, { id: "skip2", from: "a", to: "d", kind: "call" }],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const cards = Object.values(drawing.atlas.nodes);
	expect(new Set(cards.map((card) => card.x)).size).toBe(1);
	for (const route of routePoints(drawing.svg).values()) {
		for (const card of cards) expect(routeCrosses(route, card)).toBe(false);
	}
});

test("inherited return lanes and new branch labels stay beside their endpoints", async () => {
	const before = VariantContentSchema.parse({
		nodes: ["a", "b", "c", "d"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "ab", from: "a", to: "b", label: "first", kind: "call" },
			{ id: "bc", from: "b", to: "c", label: "second", kind: "call" },
			{ id: "cd", from: "c", to: "d", label: "third", kind: "call" },
			{ id: "back", from: "d", to: "a", label: "return result", kind: "call" },
		],
	});
	const content = VariantContentSchema.parse({
		...before,
		nodes: [
			...before.nodes,
			{ id: "new", name: "New stage", kind: "module" },
			{ id: "next", name: "Next stage", kind: "module" },
		],
		edges: [
			...before.edges,
			{ id: "branch", from: "b", to: "new", label: "branch", kind: "call" },
			{ id: "nextstep", from: "new", to: "next", label: "prepare and wrap", kind: "call" },
		],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const routes = routePoints(drawing.svg);
	const source = drawing.atlas.nodes["new"]!,
		target = drawing.atlas.nodes["next"]!;
	const minimum = Math.min(source.x, target.x),
		maximum = Math.max(source.x + source.width, target.x + target.width);
	for (const point of routes.get("nextstep")!) {
		expect(point.x).toBeGreaterThanOrEqual(minimum);
		expect(point.x).toBeLessThanOrEqual(maximum);
	}
	const first = drawing.atlas.nodes["a"]!,
		last = drawing.atlas.nodes["d"]!;
	for (const point of routes.get("back")!)
		expect(point.x).toBeGreaterThanOrEqual(Math.min(first.x + first.width, last.x + last.width));
});

test("an inherited return route does not zigzag inside a clear corridor", async () => {
	// A seven-stage cycle becomes one return connection and an isolated stage.
	// The retained stage keeps its inherited position outside the return corridor.
	// This is the smallest input reduced from the Semantic renderer board that
	// preserves its repeated horizontal reversals; keep the subject order and ids.
	const before = VariantContentSchema.parse({
		nodes: [
			{ id: "LgbAlvMN", name: "Canvas server", kind: "module" },
			{ id: "wpI1LbzG", name: "View dispatcher", kind: "module" },
			{ id: "y8vuJJKu", name: "Layout graph", kind: "module" },
			{ id: "Y0smyqtZ", name: "Compound layout", kind: "module" },
			{ id: "L51bfquE", name: "Edge routing", kind: "module" },
			{ id: "J7mPrUeP", name: "SVG painters", kind: "module" },
			{ id: "eECDrhMc", name: "SVG document", kind: "module" },
		],
		edges: [
			{ id: "fl3z5Duy", from: "LgbAlvMN", to: "wpI1LbzG", kind: "call" },
			{ id: "KtJOCzrZ", from: "wpI1LbzG", to: "y8vuJJKu", kind: "call" },
			{ id: "v3e9dOLe", from: "y8vuJJKu", to: "Y0smyqtZ", kind: "call" },
			{ id: "qJrkH2Qg", from: "Y0smyqtZ", to: "L51bfquE", kind: "call" },
			{ id: "0s8raCUw", from: "L51bfquE", to: "J7mPrUeP", kind: "call" },
			{ id: "qDiEFiIT", from: "J7mPrUeP", to: "eECDrhMc", kind: "call" },
			{ id: "8EDKem8V", from: "eECDrhMc", to: "LgbAlvMN", kind: "call" },
		],
	});
	const content = VariantContentSchema.parse({
		nodes: [before.nodes[0], before.nodes[6], before.nodes[4]],
		edges: [before.edges[6]],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	expect(Object.values(drawing.atlas.nodes).flatMap(Object.values).every(Number.isFinite)).toBe(
		true,
	);
	const points = routePoints(drawing.svg).get("8EDKem8V")!;
	expect(points.length).toBeGreaterThan(1);
	const source = drawing.atlas.nodes["eECDrhMc"]!;
	const retained = drawing.atlas.nodes["L51bfquE"]!;
	const baseline = await renderArchitecture({ content: before, theme: "light" });
	expect(retained.x).toBe(baseline.atlas.nodes["L51bfquE"]!.x);
	for (const point of points) {
		expect(point.x).toBeGreaterThanOrEqual(source.x + source.width);
	}
	expect(routeCrosses(points, retained)).toBe(false);
	// Ignore vertical runs and rounding control points with no horizontal change.
	// A straight outside return lane needs only its departure and arrival turns.
	const directions = points
		.slice(1)
		.map((point, index) => Math.sign(point.x - points[index]!.x))
		.filter((direction) => direction !== 0);
	const reversals = directions
		.slice(1)
		.filter((direction, index) => direction !== directions[index]);
	expect(
		reversals.length,
		"horizontal reversals inside the clear return corridor",
	).toBeLessThanOrEqual(2);
});

test("a flank label clears an unrelated corridor without bending away from its route", async () => {
	// Reduced from the actual 25px label detour: the new parallel route's label
	// overlaps the palette's older lane, although the rest of its flank is clear.
	const before = VariantContentSchema.parse({
		nodes: [
			["y8vuJJKu", "Region builder"],
			["Y0smyqtZ", "Architecture layout"],
			["L51bfquE", "Edge routing"],
			["u1OXg3Yy", "Theme palette"],
			["J7mPrUeP", "SVG painters"],
		].map(([id, name]) => ({ id, name, kind: "function" })),
		edges: [
			{ id: "v3e9dOLe", from: "y8vuJJKu", to: "Y0smyqtZ", kind: "data", label: "visible regions" },
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
			{ id: "0s8raCUw", from: "L51bfquE", to: "J7mPrUeP", kind: "data", label: "routed edges" },
			{ id: "I1lGjMES", from: "u1OXg3Yy", to: "J7mPrUeP", kind: "data", label: "literal colors" },
		],
	});
	const content = VariantContentSchema.parse({
		nodes: [before.nodes[1], before.nodes[3], before.nodes[4], before.nodes[2]],
		edges: [
			before.edges[4],
			{
				id: "6zcjVgzh",
				from: "Y0smyqtZ",
				to: "J7mPrUeP",
				kind: "data",
				label: "complete placed drawing",
			},
			before.edges[1],
			before.edges[2],
			before.edges[3],
		],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
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
	const before = VariantContentSchema.parse({
		nodes: [
			["y8vuJJKu", "Region builder"],
			["Y0smyqtZ", "Architecture layout"],
			["L51bfquE", "Edge routing"],
			["wLF1X11D", "Data-flow layout"],
			["u1OXg3Yy", "Theme palette"],
			["J7mPrUeP", "SVG painters"],
			["eECDrhMc", "SVG document and atlas"],
		].map(([id, name]) => ({ id, name, kind: "function" })),
		edges: [
			{ id: "v3e9dOLe", from: "y8vuJJKu", to: "Y0smyqtZ", kind: "data" },
			{ id: "qJrkH2Qg", from: "Y0smyqtZ", to: "L51bfquE", kind: "call" },
			{
				id: "SIdU2g2Q",
				from: "Y0smyqtZ",
				to: "J7mPrUeP",
				kind: "data",
				label: "placed architecture",
			},
			{ id: "0s8raCUw", from: "L51bfquE", to: "J7mPrUeP", kind: "data" },
			{ id: "eKqUHYSH", from: "wLF1X11D", to: "J7mPrUeP", kind: "data" },
			{ id: "I1lGjMES", from: "u1OXg3Yy", to: "J7mPrUeP", kind: "data", label: "literal colors" },
			{ id: "qDiEFiIT", from: "J7mPrUeP", to: "eECDrhMc", kind: "render" },
		],
	});
	const content = VariantContentSchema.parse({
		nodes: [before.nodes[1], before.nodes[3], before.nodes[4], before.nodes[5]],
		edges: [before.edges[5], before.edges[2]],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const points = corridorPoints(drawing.svg).get("I1lGjMES")!;
	// Its faces come from the predecessor picture, where a single-relationship
	// card's skip is the engine's to attach; the reader's invariant is one
	// route with its label on a straight run, few bends, and no card crossed.
	expect(onStraightRun(points, drawing, "I1lGjMES")).toBe(true);
	expect(
		bendsOf(points),
		"a route that detours around its own label is a snake",
	).toBeLessThanOrEqual(4);
	for (const card of Object.values(drawing.atlas.nodes))
		expect(routeCrosses(routePoints(drawing.svg).get("I1lGjMES")!, card)).toBe(false);
});

test("a skip a proposal adds keeps its label on its own run and clears the pinned cards", async () => {
	const before = VariantContentSchema.parse({
		nodes: [
			["Y0smyqtZ", "Architecture layout"],
			["L51bfquE", "Edge routing"],
			["J3yMo4ag", "Measured text"],
			["J7mPrUeP", "SVG painters"],
		].map(([id, name]) => ({ id, name, kind: "function" })),
		edges: [
			{ id: "qJrkH2Qg", from: "Y0smyqtZ", to: "L51bfquE", kind: "call" },
			{ id: "Wn0XA35I", from: "Y0smyqtZ", to: "J3yMo4ag", kind: "call" },
			{ id: "neQc1gXi", from: "L51bfquE", to: "J3yMo4ag", kind: "call" },
		],
	});
	const content = VariantContentSchema.parse({
		nodes: [before.nodes[0], before.nodes[2], before.nodes[3], before.nodes[1]],
		edges: [
			{
				id: "6zcjVgzh",
				from: "Y0smyqtZ",
				to: "J7mPrUeP",
				kind: "data",
				label: "complete placed drawing",
			},
			before.edges[0],
			before.edges[1],
			{ id: "0s8raCUw", from: "L51bfquE", to: "J7mPrUeP", kind: "data" },
		],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	// Its faces are the ones a first render of the proposal gives it, never a
	// flank or a top approach guessed from where the predecessor put the cards.
	const points = corridorPoints(drawing.svg).get("6zcjVgzh")!;
	expect(onStraightRun(points, drawing, "6zcjVgzh")).toBe(true);
	expect(
		bendsOf(points),
		"a route that detours around its own label is a snake",
	).toBeLessThanOrEqual(4);
	for (const card of Object.values(drawing.atlas.nodes))
		expect(routeCrosses(routePoints(drawing.svg).get("6zcjVgzh")!, card)).toBe(false);
});

test("a surviving relationship keeps the face it left and reached in the predecessor, whichever the ranks would now choose", async () => {
	// A return took the right flank in the predecessor. Adding a card that
	// makes the same relationship a forward step by rank must not move its
	// attachments: the faces are read back from the predecessor's route ends.
	const before = VariantContentSchema.parse({
		nodes: ["a", "b"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "ab", from: "a", to: "b", kind: "call" },
			{ id: "ba", from: "b", to: "a", kind: "call", label: "result" },
		],
	});
	const content = VariantContentSchema.parse({
		nodes: [...before.nodes, { id: "c", name: "c", kind: "module" }],
		edges: [...before.edges, { id: "bc", from: "b", to: "c", kind: "call" }],
	});
	const first = await renderArchitecture({ content: before, theme: "light" });
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const wasFrom = routePoints(first.svg).get("ba")![0]!;
	const nowFrom = routePoints(drawing.svg).get("ba")![0]!;
	const b = { was: first.atlas.nodes["b"]!, now: drawing.atlas.nodes["b"]! };
	expect(faceOf(nowFrom, b.now)).toBe(faceOf(wasFrom, b.was));
});

/**
 * Which horizontal face of a card a route point sits on.
 * @param point The route's first point.
 * @param box The card.
 * @returns west, east or other.
 */
function faceOf(point: { x: number; y: number }, box: { x: number; width: number }): string {
	if (Math.abs(point.x - box.x) < 1) return "west";
	return Math.abs(point.x - box.x - box.width) < 1 ? "east" : "other";
}

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
