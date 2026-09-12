import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-walkthroughs-"));
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };

// Every test gets its own board, made fresh before it runs, so that running one
// of them by name proves the same thing as running all of them.
let board = "";
let seeded: Awaited<ReturnType<typeof StoreModule.writeSemanticBoard>>;
let boards = 0;

/** The architecture and the explanation every test in this file starts from. */
const SEED = {
	nodes: [
		{ name: "CLI", kind: "app" },
		{ name: "Canvas", kind: "service" },
		{ name: "Vault", kind: "datastore" },
		// A node and a flow may share a name; the ambiguity case below needs it.
		{ name: "Ingest", kind: "service" },
		{ name: "Ledger", kind: "datastore" },
	],
	edges: [{ from: "CLI", to: "Canvas", kind: "http" }],
	flows: [
		{
			name: "Ingest",
			participants: ["CLI", "Canvas", "Vault"],
			steps: [
				{ from: "CLI", to: "Canvas", label: "state the change" },
				{ from: "Canvas", to: "Vault", label: "atomic write" },
			],
		},
	],
	views: [{ name: "The parts", grammar: "architecture" }],
	walkthroughs: [
		{
			name: "For the board",
			summary: "Ten minutes, no jargon.",
			beats: [
				{ heading: "The shape", body: "Five parts and one call between them." },
				{
					heading: "Where it lands",
					body: "Everything ends up in the ledger.",
					subjects: ["Ledger", "CLI"],
					view: "The parts",
				},
			],
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
	board = `narrated-${boards}`;
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

/**
 * The board as it now stands, or a failure naming what went wrong.
 * @returns The one variant's content.
 */
const held = (): ContractModule.VariantContent => {
	const read = store.readSemanticBoard(board);
	if (!read.ok) throw new Error(read.problem);
	return read.board.variants[0]!.content;
};

/**
 * Apply one batch to the board as it now stands.
 * @param edit The batch as an agent states it.
 * @returns What the write boundary said.
 */
const edit = async (edit_: Record<string, unknown>) => {
	const read = store.readSemanticBoard(board);
	if (!read.ok) throw new Error(read.problem);
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read.board.version,
		transition: store.editVariantTransition(contract.VariantEditInputSchema.parse(edit_)),
	});
};

test("an explanation lands in one batch and reads back resolved", () => {
	expect(seeded.outcome).toBe("applied");

	const content = held();
	expect(content.walkthroughs).toHaveLength(1);
	const walkthrough = content.walkthroughs[0]!;
	expect(walkthrough.beats.map((beat) => beat.heading)).toEqual(["The shape", "Where it lands"]);
	expect(walkthrough.summary).toBe("Ten minutes, no jargon.");

	// Every name an agent wrote was spent at the boundary: the board holds ids.
	const ledger = content.nodes.find((node) => node.name === "Ledger")!;
	const cli = content.nodes.find((node) => node.name === "CLI")!;
	expect(walkthrough.beats[1]!.subjects).toEqual([ledger.id, cli.id]);
	expect(walkthrough.beats[1]!.view).toBe(content.views[0]!.id);
	// A beat about nothing keeps an empty list rather than gaining one.
	expect(walkthrough.beats[0]!.subjects).toEqual([]);

	// Minted against the whole family: nothing on the board answers twice.
	const ids = contract.subjectIds(content);
	expect(new Set(ids).size).toBe(ids.length);
}, 20_000);

test("a beat keeps its id when the explanation is rewritten, and a stated id must name one", async () => {
	const before = held().walkthroughs[0]!;
	const kept = before.beats[1]!.id;

	const rewritten = await edit({
		walkthroughs: [
			{
				id: before.id,
				name: "For the board",
				beats: [
					// The same beat, reworded and moved to the front.
					{ id: kept, heading: "Where it lands", body: "It all ends up in the ledger." },
					{ heading: "The shape", body: "Five parts and one call between them." },
				],
			},
		],
	});
	expect(rewritten.outcome).toBe("applied");

	const after = held().walkthroughs[0]!;
	expect(after.id).toBe(before.id);
	expect(after.beats[0]!.id).toBe(kept);
	expect(after.beats[0]!.body).toBe("It all ends up in the ledger.");
	// A stated beat is the whole beat, so what it left out is gone.
	expect(after.beats[0]!.subjects).toEqual([]);
	expect(after.beats[0]!.view).toBeUndefined();
	// The one it did not name is a new beat with an identity of its own.
	expect(after.beats[1]!.id).not.toBe(before.beats[0]!.id);

	const invented = await edit({
		walkthroughs: [
			{
				id: after.id,
				name: "For the board",
				beats: [{ id: "zzzz", heading: "Typo", body: "An id nothing answers to." }],
			},
		],
	});
	expect(invented.outcome === "rejected" && invented.code).toBe("UNKNOWN_BEAT");
}, 20_000);

test("a stated walkthrough id must name one that is already there", async () => {
	const refused = await edit({
		walkthroughs: [
			{ id: "zzzz", name: "For nobody", beats: [{ heading: "One", body: "Nothing." }] },
		],
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_WALKTHROUGH");
	expect(refused.outcome === "rejected" && refused.problem).toContain("Leave the id out");
}, 20_000);

test("a beat about a name that fits two things is refused rather than guessed at", async () => {
	const walkthrough = held().walkthroughs[0]!;
	const refused = await edit({
		walkthroughs: [
			{
				id: walkthrough.id,
				name: "For the board",
				beats: [{ heading: "Ingest", body: "How it arrives.", subjects: ["Ingest"] }],
			},
		],
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("AMBIGUOUS_REFERENCE");

	// Naming the one it meant by its id resolves it.
	const flow = held().flows[0]!;
	const accepted = await edit({
		walkthroughs: [
			{
				id: walkthrough.id,
				name: "For the board",
				beats: [{ heading: "Ingest", body: "How it arrives.", subjects: [flow.id] }],
			},
		],
	});
	expect(accepted.outcome).toBe("applied");
	expect(held().walkthroughs[0]!.beats[0]!.subjects).toEqual([flow.id]);
}, 20_000);

test("a beat about something the board has not got is refused", async () => {
	const walkthrough = held().walkthroughs[0]!;
	const refused = await edit({
		walkthroughs: [
			{
				id: walkthrough.id,
				name: "For the board",
				beats: [{ heading: "Ghosts", body: "About a thing.", subjects: ["Nowhere"] }],
			},
		],
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_SUBJECT");

	const blind = await edit({
		walkthroughs: [
			{
				id: walkthrough.id,
				name: "For the board",
				beats: [{ heading: "Ghosts", body: "Read through nothing.", view: "No such view" }],
			},
		],
	});
	expect(blind.outcome === "rejected" && blind.code).toBe("UNKNOWN_VIEW");
}, 20_000);

test("an explanation with nothing in it is refused, and says which one", async () => {
	const walkthrough = held().walkthroughs[0]!;
	const refused = await edit({
		walkthroughs: [{ id: walkthrough.id, name: "For the board", beats: [] }],
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("INVALID_CONTENT");
	expect(refused.outcome === "rejected" && refused.problem).toContain("walkthrough with no beats");
}, 20_000);

test("a node cannot be taken out from under a beat that talks about it", async () => {
	const walkthrough = held().walkthroughs[0]!;
	const stated = await edit({
		walkthroughs: [
			{
				id: walkthrough.id,
				name: "For the board",
				beats: [{ heading: "Where it lands", body: "In the ledger.", subjects: ["Ledger"] }],
			},
		],
	});
	expect(stated.outcome).toBe("applied");

	const refused = await edit({ removeNodes: ["Ledger"] });
	expect(refused.outcome === "rejected" && refused.code).toBe("SUBJECT_IN_WALKTHROUGH");
	expect(refused.outcome === "rejected" && refused.problem).toContain("Where it lands");
	// Refused whole: the node the batch wanted gone is still there.
	expect(held().nodes.some((node) => node.name === "Ledger")).toBe(true);
}, 20_000);

test("removing a node and rewriting the beat about it is one command", async () => {
	const walkthrough = held().walkthroughs[0]!;
	const both = await edit({
		removeNodes: ["Ledger"],
		walkthroughs: [
			{
				id: walkthrough.id,
				name: "For the board",
				beats: [{ heading: "Where it lands", body: "Nowhere, for now.", subjects: [] }],
			},
		],
	});
	expect(both.outcome).toBe("applied");
	expect(held().nodes.some((node) => node.name === "Ledger")).toBe(false);
	expect(held().walkthroughs[0]!.beats[0]!.subjects).toEqual([]);
}, 20_000);

test("a view cannot be taken out from under a beat that is read through it", async () => {
	const walkthrough = held().walkthroughs[0]!;
	const stated = await edit({
		walkthroughs: [
			{
				id: walkthrough.id,
				name: "For the board",
				beats: [{ heading: "The parts", body: "Look at the whole thing.", view: "The parts" }],
			},
		],
	});
	expect(stated.outcome).toBe("applied");

	const refused = await edit({ removeViews: ["The parts"] });
	expect(refused.outcome === "rejected" && refused.code).toBe("SUBJECT_IN_WALKTHROUGH");
}, 20_000);

test("an explanation is removed by the name it is addressed under", async () => {
	const missing = await edit({ removeWalkthroughs: ["For nobody"] });
	expect(missing.outcome === "rejected" && missing.code).toBe("UNKNOWN_WALKTHROUGH");

	const removed = await edit({ removeWalkthroughs: ["For the board"] });
	expect(removed.outcome).toBe("applied");
	expect(held().walkthroughs).toEqual([]);
	// The architecture it explained is untouched: a narrative is not content.
	expect(held().nodes).not.toHaveLength(0);
	expect(held().views).toHaveLength(1);
}, 20_000);

test("two explanations of one board are held, and one name is refused", async () => {
	const second = await edit({
		walkthroughs: [
			{ name: "For the builders", beats: [{ heading: "The seams", body: "One write boundary." }] },
		],
	});
	expect(second.outcome).toBe("applied");
	expect(held().walkthroughs.map((one) => one.name)).toEqual(["For the board", "For the builders"]);

	// A third stating an existing name replaces that one rather than adding a
	// second of it, which is what keeps the name an address.
	const again = await edit({
		walkthroughs: [
			{ name: "For the board", beats: [{ heading: "The shape", body: "Four parts, redrawn." }] },
		],
	});
	expect(again.outcome).toBe("applied");
	expect(held().walkthroughs).toHaveLength(2);
	expect(held().walkthroughs[0]!.beats[0]!.body).toBe("Four parts, redrawn.");
}, 20_000);
