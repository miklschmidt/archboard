import { afterAll, expect, jest, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lock from "#runtime/store/lock/lock.ts";
import { forgetDoing, recentDoing, recordDoing } from "#runtime/store/doing.ts";
import { BOARD_LOCK_MS } from "@archboard/timing";

const home = mkdtempSync(join(tmpdir(), "archboard-lock-vaults-"));

afterAll(() => {
	rmSync(home, { recursive: true, force: true });
});

// One server serves several vaults (ADR 0049), so a board of one name in two vaults is two boards.
test("a board of one name in two vaults keeps its claim, lease, announcements and doing line apart", async () => {
	const vaultA = join(home, "a");
	const vaultB = join(home, "b");
	const told: Array<{ vault: string; board: string; held: boolean }> = [];
	lock.onBoardLockChanged((vault, board, holder) => {
		told.push({ vault, board, held: holder !== null });
	});
	try {
		await lock.claimBoard({
			vault: vaultA,
			board: "payments",
			reason: "reworking A",
			forMs: 30_000,
		});
		expect(lock.claimOn(vaultA, "payments")).not.toBeNull();
		expect(lock.claimOn(vaultB, "payments")).toBeNull();
		expect(lock.claimWriterId(vaultB, "payments")).toBeNull();

		// A writer in vault B is not blocked by the claim in vault A.
		const wrote = await lock.withBoardLock(
			{ vault: vaultB, board: "payments", holder: { id: "writer-b", kind: "agent" }, waitMs: 0 },
			() => "written",
		);
		expect(wrote).toBe("written");
		expect(told.filter((item) => item.vault === vaultB && item.held)).not.toEqual([]);

		recordDoing(vaultA, "payments", {
			doing: "reworking A",
			at: "2026-10-15T00:00:00.000Z",
			by: "writer-a",
			kind: "agent",
		});
		expect(recentDoing(vaultA, "payments")).toHaveLength(1);
		expect(recentDoing(vaultB, "payments")).toEqual([]);
	} finally {
		lock.releaseClaim(vaultA, "payments");
		lock.onBoardLockChanged(null);
		lock.forgetLockAnnouncements();
		forgetDoing();
	}
});

// A lease another server took is seen only by the sweep, which must read each board on screen
// in the vault its pane shows.
test("the lock sweep reads each board on screen in its own vault", async () => {
	const vaultA = join(home, "sweep-a");
	const vaultB = join(home, "sweep-b");
	await lock.holdBoard({
		vault: vaultB,
		board: "payments",
		holder: { id: "another-server", kind: "agent" },
		waitMs: 0,
	});
	lock.forgetLockAnnouncements();
	const told: Array<{ vault: string; held: boolean }> = [];
	lock.onBoardLockChanged((vault, _board, holder) => {
		told.push({ vault, held: holder !== null });
	});
	jest.useFakeTimers();
	try {
		lock.watchBoardLocks({
			boards: () => [
				{ vault: vaultA, board: "payments" },
				{ vault: vaultB, board: "Payments" },
			],
		});
		jest.advanceTimersByTime(BOARD_LOCK_MS.watch);
		expect(told).toEqual([
			{ vault: vaultA, held: false },
			{ vault: vaultB, held: true },
		]);
	} finally {
		lock.watchBoardLocks(null);
		jest.useRealTimers();
		lock.onBoardLockChanged(null);
		lock.releaseHold(vaultB, "payments", "another-server");
		lock.forgetLockAnnouncements();
	}
});
