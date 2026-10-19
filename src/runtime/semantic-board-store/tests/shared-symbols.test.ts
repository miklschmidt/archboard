// What the vault checker says about one definition drawn by two parts
// (TASK-494). Each test owns one rule, in a vault of its own so another test's
// boards cannot make or hide a warning.

import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import * as store from "@/runtime/semantic-board-store/index";
import { createConfiguredTestVault } from "@/runtime/semantic-board-store/tests/configured-vault";
import {
	BoardCreateInputSchema,
	BoardBranchInputSchema,
	VariantEditInputSchema,
} from "@archboard/board/board-input";
import { BoardAdoptInputSchema } from "@archboard/board/resolution-input";
import type { VaultDiagnostic } from "@archboard/board/policy";

const vaults: string[] = [];
const writer = { kind: "agent" as const };
const REPO = "github.com/test/shared";
const PATH = "src/payments.ts";

afterAll(() => {
	for (const vault of vaults) rmSync(vault, { recursive: true, force: true });
});

/**
 * A vault of its own.
 * @returns Its directory.
 */
function newVault(): string {
	const vault = createConfiguredTestVault("archboard-shared-symbols-");
	vaults.push(vault);
	return vault;
}

/**
 * Write one board, refusing to continue when the store would not take it.
 * @param vault The vault.
 * @param input The create payload.
 */
async function create(vault: string, input: Record<string, unknown>): Promise<void> {
	const written = await store.writeSemanticBoard({
		vault,
		board: String(input["name"]),
		writer,
		transition: store.createBoardTransition(BoardCreateInputSchema.parse(input)),
	});
	if (written.outcome !== "applied") throw new Error(`seed refused: ${JSON.stringify(written)}`);
}

/**
 * Apply one transition to a board.
 * @param vault The vault.
 * @param board The board.
 * @param transition What to do.
 */
async function apply(
	vault: string,
	board: string,
	transition: ReturnType<typeof store.branchVariantTransition>,
): Promise<void> {
	const current = store.readSemanticBoard(vault, board);
	if (!current.ok) throw new Error(current.problem);
	const written = await store.writeSemanticBoard({
		vault,
		board,
		writer,
		expectedVersion: current.board.version,
		transition,
	});
	if (written.outcome !== "applied") throw new Error(`write refused: ${JSON.stringify(written)}`);
}

/**
 * A part bound to a symbol of the shared file.
 * @param name The part's name.
 * @param symbol The symbol, or none for a bare file.
 * @param more Further node fields.
 * @returns The node input.
 */
function part(name: string, symbol?: string, more: Record<string, unknown> = {}) {
	return {
		name,
		kind: "module",
		binding: { repo: REPO, path: PATH, ...(symbol === undefined ? {} : { symbol }) },
		...more,
	};
}

/**
 * The checker's shared-symbol warnings.
 * @param vault The vault.
 * @returns Them.
 */
function shared(vault: string): VaultDiagnostic[] {
	return store
		.checkSemanticVault(vault)
		.diagnostics.filter((issue) => issue.code === "SHARED_SYMBOL");
}

/**
 * A vault that already holds one pair that shares a symbol, so a test of a
 * rule that stays quiet fails on a checker that says nothing at all.
 * @returns Its directory.
 */
async function quietVault(): Promise<string> {
	const vault = newVault();
	await create(vault, { name: "control-a", level: "system", nodes: [part("Control", "control")] });
	await create(vault, { name: "control-b", level: "system", nodes: [part("Control", "control")] });
	return vault;
}

/**
 * Assert the control pair is the only pair the checker warns about.
 * @param vault The vault `quietVault` made.
 */
function expectQuiet(vault: string): void {
	expect(shared(vault).map((issue) => issue.sharedSymbol?.binding.symbol)).toEqual(["control"]);
}

test("two parts on two boards that bind one symbol are warned about, naming both", async () => {
	const vault = newVault();
	await create(vault, { name: "billing", level: "system", nodes: [part("Charge", "charge")] });
	await create(vault, { name: "refunds", level: "system", nodes: [part("Charge copy", "charge")] });
	const warnings = shared(vault);
	expect(warnings).toHaveLength(1);
	expect(warnings[0]?.severity).toBe("warning");
	const found = warnings[0]?.sharedSymbol;
	expect(found?.binding).toEqual({ repo: REPO, path: PATH, symbol: "charge" });
	expect(found?.parts.map(({ board, name }) => [board, name])).toEqual([
		["billing", "Charge"],
		["refunds", "Charge copy"],
	]);
	const variants = found?.parts.map((each) => each.variants);
	expect(variants?.every((each) => each.length === 1)).toBe(true);
}, 30_000);

test("two parts of one board that bind one symbol are warned about", async () => {
	const vault = newVault();
	await create(vault, {
		name: "billing",
		level: "system",
		nodes: [part("Charge", "charge"), part("Charge again", "charge")],
	});
	expect(shared(vault).map((issue) => issue.sharedSymbol?.parts.map((each) => each.board))).toEqual(
		[["billing", "billing"]],
	);
}, 30_000);

/**
 * Branch a board's first variant into a draft.
 * @param vault The vault.
 * @param board The board.
 * @param name What to call the draft.
 */
async function branch(vault: string, board: string, name: string): Promise<void> {
	const current = store.readSemanticBoard(vault, board);
	if (!current.ok) throw new Error(current.problem);
	await apply(
		vault,
		board,
		store.branchVariantTransition(
			BoardBranchInputSchema.parse({ from: current.board.variants[0]!.name, name }),
		),
	);
}

/**
 * A drill-down to the current variant of a board.
 * @param board The board it opens.
 * @returns The drill-down.
 */
function opening(board: string) {
	return { drillDown: { board, variant: { kind: "current" } } };
}

test("a draft counts", async () => {
	const vault = newVault();
	await create(vault, { name: "billing", level: "system", nodes: [part("Charge", "charge")] });
	await create(vault, {
		name: "refunds",
		level: "system",
		lifecycle: "draft",
		nodes: [part("Charge copy", "charge")],
	});
	expect(shared(vault)).toHaveLength(1);
}, 30_000);

test("a historical variant does not count", async () => {
	const vault = newVault();
	await create(vault, { name: "billing", level: "system", nodes: [part("Charge", "charge")] });
	await create(vault, { name: "refunds", level: "system", nodes: [part("Charge copy", "charge")] });
	expect(shared(vault)).toHaveLength(1);
	await branch(vault, "refunds", "Next");
	await apply(
		vault,
		"refunds",
		store.editVariantTransition(
			VariantEditInputSchema.parse({
				variant: "Next",
				nodes: [
					{
						name: "Charge copy",
						kind: "module",
						binding: { repo: REPO, path: PATH, symbol: "other" },
					},
				],
			}),
		),
	);
	await apply(
		vault,
		"refunds",
		store.adoptVariantTransition(BoardAdoptInputSchema.parse({ variant: "Next" })),
	);
	// The variant that bound `charge` is history now.
	expect(shared(vault)).toEqual([]);
}, 30_000);

test("a part that continues under its id across the variants of a board is one part", async () => {
	const vault = await quietVault();
	await create(vault, { name: "billing", level: "system", nodes: [part("Charge", "charge")] });
	await branch(vault, "billing", "Next");
	expectQuiet(vault);
}, 30_000);

test("a drill-down from either part to the board of the other stays quiet", async () => {
	const downFromRefunds = await quietVault();
	await create(downFromRefunds, {
		name: "billing",
		level: "system",
		nodes: [part("Charge", "charge")],
	});
	await create(downFromRefunds, {
		name: "refunds",
		level: "system",
		nodes: [part("Charge", "charge", opening("billing"))],
	});
	expectQuiet(downFromRefunds);

	const downFromBilling = await quietVault();
	await create(downFromBilling, {
		name: "refunds",
		level: "system",
		nodes: [part("Charge", "charge")],
	});
	await create(downFromBilling, {
		name: "billing",
		level: "system",
		nodes: [part("Charge", "charge", opening("refunds"))],
	});
	expectQuiet(downFromBilling);
}, 30_000);

test("a drill-down to some other board does not silence the pair", async () => {
	const vault = newVault();
	await create(vault, {
		name: "elsewhere",
		level: "system",
		nodes: [{ name: "Alone", kind: "module" }],
	});
	await create(vault, { name: "billing", level: "system", nodes: [part("Charge", "charge")] });
	await create(vault, {
		name: "refunds",
		level: "system",
		nodes: [part("Charge", "charge", opening("elsewhere"))],
	});
	expect(shared(vault)).toHaveLength(1);
}, 30_000);

test("a binding without a symbol is never reported, and neither are two different symbols", async () => {
	const vault = await quietVault();
	await create(vault, {
		name: "billing",
		level: "system",
		nodes: [part("Whole file"), part("Charge", "charge")],
	});
	await create(vault, {
		name: "refunds",
		level: "system",
		nodes: [part("Same file"), part("Refund", "refund")],
	});
	expectQuiet(vault);
}, 30_000);

test("a draft that replaces a part under a new id never draws the old one beside it", async () => {
	const vault = await quietVault();
	await create(vault, { name: "billing", level: "system", nodes: [part("Charge", "charge")] });
	await branch(vault, "billing", "Next");
	await apply(
		vault,
		"billing",
		store.editVariantTransition(
			VariantEditInputSchema.parse({
				variant: "Next",
				removeNodes: ["Charge"],
				confirm: ["PART_RECREATED", "INHERITANCE_DROPPED"],
				nodes: [part("Charge, renamed", "charge")],
			}),
		),
	);
	expectQuiet(vault);
}, 30_000);
