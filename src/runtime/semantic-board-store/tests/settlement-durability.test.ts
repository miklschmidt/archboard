import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-durability-"));
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };

// A baseline, a draft off it, and a draft off that — built fresh per test, and
// put into disagreement by the case that needs one.
const A = "Queued ingest";
const B = "Queued and batched";
let board = "";
let boards = 0;
let apiId = "";
let baseline = "";

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	// Where this owner's boards actually land, asked rather than assumed.
	ownVaultOrRefuse(vault, store.locateSemanticBoard("where this owner writes").file);
	contract = await import("@/shared/semantic-board/index");
});
beforeEach(async () => {
	boards += 1;
	board = `settling-${boards}`;
	await store.writeSemanticBoard({
		board,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name: board,
				nodes: [{ name: "API", kind: "service", responsibility: "Serves requests" }],
			}),
		),
	});
	baseline = read().variants[0]!.name;
	apiId = read().variants[0]!.content.nodes[0]!.id;
	await branch(baseline, A);
	await branch(A, B);
});
afterAll(() => {
	if (callerVault === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = callerVault;
	rmSync(vault, { recursive: true, force: true });
});

/**
 * The board as it now stands.
 * @returns The board.
 */
function read() {
	const answer = store.readSemanticBoard(board);
	if (!answer.ok) throw new Error(answer.problem);
	return answer.board;
}

/**
 * One variant, by name.
 * @param name What it is called.
 * @returns The variant.
 */
function variant(name: string) {
	const found = read().variants.find((one) => one.name === name);
	if (found === undefined) throw new Error(`no variant called ${name}`);
	return found;
}

/**
 * Derive a proposal from a variant.
 * @param from The variant to derive from.
 * @param name What to call it.
 * @returns What the write did.
 */
async function branch(from: string, name: string) {
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ from, name }),
		),
	});
}

/**
 * Rename the API node on one variant.
 * @param on The variant.
 * @param to The new name.
 * @returns What the write did.
 */
async function rename(on: string, to: string) {
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				variant: on,
				nodes: [{ id: apiId, name: to, kind: "service" }],
			}),
		),
	});
}

/**
 * Settle a proposal.
 * @param on The proposal.
 * @param side Which side to take.
 * @returns What the write did.
 */
async function settle(on: string, side: "mine" | "theirs") {
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.settleVariantTransition(
			contract.ResolutionInputSchema.parse({
				variant: on,
				choices: [{ subject: apiId, field: "name", side }],
			}),
		),
	});
}

test("a decision stays decided when the next one is made", async () => {
	// Two disagreements on one node: the name, and what it is responsible for.
	await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				variant: A,
				nodes: [{ id: apiId, name: "Gateway", kind: "service", responsibility: "Serves the edge" }],
			}),
		),
	});
	await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				variant: baseline,
				nodes: [
					{ id: apiId, name: "Public API", kind: "service", responsibility: "Serves everybody" },
				],
			}),
		),
	});
	expect(variant(A).reconciliation?.issues).toHaveLength(2);

	// Answer one of them, keeping this proposal's name.
	const first = await settle(A, "mine");
	expect(first.outcome).toBe("applied");
	expect(variant(A).content.nodes[0]?.name).toBe("Gateway");
	// The other is still open, and the answer says so rather than reporting a
	// write that left nothing to do.
	expect(variant(A).reconciliation?.issues).toHaveLength(1);
	if (first.outcome !== "applied") throw new Error("not applied");
	expect(first.descendants.map((one) => one.variant)).toContain(variant(A).id);

	// Answer the second one the other way.
	const second = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.settleVariantTransition(
			contract.ResolutionInputSchema.parse({
				variant: A,
				choices: [{ subject: apiId, field: "responsibility", side: "theirs" }],
			}),
		),
	});
	expect(second.outcome).toBe("applied");
	// The name decision holds: answering the second disagreement does not reopen
	// the first, because settling a field is agreeing about that field.
	expect(variant(A).content.nodes[0]?.name).toBe("Gateway");
	expect(variant(A).content.nodes[0]?.responsibility).toBe("Serves everybody");
	expect(variant(A).reconciliation).toBeUndefined();
}, 30_000);

test("a draft waiting on an ancestor cannot settle anything of its own", async () => {
	// B is derived from A. Give B its own disagreement first, then put A into
	// one, which blocks B before it can answer.
	await rename(B, "Edge");
	await rename(baseline, "Public API");
	await rename(A, "Gateway");
	await rename(baseline, "The API");

	const blocked = variant(B).reconciliation;
	expect(blocked?.blockedBy).toBe(variant(A).id);
	const refused = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.settleVariantTransition(
			contract.ResolutionInputSchema.parse({
				variant: B,
				choices: [{ subject: apiId, field: "name", side: "mine" }],
			}),
		),
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("VARIANT_BLOCKED");
}, 30_000);

test("taking a value the predecessor no longer writes means not writing one", async () => {
	await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				variant: baseline,
				nodes: [{ id: apiId, name: "API", kind: "service", description: "the front door" }],
			}),
		),
	});
	// The proposal describes it one way; the current state stops describing it.
	await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				variant: A,
				nodes: [{ id: apiId, name: "API", kind: "service", description: "the only way in" }],
			}),
		),
	});
	await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				variant: baseline,
				nodes: [{ id: apiId, name: "API", kind: "service" }],
			}),
		),
	});
	const settled = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.settleVariantTransition(
			contract.ResolutionInputSchema.parse({
				variant: A,
				choices: [{ subject: apiId, field: "description", side: "theirs" }],
			}),
		),
	});
	// Taking "nothing written" writes nothing, rather than writing a null the
	// contract refuses.
	expect(settled.outcome, settled.outcome === "rejected" ? settled.problem : "").toBe("applied");
	expect(variant(A).content.nodes[0]?.description).toBeUndefined();
}, 30_000);
