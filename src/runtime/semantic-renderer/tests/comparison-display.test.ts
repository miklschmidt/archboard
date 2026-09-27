import { expect, test } from "bun:test";

import { renderBoard, type RenderedDiagram } from "@/runtime/semantic-renderer/index";
import { shownDrawing } from "@/runtime/semantic-renderer/layout";
import { routeEnds, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { across, bridged, down, drawing } from "@/runtime/semantic-renderer/tests/fixed-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import {
	LayoutEngineSchema,
	SemanticBoardSchema,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	type LayoutEngineName,
} from "@/shared/semantic-board/index";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";

/** How a line of a call is drawn. */
const LINE = { dash: "solid", arrowhead: "filled" } as const;

test("a plain proposal drawing omits comparison marks and removed context", async () => {
	const before = orderedFixture({
		nodes: [
			{ id: "kept", name: "Service", kind: "service" },
			{ id: "old", name: "Old worker", kind: "module" },
		],
	});
	const after = orderedFixture({
		nodes: [
			{ id: "kept", name: "Service", kind: "service" },
			{ id: "new", name: "New worker", kind: "module" },
		],
	});
	const board = SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "board",
		name: "Workers",
		level: "system",
		version: 1,
		createdAt: "2026-09-20T00:00:00.000Z",
		updatedAt: "2026-09-20T00:00:00.000Z",
		current: "current",
		variants: [
			{ id: "current", name: "Current", lifecycle: "current", content: before },
			{ id: "draft", name: "Draft", lifecycle: "draft", parent: "current", content: after },
		],
	});
	const decorated = await renderBoard(
		board,
		{ variant: "draft", theme: "light", fonts: "linked" },
		DEFAULT_SEMANTIC_POLICY,
	);
	const plain = await renderBoard(
		board,
		{ variant: "draft", theme: "light", fonts: "linked", comparison: false },
		DEFAULT_SEMANTIC_POLICY,
	);
	if (!decorated.ok || !plain.ok || !("svg" in decorated.reply) || !("svg" in plain.reply)) {
		throw new Error("Expected two drawn proposals");
	}
	expect(decorated.reply.svg).toContain('data-semantic-standing="removed"');
	expect(decorated.reply.svg).toContain('data-semantic-id="old"');
	expect(plain.reply.svg).not.toContain("data-semantic-standing");
	expect(plain.reply.svg).not.toContain('data-semantic-id="old"');
	expect(plain.reply.svg).toContain('data-semantic-id="new"');
	expect(plain.reply.changes).toEqual(decorated.reply.changes);
	expect(plain.reply.variant).toEqual(decorated.reply.variant);
});

test("hiding comparison marks keeps the routes of continuing relationships", async () => {
	const nodes = [
		{ id: "source", name: "Source", kind: "service" },
		{ id: "sink", name: "Sink", kind: "service" },
	];
	const existing = { id: "existing", from: "source", to: "sink", kind: "call" };
	const added = { id: "added", from: "source", to: "sink", kind: "call" };
	const board = SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "board",
		name: "Parallel connections",
		level: "system",
		version: 1,
		createdAt: "2026-09-20T00:00:00.000Z",
		updatedAt: "2026-09-20T00:00:00.000Z",
		current: "current",
		variants: [
			{
				id: "current",
				name: "Current",
				lifecycle: "current",
				content: orderedFixture({ nodes, edges: [existing] }),
			},
			{
				id: "draft",
				name: "Draft",
				lifecycle: "draft",
				parent: "current",
				content: orderedFixture({ nodes, edges: [existing, added] }),
			},
		],
	});
	const compared = await renderBoard(
		board,
		{ variant: "draft", theme: "light", fonts: "linked" },
		DEFAULT_SEMANTIC_POLICY,
	);
	const plain = await renderBoard(
		board,
		{ variant: "draft", theme: "light", fonts: "linked", comparison: false },
		DEFAULT_SEMANTIC_POLICY,
	);
	if (!compared.ok || !plain.ok || !("svg" in compared.reply) || !("svg" in plain.reply)) {
		throw new Error("Expected two drawn proposals");
	}
	const routes = routePoints(compared.reply.svg);
	expect(routes.get(existing.id)).not.toEqual(routes.get(added.id));
	expect(plain.reply.atlas.nodes).toEqual(compared.reply.atlas.nodes);
	expect(routePoints(plain.reply.svg)).toEqual(routes);
});

/**
 * A board whose draft lacks what its current variant has, drawn with its
 * comparison and without, in one engine and one view.
 * @param current The current variant's content.
 * @param draft The draft's content.
 * @param how The engine, and the view when it is one.
 * @param how.layout The engine.
 * @param how.view The view's grammar and scope, when the drawing is of one.
 * @returns Both drawings.
 */
async function bothModes(
	current: unknown,
	draft: unknown,
	how: { layout?: LayoutEngineName; view?: { grammar: string; scope?: unknown } },
): Promise<{ compared: RenderedDiagram; plain: RenderedDiagram }> {
	const board = SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "board",
		name: "Removals",
		level: "system",
		version: 1,
		createdAt: "2026-09-27T00:00:00.000Z",
		updatedAt: "2026-09-27T00:00:00.000Z",
		current: "current",
		views: how.view === undefined ? [] : [{ id: "view", name: "View", ...how.view }],
		variants: [
			{ id: "current", name: "Current", lifecycle: "current", content: orderedFixture(current) },
			{
				id: "draft",
				name: "Draft",
				lifecycle: "draft",
				parent: "current",
				content: orderedFixture(draft),
			},
		],
	});
	const ask = { variant: "draft", fonts: "linked", layout: how.layout } as const;
	const view = how.view === undefined ? {} : { view: "view" };
	const [compared, plain] = await Promise.all([
		renderBoard(board, { ...ask, ...view }, DEFAULT_SEMANTIC_POLICY),
		renderBoard(board, { ...ask, ...view, comparison: false }, DEFAULT_SEMANTIC_POLICY),
	]);
	if (!compared.ok || !plain.ok || !("svg" in compared.reply) || !("svg" in plain.reply)) {
		throw new Error("Expected two drawn proposals");
	}
	return { compared: compared.reply, plain: plain.reply };
}

/**
 * Every subject of the drawing without its comparison stands where it stands
 * with it, and nothing that stands removed is drawn or can be picked.
 * @param drawings Both drawings.
 * @param drawings.compared The drawing with its comparison.
 * @param drawings.plain The drawing without it.
 * @param removed The ids that stand removed.
 */
function expectSamePlaces(
	{ compared, plain }: { compared: RenderedDiagram; plain: RenderedDiagram },
	removed: readonly string[],
): void {
	for (const kind of ["nodes", "edges", "regions"] as const) {
		const kept = Object.fromEntries(
			Object.keys(plain.atlas[kind]).map((id) => [id, compared.atlas[kind][id]!]),
		);
		expect(plain.atlas[kind]).toEqual(kept);
		for (const id of removed) expect(plain.atlas[kind][id]).toBeUndefined();
	}
	for (const id of removed) {
		expect(compared.svg).toContain(`data-semantic-id="${id}"`);
		expect(plain.svg).not.toContain(`data-semantic-id="${id}"`);
	}
	expect(plain.width).toBe(compared.width);
	expect(plain.height).toBe(compared.height);
}

const everyNode = [
	{ id: "gate", name: "Gateway", kind: "service" },
	{ id: "api", name: "Orders API", kind: "service" },
	{ id: "old", name: "Legacy cache", kind: "database" },
	{ id: "store", name: "Order store", kind: "database" },
	{ id: "queue", name: "Event queue", kind: "queue" },
	{ id: "worker", name: "Fulfilment worker", kind: "service" },
];
const everyEdge = [
	{ id: "ga", from: "gate", to: "api", kind: "call", label: "orders" },
	{ id: "ao", from: "api", to: "old", kind: "call", label: "cache reads" },
	{ id: "os", from: "old", to: "store", kind: "call" },
	{ id: "as", from: "api", to: "store", kind: "call", label: "writes" },
	{ id: "aq", from: "api", to: "queue", kind: "call" },
	{ id: "qw", from: "queue", to: "worker", kind: "call" },
	{ id: "ws", from: "worker", to: "store", kind: "call", label: "status" },
];

test("turning the comparison off moves nothing a draft shares with its reference", async () => {
	// The draft drops a card with its two lines, and one line between cards it keeps.
	const removed = ["old", "ao", "os", "ws"];
	const draft = {
		nodes: everyNode.filter(({ id }) => !removed.includes(id)),
		edges: everyEdge.filter(({ id }) => !removed.includes(id)),
	};
	for (const layout of LayoutEngineSchema.options) {
		const drawings = await bothModes({ nodes: everyNode, edges: everyEdge }, draft, { layout });
		expectSamePlaces(drawings, removed);
		const routes = routePoints(drawings.compared.svg);
		for (const [id, route] of routePoints(drawings.plain.svg)) {
			expect(route).toEqual(routes.get(id)!);
		}
	}
});

test("turning the comparison off moves no participant or message of a sequence", async () => {
	const nodes = [
		{ id: "web", name: "Console", kind: "ui" },
		{ id: "api", name: "Orders API", kind: "service" },
		{ id: "old", name: "Legacy cache", kind: "database" },
		{ id: "store", name: "Order store", kind: "database" },
	];
	const steps = [
		{ id: "s1", from: "web", to: "api", label: "place order", kind: "sync" },
		{ id: "s2", from: "api", to: "old", label: "read cache", kind: "sync" },
		{ id: "s3", from: "api", to: "store", label: "write order", kind: "sync" },
		{ id: "s4", from: "api", to: "web", label: "placed", kind: "return" },
	];
	const flow = { id: "f1", name: "Place an order", participants: ["web", "api", "old", "store"] };
	// A participant's box covers its column in every flow, so the flow the draft
	// drops has none it keeps.
	const gone = { id: "f2", name: "Warm the cache", participants: ["old"] };
	const warm = [{ id: "s5", from: "old", to: "old", label: "warm", kind: "self" }];
	const drawings = await bothModes(
		{
			nodes,
			edges: [],
			flows: [
				{ ...flow, steps },
				{ ...gone, steps: warm },
			],
		},
		{
			nodes: nodes.filter(({ id }) => id !== "old"),
			edges: [],
			flows: [
				{
					...flow,
					participants: ["web", "api", "store"],
					steps: steps.filter(({ id }) => id !== "s2"),
				},
			],
		},
		{ view: { grammar: "data-flow" } },
	);
	expectSamePlaces(drawings, ["old", "s2", "f2", "s5"]);
	expect(routeEnds(drawings.plain.svg, "step")).toEqual(
		new Map(
			[...routeEnds(drawings.compared.svg, "step")].filter(([id]) => !["s2", "s5"].includes(id)),
		),
	);
});

test("a line is not hopped or cut where it crosses a line that is not drawn", () => {
	const settled = drawing([across(50), down(50)]);
	const whole = { ...settled, bridged: bridged(settled) };
	expect(whole.bridged.bridges).toHaveLength(1);
	const lines = new Map(whole.edges.map(({ edge }) => [edge.id, LINE] as const));
	for (const unshown of ["0", "1"]) {
		const shown = shownDrawing(whole, new Set([unshown]), lines);
		expect(shown.bridged.bridges).toEqual([]);
		expect(shown.bridged.edges.map(({ edge }) => edge.id)).toEqual(
			["0", "1"].filter((id) => id !== unshown),
		);
		expect(shown.bridged.edges[0]!.curve).toEqual(
			settled.edges.find(({ edge }) => edge.id !== unshown)!.curve,
		);
	}
});

test("a board drawn from its flow keeps a line for every message the draft keeps", async () => {
	const nodes = [
		{ id: "web", name: "Console", kind: "ui" },
		{ id: "api", name: "Orders API", kind: "service" },
	];
	const flow = { id: "f1", name: "Place an order", participants: ["web", "api"] };
	const first = { id: "s1", from: "web", to: "api", label: "place order", kind: "sync" };
	const again = { id: "s2", from: "web", to: "api", label: "confirm", kind: "sync" };
	// The draft drops the first of two messages over one pair: the pair's line is the one it keeps.
	const riding = await bothModes(
		{ nodes, edges: [], flows: [{ ...flow, steps: [first, again] }] },
		{ nodes, edges: [], flows: [{ ...flow, steps: [again] }] },
		{},
	);
	expect(Object.keys(riding.plain.atlas.edges)).toEqual([again.id]);
	expect(riding.plain.atlas.edges).toEqual(riding.compared.atlas.edges);
	// The draft drops every relationship and keeps its flow: the flow's messages join the cards.
	const wiring = { id: "call", from: "web", to: "api", kind: "call" };
	const unwired = await bothModes(
		{ nodes, edges: [wiring], flows: [{ ...flow, steps: [first] }] },
		{ nodes, edges: [], flows: [{ ...flow, steps: [first] }] },
		{},
	);
	expectSamePlaces(unwired, [wiring.id]);
	expect(Object.keys(unwired.plain.atlas.edges)).toEqual([first.id]);
});

test("a view without its comparison draws only what the draft's own view holds", async () => {
	const nodes = [
		{ id: "gate", name: "Gateway", kind: "service" },
		{ id: "api", name: "Orders API", kind: "service" },
		{ id: "store", name: "Order store", kind: "database" },
	];
	const orders = { id: "ga", from: "gate", to: "api", kind: "call" };
	const writes = { id: "as", from: "api", to: "store", kind: "call" };
	// The view selects both lines; the draft drops the one that needs the store.
	const drawings = await bothModes(
		{ nodes, edges: [orders, writes] },
		{ nodes, edges: [orders] },
		{
			view: {
				grammar: "architecture",
				scope: { kind: "selection", edges: [orders.id, writes.id] },
			},
		},
	);
	expectSamePlaces(drawings, [writes.id, "store"]);
	expect(Object.keys(drawings.plain.atlas.nodes).toSorted()).toEqual(["api", "gate"]);
});

test("lines keep their lanes where a card that is not drawn held them apart", () => {
	// Two routes whose rows fold a crossing into their corners, and a card
	// between the lanes they would exchange onto.
	const folded = drawing([
		[
			{ x: 0, y: 50 },
			{ x: 60, y: 50 },
			{ x: 60, y: 100 },
			{ x: 100, y: 100 },
		],
		[
			{ x: 100, y: 50 },
			{ x: 40, y: 50 },
			{ x: 40, y: 0 },
			{ x: 0, y: 0 },
		],
	]);
	const [node] = orderedFixture({ nodes: [{ id: "gone", name: "Gone", kind: "service" }] }).nodes;
	const measured = { node: node!, width: 10, height: 10, headerHeight: 10, runs: [] };
	const settled = {
		...folded,
		cards: [{ measured, box: { x: 45, y: 20, width: 10, height: 10 }, depth: 0 }],
	};
	const whole = { ...settled, bridged: bridged(settled) };
	const lines = new Map(whole.edges.map(({ edge }) => [edge.id, LINE] as const));
	const shown = shownDrawing(whole, new Set([node!.id]), lines);
	expect(shown.bridged.edges.map(({ curve }) => curve)).toEqual(
		whole.bridged.edges.map(({ curve }) => curve),
	);
});
