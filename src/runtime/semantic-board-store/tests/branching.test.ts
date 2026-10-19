import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as store from "@/runtime/semantic-board-store/index";
import {
	BoardCreateInputSchema,
	BoardBranchInputSchema,
	VariantEditInputSchema,
} from "@archboard/board/board-input";
import { compareVariants } from "@archboard/board/compare-variants";
import { BoardShelveInputSchema, BoardAdoptInputSchema } from "@archboard/board/resolution-input";

const vault = mkdtempSync(join(tmpdir(), "archboard-branching-"));
const writer = { kind: "agent" as const };

// Every test gets its own board, made fresh before it runs — the baseline and
// one proposal off it — so that running one of them by name proves the same
// thing as running all of them.
let board = "";
let branched: Awaited<ReturnType<typeof store.writeSemanticBoard>>;
let boards = 0;
const PROPOSAL = "Queue in front";

beforeEach(async () => {
	boards += 1;
	board = `ancestry-${boards}`;
	await store.writeSemanticBoard({
		vault,
		board,
		writer,
		transition: store.createBoardTransition(
			BoardCreateInputSchema.parse({
				name: board,
				level: "system",
				nodes: [
					{ name: "Gateway", kind: "service" },
					{ name: "Orders", kind: "service" },
				],
				edges: [{ from: "Gateway", to: "Orders", kind: "http" }],
			}),
		),
	});
	branched = await branch(board, read(board).variants[0]!.name, PROPOSAL);
});
afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

/**
 * The board as it now stands.
 * @param name The board name.
 * @returns The board.
 */
function read(name: string) {
	const answer = store.readSemanticBoard(vault, name);
	if (!answer.ok) throw new Error(answer.problem);
	return answer.board;
}

/**
 * Branch a proposal from a variant.
 * @param on The board name.
 * @param from The variant to derive from.
 * @param name What to call the proposal.
 * @returns What the write did.
 */
async function branch(on: string, from: string, name: string) {
	return store.writeSemanticBoard({
		vault,
		board: on,
		writer,
		expectedVersion: read(on).version,
		transition: store.branchVariantTransition(BoardBranchInputSchema.parse({ from, name })),
	});
}

test("a proposal inherits its predecessor's architecture, identities and all", () => {
	expect(branched.outcome).toBe("applied");
	const held = read(board);
	const initial = held.variants[0]!;
	expect(held.variants).toHaveLength(2);
	const proposal = held.variants[1]!;
	expect(proposal.lifecycle).toBe("draft");
	expect(proposal.parent).toBe(initial.id);
	// The designation does not move: branching proposes, it does not implement.
	expect(held.current).toBe(initial.id);
	// The same entities, not copies with new identities — which is what makes
	// the two comparable at all.
	expect(proposal.content.nodes.map((node) => node.id)).toEqual(
		initial.content.nodes.map((node) => node.id),
	);
	expect(proposal.content.edges.map((edge) => edge.id)).toEqual(
		initial.content.edges.map((edge) => edge.id),
	);
}, 20_000);

test("two proposals can compete from one baseline, and a proposal can be branched again", async () => {
	const initial = read(board).variants[0]!;
	expect((await branch(board, initial.name, "Cache in front")).outcome).toBe("applied");
	const chained = await branch(board, PROPOSAL, "Queue, then batched");
	expect(chained.outcome).toBe("applied");

	const held = read(board);
	const byName = new Map(held.variants.map((variant) => [variant.name, variant]));
	// Two siblings of the baseline, and one child of a sibling.
	expect(byName.get(PROPOSAL)?.parent).toBe(initial.id);
	expect(byName.get("Cache in front")?.parent).toBe(initial.id);
	expect(byName.get("Queue, then batched")?.parent).toBe(byName.get(PROPOSAL)?.id);
	expect(held.variants.filter((variant) => variant.lifecycle === "current")).toHaveLength(1);
}, 20_000);

test("branching from a variant that is not there is refused", async () => {
	const refused = await branch(board, "no such thing", "Nowhere");
	expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_VARIANT");
}, 20_000);

test("a proposal is edited like any other variant, and its predecessor does not move", async () => {
	const before = read(board);
	const baseline = before.variants[0]!;
	const applied = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: before.version,
		transition: store.editVariantTransition(
			VariantEditInputSchema.parse({
				variant: PROPOSAL,
				nodes: [{ name: "Queue", kind: "queue" }],
				edges: [{ from: "Gateway", to: "Queue", kind: "queue" }],
			}),
		),
	});
	expect(applied.outcome).toBe("applied");
	const after = read(board);
	expect(after.variants[0]!.content).toEqual(baseline.content);

	// And the difference between the two is derived, not written down.
	const proposal = after.variants.find((variant) => variant.name === PROPOSAL)!;
	const comparison = compareVariants(baseline.content, proposal.content);
	const queue = proposal.content.nodes.find((node) => node.name === "Queue")!;
	expect(comparison.nodes.get(queue.id)?.kind).toBe("added");
	// Adding a node does not make its neighbours changed.
	const gateway = proposal.content.nodes.find((node) => node.name === "Gateway")!;
	expect(comparison.nodes.get(gateway.id)?.kind).toBe("unchanged");
}, 20_000);

test("a branch is one version, written against the version it was asked for", async () => {
	const before = read(board);
	const applied = await branch(board, before.variants[0]!.name, "Read through a cache");
	expect(applied.outcome).toBe("applied");
	// One command, one version: deriving a proposal is a write like any other and
	// advances the board exactly once, so a reader that saw the last version can
	// tell that something happened and what it was written against.
	expect(read(board).version).toBe(before.version + 1);

	// And a branch written against a version the board has moved past is refused
	// rather than applied to whatever the board says now, which is how one
	// agent's proposal would quietly be derived from another's change.
	const stale = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: before.version,
		transition: store.branchVariantTransition(
			BoardBranchInputSchema.parse({
				from: before.variants[0]!.name,
				name: "Derived from a stale read",
			}),
		),
	});
	expect(stale.outcome === "rejected" && stale.code).toBe("BOARD_VERSION_CONFLICT");
	// Nothing was written: the board is where the accepted branch left it.
	expect(read(board).version).toBe(before.version + 1);
	expect(read(board).variants.map((one) => one.name)).not.toContain("Derived from a stale read");
}, 20_000);

/**
 * Write one transition against the version the test's board is at.
 * @param transition The transition.
 * @returns What the write did.
 */
async function write(transition: store.SemanticTransition) {
	return store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: read(board).version,
		transition,
	});
}

/**
 * Edit the test's board with one stated batch.
 * @param batch The batch.
 * @returns What the write did.
 */
async function edit(batch: Record<string, unknown>) {
	return write(store.editVariantTransition(VariantEditInputSchema.parse(batch)));
}

test("an edit restates the summary of the variant it lands on, and a record refuses it", async () => {
	const summaryOf = (name: string) =>
		read(board).variants.find((variant) => variant.name === name)?.summary;
	const baseline = read(board).variants[0]!.name;

	// With content, in one write; the other variants keep theirs.
	const before = read(board).version;
	const both = await edit({
		variant: PROPOSAL,
		summary: "Orders arrive through a queue",
		nodes: [{ name: "Queue", kind: "queue" }],
	});
	expect(both.outcome).toBe("applied");
	expect(read(board).version).toBe(before + 1);
	expect(summaryOf(PROPOSAL)).toBe("Orders arrive through a queue");
	expect(summaryOf(baseline)).toBeUndefined();

	// Alone, on the current variant; the draft under it does not inherit it.
	expect((await edit({ summary: "Orders as they are served today" })).outcome).toBe("applied");
	expect(summaryOf(baseline)).toBe("Orders as they are served today");
	expect(summaryOf(PROPOSAL)).toBe("Orders arrive through a queue");

	// A shelved proposal and a superseded architecture are records: refused, nothing written.
	await branch(board, baseline, "Spare");
	await write(
		store.shelveVariantTransition(
			BoardShelveInputSchema.parse({ variant: "Spare", reason: "not carried out" }),
		),
	);
	await write(store.adoptVariantTransition(BoardAdoptInputSchema.parse({ variant: PROPOSAL })));
	const records = read(board);
	const shelved = await edit({ variant: "Spare", summary: "Rewritten" });
	expect(shelved.outcome === "rejected" && shelved.code).toBe("VARIANT_SHELVED");
	const historical = await edit({ variant: baseline, summary: "Rewritten" });
	expect(historical.outcome === "rejected" && historical.code).toBe("VARIANT_HISTORICAL");
	expect(read(board)).toEqual(records);
}, 20_000);

test("a variant's documents: an edit replaces the edited list, a branch copies it, a record refuses it", async () => {
	const documentsOf = (name: string) =>
		read(board).variants.find((variant) => variant.name === name)?.documents;
	const baseline = read(board).variants[0]!.name;
	const design = { repo: "github.com/acme/shop", path: "docs/queue.md", commit: "abc1234" };
	const plan = { repo: "github.com/acme/shop", path: "backlog/tasks/task-7.md" };

	// Stated on the proposal alone, in the write that states its content.
	const before = read(board).version;
	const stated = await edit({
		variant: PROPOSAL,
		documents: [design, plan],
		nodes: [{ name: "Queue", kind: "queue" }],
	});
	expect(stated.outcome).toBe("applied");
	expect(read(board).version).toBe(before + 1);
	expect(documentsOf(PROPOSAL)).toEqual([design, plan]);
	expect(documentsOf(baseline)).toBeUndefined();

	// A branch copies the list of the variant it comes from.
	await branch(board, PROPOSAL, "Next layer");
	expect(documentsOf("Next layer")).toEqual([design, plan]);

	// A later list replaces the edited variant's only, and an edit that leaves it out keeps it.
	const moved = { ...design, commit: "def5678" };
	expect((await edit({ variant: "Next layer", documents: [moved] })).outcome).toBe("applied");
	expect(documentsOf("Next layer")).toEqual([moved]);
	expect(documentsOf(PROPOSAL)).toEqual([design, plan]);
	expect((await edit({ variant: PROPOSAL, summary: "A queue" })).outcome).toBe("applied");
	expect(documentsOf(PROPOSAL)).toEqual([design, plan]);

	// An empty list removes the field.
	expect((await edit({ variant: "Next layer", documents: [] })).outcome).toBe("applied");
	const emptied = read(board).variants.find((one) => one.name === "Next layer");
	expect(emptied).not.toHaveProperty("documents");

	// A superseded architecture is a record: refused, nothing written.
	await write(store.adoptVariantTransition(BoardAdoptInputSchema.parse({ variant: PROPOSAL })));
	const records = read(board);
	const historical = await edit({ variant: baseline, documents: [plan] });
	expect(historical.outcome === "rejected" && historical.code).toBe("VARIANT_HISTORICAL");
	expect(read(board)).toEqual(records);
}, 20_000);

test("a new board's first variant holds the documents its payload names", async () => {
	const name = `documented-${boards}`;
	const design = { repo: "github.com/acme/shop", path: "docs/queue.md", branch: "design" };
	await store.writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition: store.createBoardTransition(
			BoardCreateInputSchema.parse({
				name,
				level: "system",
				lifecycle: "draft",
				documents: [design],
			}),
		),
	});
	expect(read(name).variants[0]?.documents).toEqual([design]);
});
