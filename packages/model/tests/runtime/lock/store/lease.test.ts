import { expect, jest, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lock from "#runtime/lock/store/lock.ts";
import { logger } from "@archboard/diagnostics/logger";
import { observeLockTimers } from "#tests/runtime/support/lock-timers.ts";

const vault = mkdtempSync(join(tmpdir(), "archboard-lock-lease-"));
const originalWarn = logger().warn;
const agent = (id: string) => ({ id, kind: "agent" as const });
const human = (id: string) => ({ id, kind: "human" as const });
const models = new Set<string>();

async function advanceLockTime(duration: number): Promise<void> {
	const boundary = { reached: false };
	setTimeout(() => (boundary.reached = true), duration);
	while (!boundary.reached) {
		// Let the work awakened by each timer schedule its next wait before advancing.
		await new Promise((resolve) => setImmediate(resolve));
		jest.advanceTimersToNextTimer();
	}
	// The boundary can wake the final attempt without scheduling a further timer.
	await new Promise((resolve) => setImmediate(resolve));
}

async function cleanup(): Promise<void> {
	lock.watchModelLocks(null);
	lock.onModelSweep(null);
	lock.onModelLockChanged(null);
	for (const model of models) {
		lock.releaseClaim(vault, model);
		for (const id of ["first", "user", "later", "patient", "upper", "nested", "departed"]) {
			lock.releaseHold(vault, model, id);
		}
	}
	lock.forgetLockAnnouncements();
	jest.useRealTimers();
	logger().warn = originalWarn;
	rmSync(vault, { recursive: true, force: true });
}

test("post-attempt cancellation preserves a reentrant claim for explicit release", async () => {
	const model = "cancelled-reentrant-claim";
	models.add(model);
	const originalClaim = await lock.claimModel({
		vault,
		model,
		reason: "Keep the original claim",
		waits: false,
	});
	try {
		const controller = new AbortController();
		const cancelledRenewal = lock.claimModel({
			vault,
			model,
			reason: "This renewal is canceled after its reentrant attempt",
			waits: false,
			signal: controller.signal,
		});
		controller.abort();
		await expect(cancelledRenewal).rejects.toBeInstanceOf(lock.ModelLockCancelledError);
		expect(lock.claimOn(vault, model)?.holder.id).toBe(originalClaim.claim.holder.id);
		expect(lock.modelLockState(vault, model)?.id).toBe(originalClaim.claim.holder.id);
		expect(lock.releaseClaim(vault, model)?.holder.id).toBe(originalClaim.claim.holder.id);
		expect(lock.claimOn(vault, model)).toBeNull();
		expect(lock.modelLockState(vault, model)).toBeNull();
	} finally {
		lock.releaseClaim(vault, model);
	}
});

test("lease interface excludes, renews, expires, and normalizes", async () => {
	jest.useFakeTimers();
	try {
		using timers = observeLockTimers();
		const model = "interface";
		models.add(model);
		let writes = 0;
		expect(await lock.withLease({ vault, model, holder: agent("first") }, () => ++writes)).toBe(1);
		expect(lock.modelLockState(vault, model)).toBeNull();
		const userRequest = {
			vault,
			model,
			holder: human("user"),
			leaseMs: 60_000,
			waits: false as const,
		};
		const held = await lock.holdModel(userRequest);
		expect(held.created).toBeTrue();
		let settled = false;
		const refusal = lock
			.holdModel({ vault, model, holder: agent("later") })
			.catch((error: unknown) => error)
			.finally(() => (settled = true));
		const wait = timers.delay("modelLock.wait");
		await advanceLockTime(wait - 1);
		expect(settled).toBeFalse();
		await advanceLockTime(1);
		expect(settled).toBeTrue();
		const refused = await refusal;
		expect(refused).toBeInstanceOf(lock.ModelHeldError);
		if (!(refused instanceof lock.ModelHeldError)) {
			throw new Error("Expected ModelHeldError.");
		}
		expect(refused.code).toBe("MODEL_HELD");
		expect(refused.model).toBe(model);
		expect(refused.holder).toMatchObject({ id: "user", kind: "human" });
		expect(refused.message).toMatch(/held by the user at the canvas, since/);
		expect(refused.waitedMs).toBe(wait);
		expect(lock.modelLockState(vault, model)).toEqual(held.holder);
		expect(jest.getTimerCount()).toBe(0);
		jest.advanceTimersByTime(1);
		const renewed = await lock.holdModel(userRequest);
		expect(renewed.created).toBeFalse();
		expect(renewed.holder.since).toBe(held.holder.since);
		expect(Date.parse(renewed.holder.until)).toBeGreaterThan(Date.parse(held.holder.until));
		await lock.withLease({ vault, model, holder: human("user") }, () => ++writes);
		expect(writes).toBe(2);
		expect(lock.modelLockState(vault, model)?.id).toBe("user");
		// A user behind another user's hold is refused at once, without the
		// agent's wait (TASK-153): no timer is advanced and no time is waited.
		const otherUser = await lock
			.holdModel({ vault, model, holder: human("other-pane") })
			.catch((error: unknown) => error);
		if (!(otherUser instanceof lock.ModelHeldError)) {
			throw new Error("Expected the other user's hold to be refused.");
		}
		expect(otherUser.holder).toMatchObject({ id: "user" });
		expect(otherUser.waitedMs).toBe(0);
		expect(lock.releaseHold(vault, model, "later")).toBeFalse();
		expect(lock.releaseHold(vault, model, "user")).toBeTrue();

		const expired = "expired";
		models.add(expired);
		const departed = await lock.holdModel({
			vault,
			model: expired,
			holder: agent("departed"),
			leaseMs: 100,
			waits: false,
		});
		await advanceLockTime(Date.parse(departed.holder.until) - Date.now() - 1);
		expect(lock.modelLockState(vault, expired)?.id).toBe("departed");
		const expiredTakeover = lock.holdModel({
			vault,
			model: expired,
			holder: agent("later"),
		});
		jest.advanceTimersByTime(1);
		expect(lock.modelLockState(vault, expired)).toBeNull();
		await advanceLockTime(timers.delay("modelLock.wait") - 1);
		expect(await expiredTakeover).toMatchObject({ created: true, holder: { id: "later" } });

		const waiting = "waiting";
		models.add(waiting);
		await lock.holdModel({
			vault,
			model: waiting,
			holder: human("user"),
			leaseMs: 2_000,
			waits: false,
		});
		setTimeout(() => lock.releaseHold(vault, waiting, "user"), 250);
		const waitingTakeover = lock.holdModel({
			vault,
			model: waiting,
			holder: agent("patient"),
		});
		// The holder lets go at 250 ms; the waiter sees it at its next look.
		await advanceLockTime(500);
		expect(await waitingTakeover).toMatchObject({ created: true, holder: { id: "patient" } });

		const cancelled = "cancelled";
		models.add(cancelled);
		await lock.holdModel({
			vault,
			model: cancelled,
			holder: human("user"),
			leaseMs: 2_000,
			waits: false,
		});
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 25);
		const cancelStart = Date.now();
		const cancellationRequest = lock
			.holdModel({
				vault,
				model: cancelled,
				holder: agent("later"),
				signal: controller.signal,
			})
			.catch((error: unknown) => error);
		await advanceLockTime(25);
		const cancellation = await cancellationRequest;
		expect(cancellation).toBeInstanceOf(lock.ModelLockCancelledError);
		expect(Date.now() - cancelStart).toBeLessThan(500);
		expect(lock.modelLockState(vault, cancelled)?.id).toBe("user");
		expect(lock.releaseHold(vault, cancelled, "user")).toBeTrue();

		models.add("Payments");
		await lock.holdModel({ vault, model: "Payments", holder: agent("upper"), waits: false });
		const canonicalRefusal = await lock
			.holdModel({ vault, model: "payments", holder: agent("later"), waits: false })
			.catch((error: unknown) => error);
		expect(canonicalRefusal).toBeInstanceOf(lock.ModelHeldError);
		lock.releaseHold(vault, "payments", "upper");
		models.add("systems/payments");
		await lock.holdModel({
			vault,
			model: "systems/payments",
			holder: agent("nested"),
			waits: false,
		});
		expect(existsSync(join(vault, ".archboard/locks/systems%2Fpayments.lock"))).toBeTrue();

		const unreadable = "unreadable";
		models.add(unreadable);
		await lock.holdModel({ vault, model: unreadable, holder: agent("first"), waits: false });
		const file = join(vault, ".archboard/locks/unreadable.lock");
		mkdirSync(join(vault, ".archboard/locks"), { recursive: true });
		writeFileSync(file, "{ half a record");
		const unreadableTakeover = lock.holdModel({
			vault,
			model: unreadable,
			holder: agent("later"),
			waits: false,
		});
		jest.advanceTimersByTime(timers.delay("modelLock.stealGuard"));
		expect(await unreadableTakeover).toMatchObject({ created: true });
	} finally {
		await cleanup();
	}
}, 30_000);
