import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { createConfiguredTestVault } from "@/runtime/semantic-board-store/tests/configured-vault";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = createConfiguredTestVault("archboard-shelving-");
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };

// The family every case here is about: a baseline S, a draft A off it, and a
// draft B off A. Built fresh per test, so each one proves the same thing run
// alone as run with the rest.
const A = "Queued ingest";
const B = "Queued and batched";
let board = "";
let boards = 0;
let baseline = "";
let apiId = "";

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	// Where this owner's boards actually land, asked rather than assumed.
	ownVaultOrRefuse(vault, store.locateSemanticBoard("where this owner writes").file);
	contract = await import("@/shared/semantic-board/index");
});
beforeEach(async () => {
	boards += 1;
	board = `shelving-${boards}`;
	await store.writeSemanticBoard({
		board,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name: board,
				level: "system",
				nodes: [
					{ name: "API", kind: "service", responsibility: "Serves requests" },
					{ name: "Store", kind: "datastore" },
				],
				edges: [{ from: "API", to: "Store", kind: "call", label: "reads" }],
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
	const node = variant(name).content.nodes.find((one) => one.id === apiId);
	if (node === undefined) throw new Error("no API node");
	return node;
}

/**
 * Derive a proposal from a variant.
 * @param from The variant to derive from.
 * @param name What to call the proposal.
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

/**
 * Let one proposal go.
 * @param name The variant to shelve.
 * @param reason Why it was let go.
 * @returns What the write did.
 */
async function shelve(name: string, reason = "the parent already says this") {
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.shelveVariantTransition(
			contract.BoardShelveInputSchema.parse({ variant: name, reason }),
		),
	});
}

/**
 * Adopt one variant.
 * @param name The variant to adopt.
 * @returns What the write did.
 */
async function adopt(name: string) {
	return store.writeSemanticBoard({
		board,
		writer,
		expectedVersion: read().version,
		transition: store.adoptVariantTransition(
			contract.BoardAdoptInputSchema.parse({ variant: name }),
		),
	});
}

test("a proposal is let go under its name, and the board records what, when and why", async () => {
	const before = read();
	const said = api(B).name;
	const written = await shelve(B, "the layout landed on the parent instead");
	expect(written.outcome).toBe("applied");

	const after = read();
	// One command, one version.
	expect(after.version).toBe(before.version + 1);
	const shelved = variant(B);
	expect(shelved.lifecycle).toBe("shelved");
	// Nothing about what it says moved: the name, the content and the ancestry
	// are what a link into it and a reader of it still find.
	expect(shelved.name).toBe(B);
	expect(shelved.id).toBe(before.variants.find((one) => one.name === B)!.id);
	expect(shelved.parent).toBe(variant(A).id);
	expect(api(B).name).toBe(said);

	expect(after.shelvings).toHaveLength(1);
	expect(after.shelvings?.[0]).toMatchObject({
		variant: shelved.id,
		reason: "the layout landed on the parent instead",
	});
	expect(Date.parse(after.shelvings![0]!.at)).not.toBeNaN();
	// Exactly one variant is still the implemented architecture.
	expect(after.variants.filter((one) => one.lifecycle === "current")).toHaveLength(1);
}, 30_000);

test("a shelved proposal stops receiving its predecessor's edits, and the change stops there", async () => {
	// A is let go, and then somebody picks the thinking back up by branching
	// from it — which is what the refusals point at, and what puts a live draft
	// on the far side of a shelved one.
	expect((await shelve(B)).outcome).toBe("applied");
	expect((await shelve(A)).outcome).toBe("applied");
	expect((await branch(A, "Queued ingest, revisited")).outcome).toBe("applied");
	const said = api(A).name;
	const beyond = api("Queued ingest, revisited").name;

	const written = await rename(baseline, "Public API");
	expect(written.outcome).toBe("applied");
	// The baseline moved and the shelved proposal did not follow it.
	expect(api(baseline).name).toBe("Public API");
	expect(api(A).name).toBe(said);
	expect(variant(A).reconciliation).toBeUndefined();
	// Nothing was reported as needing anybody, because nothing was merged.
	expect(written.outcome === "applied" ? written.descendants : []).toEqual([]);
	// The change stopped at the shelved variant rather than reaching past it.
	expect(api("Queued ingest, revisited").name).toBe(beyond);
	expect(variant("Queued ingest, revisited").reconciliation).toBeUndefined();
}, 30_000);

test("a standing the proposal was holding is let go with it", async () => {
	await rename(B, "Gateway");
	const conflicted = await rename(A, "Ingest API");
	expect(conflicted.outcome).toBe("applied");
	expect(variant(B).reconciliation?.issues.length).toBeGreaterThan(0);

	expect((await shelve(B)).outcome).toBe("applied");
	// Nothing to settle, and nothing settled: it keeps exactly what it said.
	expect(variant(B).reconciliation).toBeUndefined();
	expect(api(B).name).toBe("Gateway");
}, 30_000);

test("shelving refuses the current variant", async () => {
	const written = await shelve(baseline);
	expect(written.outcome).toBe("rejected");
	expect(written.outcome === "rejected" ? written.code : null).toBe("VARIANT_CURRENT");
	expect(variant(baseline).lifecycle).toBe("current");
	expect(read().shelvings).toBeUndefined();
}, 30_000);

test("shelving refuses a historical variant", async () => {
	expect((await shelve(B)).outcome).toBe("applied");
	expect((await adopt(A)).outcome).toBe("applied");
	expect(variant(baseline).lifecycle).toBe("historical");

	const written = await shelve(baseline);
	expect(written.outcome).toBe("rejected");
	expect(written.outcome === "rejected" ? written.code : null).toBe("VARIANT_HISTORICAL");
	expect(variant(baseline).lifecycle).toBe("historical");
	expect(read().shelvings).toHaveLength(1);
}, 30_000);

test("shelving refuses a proposal that has already been let go", async () => {
	expect((await shelve(B)).outcome).toBe("applied");
	const at = read().version;

	const written = await shelve(B, "letting it go twice");
	expect(written.outcome).toBe("rejected");
	expect(written.outcome === "rejected" ? written.code : null).toBe("VARIANT_SHELVED");
	// Nothing was written: no second record, no second version.
	expect(read().version).toBe(at);
	expect(read().shelvings).toHaveLength(1);
}, 30_000);

test("shelving refuses a proposal other drafts are still standing on, and names them", async () => {
	const written = await shelve(A);
	expect(written.outcome).toBe("rejected");
	expect(written.outcome === "rejected" ? written.code : null).toBe("VARIANT_HAS_DRAFTS");
	// The way out is to decide what happens to each of them, so each is named.
	expect(written.outcome === "rejected" ? written.problem : "").toContain(B);
	expect(variant(A).lifecycle).toBe("draft");

	// Once the draft under it is gone from the line, it may be let go.
	expect((await shelve(B)).outcome).toBe("applied");
	expect((await shelve(A)).outcome).toBe("applied");
	expect(variant(A).lifecycle).toBe("shelved");
}, 30_000);

test("a shelved proposal refuses content edits and adoption, and may still be branched from", async () => {
	expect((await shelve(B)).outcome).toBe("applied");
	const at = read().version;

	const edited = await rename(B, "Gateway");
	expect(edited.outcome).toBe("rejected");
	expect(edited.outcome === "rejected" ? edited.code : null).toBe("VARIANT_SHELVED");

	const adopted = await adopt(B);
	expect(adopted.outcome).toBe("rejected");
	expect(adopted.outcome === "rejected" ? adopted.code : null).toBe("VARIANT_SHELVED");
	expect(read().version).toBe(at);
	expect(read().current).toBe(variant(baseline).id);

	// The way the refusals point: the thinking is still there to build on.
	const again = await branch(B, "Queued and batched, again");
	expect(again.outcome).toBe("applied");
	expect(variant("Queued and batched, again").lifecycle).toBe("draft");
	expect(variant("Queued and batched, again").parent).toBe(variant(B).id);
}, 30_000);

test("shelving a proposal changes nothing about the board's views or its other variants", async () => {
	const before = read();
	expect((await shelve(B)).outcome).toBe("applied");
	const after = read();

	expect(after.views).toEqual(before.views);
	for (const name of [baseline, A]) {
		const was = before.variants.find((one) => one.name === name)!;
		expect(
			after.variants.find((one) => one.name === name),
			name,
		).toEqual(was);
	}
}, 30_000);

test("the vault checker stops asking a shelved proposal to repair its content", async () => {
	// The checker reports a content diagnostic only where an accepted write can
	// answer it (TASK-259). A shelved proposal refuses content edits exactly as
	// history does, so it leaves the checked set with the same write that shelves
	// it — otherwise the vault keeps a warning nobody is allowed to clear.
	const at = `linked-${boards}`;
	const from = `linking-${boards}`;
	await store.writeSemanticBoard({
		board: at,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name: at,
				level: "service",
				nodes: [{ name: "Store", kind: "module" }],
			}),
		),
	});
	await store.writeSemanticBoard({
		board: from,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name: from,
				level: "system",
				nodes: [
					{ name: "Caller", kind: "app" },
					// `external` disagrees with the level of the board it opens, which
					// is a repair to this variant's own nodes and nothing else.
					{
						name: "Checkout",
						kind: "external",
						drillDown: { board: at, variant: { kind: "current" } },
					},
				],
				edges: [{ from: "Caller", to: "Checkout", kind: "http" }],
			}),
		),
	});
	const mismatches = () =>
		store
			.checkSemanticVault(vault)
			.diagnostics.filter(
				(issue) => issue.board === from && issue.code === "DRILL_DOWN_LEVEL_MISMATCH",
			);
	expect(mismatches()).toHaveLength(1);

	const proposal = "Same link, restated";
	const branched = await store.writeSemanticBoard({
		board: from,
		writer,
		expectedVersion: 1,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ from: "Initial", name: proposal }),
		),
	});
	expect(branched.outcome).toBe("applied");
	// The draft carries the same node, so it is asked to repair it too.
	expect(mismatches()).toHaveLength(2);

	const shelved = await store.writeSemanticBoard({
		board: from,
		writer,
		expectedVersion: 2,
		transition: store.shelveVariantTransition(
			contract.BoardShelveInputSchema.parse({
				variant: proposal,
				reason: "the link is fine as it is",
			}),
		),
	});
	expect(shelved.outcome).toBe("applied");
	expect(mismatches()).toHaveLength(1);
}, 30_000);
