import { describe, expect, test } from "bun:test";
import {
	SemanticBoardSchema,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	VariantContentSchema,
	type SemanticBoard,
	type VariantContent,
} from "@/shared/semantic-board/index";
import { drawingOf } from "@/server/canvas/index";

const PLATFORM = { id: "pl", name: "Platform", kind: "service" };
const GATEWAY = { id: "gw", name: "Gateway", kind: "module", parent: "pl" };
const LEGACY = { id: "lg", name: "Legacy intake", kind: "module", parent: "pl" };
const LEDGER = { id: "ld", name: "Ledger", kind: "service" };
const OLD_WIRE = { id: "e1", from: "gw", to: "lg", kind: "call" };
const KEPT_WIRE = { id: "e2", from: "gw", to: "ld", kind: "call" };

/**
 * A board with a baseline and one proposal derived from it.
 * @param proposed What the proposal says its architecture is.
 * @returns The board.
 */
const boardWith = (proposed: Record<string, unknown>): SemanticBoard =>
	SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "bd",
		name: "payments",
		version: 2,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "Initial",
				lifecycle: "current",
				content: {
					nodes: [PLATFORM, GATEWAY, LEGACY, LEDGER],
					edges: [OLD_WIRE, KEPT_WIRE],
				},
			},
			{
				id: "v2",
				name: "Without the legacy intake",
				lifecycle: "draft",
				parent: "v1",
				content: proposed,
			},
		],
	});

/**
 * The content a variant states, parsed as a document holds it.
 * @param stated What is on it.
 * @returns The content.
 */
const content = (stated: Record<string, unknown>): VariantContent =>
	VariantContentSchema.parse(stated);

describe("the picture drawn for a proposal", () => {
	const PROPOSED = content({
		nodes: [
			PLATFORM,
			GATEWAY,
			LEDGER,
			{ id: "qu", name: "Intake queue", kind: "queue", parent: "pl" },
		],
		edges: [KEPT_WIRE],
	});
	const board = boardWith(PROPOSED);
	const proposal = board.variants[1]!;

	test("puts back what the change took away, and says how each subject stands", () => {
		const drawing = drawingOf(board, proposal);
		expect(drawing.changes?.predecessor.id).toBe("v1");
		// The removed module is drawn again, as context for what the change did.
		expect(drawing.content.nodes.map((node) => node.id).toSorted()).toEqual([
			"gw",
			"ld",
			"lg",
			"pl",
			"qu",
		]);
		expect(drawing.content.edges.map((edge) => edge.id).toSorted()).toEqual(["e1", "e2"]);
		expect(drawing.changes?.standing).toMatchObject({
			qu: "added",
			lg: "removed",
			e1: "removed",
			gw: "unchanged",
			pl: "unchanged",
			e2: "unchanged",
		});
	});

	test("the proposal itself still says only what it proposes", () => {
		drawingOf(board, proposal);
		expect(PROPOSED.nodes.map((node) => node.id)).not.toContain("lg");
		expect(board.variants[1]?.content.nodes.map((node) => node.id)).not.toContain("lg");
	});

	test("a variant that came from nothing changed nothing, and is drawn as it is", () => {
		const baseline = board.variants[0]!;
		const drawing = drawingOf(board, baseline);
		expect(drawing.changes).toBeNull();
		expect(drawing.content).toBe(baseline.content);
	});
});

describe("what a narrower reading is allowed to say", () => {
	test("a view says what its own corner lost and stays quiet about the rest", () => {
		// The proposal dropped a module inside the platform and a whole service
		// elsewhere; this view is only about the ledger.
		const proposed = content({ nodes: [PLATFORM, GATEWAY, LEDGER], edges: [KEPT_WIRE] });
		const board = SemanticBoardSchema.parse({
			schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
			kind: "semantic-board",
			id: "bd",
			name: "payments",
			version: 2,
			createdAt: "2026-09-11T00:00:00.000Z",
			updatedAt: "2026-09-11T00:00:00.000Z",
			current: "v1",
			variants: [
				{
					id: "v1",
					name: "Initial",
					lifecycle: "current",
					content: {
						nodes: [
							PLATFORM,
							GATEWAY,
							LEGACY,
							LEDGER,
							{ id: "rp", name: "Reporting", kind: "service" },
						],
						edges: [OLD_WIRE, KEPT_WIRE],
					},
				},
				{ id: "v2", name: "Leaner", lifecycle: "draft", parent: "v1", content: proposed },
			],
		});
		const scope = { kind: "selection" as const, nodes: ["ld"], edges: [], flows: [] };
		const drawing = drawingOf(board, board.variants[1]!, scope);
		// Neither removal has context here: one hangs off a container this view
		// does not draw, the other was a root the view never showed.
		expect(drawing.content.nodes.map((node) => node.id)).toEqual(["ld"]);
		expect(drawing.changes?.standing["lg"]).toBeUndefined();
		expect(drawing.changes?.standing["rp"]).toBeUndefined();
	});

	test("a view that selects a deleted module shows it with its container", () => {
		const proposed = content({ nodes: [PLATFORM, GATEWAY, LEDGER], edges: [KEPT_WIRE] });
		const board = boardWith(proposed);
		const scope = { kind: "selection" as const, nodes: ["pl", "gw", "lg"], edges: [], flows: [] };
		const drawing = drawingOf(board, board.variants[1]!, scope);
		expect(drawing.content.nodes.map((node) => node.id).toSorted()).toEqual(["gw", "lg", "pl"]);
		expect(drawing.changes?.standing["lg"]).toBe("removed");
		// The relationship comes with it, because both its ends are drawn.
		expect(drawing.content.edges.map((edge) => edge.id)).toEqual(["e1"]);
	});

	test("a selected deleted edge excludes other deleted edges between the same nodes", () => {
		const board = boardWith({ nodes: [PLATFORM, GATEWAY, LEGACY, LEDGER], edges: [] });
		board.variants[0]!.content.edges.push({
			...board.variants[0]!.content.edges[0]!,
			id: "parallel",
		});
		const drawing = drawingOf(board, board.variants[1]!, {
			kind: "selection",
			nodes: [],
			edges: ["e1"],
			flows: [],
		});
		expect(drawing.content.edges.map((edge) => edge.id)).toEqual(["e1"]);
		expect(drawing.changes?.standing["e1"]).toBe("removed");
		expect(drawing.changes?.standing["parallel"]).toBeUndefined();
	});

	test("a removed container brings its removed contents back with it", () => {
		const proposed = content({ nodes: [LEDGER], edges: [] });
		const board = boardWith(proposed);
		const drawing = drawingOf(board, board.variants[1]!);
		expect(drawing.content.nodes.map((node) => node.id).toSorted()).toEqual([
			"gw",
			"ld",
			"lg",
			"pl",
		]);
		expect(drawing.changes?.standing["gw"]).toBe("removed");
		expect(drawing.changes?.standing["pl"]).toBe("removed");
	});
});

describe("a sequence a proposal cut into", () => {
	const STEPS = [
		{ id: "s1", from: "gw", to: "lg", label: "hand over", kind: "sync" },
		{ id: "s2", from: "gw", to: "ld", label: "post", kind: "sync" },
	];
	const FLOW = { id: "f1", name: "Posting", participants: ["gw", "lg", "ld"], steps: STEPS };

	test("puts the step it dropped back where it was told", () => {
		const proposed = content({
			nodes: [PLATFORM, GATEWAY, LEGACY, LEDGER],
			edges: [KEPT_WIRE],
			flows: [{ ...FLOW, steps: [STEPS[1]] }],
		});
		const board = SemanticBoardSchema.parse({
			schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
			kind: "semantic-board",
			id: "bd",
			name: "payments",
			version: 2,
			createdAt: "2026-09-11T00:00:00.000Z",
			updatedAt: "2026-09-11T00:00:00.000Z",
			current: "v1",
			variants: [
				{
					id: "v1",
					name: "Initial",
					lifecycle: "current",
					content: {
						nodes: [PLATFORM, GATEWAY, LEGACY, LEDGER],
						edges: [OLD_WIRE, KEPT_WIRE],
						flows: [FLOW],
					},
				},
				{
					id: "v2",
					name: "Straight to the ledger",
					lifecycle: "draft",
					parent: "v1",
					content: proposed,
				},
			],
		});
		const drawing = drawingOf(board, board.variants[1]!);
		expect(drawing.content.flows[0]?.steps.map((step) => step.id)).toEqual(["s1", "s2"]);
		expect(drawing.changes?.standing["s1"]).toBe("removed");
		// The step that survived says nothing about the one that went: where a step
		// stands is counted over the steps both variants hold, so a removal shifts
		// nothing after it.
		expect(drawing.changes?.standing["s2"]).toBe("unchanged");
	});
});

describe("a view that selects everything", () => {
	test("is the whole variant under another name, removals included", () => {
		// A named `all` view and no view at all are the same reading, so a root
		// the proposal deleted has to appear in both or in neither.
		const proposed = content({ nodes: [PLATFORM, GATEWAY, LEGACY], edges: [] });
		const board = boardWith(proposed);
		const named = drawingOf(board, board.variants[1]!, { kind: "all" });
		expect(named.content.nodes.map((node) => node.id)).toContain("ld");
		expect(named.changes?.standing["ld"]).toBe("removed");
	});
});

describe("what a whole picture owes a reader", () => {
	const STEPS = [
		{ id: "s1", from: "gw", to: "lg", label: "hand over", kind: "sync" },
		{ id: "s2", from: "lg", to: "ld", label: "post", kind: "sync" },
	];
	const FLOW = { id: "f1", name: "Posting", participants: ["gw", "lg", "ld"], steps: STEPS };

	/**
	 * A board whose proposal dropped the whole exchange.
	 * @returns The board.
	 */
	const droppedFlow = (): SemanticBoard =>
		SemanticBoardSchema.parse({
			schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
			kind: "semantic-board",
			id: "bd",
			name: "payments",
			version: 2,
			createdAt: "2026-09-11T00:00:00.000Z",
			updatedAt: "2026-09-11T00:00:00.000Z",
			current: "v1",
			variants: [
				{
					id: "v1",
					name: "Initial",
					lifecycle: "current",
					content: {
						nodes: [PLATFORM, GATEWAY, LEGACY, LEDGER],
						edges: [OLD_WIRE, KEPT_WIRE],
						flows: [FLOW],
					},
				},
				{
					id: "v2",
					name: "No exchange",
					lifecycle: "draft",
					parent: "v1",
					content: { nodes: [PLATFORM, GATEWAY, LEGACY, LEDGER], edges: [KEPT_WIRE] },
				},
			],
		});

	test("a whole conversation the proposal dropped is drawn, steps and all", () => {
		const board = droppedFlow();
		const proposal = board.variants[1]!;
		const drawing = drawingOf(board, proposal);
		expect(drawing.content.flows.map((flow) => flow.id)).toEqual(["f1"]);
		expect(drawing.content.flows[0]?.steps.map((step) => step.id)).toEqual(["s1", "s2"]);
		expect(drawing.changes?.standing["f1"]).toBe("removed");
		expect(drawing.changes?.standing["s1"]).toBe("removed");
		expect(drawing.changes?.standing["s2"]).toBe("removed");
	});
});

describe("a sequence read through a view that dropped a participant", () => {
	const STEPS = [
		{ id: "s1", from: "gw", to: "lg", label: "hand over", kind: "sync" },
		{ id: "s2", from: "lg", to: "ld", label: "post", kind: "sync" },
	];
	const BASELINE_FLOW = {
		id: "f1",
		name: "Posting",
		participants: ["gw", "lg", "ld"],
		steps: STEPS,
	};
	const PROPOSED_FLOW = {
		id: "f1",
		name: "Posting",
		participants: ["gw", "ld"],
		steps: [{ id: "s3", from: "gw", to: "ld", label: "post", kind: "sync" }],
	};

	/**
	 * A board whose proposal routes around the legacy intake, which is still on
	 * the board but no longer part of the exchange.
	 * @returns The board.
	 */
	const rerouted = (): SemanticBoard =>
		SemanticBoardSchema.parse({
			schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
			kind: "semantic-board",
			id: "bd",
			name: "payments",
			version: 2,
			createdAt: "2026-09-11T00:00:00.000Z",
			updatedAt: "2026-09-11T00:00:00.000Z",
			current: "v1",
			variants: [
				{
					id: "v1",
					name: "Initial",
					lifecycle: "current",
					content: {
						nodes: [PLATFORM, GATEWAY, LEGACY, LEDGER],
						edges: [OLD_WIRE, KEPT_WIRE],
						flows: [BASELINE_FLOW],
					},
				},
				{
					id: "v2",
					name: "Straight through",
					lifecycle: "draft",
					parent: "v1",
					content: {
						nodes: [PLATFORM, GATEWAY, LEGACY, LEDGER],
						edges: [KEPT_WIRE],
						flows: [PROPOSED_FLOW],
					},
				},
			],
		});

	test("brings back the participant its removed steps were addressed to", () => {
		const board = rerouted();
		// The view is about the exchange: it keeps the flow and the two columns
		// the proposal's own steps need, and nothing else.
		const scope = { kind: "selection" as const, nodes: [], edges: [], flows: ["f1"] };
		const drawing = drawingOf(board, board.variants[1]!, scope);
		const flow = drawing.content.flows[0];
		// Neither old call survives, so the removed run follows the proposal.
		expect(flow?.steps.map((step) => step.id)).toEqual(["s3", "s1", "s2"]);
		// The dropped participant is drawn so the removed steps have somewhere to
		// go, and it is a column of the flow again.
		expect(drawing.content.nodes.map((node) => node.id)).toContain("lg");
		expect(flow?.participants).toContain("lg");
		// It is not a change: the node is still on the proposal, just not in the
		// exchange any more.
		expect(drawing.changes?.standing["lg"]).toBe("unchanged");
		expect(drawing.changes?.standing["s1"]).toBe("removed");
		expect(drawing.changes?.standing["s3"]).toBe("added");
	});
});

test("a shared scope preserves its deleted exchange without unrelated deletions", () => {
	const board = boardWith({
		nodes: [PLATFORM, GATEWAY, LEDGER],
		edges: [KEPT_WIRE],
		flows: [
			{
				id: "newflow",
				name: "Direct posting",
				participants: ["gw", "ld"],
				steps: [{ id: "newstep", from: "gw", to: "ld", label: "post" }],
			},
		],
	});
	board.variants[0]!.content = content({
		nodes: [
			PLATFORM,
			GATEWAY,
			LEGACY,
			LEDGER,
			{ id: "other", name: "Other service", kind: "service" },
		],
		edges: [OLD_WIRE, KEPT_WIRE],
		flows: [
			{
				id: "oldflow",
				name: "Legacy posting",
				participants: ["gw", "lg"],
				steps: [{ id: "oldstep", from: "gw", to: "lg", label: "hand over" }],
			},
			{
				id: "outside",
				name: "Unrelated",
				participants: ["gw", "other"],
				steps: [{ id: "outstep", from: "gw", to: "other", label: "report" }],
			},
		],
	});
	const proposal = board.variants[1]!;
	const scope = { kind: "selection" as const, nodes: [], edges: [], flows: ["oldflow", "newflow"] };
	const drawing = drawingOf(board, proposal, scope);
	expect(drawing.content.flows.map((flow) => flow.id).toSorted()).toEqual(["newflow", "oldflow"]);
	expect(drawing.content.nodes.map((node) => node.id).toSorted()).toEqual(["gw", "ld", "lg", "pl"]);
	expect(drawing.changes?.standing).toMatchObject({
		oldflow: "removed",
		oldstep: "removed",
		lg: "removed",
		newflow: "added",
	});
	expect(drawing.changes?.standing["outside"]).toBeUndefined();
	expect(drawing.changes?.standing["other"]).toBeUndefined();
	// A proposal-only selection still has nothing to show on the initial variant.
	const initial = drawingOf(board, board.variants[0]!, { ...scope, flows: ["newflow"] });
	expect(initial.content.nodes).toEqual([]);
	expect(initial.content.flows).toEqual([]);
	expect(initial.changes).toBeNull();
});
