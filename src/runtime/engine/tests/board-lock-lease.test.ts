import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const previousVault = process.env.ARCHBOARD_VAULT;
const vault = mkdtempSync(join(tmpdir(), "archboard-lock-lease-"));
process.env.ARCHBOARD_VAULT = vault;
const lock = await import("../board-lock.ts");
const logger = (await import("../logger.ts")).default;
const timing = await import("../../../shared/timing/timing.ts");
const originalWarn = logger.warn;
const agent = (id: string) => ({ id, kind: "agent" as const });
const human = (id: string) => ({ id, kind: "human" as const });
const boards = new Set<string>();
const timers = new Set<ReturnType<typeof setTimeout>>();

async function cleanup(): Promise<void> {
	for (const timer of timers) clearTimeout(timer);
	lock.watchBoardLocks(null);
	lock.onBoardSweep(null);
	lock.onBoardLockChanged(null);
	for (const board of boards) {
		lock.releaseClaim(board);
		for (const id of ["first", "user", "later", "patient", "upper", "nested", "departed"])
			lock.releaseHold(board, id);
	}
	lock.forgetLockAnnouncements();
	logger.warn = originalWarn;
	if (previousVault === undefined) delete process.env.ARCHBOARD_VAULT;
	else process.env.ARCHBOARD_VAULT = previousVault;
	rmSync(vault, { recursive: true, force: true });
}

test("lease interface excludes, renews, expires, and normalizes", async () => {
	try {
		const board = "interface";
		boards.add(board);
		let writes = 0;
		expect(await lock.withBoardLock({ board, holder: agent("first") }, () => ++writes)).toBe(1);
		expect(lock.boardLockState(board)).toBeNull();
		const held = await lock.holdBoard({ board, holder: human("user"), waitMs: 0 });
		expect(held.created).toBeTrue();
		const started = Date.now();
		const refused = await lock
			.holdBoard({ board, holder: agent("later"), waitMs: 120 })
			.catch((error: unknown) => error);
		expect(refused).toBeInstanceOf(lock.BoardHeldError);
		if (!(refused instanceof lock.BoardHeldError)) throw new Error("Expected BoardHeldError.");
		expect(refused.holder).toMatchObject({ id: "user", kind: "human" });
		expect(refused.message).toMatch(/held by the person at the canvas, since/);
		expect(refused.waitedMs).toBeGreaterThanOrEqual(100);
		expect(Date.now() - started).toBeGreaterThanOrEqual(100);
		const renewed = await lock.holdBoard({ board, holder: human("user"), waitMs: 0 });
		expect(renewed.created).toBeFalse();
		expect(renewed.holder.since).toBe(held.holder.since);
		expect(Date.parse(renewed.holder.until)).toBeGreaterThan(Date.parse(held.holder.until));
		await lock.withBoardLock({ board, holder: human("user") }, () => ++writes);
		expect(writes).toBe(2);
		expect(lock.boardLockState(board)?.id).toBe("user");
		expect(lock.releaseHold(board, "later")).toBeFalse();
		expect(lock.releaseHold(board, "user")).toBeTrue();

		const expired = "expired";
		boards.add(expired);
		await lock.holdBoard({ board: expired, holder: agent("departed"), leaseMs: 100, waitMs: 0 });
		expect(
			await lock.holdBoard({ board: expired, holder: agent("later"), waitMs: 1_000 }),
		).toMatchObject({ created: true, holder: { id: "later" } });
		expect(timing.LOCK_LEASE_MS).toBeGreaterThanOrEqual(timing.REPORT_IDLE_SETTLE_MS * 2);
		expect(timing.LOCK_WAIT_CAP_MS).toBeGreaterThan(timing.LOCK_LEASE_MS);

		const waiting = "waiting";
		boards.add(waiting);
		await lock.holdBoard({ board: waiting, holder: human("user"), leaseMs: 2_000, waitMs: 0 });
		const timer = setTimeout(() => lock.releaseHold(waiting, "user"), 250);
		timers.add(timer);
		const waitStart = Date.now();
		await lock.holdBoard({ board: waiting, holder: agent("patient"), waitMs: 2_000 });
		expect(Date.now() - waitStart).toBeWithin(200, 1_200);

		boards.add("Payments");
		await lock.holdBoard({ board: "Payments", holder: agent("upper"), waitMs: 0 });
		const canonicalRefusal = await lock
			.holdBoard({ board: "payments", holder: agent("later"), waitMs: 0 })
			.catch((error: unknown) => error);
		expect(canonicalRefusal).toBeInstanceOf(lock.BoardHeldError);
		lock.releaseHold("payments", "upper");
		boards.add("systems/payments");
		await lock.holdBoard({ board: "systems/payments", holder: agent("nested"), waitMs: 0 });
		expect(existsSync(join(vault, ".archboard/locks/systems%2Fpayments.lock"))).toBeTrue();

		const unreadable = "unreadable";
		boards.add(unreadable);
		await lock.holdBoard({ board: unreadable, holder: agent("first"), waitMs: 0 });
		const file = join(vault, ".archboard/locks/unreadable.lock");
		mkdirSync(join(vault, ".archboard/locks"), { recursive: true });
		writeFileSync(file, "{ half a record");
		expect(
			await lock.holdBoard({ board: unreadable, holder: agent("later"), waitMs: 0 }),
		).toMatchObject({ created: true });
	} finally {
		await cleanup();
	}
}, 10_000);
