// What a delete refuses and answers (ADR 0057, TASK-526.06), at the store: it
// is refused while a node on a current or draft variant of another board of the
// vault opens the board, by its name or a former name, naming no repository or
// the vault's own, and the refusal names each node; its answer lists the board's tracked embeds; and the board's name
// and former names are free for a new board afterwards.

import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSemanticBoard } from "#runtime/operations/write/write.ts";
import {
	branchVariantTransition,
	createBoardTransition,
	editVariantTransition,
	shelveVariantTransition,
	type SemanticTransition,
} from "#runtime/operations/write/transitions.ts";
import { renameTransition } from "#runtime/operations/rename/rename.ts";
import { trackEmbedTransition } from "#runtime/operations/embeds/track.ts";
import { locateSemanticBoard } from "#runtime/store/location.ts";
import { discardSemanticBoard } from "#runtime/operations/write/discard.ts";
import { readSemanticBoard } from "#runtime/operations/read/read.ts";
import { BoardCreateInputSchema, VariantEditInputSchema } from "#shared/protocol/board-input.ts";

// The vault of a checkout, so a drill-down can name the vault's own repository.
const OWN = "github.com/acme/ledger";
const root = mkdtempSync(join(tmpdir(), "archboard-delete-"));
const vault = join(root, ".archboard", "vault");
mkdirSync(vault, { recursive: true });
for (const args of [
	["init", "-q"],
	["remote", "add", "origin", `https://${OWN}.git`],
]) {
	expect(Bun.spawnSync(["git", ...args], { cwd: root }).exitCode).toBe(0);
}
const writer = { kind: "agent" as const, reason: "deleting a board" };

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

/**
 * A part that opens a board.
 * @param name The part's name.
 * @param board The board it opens.
 * @param repo The repository identity it names, when it names one.
 * @returns The node.
 */
function opening(name: string, board: string, repo?: string) {
	return {
		name,
		kind: "service",
		drillDown: { board, variant: { kind: "current" }, ...(repo === undefined ? {} : { repo }) },
	};
}

/**
 * Make a board.
 * @param name Its name.
 * @param nodes Its parts.
 */
async function made(name: string, nodes: readonly Record<string, unknown>[]): Promise<void> {
	const created = await writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition: createBoardTransition(
			BoardCreateInputSchema.parse({ name, level: "system", nodes }),
		),
	});
	expect(created.outcome).toBe("applied");
}

/**
 * Change a board.
 * @param name Its name.
 * @param transition The change.
 */
async function change(name: string, transition: SemanticTransition): Promise<void> {
	const read = readSemanticBoard(vault, name);
	if (!read.ok) throw new Error(read.problem);
	const written = await writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition,
		expectedVersion: read.board.version,
	});
	expect(written.outcome === "rejected" ? written.problem : written.outcome).toBe("applied");
}

/**
 * The id of a variant of a board, by name.
 * @param board The board's name.
 * @param variant The variant's name.
 * @returns Its id.
 */
function variantId(board: string, variant: string): string {
	const read = readSemanticBoard(vault, board);
	if (!read.ok) throw new Error(read.problem);
	const found = read.board.variants.find((one) => one.name === variant);
	if (found === undefined) throw new Error(`no variant ${variant}`);
	return found.id;
}

test("a board that a current or draft node of another board opens is refused, naming each node", async () => {
	await made("Ledger", [{ name: "Books", kind: "module" }]);
	await change("Ledger", renameTransition({ to: "General ledger" }));
	// The current variant opens it by the name it had, which still answers to it.
	await made("Payments", [{ name: "API", kind: "app" }, opening("Books", "Ledger")]);
	// The current variant names another repository; only a draft opens it here.
	await made("Platform", [
		{ name: "Web", kind: "app" },
		opening("Ledger", "Ledger", "github.com/else/where"),
	]);
	// The vault's own repository is this vault.
	await made("Treasury", [{ name: "Cash", kind: "app" }, opening("Books", "Ledger", OWN)]);
	await change("Platform", branchVariantTransition({ name: "Planned" }));
	await change(
		"Platform",
		editVariantTransition(
			VariantEditInputSchema.parse({
				variant: "Planned",
				nodes: [opening("Books", "General ledger")],
			}),
		),
	);

	const refused = await discardSemanticBoard({ vault, board: "General ledger", writer });
	expect(refused).toMatchObject({ outcome: "rejected", code: "BOARD_OPENED_BY", version: 2 });
	expect(refused.outcome === "rejected" && refused.openedBy).toEqual([
		expect.objectContaining({ board: "Payments", variant: variantId("Payments", "Initial") }),
		expect.objectContaining({ board: "Platform", variant: variantId("Platform", "Planned") }),
		expect.objectContaining({ board: "Treasury", variant: variantId("Treasury", "Initial") }),
	]);
	expect(existsSync(locateSemanticBoard("General ledger", vault).file)).toBeTrue();
});

test("a drill-down on a shelved proposal or into another repository does not keep a board", async () => {
	await made("Archive", [{ name: "Store", kind: "module" }]);
	await made("Reports", [
		{ name: "Web", kind: "app" },
		opening("Old", "Archive", "github.com/else/where"),
	]);
	await change("Reports", branchVariantTransition({ name: "Abandoned" }));
	await change(
		"Reports",
		editVariantTransition(
			VariantEditInputSchema.parse({
				variant: "Abandoned",
				nodes: [opening("Old store", "Archive")],
			}),
		),
	);
	await change("Reports", shelveVariantTransition({ variant: "Abandoned", reason: "not needed" }));

	const deleted = await discardSemanticBoard({ vault, board: "Archive", writer });
	expect(deleted).toMatchObject({ outcome: "discarded", trackedEmbeds: [] });
});

test("a delete answers the tracked embeds, and frees the name and the former names", async () => {
	await made("Old ingest", [{ name: "Queue", kind: "module" }]);
	await change("Old ingest", renameTransition({ to: "Ingest" }));
	const embed = { repo: "github.com/acme/docs", path: "docs/ingest.svg" };
	await change("Ingest", trackEmbedTransition(embed));

	const deleted = await discardSemanticBoard({
		vault,
		board: "Ingest",
		writer,
		expectedVersion: 3,
	});
	expect(deleted).toMatchObject({
		outcome: "discarded",
		previousVersion: 3,
		trackedEmbeds: [embed],
	});

	// Neither the name nor the former name opens anything now, and each can be a new board.
	expect(readSemanticBoard(vault, "Old ingest")).toMatchObject({
		ok: false,
		code: "BOARD_MISSING",
	});
	await made("Ingest", [{ name: "Stream", kind: "module" }]);
	await made("Old ingest", [{ name: "Batch", kind: "module" }]);
	const [current, former] = [
		readSemanticBoard(vault, "Ingest"),
		readSemanticBoard(vault, "Old ingest"),
	];
	expect([current.ok && current.board.version, former.ok && former.board.name]).toEqual([
		1,
		"Old ingest",
	]);
});
