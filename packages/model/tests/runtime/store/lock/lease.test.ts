import { expect, jest, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lock from "#runtime/store/lock/lock.ts";
import { logger } from "@archboard/diagnostics/logger";
import { MODEL_LOCK_MS } from "@archboard/timing";

const vault = mkdtempSync(join(tmpdir(), "archboard-lock-lease-"));
const originalWarn = logger.warn;
const agent = (id: string) => ({ id, kind: "agent" as const });
const human = (id: string) => ({ id, kind: "human" as const });
const boards = new Set<string>();

async function advanceLockTime(ms: number): Promise<void> {
	let elapsed = 0;
	while (elapsed < ms) {
		const step = Math.min(MODEL_LOCK_MS.poll, ms - elapsed);
		jest.advanceTimersByTime(step);
		await Promise.resolve();
		await Promise.resolve();
		elapsed += step;
	}
}

async function cleanup(): Promise<void> {
	lock.watchModelLocks(null);
	lock.onBoardSweep(null);
	lock.onBoardLockChanged(null);
	for (const board of boards) {
		lock.releaseClaim(vault, board);
		for (const id of ["first", "user", "later", "patient", "upper", "nested", "departed"]) {
			lock.releaseHold(vault, board, id);
		}
	}
	lock.forgetLockAnnouncements();
	jest.useRealTimers();
	logger.warn = originalWarn;
	rmSync(vault, { recursive: true, force: true });
}

test("post-attempt cancellation preserves a reentrant claim for explicit release", async () => {
	const board = "cancelled-reentrant-claim";
	boards.add(board);
	const originalClaim = await lock.claimModel({
		vault,
		board,
		reason: "Keep the original claim",
		waitMs: 0,
	});
	try {
		const controller = new AbortController();
		const cancelledRenewal = lock.claimModel({
			vault,
			board,
			reason: "This renewal is canceled after its reentrant attempt",
			waitMs: 0,
			signal: controller.signal,
		});
		controller.abort();
		await expect(cancelledRenewal).rejects.toBeInstanceOf(lock.ModelLockCancelledError);
		expect(lock.claimOn(vault, board)?.holder.id).toBe(originalClaim.claim.holder.id);
		expect(lock.modelLockState(vault, board)?.id).toBe(originalClaim.claim.holder.id);
		expect(lock.releaseClaim(vault, board)?.holder.id).toBe(originalClaim.claim.holder.id);
		expect(lock.claimOn(vault, board)).toBeNull();
		expect(lock.modelLockState(vault, board)).toBeNull();
	} finally {
		lock.releaseClaim(vault, board);
	}
});

test("lease interface excludes, renews, expires, and normalizes", async () => {
	jest.useFakeTimers();
	try {
		const board = "interface";
		boards.add(board);
		let writes = 0;
		expect(await lock.withLease({ vault, board, holder: agent("first") }, () => ++writes)).toBe(1);
		expect(lock.modelLockState(vault, board)).toBeNull();
		const held = await lock.holdModel({
			vault,
			board,
			holder: human("user"),
			leaseMs: MODEL_LOCK_MS.waitCap + MODEL_LOCK_MS.lease,
			waitMs: 0,
		});
		expect(held.created).toBeTrue();
		const refusal = lock
			.holdModel({ vault, board, holder: agent("later") })
			.catch((error: unknown) => error);
		await advanceLockTime(MODEL_LOCK_MS.waitCap);
		const refused = await refusal;
		expect(refused).toBeInstanceOf(lock.ModelHeldError);
		if (!(refused instanceof lock.ModelHeldError)) {
			throw new Error("Expected ModelHeldError.");
		}
		expect(refused.code).toBe("MODEL_HELD");
		expect(refused.board).toBe(board);
		expect(refused.holder).toMatchObject({ id: "user", kind: "human" });
		expect(refused.message).toMatch(/held by the user at the canvas, since/);
		expect(refused.waitedMs).toBe(MODEL_LOCK_MS.waitCap);
		jest.advanceTimersByTime(1);
		const renewed = await lock.holdModel({ vault, board, holder: human("user"), waitMs: 0 });
		expect(renewed.created).toBeFalse();
		expect(renewed.holder.since).toBe(held.holder.since);
		expect(Date.parse(renewed.holder.until)).toBeGreaterThan(Date.parse(held.holder.until));
		await lock.withLease({ vault, board, holder: human("user") }, () => ++writes);
		expect(writes).toBe(2);
		expect(lock.modelLockState(vault, board)?.id).toBe("user");
		// A user behind another user's hold is refused at once, without the
		// agent's wait (TASK-153): no timer is advanced and no time is waited.
		const otherUser = await lock
			.holdModel({ vault, board, holder: human("other-pane") })
			.catch((error: unknown) => error);
		if (!(otherUser instanceof lock.ModelHeldError)) {
			throw new Error("Expected the other user's hold to be refused.");
		}
		expect(otherUser.holder).toMatchObject({ id: "user" });
		expect(otherUser.waitedMs).toBe(0);
		expect(lock.releaseHold(vault, board, "later")).toBeFalse();
		expect(lock.releaseHold(vault, board, "user")).toBeTrue();

		const expired = "expired";
		boards.add(expired);
		await lock.holdModel({
			vault,
			board: expired,
			holder: agent("departed"),
			leaseMs: 100,
			waitMs: 0,
		});
		const expiredTakeover = lock.holdModel({
			vault,
			board: expired,
			holder: agent("later"),
			waitMs: 1_000,
		});
		await advanceLockTime(100 + MODEL_LOCK_MS.stealGuard);
		expect(await expiredTakeover).toMatchObject({ created: true, holder: { id: "later" } });
		expect(MODEL_LOCK_MS.waitCap).toBeGreaterThan(MODEL_LOCK_MS.lease);

		const waiting = "waiting";
		boards.add(waiting);
		await lock.holdModel({
			vault,
			board: waiting,
			holder: human("user"),
			leaseMs: 2_000,
			waitMs: 0,
		});
		setTimeout(() => lock.releaseHold(vault, waiting, "user"), 250);
		const waitingTakeover = lock.holdModel({
			vault,
			board: waiting,
			holder: agent("patient"),
			waitMs: 2_000,
		});
		await advanceLockTime(250);
		expect(await waitingTakeover).toMatchObject({ created: true, holder: { id: "patient" } });

		const cancelled = "cancelled";
		boards.add(cancelled);
		await lock.holdModel({
			vault,
			board: cancelled,
			holder: human("user"),
			leaseMs: 2_000,
			waitMs: 0,
		});
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 25);
		const cancelStart = Date.now();
		const cancellationRequest = lock
			.holdModel({
				vault,
				board: cancelled,
				holder: agent("later"),
				waitMs: 2_000,
				signal: controller.signal,
			})
			.catch((error: unknown) => error);
		await advanceLockTime(25);
		const cancellation = await cancellationRequest;
		expect(cancellation).toBeInstanceOf(lock.ModelLockCancelledError);
		expect(Date.now() - cancelStart).toBeLessThan(500);
		expect(lock.modelLockState(vault, cancelled)?.id).toBe("user");
		expect(lock.releaseHold(vault, cancelled, "user")).toBeTrue();

		boards.add("Payments");
		await lock.holdModel({ vault, board: "Payments", holder: agent("upper"), waitMs: 0 });
		const canonicalRefusal = await lock
			.holdModel({ vault, board: "payments", holder: agent("later"), waitMs: 0 })
			.catch((error: unknown) => error);
		expect(canonicalRefusal).toBeInstanceOf(lock.ModelHeldError);
		lock.releaseHold(vault, "payments", "upper");
		boards.add("systems/payments");
		await lock.holdModel({ vault, board: "systems/payments", holder: agent("nested"), waitMs: 0 });
		expect(existsSync(join(vault, ".archboard/locks/systems%2Fpayments.lock"))).toBeTrue();

		const unreadable = "unreadable";
		boards.add(unreadable);
		await lock.holdModel({ vault, board: unreadable, holder: agent("first"), waitMs: 0 });
		const file = join(vault, ".archboard/locks/unreadable.lock");
		mkdirSync(join(vault, ".archboard/locks"), { recursive: true });
		writeFileSync(file, "{ half a record");
		const unreadableTakeover = lock.holdModel({
			vault,
			board: unreadable,
			holder: agent("later"),
			waitMs: 0,
		});
		await advanceLockTime(MODEL_LOCK_MS.stealGuard);
		expect(await unreadableTakeover).toMatchObject({ created: true });
	} finally {
		await cleanup();
	}
}, 30_000);
