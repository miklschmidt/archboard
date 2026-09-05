import { expect, jest, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const previousVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-board-claim-"));
process.env["ARCHBOARD_VAULT"] = vault;
const lock = await import("../board-lock.ts");
const logger = (await import("../logger.ts")).default;
const { CLAIM_LEASE_MS, LOCK_LEASE_MS, LOCK_POLL_MS, LOCK_STEAL_GUARD_MS } =
	await import("../../../shared/timing/timing.ts");
const originalWarn = logger.warn;
const boards = new Set<string>();
const agent = (id: string) => ({ id, kind: "agent" as const });
const human = (id: string) => ({ id, kind: "human" as const });

async function advanceLockTime(ms: number): Promise<void> {
	let elapsed = 0;
	while (elapsed < ms) {
		const step = Math.min(LOCK_POLL_MS, ms - elapsed);
		jest.advanceTimersByTime(step);
		await Promise.resolve();
		await Promise.resolve();
		elapsed += step;
	}
}

test("claims keep one hold, renew, expire, and report both lapsed takeovers once", async () => {
	jest.useFakeTimers();
	try {
		const board = "claimed";
		boards.add(board);
		const first = await lock.claimBoard({
			board,
			reason: "redrawing the payment path",
			forMs: 30_000,
		});
		expect(first.created).toBeTrue();
		expect(first.claim.holder).toMatchObject({
			claimed: true,
			reason: "redrawing the payment path",
		});
		const claimedRefusal = await lock
			.holdBoard({ board, holder: agent("claimed-rival"), waitMs: 0 })
			.catch((error: unknown) => error);
		expect(claimedRefusal).toBeInstanceOf(lock.BoardHeldError);
		expect((claimedRefusal as Error).message).toContain(
			"held by an agent that has claimed it (redrawing the payment path)",
		);
		const since = first.claim.holder.since;
		let gaps = 0;
		for (let index = 0; index < 20; index += 1) {
			const writer = lock.claimWriterId(board);
			expect(writer).toBe(first.claim.holder.id);
			expect(
				await lock.withBoardLock({ board, holder: agent(writer!), waitMs: 0 }, () => index),
			).toBe(index);
			const rival = await lock
				.holdBoard({ board, holder: agent(`rival-${index}`), waitMs: 0 })
				.catch((error: unknown) => error);
			if (!(rival instanceof lock.BoardHeldError)) {
				gaps += 1;
			}
		}
		expect(gaps).toBe(0);
		expect(lock.boardLockState(board)?.since).toBe(since);
		const extended = await lock.claimBoard({ board, reason: "now the queues", forMs: 40_000 });
		expect(extended.created).toBeFalse();
		expect(extended.claim.holder.id).toBe(first.claim.holder.id);
		expect(extended.claim.holder.reason).toBe("now the queues");

		const camera = await lock
			.holdBoard({ board, holder: human("camera"), waitMs: 0, revokeClaim: false })
			.catch((error: unknown) => error);
		expect(camera).toBeInstanceOf(lock.BoardHeldError);
		expect(lock.claimOn(board)).not.toBeNull();
		const takeoverRequest = lock.holdBoard({
			board,
			holder: human("person"),
			waitMs: 0,
			revokeClaim: true,
		});
		await advanceLockTime(LOCK_STEAL_GUARD_MS);
		const takeover = await takeoverRequest;
		expect(takeover.holder.id).toBe("person");
		expect(lock.claimOn(board)).toBeNull();
		expect(lock.takeClaimRevocation(board)).toMatchObject({
			by: { id: "person" },
			claim: { holder: { reason: "now the queues" } },
		});
		expect(lock.takeClaimRevocation(board)).toBeNull();
		lock.releaseHold(board, "person");

		for (const mode of ["expired", "deleted"] as const) {
			const lapsed = `lapsed-${mode}`;
			boards.add(lapsed);
			await lock.claimBoard({ board: lapsed, reason: "lapsed work", forMs: 60_000 });
			const file = join(vault, ".archboard/locks", `${lapsed}.lock`);
			if (mode === "expired") {
				const record = JSON.parse(readFileSync(file, "utf8")) as { until: string };
				record.until = new Date(Date.now() - 1_000).toISOString();
				writeFileSync(file, JSON.stringify(record));
			} else {
				rmSync(file);
			}
			const lapsedTakeover = lock.holdBoard({
				board: lapsed,
				holder: human("person"),
				waitMs: 0,
				revokeClaim: true,
			});
			if (mode === "expired") {
				await advanceLockTime(LOCK_STEAL_GUARD_MS);
			}
			const taken = await lapsedTakeover;
			expect(taken.holder.id).toBe("person");
			expect(lock.claimOn(lapsed)).toBeNull();
			expect(lock.takeClaimRevocation(lapsed)).toMatchObject({
				by: { id: "person" },
				claim: { holder: { reason: "lapsed work" } },
			});
			expect(lock.takeClaimRevocation(lapsed)).toBeNull();
			lock.releaseHold(lapsed, "person");
		}

		const idle = "idle";
		boards.add(idle);
		const idleClaim = await lock.claimBoard({ board: idle, reason: "reading", forMs: 60_000 });
		jest.advanceTimersByTime(LOCK_LEASE_MS + 250);
		expect(lock.boardLockState(idle)?.id).toBe(idleClaim.claim.holder.id);
		expect(lock.boardLockState(idle)?.since).toBe(idleClaim.claim.holder.since);
		expect(lock.releaseClaim(idle)).not.toBeNull();

		const brief = "brief";
		boards.add(brief);
		await lock.claimBoard({ board: brief, reason: "a moment", forMs: CLAIM_LEASE_MS });
		jest.advanceTimersByTime(CLAIM_LEASE_MS);
		expect(lock.boardLockState(brief)).toBeNull();
		expect(lock.claimOn(brief)).toBeNull();
		expect(lock.releaseClaim(brief)).toBeNull();

		const plain = "plain";
		boards.add(plain);
		await lock.holdBoard({ board: plain, holder: agent("one-write"), waitMs: 0 });
		const refusal = lock
			.holdBoard({
				board: plain,
				holder: human("person"),
				waitMs: 100,
				revokeClaim: true,
			})
			.catch((error: unknown) => error);
		await advanceLockTime(100);
		const plainRefusal = await refusal;
		expect(plainRefusal).toBeInstanceOf(lock.BoardHeldError);
		expect(lock.takeClaimRevocation(plain)).toBeNull();
	} finally {
		lock.watchBoardLocks(null);
		lock.onBoardSweep(null);
		lock.onBoardLockChanged(null);
		for (const board of boards) {
			lock.releaseClaim(board);
			for (const id of ["person", "camera", "one-write"]) {
				lock.releaseHold(board, id);
			}
		}
		lock.forgetLockAnnouncements();
		jest.useRealTimers();
		logger.warn = originalWarn;
		if (previousVault === undefined) {
			delete process.env["ARCHBOARD_VAULT"];
		} else {
			process.env["ARCHBOARD_VAULT"] = previousVault;
		}
		rmSync(vault, { recursive: true, force: true });
	}
}, 15_000);
