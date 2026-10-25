import { expect, test } from "bun:test";

import { renderBoard } from "#runtime/operations/render.ts";
import { shownDrawing } from "#shared/rules/render/shown.ts";
import { bothModes, expectSamePlaces } from "#tests/runtime/support/comparison-modes.ts";
import { routePoints } from "#tests/runtime/support/drawn-routes.ts";
import { across, bridged, down, drawing } from "#tests/runtime/support/fixed-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import { SemanticBoardSchema, SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

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
		{ variant: "draft", theme: "light" },
		DEFAULT_SEMANTIC_POLICY,
	);
	const plain = await renderBoard(
		board,
		{ variant: "draft", theme: "light", comparison: false },
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
	// Both are read against the same variant; each says how what it draws stands.
	expect(plain.reply.changes?.against).toEqual(decorated.reply.changes?.against);
	expect(plain.reply.changes?.standing).toEqual({ kept: "unchanged", new: "added" });
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
		{ variant: "draft", theme: "light" },
		DEFAULT_SEMANTIC_POLICY,
	);
	const plain = await renderBoard(
		board,
		{ variant: "draft", theme: "light", comparison: false },
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

// The board's lines come from its flow, which the overview does not draw.
const EVERY_PART = { view: { grammar: "architecture", scope: { kind: "all" } } };

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
		EVERY_PART,
	);
	expect(Object.keys(riding.plain.atlas.edges)).toEqual([again.id]);
	expect(riding.plain.atlas.edges).toEqual(riding.compared.atlas.edges);
	// The draft drops every relationship and keeps its flow: the flow's messages join the cards.
	const wiring = { id: "call", from: "web", to: "api", kind: "call" };
	const unwired = await bothModes(
		{ nodes, edges: [wiring], flows: [{ ...flow, steps: [first] }] },
		{ nodes, edges: [], flows: [{ ...flow, steps: [first] }] },
		EVERY_PART,
	);
	expectSamePlaces(unwired, [wiring.id]);
	expect(Object.keys(unwired.plain.atlas.edges)).toEqual([first.id]);
	// The draft drops the only child of a participant: the comparison draws it
	// a container again, and the draft's own message still lands on it.
	const child = { id: "wk", name: "Worker", kind: "module", parent: "api" };
	const emptied = await bothModes(
		{ nodes: [...nodes, child], edges: [], flows: [{ ...flow, steps: [first] }] },
		{ nodes, edges: [], flows: [{ ...flow, steps: [first] }] },
		EVERY_PART,
	);
	expectSamePlaces(emptied, [child.id]);
	expect(Object.keys(emptied.plain.atlas.edges)).toEqual([first.id]);
});

/**
 * How a subject's own group is drawn, apart from how it stands.
 * @param svg The picture.
 * @param id The subject.
 * @returns Its opening tag, without its standing.
 */
function lookOf(svg: string, id: string): string | undefined {
	return new RegExp(`<g[^>]*data-semantic-id="${id}"[^>]*>`, "u")
		.exec(svg)?.[0]
		.replace(/ data-semantic-standing="[^"]*"/u, "");
}

test("a frame whose only child the draft drops looks the same without its comparison", async () => {
	const nodes = [
		{ id: "svc", name: "Orders service", kind: "service" },
		{ id: "db", name: "Order store", kind: "database" },
	];
	const child = { id: "mod", name: "Handler", kind: "module", parent: "svc" };
	const writes = { id: "md", from: "mod", to: "db", kind: "call" };
	const drawings = await bothModes(
		{ nodes: [...nodes, child], edges: [writes] },
		{ nodes, edges: [] },
		EVERY_PART,
	);
	expectSamePlaces(drawings, [child.id, writes.id]);
	expect(lookOf(drawings.plain.svg, "svc")).toBe(lookOf(drawings.compared.svg, "svc"));
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

test("a view keeps the draft's own step lines where its comparison pulls a relationship in", async () => {
	const nodes = [
		{ id: "web", name: "Console", kind: "ui" },
		{ id: "api", name: "Orders API", kind: "service" },
		{ id: "store", name: "Order store", kind: "database" },
	];
	// The store is in the view only through the message the draft drops, and
	// with it the relationship the draft keeps but its own view does not show.
	const wiring = { id: "k", from: "api", to: "store", kind: "call" };
	const place = { id: "s1", from: "web", to: "api", label: "place", kind: "sync" };
	const write = { id: "s2", from: "api", to: "store", label: "write", kind: "sync" };
	const flow = { id: "f1", name: "Place an order" };
	const drawings = await bothModes(
		{
			nodes,
			edges: [wiring],
			flows: [{ ...flow, participants: ["web", "api", "store"], steps: [place, write] }],
		},
		{ nodes, edges: [wiring], flows: [{ ...flow, participants: ["web", "api"], steps: [place] }] },
		{ view: { grammar: "architecture", scope: { kind: "selection", flows: [flow.id] } } },
	);
	expectSamePlaces(drawings, ["store", wiring.id, write.id]);
	expect(Object.keys(drawings.plain.atlas.edges)).toEqual([place.id]);
});
