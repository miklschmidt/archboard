import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "archboard-lock-vaults-"));
const previousVault = process.env["ARCHBOARD_VAULT"];
process.env["ARCHBOARD_VAULT"] = join(home, "unused");
const lock = await import("../board-lock.ts");
const { recentDoing, recordDoing, forgetDoing } = await import("../board-doing.ts");

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
		if (previousVault === undefined) {
			delete process.env["ARCHBOARD_VAULT"];
		} else {
			process.env["ARCHBOARD_VAULT"] = previousVault;
		}
		rmSync(home, { recursive: true, force: true });
	}
});
