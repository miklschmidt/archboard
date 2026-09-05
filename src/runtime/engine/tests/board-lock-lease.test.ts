import { expect, jest, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const previousVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-lock-lease-"));
process.env["ARCHBOARD_VAULT"] = vault;
const lock = await import("../board-lock.ts");
const logger = (await import("../logger.ts")).default;
const timing = await import("../../../shared/timing/timing.ts");
const originalWarn = logger.warn;
const agent = (id: string) => ({ id, kind: "agent" as const });
const human = (id: string) => ({ id, kind: "human" as const });
const boards = new Set<string>();

async function advanceLockTime(ms: number): Promise<void> {
	let elapsed = 0;
	while (elapsed < ms) {
		const step = Math.min(timing.LOCK_POLL_MS, ms - elapsed);
		jest.advanceTimersByTime(step);
		await Promise.resolve();
		await Promise.resolve();
		elapsed += step;
	}
}

async function cleanup(): Promise<void> {
	lock.watchBoardLocks(null);
	lock.onBoardSweep(null);
	lock.onBoardLockChanged(null);
	for (const board of boards) {
		lock.releaseClaim(board);
		for (const id of ["first", "user", "later", "patient", "upper", "nested", "departed"])
			lock.releaseHold(board, id);
	}
	lock.forgetLockAnnouncements();
	jest.useRealTimers();
	logger.warn = originalWarn;
	if (previousVault === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = previousVault;
	rmSync(vault, { recursive: true, force: true });
}

test("post-attempt cancellation preserves a reentrant claim for explicit release", async () => {
	const board = "cancelled-reentrant-claim";
	boards.add(board);
	const originalClaim = await lock.claimBoard({
		board,
		reason: "Keep the original claim",
		waitMs: 0,
	});
	try {
		const controller = new AbortController();
		const cancelledRenewal = lock.claimBoard({
			board,
			reason: "This renewal is canceled after its reentrant attempt",
			waitMs: 0,
			signal: controller.signal,
		});
		controller.abort();
		await expect(cancelledRenewal).rejects.toBeInstanceOf(lock.BoardLockCancelledError);
		expect(lock.claimOn(board)?.holder.id).toBe(originalClaim.claim.holder.id);
		expect(lock.boardLockState(board)?.id).toBe(originalClaim.claim.holder.id);
		expect(lock.releaseClaim(board)?.holder.id).toBe(originalClaim.claim.holder.id);
		expect(lock.claimOn(board)).toBeNull();
		expect(lock.boardLockState(board)).toBeNull();
	} finally {
		lock.releaseClaim(board);
	}
});

test("lease interface excludes, renews, expires, and normalizes", async () => {
	jest.useFakeTimers();
	try {
		const board = "interface";
		boards.add(board);
		let writes = 0;
		expect(await lock.withBoardLock({ board, holder: agent("first") }, () => ++writes)).toBe(1);
		expect(lock.boardLockState(board)).toBeNull();
		const held = await lock.holdBoard({
			board,
			holder: human("user"),
			leaseMs: timing.LOCK_WAIT_CAP_MS + timing.LOCK_LEASE_MS,
			waitMs: 0,
		});
		expect(held.created).toBeTrue();
		const refusal = lock
			.holdBoard({ board, holder: agent("later") })
			.catch((error: unknown) => error);
		await advanceLockTime(timing.LOCK_WAIT_CAP_MS);
		const refused = await refusal;
		expect(refused).toBeInstanceOf(lock.BoardHeldError);
		if (!(refused instanceof lock.BoardHeldError)) throw new Error("Expected BoardHeldError.");
		expect(refused.code).toBe("BOARD_HELD");
		expect(refused.board).toBe(board);
		expect(refused.holder).toMatchObject({ id: "user", kind: "human" });
		expect(refused.message).toMatch(/held by the person at the canvas, since/);
		expect(refused.waitedMs).toBe(timing.LOCK_WAIT_CAP_MS);
		jest.advanceTimersByTime(1);
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
		const expiredTakeover = lock.holdBoard({
			board: expired,
			holder: agent("later"),
			waitMs: 1_000,
		});
		await advanceLockTime(100 + timing.LOCK_STEAL_GUARD_MS);
		expect(await expiredTakeover).toMatchObject({ created: true, holder: { id: "later" } });
		expect(timing.LOCK_LEASE_MS).toBeGreaterThanOrEqual(timing.REPORT_IDLE_SETTLE_MS * 2);
		expect(timing.LOCK_WAIT_CAP_MS).toBeGreaterThan(timing.LOCK_LEASE_MS);

		const waiting = "waiting";
		boards.add(waiting);
		await lock.holdBoard({ board: waiting, holder: human("user"), leaseMs: 2_000, waitMs: 0 });
		setTimeout(() => lock.releaseHold(waiting, "user"), 250);
		const waitingTakeover = lock.holdBoard({
			board: waiting,
			holder: agent("patient"),
			waitMs: 2_000,
		});
		await advanceLockTime(250);
		expect(await waitingTakeover).toMatchObject({ created: true, holder: { id: "patient" } });

		const cancelled = "cancelled";
		boards.add(cancelled);
		await lock.holdBoard({ board: cancelled, holder: human("user"), leaseMs: 2_000, waitMs: 0 });
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 25);
		const cancelStart = Date.now();
		const cancellationRequest = lock
			.holdBoard({
				board: cancelled,
				holder: agent("later"),
				waitMs: 2_000,
				signal: controller.signal,
			})
			.catch((error: unknown) => error);
		await advanceLockTime(25);
		const cancellation = await cancellationRequest;
		expect(cancellation).toBeInstanceOf(lock.BoardLockCancelledError);
		expect(Date.now() - cancelStart).toBeLessThan(500);
		expect(lock.boardLockState(cancelled)?.id).toBe("user");
		expect(lock.releaseHold(cancelled, "user")).toBeTrue();

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
		const unreadableTakeover = lock.holdBoard({
			board: unreadable,
			holder: agent("later"),
			waitMs: 0,
		});
		await advanceLockTime(timing.LOCK_STEAL_GUARD_MS);
		expect(await unreadableTakeover).toMatchObject({ created: true });
	} finally {
		await cleanup();
	}
}, 10_000);
