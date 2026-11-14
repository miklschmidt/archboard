import { afterAll, expect, jest, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lock from "#runtime/lock/store/lock.ts";
import { MODEL_LOCK_MS } from "#runtime/lock/constants/durations.ts";

const home = mkdtempSync(join(tmpdir(), "archboard-lock-vaults-"));

afterAll(() => {
	rmSync(home, { recursive: true, force: true });
});

// One server serves several vaults (ADR 0049), so a model of one name in two vaults is two models.
test("a model of one name in two vaults keeps its claim, lease and announcements apart", async () => {
	const vaultA = join(home, "a");
	const vaultB = join(home, "b");
	const told: Array<{ vault: string; model: string; held: boolean }> = [];
	lock.onModelLockChanged((vault, model, holder) => {
		told.push({ vault, model, held: holder !== null });
	});
	try {
		await lock.claimModel({
			vault: vaultA,
			model: "payments",
			reason: "reworking A",
			forMs: 30_000,
		});
		expect(lock.claimOn(vaultA, "payments")).not.toBeNull();
		expect(lock.claimOn(vaultB, "payments")).toBeNull();
		expect(lock.claimWriterId(vaultB, "payments")).toBeNull();

		// A writer in vault B is not blocked by the claim in vault A.
		const wrote = await lock.withLease(
			{ vault: vaultB, model: "payments", holder: { id: "writer-b", kind: "agent" }, waitMs: 0 },
			() => "written",
		);
		expect(wrote).toBe("written");
		expect(told.filter((item) => item.vault === vaultB && item.held)).not.toEqual([]);
	} finally {
		lock.releaseClaim(vaultA, "payments");
		lock.onModelLockChanged(null);
		lock.forgetLockAnnouncements();
	}
});

// A lease another server took is seen only by the sweep, which must read each model on screen
// in the vault its pane shows.
test("the lock sweep reads each model on screen in its own vault", async () => {
	const vaultA = join(home, "sweep-a");
	const vaultB = join(home, "sweep-b");
	await lock.holdModel({
		vault: vaultB,
		model: "payments",
		holder: { id: "another-server", kind: "agent" },
		waitMs: 0,
	});
	lock.forgetLockAnnouncements();
	const told: Array<{ vault: string; held: boolean }> = [];
	lock.onModelLockChanged((vault, _model, holder) => {
		told.push({ vault, held: holder !== null });
	});
	jest.useFakeTimers();
	try {
		lock.watchModelLocks({
			models: () => [
				{ vault: vaultA, model: "payments" },
				{ vault: vaultB, model: "Payments" },
			],
		});
		jest.advanceTimersByTime(MODEL_LOCK_MS.watch);
		expect(told).toEqual([
			{ vault: vaultA, held: false },
			{ vault: vaultB, held: true },
		]);
	} finally {
		lock.watchModelLocks(null);
		jest.useRealTimers();
		lock.onModelLockChanged(null);
		lock.releaseHold(vaultB, "payments", "another-server");
		lock.forgetLockAnnouncements();
	}
});
