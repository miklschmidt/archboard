// Fixed route geometry exercises corner/bridge interaction independently of
// whichever crossings a placement engine chooses for a whole board.
import { expect, test } from "bun:test";
import {
	bridgeCrossings,
	curveThrough,
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
		{ x: 50, y: 68 },
		{ x: 100, y: 68 },
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
	expect(result.bridges[0]!.edgeId).toBe("1");
	expect(result.bridges[0]!.under).toEqual(["0"]);
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

// The source has no arrowhead. Short endpoint legs from Common-WebLib and
// the cloud's VM → DB connections must leave room for the target's own ink.
test("short endpoint bends reserve arrow space only at the target", () => {
	const points = [
		{ x: 0, y: 0 },
		{ x: 0, y: 16 },
		{ x: 100, y: 16 },
		{ x: 100, y: 29 },
	];
	const ordinary = curveThrough(points);
	const narrowHead = curveThrough(points, undefined, 8);
	for (const curve of [ordinary, narrowHead]) {
		const departure = curve.segments[0]!;
		expect(departure.kind).toBe("line");
		expect(departure.to).toEqual({ x: 0, y: 8 });
		expect(curve.segments[1]!.kind).toBe("cubic");
	}
	// Reducing only the target's reserved ink gives the last bend its space;
	// the endpoint and the source's already-rounded departure stay unchanged.
	expect(ordinary.segments.at(-2)!.to).toEqual({ x: 100, y: 17 });
	expect(narrowHead.segments.at(-2)!.to).toEqual({ x: 100, y: 21 });
	expect(narrowHead.segments.at(-1)).toEqual(ordinary.segments.at(-1));
});
