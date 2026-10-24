// Fixed route geometry exercises corner/bridge interaction independently of
// whichever crossings a placement engine chooses for a whole board.
import { expect, test } from "bun:test";
import { curveThrough, curveClearanceIssue } from "#shared/rules/layout/routes/curves.ts";
import { type ArchitectureDrawing, type DrawingEdge } from "#shared/rules/render/drawing.ts";
import { bridged, bulgeOf, drawing, hops } from "#tests/runtime/support/fixed-routes.ts";

// Cloud Infrastructure, Common-WebLib and every engine's hop-on-bend: a hop
// over a turn, or beside its own, fuses with the turn into a knot; and a cut
// in its place read as no crossing at all (the user, 2026-09-27).
test("where the other line turns just past a crossing, the straight line hops it bulging away from the turn", () => {
	for (const [routes, away] of [
		// The other route turns four units past the crossing, to the right.
		[
			[
				[
					{ x: 0, y: -60 },
					{ x: 0, y: 100 },
				],
				[
					{ x: -120, y: 0 },
					{ x: 12, y: 0 },
					{ x: 12, y: 80 },
				],
			],
			"left",
		],
		// ... or eight units past it, above.
		[
			[
				[
					{ x: 0, y: 50 },
					{ x: 100, y: 50 },
				],
				[
					{ x: 50, y: 100 },
					{ x: 50, y: 34 },
					{ x: 100, y: 34 },
				],
			],
			"down",
		],
	] as [Parameters<typeof drawing>[0], "left" | "down"][]) {
		const result = bridged(drawing(routes));
		expect(result.bridges).toHaveLength(1);
		const [bridge] = result.bridges;
		expect(bridge).toMatchObject({ edgeId: "0", under: ["1"] });
		expect(hops(bridge!)).toBe(true);
		const { least, most } = bulgeOf(bridge!);
		expect(away === "left" ? most : Math.abs(least), `bulges ${away}`).toBe(0);
	}
});

// Board persistence, Board viewer and Voice coordinator: a corner cut beneath
// a straight line left its route ending where the line past the turn began.
// Here the corner runs on beside the line, under where a hop's shoulder would
// be. A gap cut in the straight line instead had no arc over it (TASK-408).
test("a rounded corner that turns beside a straight line crosses it plainly, and both stay whole", () => {
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
	const result = bridged(before);
	expect(result.edges).toEqual(before.edges);
	expect(result.bridges).toEqual([]);
});

// Track and Blocks draw a trunk as one route per relationship, on top of each
// other; a line painted between them crossed it flat.
test("a line crosses a trunk once, wherever it is painted among the trunk's routes", () => {
	const across = [
		{ x: 0, y: 50 },
		{ x: 100, y: 50 },
	];
	const down = [
		{ x: 50, y: 0 },
		{ x: 50, y: 100 },
	];
	const between = bridged(drawing([down, across, down]));
	expect(between.bridges).toHaveLength(1);
	expect(between.bridges[0]!.edgeId).toBe("1");
	expect(between.bridges[0]!.under.toSorted()).toEqual(["0", "2"]);
	// A trunk painted over the line rises as one: its drawer hops, and the
	// route beneath it hops the same way, so its traffic rides over the crossing.
	const over = bridged(drawing([across, down, down]));
	expect(over.bridges).toHaveLength(1);
	expect(over.bridges[0]).toMatchObject({ edgeId: "1", under: ["0"] });
	expect(over.edges[2]!.curve).toEqual(over.edges[1]!.curve);
});

// Blocks: routes of one kind on one trunk, sharing no card, erased each
// other's shared turns and the turns where they part.
test("routes that run together through a turn, and part from each other, cut nothing", () => {
	const result = bridged(
		drawing([
			[
				{ x: 0, y: 0 },
				{ x: 0, y: 100 },
				{ x: 100, y: 100 },
			],
			[
				{ x: 0, y: 30 },
				{ x: 0, y: 100 },
				{ x: 60, y: 100 },
				{ x: 60, y: 160 },
			],
		]),
	);
	expect(result.bridges).toEqual([]);
});

// Opposing rounded turns from the cloud board's VM → DB and API → DB
// connections cross between their orthogonal runs: neither straight line
// contains the contact, and no hop stands on a turn. The corners cross plainly,
// neither deformed nor cut (TASK-408).
test("opposing rounded corners cross plainly without deforming or cutting either route", () => {
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
	const result = bridged(before);
	expect(result.edges).toEqual(edges);
	expect(result.bridges).toEqual([]);
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
			{ x: 30, y: 100 },
			{ x: 30, y: 150 },
			{ x: -80, y: 150 },
		],
	];
	const label = { x: -30, y: 30, width: 60, height: 20 };
	const before = drawing(routes);
	const edges = [
		{
			...before.edges[0]!,
			label: {
				box: label,
				measured: { width: 60, height: 20, runs: [], chips: [{ y: 0, height: 20 }] },
			},
		},
		before.edges[1]!,
	];
	const result = bridged({ ...before, width: 240, height: 160, edges });
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
	expect(moved.x + moved.width / 2).toBe(30);
});

test("a fan's line that turns back across its sibling's lane drops a lane before it", () => {
	// Both lines leave one port along one row. The outer lane turns back
	// under the row across the inner lane, which runs on past that turn.
	const routes = [
		[
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 200 },
			{ x: 200, y: 200 },
		],
		[
			{ x: 0, y: 0 },
			{ x: 116, y: 0 },
			{ x: 116, y: 100 },
			{ x: -60, y: 100 },
		],
	];
	const before = drawing(routes);
	const edges = before.edges.map((drawn) => ({
		...drawn,
		edge: { ...drawn.edge, from: "hub" },
	}));
	const result = bridged({ ...before, width: 300, height: 260, edges });
	expect(result.bridges).toEqual([]);
	for (const [index, { curve }] of result.edges.entries()) {
		expect(curve.from).toEqual(routes[index]![0]!);
		expect(curve.segments.at(-1)!.to).toEqual(routes[index]!.at(-1)!);
	}
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
