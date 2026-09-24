// Fixed route geometry exercises corner/bridge interaction independently of
// whichever crossings a placement engine chooses for a whole board.
import { expect, test } from "bun:test";
import {
	bridgeCrossings,
	curveThrough,
	curveClearanceIssue,
	type ArchitectureDrawing,
	type DrawingEdge,
	type Point,
} from "@/runtime/semantic-renderer/layout";

const ROUTES: readonly (readonly Point[])[] = [
	[
		{ x: 0, y: 50 },
		{ x: 100, y: 50 },
	],
	[
		{ x: 50, y: 0 },
		{ x: 50, y: 65 },
		{ x: 100, y: 65 },
	],
];

/**
 * Rounded routes as they reach crossing treatment.
 * @param routes The fixed orthogonal routes.
 * @returns The complete geometry presented to bridge placement.
 */
function drawing(routes: readonly (readonly Point[])[] = ROUTES): ArchitectureDrawing {
	const edges: DrawingEdge[] = routes.map((points, index) => ({
		edge: {
			id: String(index),
			order: (index + 1) * 1000,
			from: `source${index}`,
			to: `target${index}`,
			kind: "call",
			emphasis: "normal",
		},
		curve: curveThrough(points),
		path: "",
	}));
	return { direction: "down", width: 120, height: 100, cards: [], containers: [], edges };
}

test("a crossing beside a rounded turn uses the other route when the preferred arc cannot fit", () => {
	const before = drawing();
	const result = bridgeCrossings(before);
	expect(result.bridges).toHaveLength(1);
	expect(result.bridges[0]!.edgeId).toBe("0");
	expect(result.bridges[0]!.under).toEqual(["1"]);
	// The tight corner is untouched: only the clear crossing route is lifted.
	expect(result.edges[1]!.curve).toEqual(before.edges[1]!.curve);
});

// Common-WebLib's phone → ambient route turns 12px after the generated-model
// relationship crosses it. Reserving a 10px bridge shrank that turn to 1.99px.
test("a crossing near a turn preserves natural rounding while separating its ink", () => {
	const routes = [
		[
			{ x: 0, y: 50 },
			{ x: 100, y: 50 },
		],
		[
			{ x: 50, y: 0 },
			{ x: 50, y: 62 },
			{ x: 0, y: 62 },
		],
	];
	const before = drawing(routes);
	const result = bridgeCrossings(before);
	const cornerRoute = curveThrough(routes[1]!);
	expect(before.edges[1]!.curve).toEqual(cornerRoute);
	expect(result.edges[1]!.curve).toEqual(cornerRoute);
	expect(result.bridges).toHaveLength(1);
	expect(result.bridges[0]!.edgeId).toBe("0");
	expect(result.bridges[0]!.under).toEqual(["1"]);
});

test("a straight crossing four units before the other route turns still has an arc", () => {
	// Cloud Infrastructure: the VM-to-database vertical route crosses a long
	// horizontal database route immediately before that route turns downward.
	const before = drawing([
		[
			{ x: 0, y: -60 },
			{ x: 0, y: 100 },
		],
		[
			{ x: -120, y: 0 },
			{ x: 12, y: 0 },
			{ x: 12, y: 80 },
		],
	]);
	const result = bridgeCrossings(before);
	expect(result.bridges.some((bridge) => bridge.edgeId === "0" && bridge.under.includes("1"))).toBe(
		true,
	);
	expect(result.edges[0]!.curve).not.toEqual(before.edges[0]!.curve);
	expect(result.edges[1]!.curve).toEqual(before.edges[1]!.curve);
});

test("a rounded corner crossing a straight route gains an arc on the straight route", () => {
	// Common-WebLib: the dispatch route turns across a vertical dependency route.
	// A cutout alone leaves the apparent junction; the vertical route can arc.
	const before = drawing([
		[
			{ x: -20, y: -64 },
			{ x: 0, y: -64 },
			{ x: 0, y: 18 },
			{ x: -8, y: 18 },
		],
		[
			{ x: -100, y: 0 },
			{ x: 6, y: 0 },
			{ x: 6, y: 100 },
		],
	]);
	const result = bridgeCrossings(before);
	expect(result.bridges.some((bridge) => bridge.edgeId === "0" && bridge.under.includes("1"))).toBe(
		true,
	);
	expect(result.edges[0]!.curve).not.toEqual(before.edges[0]!.curve);
	expect(result.edges[1]!.curve).toEqual(before.edges[1]!.curve);
});

// Opposing rounded turns from the cloud board's VM → DB and API → DB
// connections cross between their orthogonal runs: neither straight line
// contains the contact: separation must not deform the rounded corners.
test("opposing rounded corners clear unrelated ink without deforming either route", () => {
	const routes = [
		[
			{ x: 12, y: 0 },
			{ x: 12, y: 100 },
			{ x: -50, y: 100 },
		],
		[
			{ x: 0, y: 0 },
			{ x: 0, y: 100 },
			{ x: 80, y: 100 },
		],
	];
	const edges: DrawingEdge[] = routes.map((points, index) => ({
		edge: {
			id: String(index),
			order: (index + 1) * 1000,
			from: `source${index}`,
			to: `target${index}`,
			kind: "call",
			emphasis: "normal",
		},
		curve: curveThrough(points),
		path: "",
	}));
	const before: ArchitectureDrawing = {
		direction: "down",
		width: 130,
		height: 100,
		cards: [],
		containers: [],
		edges,
	};
	const result = bridgeCrossings(before);
	expect(result.edges).toEqual(edges);
	expect(result.bridges).toHaveLength(1);
	expect(result.bridges[0]!.edgeId).toBe("1");
	expect(result.bridges[0]!.under).toEqual(["0"]);
	expect(result.bridges[0]!.curve.segments).toEqual([
		edges[1]!.curve.segments.find((segment) => segment.kind === "cubic")!,
	]);

	// The same geometric contact can be an intentional fan-in trunk.
	const shared = structuredClone(edges);
	for (const edge of shared) edge.edge.to = "target";
	expect(bridgeCrossings({ ...before, edges: shared }).bridges).toEqual([]);
	// Different kinds use distinct ports, even when they name the same target.
	shared[0]!.edge.kind = "event";
	const distinct = bridgeCrossings({ ...before, edges: shared });
	expect(distinct.bridges).toHaveLength(1);
	expect(distinct.edges).toEqual(shared);
});

// Codex workhorse: two routes finish on one row between two cards, each turning
// toward the other's card, so they cross inside their corners where no arc fits.
test("routes that cross where they turn onto one row get a bridge on straight runs", () => {
	const routes = [
		[
			{ x: -100, y: 0 },
			{ x: 0, y: 0 },
			{ x: 0, y: 150 },
			{ x: 100, y: 150 },
		],
		[
			{ x: 120, y: 100 },
			{ x: 15, y: 100 },
			{ x: 15, y: 150 },
			{ x: -80, y: 150 },
		],
	];
	const label = { x: -30, y: 30, width: 60, height: 20 };
	const before = drawing(routes);
	const edges = [
		{ ...before.edges[0]!, label: { box: label, measured: { width: 60, height: 20, runs: [] } } },
		before.edges[1]!,
	];
	const result = bridgeCrossings({ ...before, width: 240, height: 160, edges });
	const bridge = result.bridges.find((one) => one.curve.segments.length > 1);
	expect(bridge, "a raised arc, not only a corner cutout").toBeDefined();
	expect([bridge!.edgeId, ...bridge!.under].toSorted()).toEqual(["0", "1"]);
	// Each route still leaves and reaches its own card, and the two rows no longer overlap.
	for (const [index, { curve }] of result.edges.entries()) {
		expect(curve.from).toEqual(routes[index]![0]!);
		expect(curve.segments.at(-1)!.to).toEqual(routes[index]!.at(-1)!);
	}
	const [east, west] = result.edges.map(({ curve }) => {
		const [from, to] = [curve.segments.at(-2)!.to.x, curve.segments.at(-1)!.to.x];
		return { low: Math.min(from, to), high: Math.max(from, to) };
	});
	expect(east!.low >= west!.high || west!.low >= east!.high).toBe(true);
	// The label rides its moved lane.
	const moved = result.edges[0]!.label!.box;
	expect(moved.y).toBe(label.y);
	expect(moved.x + moved.width / 2).toBe(15);
});

// Native endpoint and inner-leg shortages must never produce smaller bends.
test("ordinary bends stay fixed while completed routes require room for every turn and head", () => {
	const points = [
		{ x: 0, y: 0 },
		{ x: 0, y: 8 },
		{ x: 16, y: 8 },
		{ x: 16, y: 28 },
	];
	const curve = curveThrough(points);
	expect(curveClearanceIssue(curve)).toBeUndefined();
	let from = curve.from;
	for (const segment of curve.segments) {
		if (segment.kind === "cubic") {
			expect(Math.abs(segment.to.x - from.x)).toBe(8);
			expect(Math.abs(segment.to.y - from.y)).toBe(8);
		}
		from = segment.to;
	}
	// Each invalid intermediate still rounds at eight; only final validation
	// refuses it, letting label settlement try another native route first.
	for (const short of [
		[{ x: 0, y: 1 }, ...points.slice(1)],
		[points[0]!, points[1]!, { x: 15, y: 8 }, { x: 15, y: 28 }],
		[...points.slice(0, -1), { x: 16, y: 27 }],
	]) {
		expect(() => curveThrough(short)).not.toThrow();
		expect(curveClearanceIssue(curveThrough(short))).toBeDefined();
	}
	const labelled = curveThrough([
		{ x: 0, y: 0 },
		{ x: 0, y: 40 },
		{ x: 60, y: 40 },
	]);
	expect(curveClearanceIssue(labelled, { x: 8, y: 35, width: 20, height: 10 })).toBeUndefined();
	expect(curveClearanceIssue(labelled, { x: 7, y: 35, width: 20, height: 10 })).toBeDefined();
});

test("native coordinate jitter does not create an artificial rounded turn", () => {
	const points = [
		{ x: 1, y: 0 },
		{ x: 1, y: 25 },
		{ x: 1 + 1e-13, y: 25 },
		{ x: 1 + 1e-13, y: 50 },
	];
	const curve = curveThrough(points);
	expect(curve.segments).toHaveLength(1);
	expect(curve.segments[0]!.kind).toBe("line");
	expect(curveClearanceIssue(curve)).toBeUndefined();
});
