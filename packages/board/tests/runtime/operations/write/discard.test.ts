import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lock from "#runtime/store/lock/lock.ts";
import { writeSemanticBoard } from "#runtime/operations/write/write.ts";
import { createBoardTransition } from "#runtime/operations/write/transitions.ts";
import { locateSemanticBoard } from "#runtime/store/location.ts";
import { discardSemanticBoard } from "#runtime/operations/write/discard.ts";
import { readSemanticBoard } from "#runtime/operations/read/read.ts";
import { listSemanticBoards } from "#runtime/operations/read/listing.ts";
import { BoardCreateInputSchema } from "#shared/protocol/board-input.ts";

const vault = mkdtempSync(join(tmpdir(), "archboard-discard-"));

const writer = { kind: "agent" as const, reason: "recording the walkthrough" };

/**
 * Start a board with one node on it.
 * @param name The board name.
 */
async function create(name: string): Promise<void> {
	const created = await writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition: createBoardTransition(
			BoardCreateInputSchema.parse({
				level: "system",
				name,
				nodes: [{ name: "Gateway", kind: "service" }],
			}),
		),
	});
	expect(created.outcome).toBe("applied");
}

afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

test("a discard removes the whole board, and a later read and discard find it missing", async () => {
	await create("recorded");
	await create("neighbour");
	const location = locateSemanticBoard("recorded", vault);

	const stale = await discardSemanticBoard({
		vault,
		board: "recorded",
		writer,
		expectedVersion: 2,
	});
	expect(stale).toMatchObject({ outcome: "rejected", code: "BOARD_VERSION_CONFLICT" });
	expect(existsSync(location.file)).toBeTrue();

	const discarded = await discardSemanticBoard({ vault, board: "Recorded", writer });
	expect(discarded).toMatchObject({ outcome: "discarded", previousVersion: 1 });
	expect(existsSync(location.file)).toBeFalse();
	expect(readSemanticBoard(vault, "recorded")).toMatchObject({
		ok: false,
		code: "BOARD_MISSING",
	});
	expect(listSemanticBoards(vault).map((board) => board.key)).toEqual(["neighbour"]);

	const again = await discardSemanticBoard({ vault, board: "recorded", writer });
	expect(again).toMatchObject({ outcome: "rejected", code: "BOARD_MISSING" });
});

test("a discard under this server's claim ends the claim with the board", async () => {
	await create("claimed");
	const key = locateSemanticBoard("claimed", vault).key;
	const { claim } = await lock.claimBoard({
		vault,
		board: key,
		reason: "recording the walkthrough",
	});

	const discarded = await discardSemanticBoard({ vault, board: "claimed", writer });
	expect(discarded).toMatchObject({ outcome: "discarded", heldAs: claim.holder.id });
	expect(lock.claimOn(vault, key)).toBeNull();
	expect(lock.boardLockState(vault, key)).toBeNull();
});

test("a board somebody else holds is refused, naming the holder, and stays", async () => {
	await create("busy");
	const location = locateSemanticBoard("busy", vault);
	const holder = { id: "the-other-agent", kind: "agent" as const, reason: "drawing the ingest" };
	const hold = await lock.holdBoard({
		vault,
		board: location.key,
		holder: { ...holder, claimed: true },
		leaseMs: 30_000,
	});
	try {
		const refused = await discardSemanticBoard({ vault, board: "busy", writer });
		expect(refused).toMatchObject({ outcome: "rejected", code: "BOARD_HELD" });
		expect(refused.outcome === "rejected" && refused.problem).toContain(holder.reason);
		expect(existsSync(location.file)).toBeTrue();
	} finally {
		lock.releaseHold(vault, location.key, hold.holder.id);
	}
});
