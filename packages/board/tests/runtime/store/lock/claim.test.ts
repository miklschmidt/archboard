import { expect, jest, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lock from "#runtime/store/lock/lock.ts";
import { logger } from "@archboard/diagnostics/logger";
import { BOARD_LOCK_MS, CLAIM_MS } from "@archboard/timing";

const vault = mkdtempSync(join(tmpdir(), "archboard-board-claim-"));
const originalWarn = logger.warn;
const boards = new Set<string>();
const agent = (id: string) => ({ id, kind: "agent" as const });
const human = (id: string) => ({ id, kind: "human" as const });

async function advanceLockTime(ms: number): Promise<void> {
	let elapsed = 0;
	while (elapsed < ms) {
		const step = Math.min(BOARD_LOCK_MS.poll, ms - elapsed);
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
			vault,
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
			.holdBoard({ vault, board, holder: agent("claimed-rival"), waitMs: 0 })
			.catch((error: unknown) => error);
		expect(claimedRefusal).toBeInstanceOf(lock.BoardHeldError);
		expect((claimedRefusal as Error).message).toContain(
			"held by an agent that has claimed it (redrawing the payment path)",
		);
		const since = first.claim.holder.since;
		let gaps = 0;
		for (let index = 0; index < 20; index += 1) {
			const writer = lock.claimWriterId(vault, board);
			expect(writer).toBe(first.claim.holder.id);
			expect(
				await lock.withBoardLock({ vault, board, holder: agent(writer!), waitMs: 0 }, () => index),
			).toBe(index);
			const rival = await lock
				.holdBoard({ vault, board, holder: agent(`rival-${index}`), waitMs: 0 })
				.catch((error: unknown) => error);
			if (!(rival instanceof lock.BoardHeldError)) {
				gaps += 1;
			}
		}
		expect(gaps).toBe(0);
		expect(lock.boardLockState(vault, board)?.since).toBe(since);
		const extended = await lock.claimBoard({
			vault,
			board,
			reason: "now the queues",
			forMs: 40_000,
		});
		expect(extended.created).toBeFalse();
		expect(extended.claim.holder.id).toBe(first.claim.holder.id);
		expect(extended.claim.holder.reason).toBe("now the queues");

		const camera = await lock
			.holdBoard({ vault, board, holder: human("camera"), waitMs: 0, revokeClaim: false })
			.catch((error: unknown) => error);
		expect(camera).toBeInstanceOf(lock.BoardHeldError);
		expect(lock.claimOn(vault, board)).not.toBeNull();
		const takeoverRequest = lock.holdBoard({
			vault,
			board,
			holder: human("user"),
			waitMs: 0,
			revokeClaim: true,
		});
		await advanceLockTime(BOARD_LOCK_MS.stealGuard);
		const takeover = await takeoverRequest;
		expect(takeover.holder.id).toBe("user");
		expect(lock.claimOn(vault, board)).toBeNull();
		expect(lock.takeClaimRevocation(vault, board)).toMatchObject({
			by: { id: "user" },
			claim: { holder: { reason: "now the queues" } },
		});
		expect(lock.takeClaimRevocation(vault, board)).toBeNull();
		lock.releaseHold(vault, board, "user");

		for (const mode of ["expired", "deleted"] as const) {
			const lapsed = `lapsed-${mode}`;
			boards.add(lapsed);
			await lock.claimBoard({ vault, board: lapsed, reason: "lapsed work", forMs: 60_000 });
			const file = join(vault, ".archboard/locks", `${lapsed}.lock`);
			if (mode === "expired") {
				const record = JSON.parse(readFileSync(file, "utf8")) as { until: string };
				record.until = new Date(Date.now() - 1_000).toISOString();
				writeFileSync(file, JSON.stringify(record));
			} else {
				rmSync(file);
			}
			const lapsedTakeover = lock.holdBoard({
				vault,
				board: lapsed,
				holder: human("user"),
				waitMs: 0,
				revokeClaim: true,
			});
			if (mode === "expired") {
				await advanceLockTime(BOARD_LOCK_MS.stealGuard);
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
		boards.add(idle);
		const idleClaim = await lock.claimBoard({
			vault,
			board: idle,
			reason: "reading",
			forMs: 60_000,
		});
		jest.advanceTimersByTime(BOARD_LOCK_MS.lease + 250);
		expect(lock.boardLockState(vault, idle)?.id).toBe(idleClaim.claim.holder.id);
		expect(lock.boardLockState(vault, idle)?.since).toBe(idleClaim.claim.holder.since);
		expect(lock.releaseClaim(vault, idle)).not.toBeNull();

		const brief = "brief";
		boards.add(brief);
		await lock.claimBoard({ vault, board: brief, reason: "a moment", forMs: CLAIM_MS.lease });
		jest.advanceTimersByTime(CLAIM_MS.lease);
		expect(lock.boardLockState(vault, brief)).toBeNull();
		expect(lock.claimOn(vault, brief)).toBeNull();
		expect(lock.releaseClaim(vault, brief)).toBeNull();

		const plain = "plain";
		boards.add(plain);
		await lock.holdBoard({ vault, board: plain, holder: agent("one-write"), waitMs: 0 });
		const refusal = lock
			.holdBoard({ vault, board: plain, holder: human("user"), waitMs: 100, revokeClaim: true })
			.catch((error: unknown) => error);
		await advanceLockTime(100);
		const plainRefusal = await refusal;
		expect(plainRefusal).toBeInstanceOf(lock.BoardHeldError);
		expect(lock.takeClaimRevocation(vault, plain)).toBeNull();
	} finally {
		lock.watchBoardLocks(null);
		lock.onBoardSweep(null);
		lock.onBoardLockChanged(null);
		for (const board of boards) {
			lock.releaseClaim(vault, board);
			for (const id of ["user", "camera", "one-write"]) {
				lock.releaseHold(vault, board, id);
			}
		}
		lock.forgetLockAnnouncements();
		jest.useRealTimers();
		logger.warn = originalWarn;
		rmSync(vault, { recursive: true, force: true });
	}
}, 45_000);
