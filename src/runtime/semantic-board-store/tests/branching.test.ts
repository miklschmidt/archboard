import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-branching-"));
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };

// Every test gets its own board, made fresh before it runs — the baseline and
// one proposal off it — so that running one of them by name proves the same
// thing as running all of them.
let board = "";
let branched: Awaited<ReturnType<typeof StoreModule.writeSemanticBoard>>;
let boards = 0;
const PROPOSAL = "Queue in front";

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	// Where this owner's boards actually land, asked rather than assumed.
	ownVaultOrRefuse(vault, store.locateSemanticBoard("where this owner writes").file);
	contract = await import("@/shared/semantic-board/index");
});
beforeEach(async () => {
	boards += 1;
	board = `ancestry-${boards}`;
	await store.writeSemanticBoard({
		board,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
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
	if (callerVault === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = callerVault;
	rmSync(vault, { recursive: true, force: true });
});

/**
 * The board as it now stands.
 * @param name The board name.
 * @returns The board.
 */
function read(name: string) {
	const answer = store.readSemanticBoard(name);
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
		board: on,
		writer,
		expectedVersion: read(on).version,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ from, name }),
		),
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
		board,
		writer,
		expectedVersion: before.version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
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
	const comparison = contract.compareVariants(baseline.content, proposal.content);
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
		board,
		writer,
		expectedVersion: before.version,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({
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
