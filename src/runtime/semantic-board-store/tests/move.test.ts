// Moving a board to another repository's vault (ADR 0051, TASK-472.15).
//
// The whole note moves, the drill-downs the move changes are rewritten to name
// repository identities, the moves ADR 0051 forbids are refused with nothing
// written, and a move that stopped part way leaves the board in both vaults
// and finishes when it runs again. Two throwaway git checkouts of two
// identities, a second checkout of one of them and an untracked vault, with a
// registry of their own.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { holdBoard, releaseHold } from "@/runtime/engine/board-lock";
import { declareDirectory } from "@/runtime/engine/repo-registry";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import type * as ContractModule from "@/shared/semantic-board/index";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";

const META = "github.com/acme/meta";
const PRODUCT = "github.com/acme/product";
const callerRepos = process.env["ARCHBOARD_REPOS"];
const root = realpathSync.native(mkdtempSync(join(tmpdir(), "archboard-move-")));
process.env["ARCHBOARD_REPOS"] = join(root, "repos.json");
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };
const vaults = {
	meta: join(root, "meta", ".archboard", "vault"),
	product: join(root, "product", ".archboard", "vault"),
	copy: join(root, "product-copy", ".archboard", "vault"),
	loose: join(root, "loose", ".archboard", "vault"),
};

/**
 * Give a directory a configured vault, and make it a git checkout whose
 * origin names an identity when one is given.
 * @param name The directory's name.
 * @param identity The repository identity, or nothing for an untracked vault.
 */
function holder(name: string, identity?: string): void {
	const directory = join(root, name);
	mkdirSync(join(directory, ".archboard", "vault"), { recursive: true });
	writeFileSync(
		join(directory, ".archboard", "config.yaml"),
		Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY),
	);
	if (identity === undefined) return;
	for (const args of [
		["init", "-q"],
		["remote", "add", "origin", `https://${identity}.git`],
	]) {
		expect(Bun.spawnSync(["git", ...args], { cwd: directory }).exitCode).toBe(0);
	}
}

beforeAll(async () => {
	holder("meta", META);
	holder("product", PRODUCT);
	holder("product-copy", PRODUCT);
	holder("loose");
	// The check that follows a link into another repository reads its chosen checkout.
	await declareDirectory(join(root, "meta"));
	await declareDirectory(join(root, "product"));
	store = await import("@/runtime/semantic-board-store/index");
	contract = await import("@/shared/semantic-board/index");
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(root, { recursive: true, force: true });
});

/**
 * A part that opens a board.
 * @param name The part's name.
 * @param opens The board it opens.
 * @returns The node.
 */
function opening(name: string, opens: string) {
	return { name, kind: "service", drillDown: { board: opens, variant: { kind: "current" } } };
}

/**
 * Create a board, refusing to go on when the store would not take it.
 * @param vault The vault.
 * @param name The board's name.
 * @param nodes Its parts; one module when none are given.
 */
async function create(
	vault: string,
	name: string,
	nodes: readonly Record<string, unknown>[] = [{ name: "Store", kind: "module" }],
): Promise<void> {
	const [first, ...rest] = nodes;
	const written = await store.writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name,
				level: "service",
				nodes,
				// Every part after the first is wired, so none is on the board only for its link.
				edges: rest.map((node) => ({ from: first?.["name"], to: node["name"], kind: "http" })),
			}),
		),
	});
	if (written.outcome !== "applied") throw new Error(`seed refused: ${JSON.stringify(written)}`);
}

/**
 * Write one transition to an existing board at the version it is at.
 * @param vault The vault.
 * @param name The board.
 * @param transition The transition.
 */
async function change(
	vault: string,
	name: string,
	transition: StoreModule.SemanticTransition,
): Promise<void> {
	const written = await store.writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition,
		expectedVersion: board(vault, name).version,
	});
	if (written.outcome !== "applied") throw new Error(`change refused: ${JSON.stringify(written)}`);
}

/**
 * A board as it is on disk.
 * @param vault The vault.
 * @param name The board's name.
 * @returns The board.
 */
function board(vault: string, name: string): ContractModule.SemanticBoard {
	const read = store.readSemanticBoard(vault, name);
	if (!read.ok) throw new Error(read.problem);
	return read.board;
}

/**
 * Whether a vault holds a file for a board.
 * @param vault The vault.
 * @param name The board's name.
 * @returns True when the file is there.
 */
function holds(vault: string, name: string): boolean {
	return existsSync(store.locateSemanticBoard(name, vault).file);
}

/**
 * The drill-down of one part on the board's current variant.
 * @param vault The vault.
 * @param name The board.
 * @param part The part's name.
 * @returns What it opens.
 */
function drillOf(vault: string, name: string, part: string) {
	const read = board(vault, name);
	const variant = read.variants.find((one) => one.id === read.current);
	return variant?.content.nodes.find((node) => node.name === part)?.drillDown;
}

/**
 * Every variant of a board, with the ids of its parts.
 * @param one The board.
 * @returns Each variant's id beside the ids of its nodes.
 */
function subjects(one: ContractModule.SemanticBoard) {
	return one.variants.map((variant) => [variant.id, variant.content.nodes.map((node) => node.id)]);
}

/**
 * Move a board as an agent.
 * @param name The board.
 * @param from The source vault.
 * @param to The target vault.
 * @returns What the move did.
 */
function move(name: string, from: string, to: string) {
	return store.moveSemanticBoard({ vault: from, board: name, to, writer });
}

test("the whole note moves, and the drill-downs it changes name repository identities", async () => {
	await create(vaults.meta, "Ledger");
	await create(vaults.meta, "Old payments", [
		{ name: "API", kind: "app" },
		opening("Books", "Ledger"),
	]);
	await change(vaults.meta, "Old payments", store.renameTransition({ to: "Payments" }));
	await change(vaults.meta, "Payments", store.branchVariantTransition({ name: "Queued" }));
	// It opens the board by the name the board had before the rename.
	await create(vaults.meta, "Platform", [
		{ name: "Web", kind: "app" },
		opening("Pay", "Old payments"),
	]);
	const before = board(vaults.meta, "Payments");

	const moved = await move("Payments", vaults.meta, vaults.product);

	expect(moved.outcome).toBe("moved");
	expect([holds(vaults.meta, "Payments"), holds(vaults.product, "Payments")]).toEqual([
		false,
		true,
	]);
	const after = board(vaults.product, "Old payments");
	expect({ id: after.id, name: after.name, formerNames: after.formerNames }).toEqual({
		id: before.id,
		name: "Payments",
		formerNames: ["Old payments"],
	});
	expect(subjects(after)).toEqual(subjects(before));
	expect(drillOf(vaults.meta, "Platform", "Pay")?.repo).toBe(PRODUCT);
	expect(drillOf(vaults.product, "Payments", "Books")?.repo).toBe(META);
	if (moved.outcome !== "moved") return;
	expect(moved.rewritten.map((one) => `${one.board} ${one.drillDown.repo}`).toSorted()).toEqual([
		`Payments ${META}`,
		`Payments ${META}`,
		`Platform ${PRODUCT}`,
	]);
	// No link in either vault opens nothing.
	for (const vault of [vaults.meta, vaults.product]) {
		const unknown = store
			.checkSemanticVault(vault)
			.diagnostics.filter((one) => one.code.startsWith("DRILL_DOWN_UNKNOWN"));
		expect(unknown).toEqual([]);
	}
});

test("a move to the board's own repository, or to a vault that answers to its name, is refused", async () => {
	await create(vaults.meta, "Refunds");
	await create(vaults.product, "Refunds");
	await create(vaults.meta, "Invoices");
	await create(vaults.product, "Invoices");
	await change(vaults.product, "Invoices", store.renameTransition({ to: "Billing" }));
	const refusals = [
		await move("Refunds", vaults.meta, vaults.meta),
		await move("Refunds", vaults.product, vaults.copy),
		await move("Refunds", vaults.meta, vaults.product),
		await move("Invoices", vaults.meta, vaults.product),
	].map((result) => (result.outcome === "rejected" ? result.code : result.outcome));
	expect(refusals).toEqual([
		"MOVE_SAME_REPOSITORY",
		"MOVE_SAME_REPOSITORY",
		"BOARD_EXISTS",
		"BOARD_EXISTS",
	]);
	expect([holds(vaults.meta, "Refunds"), holds(vaults.meta, "Invoices")]).toEqual([true, true]);
	expect(holds(vaults.copy, "Refunds")).toBe(false);
});

test("a move is refused while somebody else holds the board, or its name in the target", async () => {
	await create(vaults.meta, "Quotes");
	const elsewhere = { id: "another-server", kind: "agent" as const, claimed: true };
	for (const vault of [vaults.meta, vaults.product]) {
		await holdBoard({ vault, board: "quotes", holder: elsewhere, leaseMs: 60_000 });
		const result = await move("Quotes", vaults.meta, vaults.product);
		releaseHold(vault, "quotes", elsewhere.id);
		expect(result.outcome === "rejected" ? result.code : result.outcome).toBe("BOARD_HELD");
	}
	expect([holds(vaults.meta, "Quotes"), holds(vaults.product, "Quotes")]).toEqual([true, false]);
});

test("a move that needs a drill-down into an untracked vault is refused", async () => {
	await create(vaults.meta, "Linked");
	await create(vaults.meta, "Caller", [{ name: "Web", kind: "app" }, opening("Opens", "Linked")]);
	await create(vaults.loose, "Sketch", [{ name: "Web", kind: "app" }, opening("Opens", "Notes")]);
	await create(vaults.loose, "Notes");
	const inbound = await move("Linked", vaults.meta, vaults.loose);
	const outbound = await move("Sketch", vaults.loose, vaults.meta);
	expect([inbound, outbound].map((one) => (one.outcome === "rejected" ? one.code : ""))).toEqual([
		"MOVE_NEEDS_IDENTITY",
		"MOVE_NEEDS_IDENTITY",
	]);
	expect([holds(vaults.loose, "Linked"), holds(vaults.meta, "Sketch")]).toEqual([false, false]);
	// Out of an untracked vault, a link into the board can name the repository it moves to.
	expect((await move("Notes", vaults.loose, vaults.meta)).outcome).toBe("moved");
	expect(drillOf(vaults.loose, "Sketch", "Opens")?.repo).toBe(META);
	// A board nothing links to, and that links nowhere, moves into an untracked vault.
	await create(vaults.meta, "Lonely");
	expect((await move("Lonely", vaults.meta, vaults.loose)).outcome).toBe("moved");
});

test("a move that stopped part way leaves the board in both vaults, and running it again finishes it", async () => {
	await create(vaults.meta, "Orders");
	await create(vaults.meta, "Checkout", [{ name: "Web", kind: "app" }, opening("Place", "Orders")]);
	await create(vaults.meta, "Shipping", [{ name: "Web", kind: "app" }, opening("Track", "Orders")]);
	const elsewhere = { id: "another-server", kind: "agent" as const, claimed: true };
	// Boards are rewritten in key order, so Checkout is rewritten before Shipping stops the move.
	await holdBoard({ vault: vaults.meta, board: "shipping", holder: elsewhere, leaseMs: 60_000 });
	const first = await move("Orders", vaults.meta, vaults.product);
	releaseHold(vaults.meta, "shipping", elsewhere.id);

	expect(first.outcome === "stopped" ? first.code : first.outcome).toBe("MOVE_STOPPED");
	expect([holds(vaults.meta, "Orders"), holds(vaults.product, "Orders")]).toEqual([true, true]);
	expect(drillOf(vaults.meta, "Checkout", "Place")?.repo).toBe(PRODUCT);
	expect(drillOf(vaults.meta, "Shipping", "Track")?.repo).toBeUndefined();

	const again = await move("Orders", vaults.meta, vaults.product);
	expect(again.outcome).toBe("moved");
	expect([holds(vaults.meta, "Orders"), holds(vaults.product, "Orders")]).toEqual([false, true]);
	expect(drillOf(vaults.meta, "Shipping", "Track")?.repo).toBe(PRODUCT);
	if (again.outcome !== "moved") return;
	// The first run's rewrite is done, and the second rewrites only what was left.
	expect(again.rewritten.map((one) => one.board)).toEqual(["Shipping"]);
});
