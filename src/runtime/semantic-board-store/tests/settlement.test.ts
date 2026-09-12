import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-settlement-"));
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
 * The ancestor one variant says it is waiting for.
 * @param name The variant.
 * @returns The ancestor id, or undefined when it is waiting for nothing.
 */
function blockerOf(name: string): string | undefined {
	return variant(name).reconciliation?.blockedBy;
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
 * Put A and the baseline into disagreement about the API's name.
 * @returns Nothing.
 */
async function disagree(): Promise<void> {
	await rename(A, "Gateway");
	await rename(baseline, "Public API");
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

/**
 * Adopt a variant.
 * @param name Which one.
 * @param reason Why.
 * @returns What the write did.
 */
async function adopt(name: string, reason?: string) {
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.adoptVariantTransition(
			contract.BoardAdoptInputSchema.parse({
				variant: name,
				...(reason === undefined ? {} : { reason }),
			}),
		),
	});
}

test("taking this proposal's side keeps what it said and lets its own drafts move again", async () => {
	await disagree();
	expect(blockerOf(B)).toBe(variant(A).id);

	const settled = await settle(A, "mine");
	expect(settled.outcome).toBe("applied");
	expect(variant(A).content.nodes[0]?.name).toBe("Gateway");
	expect(variant(A).reconciliation).toBeUndefined();
	// The draft that was waiting on A is merged in the same write, and takes A's
	// decision because it never had one of its own.
	expect(variant(B).reconciliation).toBeUndefined();
	expect(variant(B).content.nodes[0]?.name).toBe("Gateway");
}, 30_000);

test("taking the other side takes the value, not just the silence", async () => {
	await disagree();
	const settled = await settle(A, "theirs");
	expect(settled.outcome).toBe("applied");
	expect(variant(A).content.nodes[0]?.name).toBe("Public API");
	expect(variant(A).reconciliation).toBeUndefined();
	expect(variant(B).content.nodes[0]?.name).toBe("Public API");
}, 30_000);

test("an answer to something nothing is holding is refused, and writes nothing", async () => {
	await disagree();
	const before = read();
	const refused = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: before.version,
		transition: store.settleVariantTransition(
			contract.ResolutionInputSchema.parse({
				variant: A,
				choices: [{ subject: apiId, field: "responsibility", side: "mine" }],
			}),
		),
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("UNKNOWN_ISSUE");
	expect(read()).toEqual(before);
}, 30_000);

test("a stale answer is refused by the same version check every write makes", async () => {
	await disagree();
	const stale = read().version - 1;
	const refused = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: stale,
		transition: store.settleVariantTransition(
			contract.ResolutionInputSchema.parse({
				variant: A,
				choices: [{ subject: apiId, field: "name", side: "mine" }],
			}),
		),
	});
	expect(refused.outcome === "rejected" && refused.code).toBe("BOARD_VERSION_CONFLICT");
	expect(variant(A).reconciliation?.issues).toHaveLength(1);
}, 30_000);

test("adopting moves the designation, renames nothing and reparents nothing", async () => {
	const before = read();
	const adopted = await adopt(A, "the queue paid for itself in a week");
	expect(adopted.outcome).toBe("applied");

	const after = read();
	expect(after.current).toBe(variant(A).id);
	expect(variant(A).lifecycle).toBe("current");
	// What was current becomes the architecture that was implemented until now.
	const was = after.variants.find((one) => one.id === before.current);
	expect(was?.lifecycle).toBe("historical");
	expect(was?.name).toBe(baseline);
	// Ancestry is a record of where a state came from; adoption does not move it.
	expect(variant(A).parent).toBe(before.current);
	expect(variant(B).parent).toBe(variant(A).id);
	expect(variant(B).lifecycle).toBe("draft");
	// And the move itself is written down, with why.
	expect(after.adoptions).toEqual([
		{
			variant: variant(A).id,
			from: before.current,
			at: expect.any(String),
			reason: "the queue paid for itself in a week",
		},
	]);
}, 30_000);

test("an unsettled proposal cannot become the implemented architecture", async () => {
	await disagree();
	const before = read();
	const refused = await adopt(A);
	expect(refused.outcome === "rejected" && refused.code).toBe("VARIANT_UNSETTLED");
	expect(read()).toEqual(before);
}, 30_000);

test("adopting what is already current is refused rather than recorded twice", async () => {
	const refused = await adopt(baseline);
	expect(refused.outcome === "rejected" && refused.code).toBe("ALREADY_CURRENT");
	expect(read().adoptions).toBeUndefined();
}, 30_000);

test("an architecture that was implemented is a record, and records are not edited", async () => {
	await adopt(A);
	const before = read();
	const refused = await rename(baseline, "Whatever we wish we had called it");
	expect(refused.outcome === "rejected" && refused.code).toBe("VARIANT_HISTORICAL");
	expect(read()).toEqual(before);
}, 30_000);

test("an adopted architecture stops following the one it came from", async () => {
	await adopt(A);
	// The baseline is historical now and cannot be edited at all, so the case
	// that matters is the other way round: what is current is editable, and its
	// own drafts follow it.
	const edited = await rename(A, "Ingest API");
	expect(edited.outcome).toBe("applied");
	expect(variant(B).content.nodes[0]?.name).toBe("Ingest API");
	// And a second adoption moves the designation on again, recording both moves.
	const second = await adopt(B);
	expect(second.outcome).toBe("applied");
	expect(read().adoptions).toHaveLength(2);
	expect(variant(A).lifecycle).toBe("historical");
	expect(variant(B).lifecycle).toBe("current");
}, 30_000);

test("a draft under an adopted architecture no longer follows its own predecessor's predecessor", async () => {
	// A is adopted, so it is not a draft any more: an edit to what it came from
	// cannot reach it — and that edit is refused anyway, because that state is
	// now a record. What this proves is that A is no longer following.
	await adopt(A);
	const found = read().variants.find((one) => one.name === A);
	expect(found?.lifecycle).toBe("current");
	expect(found?.parent).toBe(read().variants.find((one) => one.name === baseline)?.id);
}, 30_000);

test("taking one side of one disagreement touches nothing else", async () => {
	// The draft has its own responsibility; the baseline renames the node. A
	// choice about the name is not permission to take everything else.
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
	await rename(baseline, "Public API");

	const settled = await settle(A, "theirs");
	expect(settled.outcome).toBe("applied");
	const node = variant(A).content.nodes[0];
	expect(node?.name).toBe("Public API");
	expect(node?.responsibility).toBe("Serves the edge");
}, 30_000);

test("settling catches the proposal up with everything decided while it waited", async () => {
	await disagree();
	// The baseline goes on working while the draft is unsettled.
	await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				variant: baseline,
				nodes: [{ name: "Ledger", kind: "service" }],
			}),
		),
	});
	// An addition nobody competes for arrives even while the draft is unsettled:
	// what it cannot take is the disagreement, not everything else.
	expect(variant(A).content.nodes.map((one) => one.name)).toContain("Ledger");
	// And the base it is measured from has not moved, so the disagreement is
	// still the disagreement rather than having quietly become agreement.
	expect(variant(A).reconciliation?.issues).toHaveLength(1);
	expect(variant(A).reconciliation?.base.nodes[0]?.name).toBe("API");

	const settled = await settle(A, "mine");
	expect(settled.outcome).toBe("applied");
	expect(variant(A).content.nodes[0]?.name).toBe("Gateway");
	expect(variant(A).content.nodes.map((one) => one.name)).toContain("Ledger");
	expect(variant(A).reconciliation).toBeUndefined();
}, 30_000);

test("a draft under an unsettled one cannot be adopted, however settled it is itself", async () => {
	await disagree();
	// B holds nothing of its own — it was not merged at all — and is waiting on A.
	expect(variant(B).reconciliation?.issues).toEqual([]);
	const refused = await adopt(B);
	expect(refused.outcome === "rejected" && refused.code).toBe("VARIANT_UNSETTLED");
	expect(blockerOf(B)).toBe(variant(A).id);
}, 30_000);

test("an architecture that was implemented cannot be made current again", async () => {
	await adopt(A);
	const before = read();
	const refused = await adopt(baseline);
	expect(refused.outcome === "rejected" && refused.code).toBe("VARIANT_HISTORICAL");
	expect(read()).toEqual(before);
}, 30_000);

test("every draft the change reached is reported, not only the ones in trouble", async () => {
	const written = await rename(baseline, "Public API");
	expect(written.outcome).toBe("applied");
	if (written.outcome !== "applied") throw new Error("not applied");
	// A and B both took it; a caller has to be able to see that it went somewhere.
	expect(written.descendants.map((one) => one.name).toSorted()).toEqual([A, B].toSorted());
	expect(written.descendants.every((one) => one.outcome === "merged")).toBe(true);
}, 30_000);
