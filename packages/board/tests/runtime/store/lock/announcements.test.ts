import { expect, jest, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lock from "#runtime/store/lock/lock.ts";
import { logger } from "@archboard/diagnostics/logger";
import { BOARD_LOCK_MS } from "@archboard/timing";

const vault = mkdtempSync(join(tmpdir(), "archboard-lock-news-"));
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
		lock.watchBoardLocks({ boards: () => [{ vault, board: "passenger" }] });
		jest.advanceTimersByTime(BOARD_LOCK_MS.watch);
		expect(
			warnings.some(([message]) => String(message).includes("lock watch continues")),
		).toBeTrue();
		lock.watchBoardLocks(null);
		lock.onBoardSweep(null);

		const news: Array<{ board: string; id: string | null; held: boolean }> = [];
		lock.onBoardLockChanged((_vault, board, holder) =>
			news.push({ board, id: holder?.id ?? null, held: holder !== null }),
		);
		await lock.holdBoard({
			vault,
			board: "broadcast",
			holder: { id: "pane", kind: "human" },
			waitMs: 0,
		});
		expect(news.at(-1)).toEqual({ board: "broadcast", id: "pane", held: true });
		const beforeRenew = news.length;
		await lock.holdBoard({
			vault,
			board: "broadcast",
			holder: { id: "pane", kind: "human" },
			waitMs: 0,
		});
		expect(news.length).toBe(beforeRenew);
		// Release news goes out with the release, not after a linger (TASK-153).
		lock.releaseHold(vault, "broadcast", "pane");
		expect(news.at(-1)).toEqual({ board: "broadcast", id: null, held: false });

		const start = news.length;
		for (let index = 0; index < 8; index += 1) {
			await lock.withBoardLock(
				{ vault, board: "broadcast", holder: { id: `fan-${index}`, kind: "agent" } },
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
		lock.releaseHold(vault, "broadcast", "pane");
		lock.releaseClaim(vault, "broadcast");
		lock.forgetLockAnnouncements();
		jest.useRealTimers();
		logger.warn = originalWarn;
		rmSync(vault, { recursive: true, force: true });
	}
}, 30_000);
