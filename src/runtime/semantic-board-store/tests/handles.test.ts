import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-handles-"));
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };

// Every test gets its own board, made fresh before it runs, so that running one
// of them by name proves the same thing as running all of them.
let board = "";
let boards = 0;

/** The architecture every test in this file starts from. */
const SEED = {
	nodes: [
		{ name: "Gateway", kind: "service" },
		{ name: "Orders", kind: "service" },
		{ name: "Ledger", kind: "datastore" },
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
	board = `handled-${boards}`;
	await store.writeSemanticBoard({
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

/**
 * The board as it now stands, read back off disk.
 * @returns The board.
 */
const readBack = (): ContractModule.SemanticBoard => {
	const read = store.readSemanticBoard(board);
	if (!read.ok) throw new Error(read.problem);
	return read.board;
};

/**
 * The one variant's content as it now stands, read back off disk.
 * @returns The content.
 */
const held = (): ContractModule.VariantContent => readBack().variants[0]!.content;

/**
 * Apply one batch to the board as it now stands.
 * @param stated The batch as an agent states it.
 * @returns What the write boundary said.
 */
const edit = async (stated: Record<string, unknown>) => {
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: readBack().version,
		transition: store.editVariantTransition(contract.VariantEditInputSchema.parse(stated)),
	});
};

test("a beat can be about a relationship the same command creates", async () => {
	const applied = await edit({
		edges: [{ as: "h-checkout", from: "Gateway", to: "Orders", kind: "http" }],
		walkthroughs: [
			{
				name: "For the board",
				beats: [
					{ heading: "The call", body: "The gateway asks orders.", subjects: ["h-checkout"] },
				],
			},
		],
	});
	expect(applied.outcome).toBe("applied");

	const content = held();
	const edge = content.edges[0]!;
	expect(edge.from).toBe(content.nodes.find((node) => node.name === "Gateway")!.id);
	// The beat is about the relationship this same command minted an id for.
	expect(content.walkthroughs[0]!.beats[0]!.subjects).toEqual([edge.id]);
}, 20_000);

test("a beat can be about a step, and a flow, the same command creates", async () => {
	const applied = await edit({
		flows: [
			{
				as: "h-flow",
				name: "Checkout",
				participants: ["Gateway", "Orders", "Ledger"],
				steps: [
					{ from: "Gateway", to: "Orders", label: "place the order" },
					{ as: "h-charge", from: "Orders", to: "Ledger", label: "record the charge" },
				],
			},
		],
		walkthroughs: [
			{
				name: "For the board",
				beats: [
					{ heading: "The exchange", body: "One order, end to end.", subjects: ["h-flow"] },
					{ heading: "The charge", body: "And it is written down.", subjects: ["h-charge"] },
				],
			},
		],
	});
	expect(applied.outcome).toBe("applied");

	const content = held();
	const flow = content.flows[0]!;
	const charge = flow.steps[1]!;
	const beats = content.walkthroughs[0]!.beats;
	expect(beats[0]!.subjects).toEqual([flow.id]);
	expect(beats[1]!.subjects).toEqual([charge.id]);
}, 20_000);

test("a handle resolves anywhere a reference does, not only in a beat", async () => {
	const applied = await edit({
		nodes: [{ as: "h-queue", name: "Queue", kind: "queue" }],
		edges: [{ as: "h-enqueue", from: "Gateway", to: "h-queue", kind: "queue" }],
		views: [
			{
				name: "Just the queueing",
				grammar: "architecture",
				scope: { kind: "selection", nodes: ["h-queue"], edges: ["h-enqueue"], flows: [] },
			},
		],
	});
	expect(applied.outcome).toBe("applied");

	const content = held();
	const queue = content.nodes.find((node) => node.name === "Queue")!;
	const enqueue = content.edges.find((one) => one.to === queue.id)!;
	const scope = readBack().views[0]!.scope;
	expect(scope.kind === "selection" && scope.nodes).toEqual([queue.id]);
	expect(scope.kind === "selection" && scope.edges).toEqual([enqueue.id]);
}, 20_000);

test("a handle that is already an id on this board is refused, naming both", async () => {
	const taken = held().nodes[0]!.id;
	const refused = await edit({
		edges: [{ as: taken, from: "Gateway", to: "Orders", kind: "http" }],
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("AMBIGUOUS_REFERENCE");
	expect(refused.outcome === "rejected" && refused.problem).toContain(taken);
	expect(refused.outcome === "rejected" && refused.problem).toContain("already the id of");
	// Refused whole: the relationship the batch wanted is not on the board.
	expect(held().edges).toHaveLength(0);
}, 20_000);

test("a handle that is already a name on this board is refused, naming both", async () => {
	const refused = await edit({
		edges: [{ as: "Ledger", from: "Gateway", to: "Orders", kind: "http" }],
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("AMBIGUOUS_REFERENCE");
	expect(refused.outcome === "rejected" && refused.problem).toContain("Ledger");
	expect(refused.outcome === "rejected" && refused.problem).toContain("already the name of");
	expect(held().edges).toHaveLength(0);
}, 20_000);

test("two entries of one command cannot ask for the same handle", async () => {
	const refused = await edit({
		edges: [
			{ as: "h-same", from: "Gateway", to: "Orders", kind: "http" },
			{ as: "h-same", from: "Orders", to: "Ledger", kind: "call" },
		],
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("AMBIGUOUS_REFERENCE");
	expect(refused.outcome === "rejected" && refused.problem).toContain("h-same");
	// Neither of the two landed: one thing asked for is one write.
	expect(held().edges).toHaveLength(0);
}, 20_000);

test("an invented id is still refused, handles or no handles", async () => {
	const invented = await edit({
		edges: [{ id: "e1", as: "h-call", from: "Gateway", to: "Orders", kind: "http" }],
	});
	expect(invented.outcome === "rejected" && invented.code).toBe("UNKNOWN_EDGE");

	// And a subject that is neither an id, nor a handle this command gave out,
	// nor a name is still nothing at all.
	const guessed = await edit({
		edges: [{ as: "h-call", from: "Gateway", to: "Orders", kind: "http" }],
		walkthroughs: [
			{
				name: "For the board",
				beats: [{ heading: "The call", body: "About a thing.", subjects: ["e1"] }],
			},
		],
	});
	expect(guessed.outcome === "rejected" && guessed.code).toBe("UNKNOWN_SUBJECT");
	expect(held().edges).toHaveLength(0);
}, 20_000);

test("a handle is spent at the boundary and never reaches the board", async () => {
	const applied = await edit({
		nodes: [{ as: "h-cache", name: "Cache", kind: "service" }],
		edges: [{ as: "h-checkout", from: "Gateway", to: "h-cache", kind: "http" }],
		walkthroughs: [
			{
				name: "For the board",
				beats: [
					{
						heading: "Through the cache",
						body: "The gateway reads it first.",
						subjects: ["h-checkout", "h-cache"],
					},
				],
			},
		],
	});
	expect(applied.outcome).toBe("applied");

	// Read back off disk: nothing the board holds carries the handle, in any
	// field, and no entity gained an `as` of its own.
	const written = JSON.stringify(readBack());
	expect(written).not.toContain("h-cache");
	expect(written).not.toContain("h-checkout");
	const cache = held().nodes.find((node) => node.name === "Cache")!;
	expect(Object.hasOwn(cache, "as")).toBe(false);

	// And the same words are free again, because nothing kept them: a handle
	// belongs to one command and dies with it.
	const again = await edit({
		nodes: [{ as: "h-cache", name: "Second", kind: "service" }],
		edges: [{ as: "h-checkout", from: "Gateway", to: "h-cache", kind: "http" }],
	});
	expect(again.outcome).toBe("applied");
	const second = held().nodes.find((node) => node.name === "Second")!;
	expect(held().edges.some((one) => one.to === second.id)).toBe(true);
}, 20_000);
