import { expect, jest, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const previousVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-lock-news-"));
process.env["ARCHBOARD_VAULT"] = vault;
const lock = await import("../board-lock.ts");
const logger = (await import("../logger.ts")).logger;
const { LOCK_WATCH_MS } = await import("../../../shared/timing/timing.ts");
const originalWarn = logger.warn;

test("announcements isolate passenger failure and report release at once", async () => {
	jest.useFakeTimers();
	try {
		const warnings: unknown[][] = [];
		logger.warn = (...args: unknown[]) => {
			warnings.push(args);
			return logger;
		};
		lock.onBoardSweep(() => {
			throw new Error("note-watch fixture failed");
		});
		lock.watchBoardLocks(() => ["passenger"]);
		jest.advanceTimersByTime(LOCK_WATCH_MS);
		expect(
			warnings.some(([message]) => String(message).includes("lock watch continues")),
		).toBeTrue();
		lock.watchBoardLocks(null);
		lock.onBoardSweep(null);

		const news: Array<{ board: string; id: string | null; held: boolean }> = [];
		lock.onBoardLockChanged((board, holder) =>
			news.push({ board, id: holder?.id ?? null, held: holder !== null }),
		);
		await lock.holdBoard({
			board: "broadcast",
			holder: { id: "pane", kind: "human" },
			waitMs: 0,
		});
		expect(news.at(-1)).toEqual({ board: "broadcast", id: "pane", held: true });
		const beforeRenew = news.length;
		await lock.holdBoard({
			board: "broadcast",
			holder: { id: "pane", kind: "human" },
			waitMs: 0,
		});
		expect(news.length).toBe(beforeRenew);
		// Release news goes out with the release, not after a linger (TASK-153).
		lock.releaseHold("broadcast", "pane");
		expect(news.at(-1)).toEqual({ board: "broadcast", id: null, held: false });

		const start = news.length;
		for (let index = 0; index < 8; index += 1) {
			await lock.withBoardLock(
				{ board: "broadcast", holder: { id: `fan-${index}`, kind: "agent" } },
				() => undefined,
			);
		}
		const sequence = news.slice(start);
		expect(sequence.map((item) => item.held)).toEqual(
			Array.from({ length: 16 }, (_, index) => index % 2 === 0),
		);
	} finally {
		lock.watchBoardLocks(null);
		lock.onBoardSweep(null);
		lock.onBoardLockChanged(null);
		lock.releaseHold("broadcast", "pane");
		lock.releaseClaim("broadcast");
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
}, 10_000);
