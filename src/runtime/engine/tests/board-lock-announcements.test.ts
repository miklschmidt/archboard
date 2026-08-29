import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const previousVault = process.env.ARCHBOARD_VAULT;
const vault = mkdtempSync(join(tmpdir(), "archboard-lock-news-"));
process.env.ARCHBOARD_VAULT = vault;
const lock = await import("../board-lock.ts");
const logger = (await import("../logger.ts")).default;
const { LOCK_FREE_LINGER_MS, LOCK_WATCH_MS } = await import("../../../shared/timing/timing.ts");
const originalWarn = logger.warn;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("announcements isolate passenger failure and coalesce free news", async () => {
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
		await sleep(LOCK_WATCH_MS + 100);
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
		lock.releaseHold("broadcast", "pane");
		expect(news.at(-1)?.held).toBeTrue();
		await sleep(LOCK_FREE_LINGER_MS + 150);
		expect(news.at(-1)?.held).toBeFalse();

		const start = news.length;
		for (let index = 0; index < 8; index += 1) {
			await lock.withBoardLock(
				{ board: "broadcast", holder: { id: `fan-${index}`, kind: "agent" } },
				() => undefined,
			);
			await sleep(5);
		}
		await sleep(LOCK_FREE_LINGER_MS + 150);
		const sequence = news.slice(start);
		const flips = sequence.filter(
			(item, index) => index > 0 && item.held !== sequence[index - 1]?.held,
		).length;
		expect(flips).toBe(1);
		expect(sequence.at(-1)?.held).toBeFalse();
	} finally {
		lock.watchBoardLocks(null);
		lock.onBoardSweep(null);
		lock.onBoardLockChanged(null);
		lock.releaseHold("broadcast", "pane");
		lock.releaseClaim("broadcast");
		lock.forgetLockAnnouncements();
		logger.warn = originalWarn;
		if (previousVault === undefined) delete process.env.ARCHBOARD_VAULT;
		else process.env.ARCHBOARD_VAULT = previousVault;
		rmSync(vault, { recursive: true, force: true });
	}
}, 10_000);
