import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-flows-"));
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };

// Every test gets its own board, made fresh before it runs, so that running one
// of them by name proves the same thing as running all of them.
let board = "";
let seeded: Awaited<ReturnType<typeof StoreModule.writeSemanticBoard>>;
let boards = 0;

/** The architecture, the flow and the two readings every test starts from. */
const SEED = {
	level: "system",
	nodes: [
		{ name: "CLI", kind: "app" },
		{ name: "Canvas", kind: "service" },
		{ name: "Vault", kind: "datastore" },
	],
	edges: [{ from: "CLI", to: "Canvas", kind: "http" }],
	flows: [
		{
			name: "One edit",
			participants: ["CLI", "Canvas", "Vault"],
			steps: [
				{ from: "CLI", to: "Canvas", label: "state the change" },
				{ from: "Canvas", to: "Canvas", label: "take the lease" },
				{ from: "Canvas", to: "Vault", label: "atomic write" },
				{ from: "Canvas", to: "CLI", label: "what it became", kind: "return" },
			],
		},
	],
	views: [
		{ name: "The parts", grammar: "architecture" },
		{
			name: "One edit, in order",
			grammar: "data-flow",
			scope: { kind: "selection", nodes: [], edges: [], flows: ["One edit"] },
		},
	],
};

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	// Where this owner's boards actually land, asked rather than assumed.
	ownVaultOrRefuse(vault, store.locateSemanticBoard("where this owner writes").file);
	contract = await import("@/shared/semantic-board/index");
});
beforeEach(async () => {
	boards += 1;
	board = `two-views-${boards}`;
	seeded = await store.writeSemanticBoard({
		board,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({ ...SEED, name: board }),
		),
	});
});
afterAll(() => {
	if (callerVault === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = callerVault;
	rmSync(vault, { recursive: true, force: true });
});

test("flows and views land in one batch and read back resolved", () => {
	expect(seeded.outcome).toBe("applied");
	const read = store.readSemanticBoard(board);
	expect(read.ok).toBe(true);
	if (!read.ok) return;
	const content = read.board.variants[0]!.content;
	expect(content.flows).toHaveLength(1);
	expect(read.board.views.map((v) => v.grammar)).toEqual(["architecture", "data-flow"]);
	// The self step is a self step whether or not it was said.
	expect(content.flows[0]!.steps[1]!.kind).toBe("self");
	// The view's scope names the flow by identity, not by the name it was written with.
	const scope = read.board.views[1]!.scope;
	expect(scope.kind === "selection" && scope.flows).toEqual([content.flows[0]!.id]);
	// Every participant and endpoint is a node of this variant.
	const nodeIds = new Set(content.nodes.map((n) => n.id));
	expect(content.flows[0]!.participants.every((p) => nodeIds.has(p))).toBe(true);

	// Two views over the same identities: the data-flow one keeps its flow's nodes.
	const drawn = contract.scopedContent(content, scope);
	expect(drawn.nodes.map((n) => n.name).toSorted()).toEqual(["CLI", "Canvas", "Vault"]);
	expect(drawn.flows).toHaveLength(1);
}, 20_000);

test("a node cannot be taken out from under a flow without saying so", async () => {
	const read = store.readSemanticBoard(board);
	if (!read.ok) throw new Error("no board");
	const refused = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read.board.version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({ removeNodes: ["Vault"] }),
		),
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("NODE_IN_FLOW");
}, 20_000);

test("a board view keeps a stale selection and explicitly draws nothing", async () => {
	const read = store.readSemanticBoard(board);
	if (!read.ok) throw new Error("no board");
	const view = read.board.views[1]!;
	const selectedFlow = read.board.variants[0]!.content.flows[0]!.id;
	const applied = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read.board.version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({ removeFlows: ["One edit"] }),
		),
	});
	expect(applied.outcome).toBe("applied");
	if (applied.outcome !== "applied") return;
	const content = applied.board.variants[0]!.content;
	expect(applied.board.views).toEqual(read.board.views);
	expect(view.scope.kind === "selection" && view.scope.flows).toEqual([selectedFlow]);
	expect(contract.scopedContent(content, view.scope)).toEqual({
		nodes: [],
		edges: [],
		flows: [],
		walkthroughs: [],
	});
}, 20_000);

test("a step keeps its id when its flow is rewritten, and a stated id must name one", async () => {
	const before = store.readSemanticBoard(board);
	if (!before.ok) throw new Error("no board");
	const flow = before.board.variants[0]!.content.flows[0]!;
	const kept = flow.steps[0]!.id;
	const moved = flow.steps[3]!.id;

	// The same flow, reordered and reworded, with two of its steps named.
	const rewritten = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: before.board.version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				flows: [
					{
						id: flow.id,
						name: "One edit",
						participants: ["CLI", "Canvas", "Vault"],
						steps: [
							{ id: moved, from: "Canvas", to: "CLI", label: "what it became", kind: "return" },
							{ id: kept, from: "CLI", to: "Canvas", label: "state the change, precisely" },
							{ from: "Canvas", to: "Vault", label: "atomic write" },
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
	expect(after.steps[1]!.label).toBe("state the change, precisely");
	expect(after.steps[2]!.id).not.toBe(kept);

	// A step id that names nothing is a typo, not a new step.
	const refused = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: rewritten.board.version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				flows: [
					{
						id: flow.id,
						name: "One edit",
						participants: ["CLI", "Canvas"],
						steps: [{ id: "notastep", from: "CLI", to: "Canvas", label: "typo" }],
					},
				],
			}),
		),
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_STEP");
}, 20_000);

test("a stated flow or view id that names nothing is refused", async () => {
	const read = store.readSemanticBoard(board);
	if (!read.ok) throw new Error("no board");
	const noFlow = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read.board.version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
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
		board,
		writer,
		expectedVersion: read.board.version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				views: [{ id: "nov1ew", name: "Ghost", grammar: "architecture" }],
			}),
		),
	});
	expect(noView.outcome === "rejected" && noView.code).toBe("UNKNOWN_VIEW");
}, 20_000);

test("a board view can select an identity held only by another variant without changing either", async () => {
	const initial = store.readSemanticBoard(board);
	if (!initial.ok) throw new Error(initial.problem);
	const baseline = initial.board.variants[0]!;
	const branched = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: initial.board.version,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ from: baseline.name, name: "With queue" }),
		),
	});
	expect(branched.outcome).toBe("applied");
	if (branched.outcome !== "applied") return;

	const extended = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: branched.board.version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				variant: "With queue",
				nodes: [{ name: "Queue", kind: "queue" }],
			}),
		),
	});
	expect(extended.outcome).toBe("applied");
	if (extended.outcome !== "applied") return;
	const adopted = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: extended.board.version,
		transition: store.adoptVariantTransition(
			contract.BoardAdoptInputSchema.parse({ variant: "With queue", reason: "queue it" }),
		),
	});
	expect(adopted.outcome).toBe("applied");
	if (adopted.outcome !== "applied") return;
	const before = adopted.board.variants.map((variant) => variant.content);
	expect(adopted.board.variants.find((variant) => variant.id === baseline.id)?.lifecycle).toBe(
		"historical",
	);

	const viewed = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: adopted.board.version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
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
		board,
		writer,
		expectedVersion: viewed.board.version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				variant: baseline.name,
				nodes: [{ ...historicalNode, name: "Historical CLI" }],
				views: [{ name: "Must not land", grammar: "architecture" }],
			}),
		),
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("VARIANT_HISTORICAL");
	const unchanged = store.readSemanticBoard(board);
	if (!unchanged.ok) throw new Error(unchanged.problem);
	expect(unchanged.board.version).toBe(viewed.board.version);
	expect(unchanged.board.views).toEqual(viewed.board.views);
}, 20_000);

test("a node keeps everything it was written with, including where it drills down to", async () => {
	// The field an agent may author is the field a hand-written copier forgets:
	// this one passed the schema and the coherence check and then was not there.
	const made = await store.writeSemanticBoard({
		board: "drilling",
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name: "drilling",
				level: "system",
				nodes: [
					{ id: undefined, name: "Canvas", kind: "service", description: "serves the panes" },
				],
			}),
		),
	});
	expect(made.outcome).toBe("applied");
	const read = store.readSemanticBoard("drilling");
	if (!read.ok) throw new Error("no board");
	const node = read.board.variants[0]!.content.nodes[0]!;
	const edited = await store.writeSemanticBoard({
		board: "drilling",
		writer,
		expectedVersion: read.board.version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				nodes: [
					{
						id: node.id,
						name: "Canvas",
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
	const after = store.readSemanticBoard("drilling");
	if (!after.ok) throw new Error("no board");
	const kept = after.board.variants[0]!.content.nodes[0]!;
	expect(kept.drillDown).toEqual({
		board: "pipeline",
		variant: { kind: "named", name: "Initial" },
	});
	expect(kept.responsibility).toBe("one board at a time");
	expect(kept.description).toBe("serves the panes");
}, 20_000);
