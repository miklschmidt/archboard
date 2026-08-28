import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const previousVault = process.env.ARCHBOARD_VAULT;
const vault = mkdtempSync(join(tmpdir(), "archboard-board-claim-"));
process.env.ARCHBOARD_VAULT = vault;
const lock = await import("../board-lock.ts");
const logger = (await import("../logger.ts")).default;
const { CLAIM_LEASE_MS, LOCK_LEASE_MS } = await import("../../../shared/timing/timing.ts");
const originalWarn = logger.warn;
const boards = new Set<string>();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const agent = (id: string) => ({ id, kind: "agent" as const });
const human = (id: string) => ({ id, kind: "human" as const });

test("claims keep one hold, renew, expire, and report both lapsed takeovers once", async () => {
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
			if (!(rival instanceof lock.BoardHeldError)) gaps += 1;
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
		const takeover = await lock.holdBoard({
			board,
			holder: human("person"),
			waitMs: 0,
			revokeClaim: true,
		});
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
			} else rmSync(file);
			const taken = await lock.holdBoard({
				board: lapsed,
				holder: human("person"),
				waitMs: 0,
				revokeClaim: true,
			});
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
		await sleep(LOCK_LEASE_MS + 250);
		expect(lock.boardLockState(idle)?.id).toBe(idleClaim.claim.holder.id);
		expect(lock.boardLockState(idle)?.since).toBe(idleClaim.claim.holder.since);
		expect(lock.releaseClaim(idle)).not.toBeNull();

		const brief = "brief";
		boards.add(brief);
		await lock.claimBoard({ board: brief, reason: "a moment", forMs: CLAIM_LEASE_MS });
		const deadline = Date.now() + CLAIM_LEASE_MS + 2_000;
		while (lock.boardLockState(brief) && Date.now() < deadline) await sleep(50);
		expect(lock.boardLockState(brief)).toBeNull();
		expect(lock.claimOn(brief)).toBeNull();
		expect(lock.releaseClaim(brief)).toBeNull();

		const plain = "plain";
		boards.add(plain);
		await lock.holdBoard({ board: plain, holder: agent("one-write"), waitMs: 0 });
		const plainRefusal = await lock
			.holdBoard({
				board: plain,
				holder: human("person"),
				waitMs: 100,
				revokeClaim: true,
			})
			.catch((error: unknown) => error);
		expect(plainRefusal).toBeInstanceOf(lock.BoardHeldError);
		expect(lock.takeClaimRevocation(plain)).toBeNull();
	} finally {
		lock.watchBoardLocks(null);
		lock.onBoardSweep(null);
		lock.onBoardLockChanged(null);
		for (const board of boards) {
			lock.releaseClaim(board);
			for (const id of ["person", "camera", "one-write"]) lock.releaseHold(board, id);
		}
		lock.forgetLockAnnouncements();
		logger.warn = originalWarn;
		if (previousVault === undefined) delete process.env.ARCHBOARD_VAULT;
		else process.env.ARCHBOARD_VAULT = previousVault;
		rmSync(vault, { recursive: true, force: true });
	}
}, 15_000);
