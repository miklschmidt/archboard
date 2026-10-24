// Tracking an embed through the write boundary (ADR 0057): the board lists
// `{ repo, path }` once, the version rises, nothing a variant says changes,
// and a held board is refused as every write is.

import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { writeSemanticBoard } from "#runtime/operations/write/write.ts";
import { createBoardTransition } from "#runtime/operations/write/transitions.ts";
import { trackEmbedTransition } from "#runtime/operations/embeds/track.ts";
import { readSemanticBoard } from "#runtime/operations/read/read.ts";
import { holdBoard, releaseHold } from "#runtime/store/lock/lock.ts";
import { createConfiguredTestVault } from "#tests/runtime/support/configured-vault.ts";
import { BoardCreateInputSchema } from "#shared/protocol/board-input.ts";
import { TrackedEmbedSchema } from "#shared/schemas/board-document.ts";

const vault = createConfiguredTestVault("archboard-track-");
const writer = { kind: "agent" as const };
const EMBED = { repo: "github.com/acme/docs", path: "docs/payments.svg" };

afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

/**
 * Create a board of one part.
 * @param name The board's name.
 */
async function create(name: string): Promise<void> {
	const written = await writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition: createBoardTransition(
			BoardCreateInputSchema.parse({
				name,
				level: "system",
				nodes: [{ name: "API", kind: "service" }],
			}),
		),
	});
	if (written.outcome !== "applied") throw new Error(JSON.stringify(written));
}

/**
 * The board as it is on disk.
 * @param name The board's name.
 * @returns The board.
 */
function read(name: string) {
	const found = readSemanticBoard(vault, name);
	if (!found.ok) throw new Error(found.problem);
	return found.board;
}

/**
 * Track the embed, stating no version.
 * @param name The board's name.
 * @returns What the write did.
 */
function track(name: string) {
	return writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition: trackEmbedTransition(EMBED),
	});
}

test("tracking lists the embed once, raises the version and changes no variant, with no stated version", async () => {
	await create("payments");
	const before = read("payments");
	expect((await track("payments")).outcome).toBe("applied");
	const after = read("payments");
	expect(after.trackedEmbeds).toEqual([EMBED]);
	expect(after.version).toBe(before.version + 1);
	expect(after.variants).toEqual(before.variants);
	const again = await track("payments");
	expect(again.outcome === "rejected" ? again.code : again.outcome).toBe("EMBED_ALREADY_TRACKED");
	expect(read("payments")).toEqual(after);
});

test("tracking a board somebody else holds is refused, and lists nothing", async () => {
	await create("ledger");
	const elsewhere = { id: "another-server", kind: "agent" as const, claimed: true };
	await holdBoard({ vault, board: "ledger", holder: elsewhere, leaseMs: 60_000 });
	const result = await track("ledger");
	releaseHold(vault, "ledger", elsewhere.id);
	expect(result.outcome === "rejected" ? result.code : result.outcome).toBe("BOARD_HELD");
	expect(read("ledger").trackedEmbeds).toBeUndefined();
});

test("a tracked embed names a file from its repository's root and nothing outside it", () => {
	for (const path of [
		"../docs/a.svg",
		"/docs/a.svg",
		"docs/./a.svg",
		"docs\\a.svg",
		"docs//a.svg",
	]) {
		expect(TrackedEmbedSchema.safeParse({ repo: EMBED.repo, path }).success, path).toBe(false);
	}
	expect(TrackedEmbedSchema.safeParse(EMBED).success).toBe(true);
});
