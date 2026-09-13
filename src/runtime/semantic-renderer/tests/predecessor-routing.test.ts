import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	corridorPoints,
	routeCrosses,
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
	// Crossing bridges are local hops, not a label-induced lane change. Collapse
	// only the circular hops recognized in the rendered route; keep all
	// other bends, and check card clearance against the actual ink below.
	const lanePoints = corridorPoints(drawing.svg).get("6zcjVgzh")!;
	const vertical = lanePoints
		.slice(1)
		.flatMap((point, index) =>
			point.x === lanePoints[index]!.x && point.y !== lanePoints[index]!.y ? [point.x] : [],
		);
	expect(vertical.length).toBeGreaterThan(0);
	expect(new Set(vertical).size, "one continuous flank through the label").toBe(1);
	for (const card of Object.values(drawing.atlas.nodes))
		expect(routeCrosses(points, card)).toBe(false);
});
