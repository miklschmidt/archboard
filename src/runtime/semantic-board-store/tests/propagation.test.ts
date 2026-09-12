import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-propagation-"));
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };

// The family every case here is about: a baseline S, a draft A off it, a draft
// B off A, and a competing draft C off S. Built fresh per test, so each one
// proves the same thing run alone as run with the rest.
const A = "Queued ingest";
const B = "Queued and batched";
const C = "Cached reads";
let board = "";
let boards = 0;

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	// Where this owner's boards actually land, asked rather than assumed.
	ownVaultOrRefuse(vault, store.locateSemanticBoard("where this owner writes").file);
	contract = await import("@/shared/semantic-board/index");
});
beforeEach(async () => {
	boards += 1;
	board = `family-${boards}`;
	await store.writeSemanticBoard({
		board,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name: board,
				nodes: [
					{ name: "API", kind: "service", responsibility: "Serves requests" },
					{ name: "Store", kind: "datastore" },
				],
				edges: [{ from: "API", to: "Store", kind: "call", label: "reads" }],
			}),
		),
	});
	const baseline = read().variants[0]!.name;
	await branch(baseline, A);
	await branch(A, B);
	await branch(baseline, C);
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
 * One variant of the board, by name.
 * @param name What it is called.
 * @returns The variant.
 */
function variant(name: string) {
	const found = read().variants.find((one) => one.name === name);
	if (found === undefined) throw new Error(`no variant called ${name}`);
	return found;
}

/**
 * The node called API, as one variant has it.
 * @param name The variant.
 * @returns The node.
 */
function api(name: string) {
	const node = variant(name).content.nodes.find((one) => one.name.length > 0 && one.id === apiId);
	if (node === undefined) throw new Error("no API node");
	return node;
}

let apiId = "";

/**
 * The ancestor one variant says it is waiting for.
 * @param name The variant.
 * @returns The ancestor id, or undefined when it is waiting for nothing.
 */
function blockerOf(name: string): string | undefined {
	return variant(name).reconciliation?.blockedBy;
}

/**
 * Derive a proposal from a variant.
 * @param from The variant to derive from.
 * @param name What to call the proposal.
 * @returns What the write did.
 */
async function branch(from: string, name: string) {
	const answer = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ from, name }),
		),
	});
	apiId = read().variants[0]!.content.nodes[0]!.id;
	return answer;
}

/**
 * Change one variant of the board.
 * @param on The variant to change.
 * @param stated What to change about it.
 * @returns What the write did.
 */
async function edit(on: string, stated: Record<string, unknown>) {
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({ variant: on, ...stated }),
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
	return edit(on, { nodes: [{ id: apiId, name: to, kind: "service" }] });
}

test("an edit to a baseline reaches every draft under it, in one version", async () => {
	const before = read().version;
	const written = await edit(read().variants[0]!.name, {
		nodes: [
			{ id: apiId, name: "API", kind: "service", responsibility: "Serves authenticated requests" },
		],
	});
	expect(written.outcome).toBe("applied");
	// One command, one version: the parent's new state and every consequence.
	expect(read().version).toBe(before + 1);
	for (const name of [A, B, C]) {
		expect(api(name).responsibility, name).toBe("Serves authenticated requests");
		expect(variant(name).reconciliation, name).toBeUndefined();
	}
}, 30_000);

test("a draft that decided otherwise keeps its decision and says what is unsettled", async () => {
	await rename(A, "Gateway");
	const written = await rename(read().variants[0]!.name, "Public API");
	expect(written.outcome).toBe("applied");

	// The draft keeps what it said, and says why it is not simply behind.
	expect(api(A).name).toBe("Gateway");
	const standing = variant(A).reconciliation;
	expect(standing?.issues[0]).toMatchObject({
		subject: apiId,
		kind: "competing-field",
		field: "name",
		mine: "Gateway",
		theirs: "Public API",
	});
	// Its own child waits on it rather than guessing which side to build on.
	expect(blockerOf(B)).toBe(variant(A).id);
	expect(api(B).name).toBe("Gateway");
	// The branch that had no opinion simply follows.
	expect(api(C).name).toBe("Public API");
	expect(variant(C).reconciliation).toBeUndefined();
}, 30_000);

test("what is unsettled survives a restart, because it is on the board", async () => {
	await rename(A, "Gateway");
	await rename(read().variants[0]!.name, "Public API");
	const written = read();

	// Nothing is held in memory: a fresh read of the file says the same.
	const reread = store.readSemanticBoard(board);
	if (!reread.ok) throw new Error(reread.problem);
	expect(reread.board).toEqual(written);
	expect(reread.board.variants.find((one) => one.name === A)?.reconciliation?.issues).toHaveLength(
		1,
	);
}, 30_000);

test("a later edit to the baseline still reaches a draft that is holding something", async () => {
	await rename(A, "Gateway");
	await rename(read().variants[0]!.name, "Public API");
	// Something the draft has no opinion about at all.
	await edit(read().variants[0]!.name, {
		nodes: [{ name: "Ledger", kind: "service" }],
	});

	// The independent addition arrives; the disagreement is still standing.
	expect(variant(A).content.nodes.map((node) => node.name)).toContain("Ledger");
	expect(api(A).name).toBe("Gateway");
	expect(variant(A).reconciliation?.issues).toHaveLength(1);
}, 30_000);

test("a draft the edit does not concern is left exactly as it was", async () => {
	const before = variant(C);
	await edit(A, { nodes: [{ name: "Queue", kind: "queue" }] });
	// A's own edit is A's business; its sibling is untouched, standing and all.
	expect(variant(C)).toEqual(before);
	expect(variant(A).content.nodes.map((node) => node.name)).toContain("Queue");
}, 30_000);

test("a disagreement the predecessor settles by agreeing goes, and what waited moves again", async () => {
	await rename(A, "Gateway");
	await rename(read().variants[0]!.name, "Public API");
	expect(variant(A).reconciliation?.issues).toHaveLength(1);
	expect(blockerOf(B)).toBe(variant(A).id);

	// The baseline comes round to the draft's own answer. That settles the
	// argument by agreeing with it; a note about it would block everything under
	// A over a difference that no longer exists.
	await rename(read().variants[0]!.name, "Gateway");
	expect(variant(A).reconciliation).toBeUndefined();
	expect(variant(B).reconciliation).toBeUndefined();
}, 30_000);

test("a draft three deep is told where the decision actually has to be made", async () => {
	// S → A → B → D, with the disagreement at A: D waits on A, not on B, which
	// has nothing anybody can settle.
	await branch(B, "Queued, batched and cached");
	const D = "Queued, batched and cached";
	await rename(A, "Gateway");
	await rename(read().variants[0]!.name, "Public API");

	expect(variant(A).reconciliation?.issues).toHaveLength(1);
	expect(blockerOf(B)).toBe(variant(A).id);
	expect(blockerOf(D)).toBe(variant(A).id);
	// D holds nothing of its own: it was not merged at all, because the state it
	// is derived from is in dispute two levels up.
	expect(variant(D).reconciliation?.issues).toEqual([]);
}, 30_000);

/**
 * What one variant is holding.
 * @param name The variant.
 * @returns Its issues, or none.
 */
function keptIssues(name: string) {
	return variant(name).reconciliation?.issues ?? [];
}

/**
 * One issue answered by keeping what this proposal says.
 * @param issue The issue.
 * @returns The choice.
 */
function asMine(issue: { subject: string; field?: string | undefined }) {
	return {
		subject: issue.subject,
		...(issue.field === undefined ? {} : { field: issue.field }),
		side: "mine" as const,
	};
}

test("a draft recovers fully once it stops naming what its predecessor removed", async () => {
	// The draft wires something to a node; the baseline removes that node and
	// adds another. Neither side is wrong on its own, and together they make a
	// document no board may hold, so the draft keeps what it had and says why.
	const held = variant(A).content.nodes.find((one) => one.name === "Store")?.id ?? "";
	await edit(A, { edges: [{ from: "API", to: "Store", kind: "call", label: "asks" }] });
	await edit(read().variants[0]!.name, {
		removeNodes: ["Store"],
		nodes: [{ name: "Ledger", kind: "service" }],
	});
	expect(variant(A).reconciliation?.issues.some((one) => one.kind === "reference-lost")).toBe(true);
	expect(variant(A).content.nodes.map((one) => one.id)).toContain(held);

	// The agent takes the relationship out, which is what the guidance asked for,
	// and then says it means what it now says.
	const wired = variant(A).content.edges.find((one) => one.label === "asks");
	await edit(A, { removeEdges: [wired?.id ?? ""] });
	const settled = await store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.settleVariantTransition(
			contract.ResolutionInputSchema.parse({
				variant: A,
				choices: keptIssues(A).map(asMine),
			}),
		),
	});
	expect(settled.outcome).toBe("applied");
	// Settling catches it up completely: the node it was holding for the
	// relationship goes, and the one the baseline added arrives.
	expect(variant(A).reconciliation).toBeUndefined();
	expect(variant(A).content.nodes.map((one) => one.name)).toContain("Ledger");
	expect(variant(A).content.nodes.map((one) => one.id)).not.toContain(held);
}, 30_000);

test("a proposal derived from an unsettled one is told so the moment it exists", async () => {
	await rename(A, "Gateway");
	await rename(read().variants[0]!.name, "Public API");

	// Derived from the variant that is itself in dispute: the decision it has to
	// wait for is that variant's own.
	await branch(A, "Gateway, queued");
	expect(blockerOf("Gateway, queued")).toBe(variant(A).id);
	expect(variant("Gateway, queued").reconciliation?.issues).toEqual([]);

	// Derived from one that is only waiting: it waits on the same decision, not
	// on the variant in between, which has nothing anybody can settle.
	await branch(B, "Queued, batched, waiting");
	expect(blockerOf("Queued, batched, waiting")).toBe(variant(A).id);

	// And a proposal off the settled sibling starts in step, as before.
	await branch(C, "Cached and queued");
	expect(variant("Cached and queued").reconciliation).toBeUndefined();
}, 30_000);
