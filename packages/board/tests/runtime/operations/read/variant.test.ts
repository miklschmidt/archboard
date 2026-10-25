import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { readBoardVariant } from "#runtime/operations/read/variant.ts";
import { writeSemanticBoard } from "#runtime/operations/write/write.ts";
import { createBoardTransition } from "#runtime/operations/write/transitions.ts";
import { createConfiguredTestVault } from "#tests/runtime/support/configured-vault.ts";
import { BoardCreateInputSchema } from "#shared/protocol/board-input.ts";

// The one read of the variant an address opens. The pane show route, the pane
// registry, the walkthrough narration and the code opener all answer by it, so
// the outcome it names is what each of them refuses or keeps a pane on.

const vault = createConfiguredTestVault("archboard-variant-read-");

afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

/**
 * Create a board nobody has built: one draft and no current variant (ADR 0031).
 * @param name The board's name.
 * @returns The draft's id.
 */
async function unbuiltBoard(name: string): Promise<string> {
	const result = await writeSemanticBoard({
		vault,
		board: name,
		writer: { kind: "agent" },
		transition: createBoardTransition(
			BoardCreateInputSchema.parse({
				name,
				level: "system",
				lifecycle: "draft",
				variant: "Queued ingest",
			}),
		),
	});
	if (result.outcome !== "applied") throw new Error(`${result.code}: ${result.problem}`);
	const draft = result.board.variants[0];
	if (draft === undefined) throw new Error("the board was created without a variant");
	return draft.id;
}

/**
 * The id of the variant an address opens, or the code it refuses with.
 * @param board The board name.
 * @param variant The variant as the address states it.
 * @returns The id or the refusal code.
 */
function opens(board: string, variant?: string): string {
	const read = readBoardVariant(vault, board, variant);
	return read.ok ? read.variant.id : read.code;
}

test("a bare name and an explicit current both open the draft of a board nobody has built", async () => {
	const draft = await unbuiltBoard("ingest");
	expect(opens("ingest")).toBe(draft);
	expect(opens("ingest", "current")).toBe(draft);
	expect(opens("ingest", " CURRENT ")).toBe(draft);
	expect(opens("ingest", "Queued ingest")).toBe(draft);
});

test("a variant the board lacks and a board the vault lacks are told apart", async () => {
	await unbuiltBoard("ledger");
	const missing = readBoardVariant(vault, "ledger", "nope");
	expect(missing.ok).toBe(false);
	// The board was read, so a caller can still name what it has.
	expect(!missing.ok && missing.code === "VARIANT_MISSING" && missing.board.name).toBe("ledger");
	expect(opens("absent")).toBe("BOARD_MISSING");
});
