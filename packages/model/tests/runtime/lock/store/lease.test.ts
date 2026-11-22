import { expect, jest, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lock from "#runtime/lock/store/lock.ts";
import { logger } from "@archboard/diagnostics/logger";
import { ms } from "@archboard/timing";

/** How far the fake clock moves per step: the first pause between two looks of a wait. A test number beside the product's. */
const LOCK_POLL_MS = 10;
/** The reviewed time an agent waits for a held model. A test number beside the product's. */
const LOCK_WAIT_MS = 5000;
/** The reviewed pause after taking over a lapsed lease. A test number beside the product's. */
const STEAL_GUARD_MS = 25;

const vault = mkdtempSync(join(tmpdir(), "archboard-lock-lease-"));
const originalWarn = logger().warn;
const agent = (id: string) => ({ id, kind: "agent" as const });
const human = (id: string) => ({ id, kind: "human" as const });
const models = new Set<string>();

async function advanceLockTime(duration: number): Promise<void> {
	let elapsed = 0;
	while (elapsed < duration) {
		const step = Math.min(LOCK_POLL_MS, duration - elapsed);
		jest.advanceTimersByTime(step);
		// A turn of the loop lets every promise the step released settle.
		await new Promise((resolve) => setImmediate(resolve));
		elapsed += step;
	}
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
		const model = "interface";
		models.add(model);
		let writes = 0;
		expect(await lock.withLease({ vault, model, holder: agent("first") }, () => ++writes)).toBe(1);
		expect(lock.modelLockState(vault, model)).toBeNull();
		const held = await lock.holdModel({
			vault,
			model,
			holder: human("user"),
			leaseMs: LOCK_WAIT_MS + ms("modelLock.lease"),
			waits: false,
		});
		expect(held.created).toBeTrue();
		const refusal = lock
			.holdModel({ vault, model, holder: agent("later") })
			.catch((error: unknown) => error);
		await advanceLockTime(LOCK_WAIT_MS);
		const refused = await refusal;
		expect(refused).toBeInstanceOf(lock.ModelHeldError);
		if (!(refused instanceof lock.ModelHeldError)) {
			throw new Error("Expected ModelHeldError.");
		}
		expect(refused.code).toBe("MODEL_HELD");
		expect(refused.model).toBe(model);
		expect(refused.holder).toMatchObject({ id: "user", kind: "human" });
		expect(refused.message).toMatch(/held by the user at the canvas, since/);
		expect(refused.waitedMs).toBe(LOCK_WAIT_MS);
		jest.advanceTimersByTime(1);
		const renewed = await lock.holdModel({ vault, model, holder: human("user"), waits: false });
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
		await lock.holdModel({
			vault,
			model: expired,
			holder: agent("departed"),
			leaseMs: 100,
			waits: false,
		});
		const expiredTakeover = lock.holdModel({
			vault,
			model: expired,
			holder: agent("later"),
		});
		// The lease lapses at 100 ms; the waiter sees it at its next look and pays the steal guard.
		await advanceLockTime(500);
		expect(await expiredTakeover).toMatchObject({ created: true, holder: { id: "later" } });
		expect(LOCK_WAIT_MS).toBeGreaterThan(ms("modelLock.lease"));

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
		await advanceLockTime(STEAL_GUARD_MS);
		expect(await unreadableTakeover).toMatchObject({ created: true });
	} finally {
		await cleanup();
	}
}, 30_000);
