import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as store from "@/runtime/semantic-board-store/index";
import {
	BoardCreateInputSchema,
	VariantEditInputSchema,
	BoardBranchInputSchema,
} from "@archboard/board/board-input";
import { scopedContent } from "@archboard/board/scope";
import { messagesOf, everyStep } from "@archboard/board/flow-steps";
import { BoardAdoptInputSchema } from "@archboard/board/resolution-input";

const vault = mkdtempSync(join(tmpdir(), "archboard-flows-"));
const writer = { kind: "agent" as const };

// Every test gets its own board, made fresh before it runs, so that running one
// of them by name proves the same thing as running all of them.
let board = "";
let seeded: Awaited<ReturnType<typeof store.writeSemanticBoard>>;
let boards = 0;

/** The architecture, the flow and the two readings every test starts from. */
const SEED = {
	level: "system",
	nodes: [
		{ name: "CLI", kind: "app" },
		{ name: "Server", kind: "service" },
		{ name: "Vault", kind: "datastore" },
	],
	edges: [{ from: "CLI", to: "Server", kind: "http" }],
	flows: [
		{
			name: "One edit",
			participants: ["CLI", "Server", "Vault"],
			steps: [
				{ from: "CLI", to: "Server", label: "state the change" },
				{ from: "Server", to: "Server", label: "take the lease" },
				{ from: "Server", to: "Vault", label: "atomic write" },
				{ from: "Server", to: "CLI", label: "what it became", kind: "return" },
			],
		},
	],
	views: [
		{ name: "The parts", grammar: "architecture" },
		{
			name: "One edit, in order",
			grammar: "sequence",
			scope: { kind: "selection", nodes: [], edges: [], flows: ["One edit"] },
		},
	],
};

beforeEach(async () => {
	boards += 1;
	board = `two-views-${boards}`;
	seeded = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		transition: store.createBoardTransition(BoardCreateInputSchema.parse({ ...SEED, name: board })),
	});
});
afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

test("flows and views land in one batch and read back resolved", () => {
	expect(seeded.outcome).toBe("applied");
	const read = store.readSemanticBoard(vault, board);
	expect(read.ok).toBe(true);
	if (!read.ok) return;
	const content = read.board.variants[0]!.content;
	expect(content.flows).toHaveLength(1);
	expect(read.board.views.map((v) => v.grammar)).toEqual(["architecture", "sequence"]);
	// The self step is a self step whether or not it was said.
	expect(content.flows[0]!.steps[1]!.kind).toBe("self");
	// The view's scope names the flow by identity, not by the name it was written with.
	const scope = read.board.views[1]!.scope;
	expect(scope.kind === "selection" && scope.flows).toEqual([content.flows[0]!.id]);
	// Every participant and endpoint is a node of this variant.
	const nodeIds = new Set(content.nodes.map((n) => n.id));
	expect(content.flows[0]!.participants.every((p) => nodeIds.has(p))).toBe(true);

	// Two views over the same identities: the sequence one keeps its flow's nodes.
	const drawn = scopedContent(content, scope);
	expect(drawn.nodes.map((n) => n.name).toSorted()).toEqual(["CLI", "Server", "Vault"]);
	expect(drawn.flows).toHaveLength(1);
}, 20_000);

test("a node cannot be taken out from under a flow without saying so", async () => {
	const read = store.readSemanticBoard(vault, board);
	if (!read.ok) throw new Error("no board");
	const refused = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: read.board.version,
		transition: store.editVariantTransition(
			VariantEditInputSchema.parse({ removeNodes: ["Vault"] }),
		),
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("NODE_IN_FLOW");
}, 20_000);

test("a board view keeps a stale selection and explicitly draws nothing", async () => {
	const read = store.readSemanticBoard(vault, board);
	if (!read.ok) throw new Error("no board");
	const view = read.board.views[1]!;
	const selectedFlow = read.board.variants[0]!.content.flows[0]!.id;
	const applied = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: read.board.version,
		transition: store.editVariantTransition(
			VariantEditInputSchema.parse({ removeFlows: ["One edit"] }),
		),
	});
	expect(applied.outcome).toBe("applied");
	if (applied.outcome !== "applied") return;
	const content = applied.board.variants[0]!.content;
	expect(applied.board.views).toEqual(read.board.views);
	expect(view.scope.kind === "selection" && view.scope.flows).toEqual([selectedFlow]);
	expect(scopedContent(content, view.scope)).toEqual({
		nodes: [],
		edges: [],
		flows: [],
		walkthroughs: [],
	});
}, 20_000);

test("a step keeps its id when its flow is rewritten, and a stated id must name one", async () => {
	const before = store.readSemanticBoard(vault, board);
	if (!before.ok) throw new Error("no board");
	const flow = before.board.variants[0]!.content.flows[0]!;
	const kept = flow.steps[0]!.id;
	const moved = flow.steps[3]!.id;

	// The same flow, reordered and reworded, with two of its steps named.
	const rewritten = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: before.board.version,
		transition: store.editVariantTransition(
			VariantEditInputSchema.parse({
				flows: [
					{
						id: flow.id,
						name: "One edit",
						participants: ["CLI", "Server", "Vault"],
						steps: [
							{ id: moved, from: "Server", to: "CLI", label: "what it became", kind: "return" },
							{ id: kept, from: "CLI", to: "Server", label: "state the change, precisely" },
							{ from: "Server", to: "Vault", label: "atomic write" },
						],
					},
				],
			}),
		),
	});
	expect(rewritten.outcome).toBe("applied");
	if (rewritten.outcome !== "applied") return;
	const after = rewritten.board.variants[0]!.content.flows[0]!;
	expect(after.steps.map((s) => s.id).slice(0, 2)).toEqual([moved, kept]);
	expect(messagesOf(after.steps)[1]!.label).toBe("state the change, precisely");
	expect(after.steps[2]!.id).not.toBe(kept);

	// A step id that names nothing is a typo, not a new step.
	const refused = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: rewritten.board.version,
		transition: store.editVariantTransition(
			VariantEditInputSchema.parse({
				flows: [
					{
						id: flow.id,
						name: "One edit",
						participants: ["CLI", "Server"],
						steps: [{ id: "notastep", from: "CLI", to: "Server", label: "typo" }],
					},
				],
			}),
		),
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_STEP");
}, 20_000);

test("a stated flow or view id that names nothing is refused", async () => {
	const read = store.readSemanticBoard(vault, board);
	if (!read.ok) throw new Error("no board");
	const noFlow = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: read.board.version,
		transition: store.editVariantTransition(
			VariantEditInputSchema.parse({
				flows: [
					{
						id: "nof1ow",
						name: "Ghost",
						participants: ["CLI"],
						steps: [{ from: "CLI", to: "CLI", label: "x" }],
					},
				],
			}),
		),
	});
	expect(noFlow.outcome === "rejected" && noFlow.code).toBe("UNKNOWN_FLOW");

	const noView = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: read.board.version,
		transition: store.editVariantTransition(
			VariantEditInputSchema.parse({
				views: [{ id: "nov1ew", name: "Ghost", grammar: "architecture" }],
			}),
		),
	});
	expect(noView.outcome === "rejected" && noView.code).toBe("UNKNOWN_VIEW");
}, 20_000);

test("a board view can select an identity held only by another variant without changing either", async () => {
	const initial = store.readSemanticBoard(vault, board);
	if (!initial.ok) throw new Error(initial.problem);
	const baseline = initial.board.variants[0]!;
	const branched = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: initial.board.version,
		transition: store.branchVariantTransition(
			BoardBranchInputSchema.parse({ from: baseline.name, name: "With queue" }),
		),
	});
	expect(branched.outcome).toBe("applied");
	if (branched.outcome !== "applied") return;

	const extended = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: branched.board.version,
		transition: store.editVariantTransition(
			VariantEditInputSchema.parse({
				variant: "With queue",
				nodes: [{ name: "Queue", kind: "queue" }],
			}),
		),
	});
	expect(extended.outcome).toBe("applied");
	if (extended.outcome !== "applied") return;
	const adopted = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: extended.board.version,
		transition: store.adoptVariantTransition(
			BoardAdoptInputSchema.parse({ variant: "With queue", reason: "queue it" }),
		),
	});
	expect(adopted.outcome).toBe("applied");
	if (adopted.outcome !== "applied") return;
	const before = adopted.board.variants.map((variant) => variant.content);
	expect(adopted.board.variants.find((variant) => variant.id === baseline.id)?.lifecycle).toBe(
		"historical",
	);

	const viewed = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: adopted.board.version,
		transition: store.editVariantTransition(
			VariantEditInputSchema.parse({
				variant: baseline.name,
				views: [
					{
						name: "The proposed queue",
						grammar: "architecture",
						scope: { kind: "selection", nodes: ["Queue"], edges: [], flows: [] },
					},
				],
			}),
		),
	});
	expect(viewed.outcome).toBe("applied");
	if (viewed.outcome !== "applied") return;
	expect(viewed.board.variants.map((variant) => variant.content)).toEqual(before);
	const queue = viewed.board.variants[1]!.content.nodes.find((node) => node.name === "Queue")!;
	const view = viewed.board.views.find((one) => one.name === "The proposed queue")!;
	expect(view.scope.kind === "selection" && view.scope.nodes).toEqual([queue.id]);

	const historicalNode = viewed.board.variants.find((variant) => variant.id === baseline.id)!
		.content.nodes[0]!;
	const refused = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: viewed.board.version,
		transition: store.editVariantTransition(
			VariantEditInputSchema.parse({
				variant: baseline.name,
				nodes: [{ ...historicalNode, name: "Historical CLI" }],
				views: [{ name: "Must not land", grammar: "architecture" }],
			}),
		),
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("VARIANT_HISTORICAL");
	const unchanged = store.readSemanticBoard(vault, board);
	if (!unchanged.ok) throw new Error(unchanged.problem);
	expect(unchanged.board.version).toBe(viewed.board.version);
	expect(unchanged.board.views).toEqual(viewed.board.views);
}, 20_000);

test("a node keeps everything it was written with, including where it drills down to", async () => {
	// The field an agent may author is the field a hand-written copier forgets:
	// this one passed the schema and the coherence check and then was not there.
	const made = await store.writeSemanticBoard({
		vault,
		board: "drilling",
		writer,
		transition: store.createBoardTransition(
			BoardCreateInputSchema.parse({
				name: "drilling",
				level: "system",
				nodes: [
					{ id: undefined, name: "Server", kind: "service", description: "serves the panes" },
				],
			}),
		),
	});
	expect(made.outcome).toBe("applied");
	const read = store.readSemanticBoard(vault, "drilling");
	if (!read.ok) throw new Error("no board");
	const node = read.board.variants[0]!.content.nodes[0]!;
	const edited = await store.writeSemanticBoard({
		vault,
		board: "drilling",
		writer,
		expectedVersion: read.board.version,
		transition: store.editVariantTransition(
			VariantEditInputSchema.parse({
				nodes: [
					{
						id: node.id,
						name: "Server",
						kind: "service",
						description: "serves the panes",
						responsibility: "one board at a time",
						drillDown: { board: "pipeline", variant: { kind: "named", name: "Initial" } },
					},
				],
			}),
		),
	});
	expect(edited.outcome).toBe("applied");
	const after = store.readSemanticBoard(vault, "drilling");
	if (!after.ok) throw new Error("no board");
	const kept = after.board.variants[0]!.content.nodes[0]!;
	expect(kept.drillDown).toEqual({
		board: "pipeline",
		variant: { kind: "named", name: "Initial" },
	});
	expect(kept.responsibility).toBe("one board at a time");
	expect(kept.description).toBe("serves the panes");
}, 20_000);

/** The ids a branching edit states for its decision, its loop and its write, where known. */
interface BranchIds {
	readonly decision?: string;
	readonly loop?: string;
	readonly write?: string;
}

test("a decision and a loop land with ids of their own, keep them on a rewrite, and name parts by name", async () => {
	const read = store.readSemanticBoard(vault, board);
	if (!read.ok) throw new Error("no board");
	const flow = read.board.variants[0]!.content.flows[0]!;
	const ask = flow.steps[0]!.id;
	/**
	 * The flow with a decision on the lease, its "no" side writing in a loop.
	 * @param ids The ids to state.
	 * @returns The edit.
	 */
	const branching = (ids: BranchIds): unknown => ({
		flows: [
			{
				id: flow.id,
				name: "One edit",
				participants: ["CLI", "Server", "Vault"],
				steps: [
					{ id: ask, from: "CLI", to: "Server", label: "state the change" },
					{
						id: ids.decision,
						kind: "decision",
						question: "Is the lease held?",
						alternatives: [
							{
								label: "yes",
								steps: [{ from: "Server", to: "CLI", label: "held", kind: "return" }],
							},
							{
								label: "no",
								steps: [
									{
										id: ids.loop,
										kind: "loop",
										condition: "for each variant",
										steps: [{ id: ids.write, from: "Server", to: "Vault", label: "atomic write" }],
									},
								],
							},
						],
					},
				],
			},
		],
	});
	const written = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: read.board.version,
		transition: store.editVariantTransition(VariantEditInputSchema.parse(branching({}))),
	});
	if (written.outcome !== "applied") throw new Error(`refused: ${JSON.stringify(written)}`);
	const steps = written.board.variants[0]!.content.flows[0]!.steps;
	const decision = steps[1]!;
	if (decision.kind !== "decision") throw new Error("no decision");
	const loop = decision.alternatives[1]!.steps[0]!;
	if (loop.kind !== "loop") throw new Error("no loop");
	const write = messagesOf(loop.steps)[0]!;
	// Every step got an id of its own, and a message names its parts by id.
	const minted = everyStep(steps).map((step) => step.id);
	expect(new Set(minted).size).toBe(minted.length);
	const nodes = new Map(
		written.board.variants[0]!.content.nodes.map((node) => [node.name, node.id]),
	);
	expect([write.from, write.to]).toEqual([nodes.get("Server")!, nodes.get("Vault")!]);

	// Stated again with the ids it was given, the logic keeps every one of them.
	const rewritten = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: written.board.version,
		transition: store.editVariantTransition(
			VariantEditInputSchema.parse(
				branching({ decision: decision.id, loop: loop.id, write: write.id }),
			),
		),
	});
	if (rewritten.outcome !== "applied") throw new Error("refused");
	const kept = everyStep(rewritten.board.variants[0]!.content.flows[0]!.steps);
	expect(kept.map((step) => step.id)).toEqual(
		expect.arrayContaining([ask, decision.id, loop.id, write.id]),
	);
}, 20_000);
