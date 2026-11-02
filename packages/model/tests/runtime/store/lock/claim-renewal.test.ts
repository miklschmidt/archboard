import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lock from "#runtime/store/lock/lock.ts";
import { MODEL_LOCK_MS, CLAIM_MS } from "@archboard/timing";

// One server renews every claim it holds from timers, and a timer cannot run
// while the server does one long synchronous piece of work, such as drawing a
// model. Jumping the clock without running timers is that pause (TASK-489).

let vault = "";

beforeEach(() => {
	jest.useFakeTimers();
	vault = mkdtempSync(join(tmpdir(), "archboard-claim-renewal-"));
});

afterEach(() => {
	lock.forgetLockAnnouncements();
	jest.useRealTimers();
	rmSync(vault, { recursive: true, force: true });
});

/**
 * Let fake time pass in poll-sized steps, so awaited lock waits settle.
 * @param ms How long.
 */
async function advanceLockTime(ms: number): Promise<void> {
	for (let elapsed = 0; elapsed < ms; elapsed += MODEL_LOCK_MS.poll) {
		jest.advanceTimersByTime(Math.min(MODEL_LOCK_MS.poll, ms - elapsed));
		await Promise.resolve();
		await Promise.resolve();
	}
}

/**
 * The server doing one synchronous piece of work longer than a claim's lease:
 * the clock moves and no timer runs.
 */
function stallServer(): void {
	jest.setSystemTime(Date.now() + CLAIM_MS.lease + MODEL_LOCK_MS.renew);
}

/**
 * One write by the agent holding the model's claim, as the write path makes it.
 * @param board The model.
 * @returns When the write has landed.
 */
async function writeUnderClaim(model: string): Promise<void> {
	const id = lock.claimWriterId(vault, model);
	expect(id).not.toBeNull();
	const written = lock.withLease(
		{ vault, model, holder: { id: id!, kind: "agent", claimed: true }, waitMs: 0 },
		() => model,
	);
	await advanceLockTime(MODEL_LOCK_MS.stealGuard * 2);
	expect(await written).toBe(model);
}

test("claims on several models of one server stand through a stall while their holders write", async () => {
	const models = ["payments", "ledger", "queues", "audit"];
	const claims = new Map<string, lock.Claim>();
	for (const model of models) {
		const { claim } = await lock.claimModel({
			vault,
			model,
			reason: `rebuilding ${model}`,
			forMs: 600_000,
		});
		claims.set(model, claim);
	}
	for (let round = 0; round < 3; round += 1) {
		stallServer();
		// After the pause, half the holders' writes land before the late renewal
		// runs and half after it.
		await Promise.all(models.slice(0, 2).map(writeUnderClaim));
		await advanceLockTime(MODEL_LOCK_MS.renew);
		await Promise.all(models.slice(2).map(writeUnderClaim));
	}
	for (const model of models) {
		const claim = claims.get(model)!;
		expect(lock.takeClaimRevocation(vault, model)).toBeNull();
		expect(lock.claimOn(vault, model)?.holder.id).toBe(claim.holder.id);
		expect(lock.modelLockState(vault, model)).toMatchObject({
			id: claim.holder.id,
			since: claim.holder.since,
			claimed: true,
		});
		const rival = await lock
			.holdModel({ vault, model, holder: { id: `rival-${model}`, kind: "agent" }, waitMs: 0 })
			.catch((error: unknown) => error);
		expect(rival).toBeInstanceOf(lock.ModelHeldError);
	}
});

test("a claim that ends without a person names what its renewal found", async () => {
	const taken = "taken";
	const removed = "removed";
	for (const model of [taken, removed]) {
		await lock.claimModel({ vault, model, reason: "rebuilding", forMs: 600_000 });
	}
	// Another process took one lease over and holds it; the other lease is gone.
	const takenFile = join(vault, ".archboard/locks", `${taken}.lock`);
	const record = JSON.parse(readFileSync(takenFile, "utf8")) as Record<string, unknown>;
	writeFileSync(
		takenFile,
		JSON.stringify({ ...record, id: "elsewhere", claimed: false, token: "elsewhere-token" }),
	);
	rmSync(join(vault, ".archboard/locks", `${removed}.lock`));
	await advanceLockTime(MODEL_LOCK_MS.renew);

	expect(lock.claimOn(vault, taken)).toBeNull();
	expect(lock.takeClaimRevocation(vault, taken)).toMatchObject({
		cause: "held-by-another",
		by: { id: "elsewhere" },
	});
	expect(lock.claimOn(vault, removed)).toBeNull();
	expect(lock.takeClaimRevocation(vault, removed)).toMatchObject({ cause: "lease-gone", by: null });
});
