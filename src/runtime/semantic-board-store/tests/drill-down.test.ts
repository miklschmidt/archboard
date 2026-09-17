// What the vault checker says about the links between boards (ADR 0029).
//
// Every board here is written through the store, because a link is only
// interesting once two real boards are in one vault: the level a node must
// carry is the other board's, and no single board can check it.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import { createConfiguredTestVault } from "@/runtime/semantic-board-store/tests/configured-vault";
import { ownVaultOrRefuse } from "@/runtime/semantic-board-store/tests/own-vault";
import type * as ContractModule from "@/shared/semantic-board/index";
import type { VaultDiagnostic } from "@/shared/semantic-policy/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = createConfiguredTestVault("archboard-drill-down-");
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	ownVaultOrRefuse(vault, store.locateSemanticBoard("where this owner writes").file);
	contract = await import("@/shared/semantic-board/index");
});
afterAll(() => {
	if (callerVault === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = callerVault;
	rmSync(vault, { recursive: true, force: true });
});

/**
 * Write one board, refusing to continue when the store would not take it.
 * @param input The create payload.
 * @returns Nothing; the board is on disk.
 */
async function create(input: Record<string, unknown>): Promise<void> {
	const written = await store.writeSemanticBoard({
		board: String(input["name"]),
		writer,
		transition: store.createBoardTransition(contract.BoardCreateInputSchema.parse(input)),
	});
	if (written.outcome !== "applied") throw new Error(`seed refused: ${JSON.stringify(written)}`);
}

/**
 * Derive a proposal from a variant.
 * @param on The board.
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

/**
 * Restate one node on one variant.
 * @param on The board.
 * @param variant The variant to edit.
 * @param node The node as it should now stand.
 * @returns What the write did.
 */
async function restate(on: string, variant: string, node: Record<string, unknown>) {
	return store.writeSemanticBoard({
		board: on,
		writer,
		expectedVersion: read(on).version,
		transition: store.editVariantTransition(
			contract.VariantEditInputSchema.parse({ variant, nodes: [node] }),
		),
	});
}

/**
 * Designate a variant as the architecture that exists.
 * @param on The board.
 * @param variant The variant to adopt.
 * @returns What the write did.
 */
async function adopt(on: string, variant: string) {
	return store.writeSemanticBoard({
		board: on,
		writer,
		expectedVersion: read(on).version,
		transition: store.adoptVariantTransition(contract.BoardAdoptInputSchema.parse({ variant })),
	});
}

/**
 * The checker's drill-down findings about one board.
 * @param board The board's name.
 * @returns Its `DRILL_DOWN_*` diagnostics.
 */
function linkFindings(board: string): VaultDiagnostic[] {
	return store
		.checkSemanticVault(vault)
		.diagnostics.filter((issue) => issue.board === board && issue.code.startsWith("DRILL_DOWN_"));
}

test("the default vocabulary can name a board of every level it configures", async () => {
	const policy = (await import("@/shared/semantic-policy/index")).DEFAULT_SEMANTIC_POLICY;
	// A node standing for another board carries that board's level as its kind
	// (ADR 0029), so a level with no kind of the same name is a board nothing
	// can link to.
	expect(policy.levels.filter((level) => !Object.hasOwn(policy.nodeKinds, level))).toEqual([]);
});

test("a link to a board at the node's own kind is nothing to report", async () => {
	await create({
		name: "agreeing-service",
		level: "service",
		nodes: [{ name: "Store", kind: "module" }],
	});
	await create({
		name: "agreeing-system",
		level: "system",
		nodes: [
			{ name: "Caller", kind: "app" },
			{
				name: "Checkout",
				kind: "service",
				drillDown: { board: "agreeing-service", variant: { kind: "current" } },
			},
		],
		edges: [{ from: "Caller", to: "Checkout", kind: "http" }],
	});
	expect(linkFindings("agreeing-system")).toEqual([]);
	expect(linkFindings("agreeing-service")).toEqual([]);
});

test("a kind that disagrees with the level of the board it opens is reported", async () => {
	await create({
		name: "outside-service",
		level: "service",
		nodes: [{ name: "Store", kind: "module" }],
	});
	await create({
		name: "outside-system",
		level: "system",
		nodes: [
			{ name: "Caller", kind: "app" },
			{
				name: "Checkout",
				kind: "external",
				drillDown: { board: "outside-service", variant: { kind: "current" } },
			},
		],
		edges: [{ from: "Caller", to: "Checkout", kind: "http" }],
	});
	const findings = linkFindings("outside-system");
	expect(findings.map((issue) => issue.code)).toEqual(["DRILL_DOWN_LEVEL_MISMATCH"]);
	const [mismatch] = findings;
	expect(mismatch?.severity).toBe("warning");
	// The path names the node whose kind is wrong, so a repair can find it.
	const node = read("outside-system").variants[0]?.content.nodes.find(
		(entry) => entry.name === "Checkout",
	);
	expect(mismatch?.path).toContain(node?.id ?? "no node");
});

test("a node that is on the board only to carry its link is reported", async () => {
	await create({
		name: "button-service",
		level: "service",
		nodes: [{ name: "Store", kind: "module" }],
	});
	await create({
		name: "button-system",
		level: "system",
		nodes: [
			{ name: "Caller", kind: "app" },
			{
				name: "Checkout",
				kind: "service",
				drillDown: { board: "button-service", variant: { kind: "current" } },
			},
		],
	});
	expect(linkFindings("button-system").map((issue) => issue.code)).toEqual([
		"DRILL_DOWN_ONLY_NODE",
	]);
});

test("a part with children or a part in a flow is a real participant, link or not", async () => {
	await create({
		name: "wired-service",
		level: "service",
		nodes: [{ name: "Store", kind: "module" }],
	});
	await create({
		name: "wired-system",
		level: "system",
		nodes: [
			{ name: "Caller", kind: "app" },
			{
				name: "Checkout",
				kind: "service",
				drillDown: { board: "wired-service", variant: { kind: "current" } },
			},
			{ name: "Ledger", kind: "module", parent: "Checkout" },
		],
		flows: [
			{
				name: "One purchase",
				participants: ["Caller", "Ledger"],
				steps: [{ from: "Caller", to: "Ledger", label: "buy" }],
			},
		],
	});
	expect(linkFindings("wired-system")).toEqual([]);
});

test("a link to a board the vault does not hold is reported once, and its level is not guessed", async () => {
	await create({
		name: "dangling-system",
		level: "system",
		nodes: [
			{ name: "Caller", kind: "app" },
			{
				name: "Checkout",
				kind: "external",
				drillDown: { board: "no such board", variant: { kind: "current" } },
			},
		],
		edges: [{ from: "Caller", to: "Checkout", kind: "http" }],
	});
	expect(linkFindings("dangling-system").map((issue) => issue.code)).toEqual([
		"DRILL_DOWN_UNKNOWN_BOARD",
	]);
});

test("what a link said while it was the architecture is not reported once it is history", async () => {
	await create({
		name: "frozen-service",
		level: "service",
		nodes: [{ name: "Store", kind: "module" }],
	});
	const opens = { board: "frozen-service", variant: { kind: "current" } };
	await create({
		name: "frozen-system",
		level: "system",
		nodes: [
			{ name: "Caller", kind: "app" },
			{ name: "Checkout", kind: "external", drillDown: opens },
		],
		edges: [{ from: "Caller", to: "Checkout", kind: "http" }],
	});
	// While that state is the one somebody can repair, it is reported.
	expect(linkFindings("frozen-system").map((issue) => issue.code)).toEqual([
		"DRILL_DOWN_LEVEL_MISMATCH",
	]);

	const baseline = read("frozen-system").variants[0]!.name;
	expect((await branch("frozen-system", baseline, "Ours after all")).outcome).toBe("applied");
	expect(
		(
			await restate("frozen-system", "Ours after all", {
				name: "Checkout",
				kind: "service",
				drillDown: opens,
			})
		).outcome,
	).toBe("applied");
	expect((await adopt("frozen-system", "Ours after all")).outcome).toBe("applied");

	const was = read("frozen-system").variants.find((variant) => variant.name === baseline);
	expect(was?.lifecycle).toBe("historical");
	// The content that fails the check is still on the board, unchanged: what
	// was true then does not change, and no accepted write could repair it.
	expect(was?.content.nodes.find((node) => node.name === "Checkout")?.kind).toBe("external");
	expect(linkFindings("frozen-system")).toEqual([]);
}, 30_000);

test("a link a proposal introduces is reported, because a proposal can still be repaired", async () => {
	await create({
		name: "proposed-service",
		level: "service",
		nodes: [{ name: "Store", kind: "module" }],
	});
	const opens = { board: "proposed-service", variant: { kind: "current" } };
	await create({
		name: "proposed-system",
		level: "system",
		nodes: [
			{ name: "Caller", kind: "app" },
			{ name: "Checkout", kind: "service", drillDown: opens },
		],
		edges: [{ from: "Caller", to: "Checkout", kind: "http" }],
	});
	expect(linkFindings("proposed-system")).toEqual([]);

	const baseline = read("proposed-system").variants[0]!.name;
	expect((await branch("proposed-system", baseline, "Buy it instead")).outcome).toBe("applied");
	expect(
		(
			await restate("proposed-system", "Buy it instead", {
				name: "Checkout",
				kind: "external",
				drillDown: opens,
			})
		).outcome,
	).toBe("applied");

	const findings = linkFindings("proposed-system");
	expect(findings.map((issue) => issue.code)).toEqual(["DRILL_DOWN_LEVEL_MISMATCH"]);
	const proposal = read("proposed-system").variants.find(
		(variant) => variant.name === "Buy it instead",
	);
	expect(findings[0]?.variant).toBe(proposal?.id);
}, 30_000);

/**
 * One board as it stands on disk.
 * @param board Its name.
 * @returns The saved family.
 */
function read(board: string): ContractModule.SemanticBoard {
	const result = store.readSemanticBoard(board);
	if (!result.ok) throw new Error(result.problem);
	return result.board;
}
