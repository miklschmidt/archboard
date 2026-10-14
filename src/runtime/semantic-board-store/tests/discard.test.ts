import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as LockModule from "@/runtime/engine/board-lock";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import type * as ContractModule from "@/shared/semantic-board/index";

// config.ts snapshots the environment at import time, so this owner takes its
// own vault before any module that resolves a vault path is evaluated.
const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-discard-"));
process.env["ARCHBOARD_VAULT"] = vault;

let store: typeof StoreModule;
let contract: typeof ContractModule;
let lock: typeof LockModule;

const writer = { kind: "agent" as const, reason: "recording the walkthrough" };

/**
 * Start a board with one node on it.
 * @param name The board name.
 */
async function create(name: string): Promise<void> {
	const created = await store.writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				level: "system",
				name,
				nodes: [{ name: "Gateway", kind: "service" }],
			}),
		),
	});
	expect(created.outcome).toBe("applied");
}

beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	contract = await import("@/shared/semantic-board/index");
	lock = await import("@/runtime/engine/board-lock");
});

afterAll(() => {
	if (callerVault === undefined) {
		delete process.env["ARCHBOARD_VAULT"];
	} else {
		process.env["ARCHBOARD_VAULT"] = callerVault;
	}
	rmSync(vault, { recursive: true, force: true });
});

test("a discard removes the whole board, and a later read and discard find it missing", async () => {
	await create("recorded");
	await create("neighbour");
	const location = store.locateSemanticBoard("recorded", vault);

	const stale = await store.discardSemanticBoard({
		vault,
		board: "recorded",
		writer,
		expectedVersion: 2,
	});
	expect(stale).toMatchObject({ outcome: "rejected", code: "BOARD_VERSION_CONFLICT" });
	expect(existsSync(location.file)).toBeTrue();

	const discarded = await store.discardSemanticBoard({ vault, board: "Recorded", writer });
	expect(discarded).toMatchObject({ outcome: "discarded", previousVersion: 1 });
	expect(existsSync(location.file)).toBeFalse();
	expect(store.readSemanticBoard(vault, "recorded")).toMatchObject({
		ok: false,
		code: "BOARD_MISSING",
	});
	expect(store.listSemanticBoards(vault).map((board) => board.key)).toEqual(["neighbour"]);

	const again = await store.discardSemanticBoard({ vault, board: "recorded", writer });
	expect(again).toMatchObject({ outcome: "rejected", code: "BOARD_MISSING" });
});

test("a discard under this server's claim ends the claim with the board", async () => {
	await create("claimed");
	const key = store.locateSemanticBoard("claimed", vault).key;
	const { claim } = await lock.claimBoard({
		vault,
		board: key,
		reason: "recording the walkthrough",
	});

	const discarded = await store.discardSemanticBoard({ vault, board: "claimed", writer });
	expect(discarded).toMatchObject({ outcome: "discarded", heldAs: claim.holder.id });
	expect(lock.claimOn(key)).toBeNull();
	expect(lock.boardLockState(vault, key)).toBeNull();
});

test("a board somebody else holds is refused, naming the holder, and stays", async () => {
	await create("busy");
	const location = store.locateSemanticBoard("busy", vault);
	const holder = { id: "the-other-agent", kind: "agent" as const, reason: "drawing the ingest" };
	const hold = await lock.holdBoard({
		vault,
		board: location.key,
		holder: { ...holder, claimed: true },
		leaseMs: 30_000,
	});
	try {
		const refused = await store.discardSemanticBoard({ vault, board: "busy", writer });
		expect(refused).toMatchObject({ outcome: "rejected", code: "BOARD_HELD" });
		expect(refused.outcome === "rejected" && refused.problem).toContain(holder.reason);
		expect(existsSync(location.file)).toBeTrue();
	} finally {
		lock.releaseHold(vault, location.key, hold.holder.id);
	}
});
