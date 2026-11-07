import { expect, jest, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lock from "#runtime/lock/store/lock.ts";
import { logger } from "@archboard/diagnostics/logger";
import { MODEL_LOCK_MS, CLAIM_MS } from "@archboard/timing";

const vault = mkdtempSync(join(tmpdir(), "archboard-board-claim-"));
const originalWarn = logger.warn;
const models = new Set<string>();
const agent = (id: string) => ({ id, kind: "agent" as const });
const human = (id: string) => ({ id, kind: "human" as const });

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

test("claims keep one hold, renew, expire, and report both lapsed takeovers once", async () => {
	jest.useFakeTimers();
	try {
		const model = "claimed";
		models.add(model);
		const first = await lock.claimModel({
			vault,
			model,
			reason: "redrawing the payment path",
			forMs: 30_000,
		});
		expect(first.created).toBeTrue();
		expect(first.claim.holder).toMatchObject({
			claimed: true,
			reason: "redrawing the payment path",
		});
		const claimedRefusal = await lock
			.holdModel({ vault, model, holder: agent("claimed-rival"), waitMs: 0 })
			.catch((error: unknown) => error);
		expect(claimedRefusal).toBeInstanceOf(lock.ModelHeldError);
		expect((claimedRefusal as Error).message).toContain(
			"held by an agent that has claimed it (redrawing the payment path)",
		);
		const since = first.claim.holder.since;
		let gaps = 0;
		for (let index = 0; index < 20; index += 1) {
			const writer = lock.claimWriterId(vault, model);
			expect(writer).toBe(first.claim.holder.id);
			expect(
				await lock.withLease({ vault, model, holder: agent(writer!), waitMs: 0 }, () => index),
			).toBe(index);
			const rival = await lock
				.holdModel({ vault, model, holder: agent(`rival-${index}`), waitMs: 0 })
				.catch((error: unknown) => error);
			if (!(rival instanceof lock.ModelHeldError)) {
				gaps += 1;
			}
		}
		expect(gaps).toBe(0);
		expect(lock.modelLockState(vault, model)?.since).toBe(since);
		const extended = await lock.claimModel({
			vault,
			model,
			reason: "now the queues",
			forMs: 40_000,
		});
		expect(extended.created).toBeFalse();
		expect(extended.claim.holder.id).toBe(first.claim.holder.id);
		expect(extended.claim.holder.reason).toBe("now the queues");

		const camera = await lock
			.holdModel({ vault, model, holder: human("camera"), waitMs: 0, revokeClaim: false })
			.catch((error: unknown) => error);
		expect(camera).toBeInstanceOf(lock.ModelHeldError);
		expect(lock.claimOn(vault, model)).not.toBeNull();
		const takeoverRequest = lock.holdModel({
			vault,
			model,
			holder: human("user"),
			waitMs: 0,
			revokeClaim: true,
		});
		await advanceLockTime(MODEL_LOCK_MS.stealGuard);
		const takeover = await takeoverRequest;
		expect(takeover.holder.id).toBe("user");
		expect(lock.claimOn(vault, model)).toBeNull();
		expect(lock.takeClaimRevocation(vault, model)).toMatchObject({
			by: { id: "user" },
			claim: { holder: { reason: "now the queues" } },
		});
		expect(lock.takeClaimRevocation(vault, model)).toBeNull();
		lock.releaseHold(vault, model, "user");

		for (const mode of ["expired", "deleted"] as const) {
			const lapsed = `lapsed-${mode}`;
			models.add(lapsed);
			await lock.claimModel({ vault, model: lapsed, reason: "lapsed work", forMs: 60_000 });
			const file = join(vault, ".archboard/locks", `${lapsed}.lock`);
			if (mode === "expired") {
				const record = JSON.parse(readFileSync(file, "utf8")) as { until: string };
				record.until = new Date(Date.now() - 1_000).toISOString();
				writeFileSync(file, JSON.stringify(record));
			} else {
				rmSync(file);
			}
			const lapsedTakeover = lock.holdModel({
				vault,
				model: lapsed,
				holder: human("user"),
				waitMs: 0,
				revokeClaim: true,
			});
			if (mode === "expired") {
				await advanceLockTime(MODEL_LOCK_MS.stealGuard);
			}
			const taken = await lapsedTakeover;
			expect(taken.holder.id).toBe("user");
			expect(lock.claimOn(vault, lapsed)).toBeNull();
			expect(lock.takeClaimRevocation(vault, lapsed)).toMatchObject({
				by: { id: "user" },
				claim: { holder: { reason: "lapsed work" } },
			});
			expect(lock.takeClaimRevocation(vault, lapsed)).toBeNull();
			lock.releaseHold(vault, lapsed, "user");
		}

		const idle = "idle";
		models.add(idle);
		const idleClaim = await lock.claimModel({
			vault,
			model: idle,
			reason: "reading",
			forMs: 60_000,
		});
		jest.advanceTimersByTime(MODEL_LOCK_MS.lease + 250);
		expect(lock.modelLockState(vault, idle)?.id).toBe(idleClaim.claim.holder.id);
		expect(lock.modelLockState(vault, idle)?.since).toBe(idleClaim.claim.holder.since);
		expect(lock.releaseClaim(vault, idle)).not.toBeNull();

		const brief = "brief";
		models.add(brief);
		await lock.claimModel({ vault, model: brief, reason: "a moment", forMs: CLAIM_MS.lease });
		jest.advanceTimersByTime(CLAIM_MS.lease);
		expect(lock.modelLockState(vault, brief)).toBeNull();
		expect(lock.claimOn(vault, brief)).toBeNull();
		expect(lock.releaseClaim(vault, brief)).toBeNull();

		const plain = "plain";
		models.add(plain);
		await lock.holdModel({ vault, model: plain, holder: agent("one-write"), waitMs: 0 });
		const refusal = lock
			.holdModel({ vault, model: plain, holder: human("user"), waitMs: 100, revokeClaim: true })
			.catch((error: unknown) => error);
		await advanceLockTime(100);
		const plainRefusal = await refusal;
		expect(plainRefusal).toBeInstanceOf(lock.ModelHeldError);
		expect(lock.takeClaimRevocation(vault, plain)).toBeNull();
	} finally {
		lock.watchModelLocks(null);
		lock.onModelSweep(null);
		lock.onModelLockChanged(null);
		for (const model of models) {
			lock.releaseClaim(vault, model);
			for (const id of ["user", "camera", "one-write"]) {
				lock.releaseHold(vault, model, id);
			}
		}
		lock.forgetLockAnnouncements();
		jest.useRealTimers();
		logger.warn = originalWarn;
		rmSync(vault, { recursive: true, force: true });
	}
}, 45_000);
