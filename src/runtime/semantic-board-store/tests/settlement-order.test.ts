import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

// Settling a disagreement about order rather than about a field.
//
// Where a step sits is relative to the other steps, and `position` is not
// something a step holds — the merge invents it to say where the two sides put
// something. So an answered order has to move the base by reordering it, and it
// has to be answered for a whole exchange at once.

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-settle-order-"));
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };

const A = "Queued ingest";
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
	board = `ordering-${boards}`;
	await store.writeSemanticBoard({
		board,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name: board,
				nodes: [{ name: "API", kind: "service" }],
			}),
		),
	});
	baseline = read().variants[0]!.name;
	apiId = read().variants[0]!.content.nodes[0]!.id;
	await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ from: baseline, name: A }),
		),
	});
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
 * Tell an exchange of three steps on the baseline, so both sides have one to
 * move.
 * @returns The flow as the board now holds it.
 */
async function tellAFlow() {
	await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				variant: baseline,
				flows: [
					{
						name: "One write",
						participants: [apiId],
						steps: ["asks", "checks", "writes"].map((label) => ({
							as: label,
							from: apiId,
							to: apiId,
							label,
							kind: "self",
						})),
					},
				],
			}),
		),
	});
	return variant(baseline).content.flows[0]!;
}

/**
 * Tell one variant's exchange in a different order.
 * @param on The variant.
 * @param order Which of the original steps go where.
 * @returns What the write did.
 */
async function retell(on: string, order: readonly number[]) {
	const flow = variant(on).content.flows[0]!;
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({
				variant: on,
				flows: [{ ...flow, steps: order.map((at) => flow.steps[at]) }],
			}),
		),
	});
}

/**
 * Answer every order disagreement one proposal is holding.
 * @param on The proposal.
 * @param choices Which of them to answer; all of them by default.
 * @returns What the write did.
 */
async function settleOrder(on: string, choices?: readonly number[]) {
	const issues = variant(on).reconciliation?.issues ?? [];
	const answering = choices === undefined ? issues : choices.map((at) => issues[at]!);
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.settleVariantTransition(
			contract.ResolutionInputSchema.parse({
				variant: on,
				choices: answering.map((issue) => ({
					subject: issue.subject,
					field: issue.field,
					side: "mine" as const,
				})),
			}),
		),
	});
}

test("an order this proposal means is kept, and stays kept when the predecessor moves again", async () => {
	await tellAFlow();
	await retell(A, [2, 0, 1]);
	await retell(baseline, [0, 2, 1]);
	const told = () => variant(A).content.flows[0]!.steps.map((step) => step.label);
	expect(variant(A).reconciliation?.issues.every((one) => one.kind === "competing-order")).toBe(
		true,
	);

	const settled = await settleOrder(A);
	expect(settled.outcome, settled.outcome === "rejected" ? settled.problem : "").toBe("applied");
	// The order this proposal means is the order it keeps.
	expect(told()).toEqual(["writes", "asks", "checks"]);
	expect(variant(A).reconciliation).toBeUndefined();

	// And the decision is durable: something else the predecessor does next does
	// not reopen an argument somebody has already settled.
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
	expect(variant(A).reconciliation).toBeUndefined();
	expect(told()).toEqual(["writes", "asks", "checks"]);
	expect(variant(A).content.nodes.map((node) => node.name)).toContain("Ledger");
}, 30_000);

test("answering where one step sits is refused, because it places the others too", async () => {
	await tellAFlow();
	await retell(A, [2, 0, 1]);
	await retell(baseline, [0, 2, 1]);
	const before = variant(A);

	const refused = await settleOrder(A, [0]);
	expect(refused.outcome).toBe("rejected");
	expect(refused.outcome === "rejected" && refused.code).toBe("ORDER_SETTLED_WHOLE");
	expect(refused.outcome === "rejected" && refused.problem).toContain("One write");
	// Nothing was written: the proposal is exactly as it was, standing and all.
	expect(variant(A)).toEqual(before);
}, 30_000);

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

test("an order settled while something else stays open leaves a base a board may hold", async () => {
	await tellAFlow();
	// Two arguments at once: where the steps go, and what the node is called.
	await retell(A, [2, 0, 1]);
	await retell(baseline, [0, 2, 1]);
	await rename(A, "Gateway");
	await rename(baseline, "Public API");
	const standing = variant(A).reconciliation?.issues ?? [];
	expect(standing.some((one) => one.kind === "competing-field")).toBe(true);

	// Answer the order and nothing else. What is left open is kept, and the state
	// the next merge is measured from is written down — so it has to be a state a
	// board may hold, with nothing invented in it.
	const settled = await settleOrder(
		A,
		standing.flatMap((one, at) => (one.kind === "competing-order" ? [at] : [])),
	);
	expect(settled.outcome, settled.outcome === "rejected" ? settled.problem : "").toBe("applied");
	const after = variant(A).reconciliation;
	expect(after?.issues.map((one) => one.kind)).toEqual(["competing-field"]);
	expect(variant(A).content.flows[0]?.steps.map((step) => step.label)).toEqual([
		"writes",
		"asks",
		"checks",
	]);

	// And the argument that is left is still answerable afterwards.
	const rest = await settleOrder(A);
	expect(rest.outcome, rest.outcome === "rejected" ? rest.problem : "").toBe("applied");
	expect(variant(A).reconciliation).toBeUndefined();
	expect(variant(A).content.nodes[0]?.name).toBe("Gateway");
}, 30_000);
