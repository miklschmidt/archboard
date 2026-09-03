import { afterAll, beforeAll, describe, expect, jest, spyOn, test } from "bun:test";
import fs, { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as BoardModule from "../board.js";
import type * as BoardIoModule from "../board-io.js";
import type * as BoardStoreModule from "../board-store.js";
import type * as BoardWriteModule from "../board-write.js";
import type * as AtomicWriteModule from "../atomic-write.js";
import type * as BoardLockModule from "../board-lock.js";
import type * as TimingModule from "../../../shared/timing/timing.js";
import type * as LoggerModule from "../logger.js";
import type { ServerElement } from "../types.js";

const root = mkdtempSync(join(tmpdir(), "archboard-board-observers-"));
const previousVault = process.env.ARCHBOARD_VAULT;
let boardModule: typeof BoardModule;
let ioModule: typeof BoardIoModule;
let storeModule: typeof BoardStoreModule;
let writeModule: typeof BoardWriteModule;
let lockModule: typeof BoardLockModule;
let timingModule: typeof TimingModule;
let logger: typeof LoggerModule.default;
let atomicWriteSpy: ReturnType<typeof spyOn>;
const ownedKeys = new Set<string>();

const boxElement = (id: string) =>
	({
		id,
		type: "rectangle",
		x: 0,
		y: 0,
		width: 40,
		height: 40,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		version: 1,
	}) as ServerElement;

beforeAll(async () => {
	process.env.ARCHBOARD_VAULT = root;
	const atomicModule: typeof AtomicWriteModule = await import("../atomic-write.js");
	atomicWriteSpy = spyOn(atomicModule, "writeFileAtomic");
	boardModule = await import("../board.js");
	ioModule = await import("../board-io.js");
	storeModule = await import("../board-store.js");
	writeModule = await import("../board-write.js");
	lockModule = await import("../board-lock.js");
	timingModule = await import("../../../shared/timing/timing.js");
	logger = (await import("../logger.js")).default;
});

afterAll(() => {
	for (const key of ownedKeys) storeModule?.boards.delete(key);
	if (previousVault === undefined) delete process.env.ARCHBOARD_VAULT;
	else process.env.ARCHBOARD_VAULT = previousVault;
	rmSync(root, { recursive: true, force: true });
});

function ownedTarget(name = "observer-test") {
	const owned = storeModule.getOrCreateBoard(boardModule.makeIdentity({ board: name }));
	ownedKeys.add(owned.key);
	owned.board.file = join(root, `${name}.excalidraw.md`);
	if (!owned.board.baseline) {
		ioModule.writeBoardContent(owned.board, ioModule.emptyContent(), {
			saveCommand: "board save",
		});
	}
	return owned;
}

function handoffPath(board: string): string {
	return join(root, ".archboard", "locks", `${encodeURIComponent(board)}.lock.handoff`);
}

async function flushLockTurns(): Promise<void> {
	for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
}

function withFailingLockRename<T>(action: () => T): T {
	const originalRename = fs.renameSync.bind(fs);
	const renameSpy = spyOn(fs, "renameSync").mockImplementation((from, to) => {
		if (String(to).endsWith(".lock")) throw new Error("injected lease stamp rename failure");
		return originalRename(from, to);
	});
	const warnSpy = spyOn(logger, "warn").mockImplementation(() => undefined);
	try {
		const result = action();
		expect(warnSpy).toHaveBeenCalledTimes(1);
		return result;
	} finally {
		renameSpy.mockRestore();
		warnSpy.mockRestore();
	}
}

async function acquireAfterObservedPredecessor(options: {
	board: string;
	hash?: string;
	failStamp?: boolean;
	rewriteReceipt?: (file: string) => void;
}) {
	const predecessorId = `${options.board}-predecessor`;
	const successorId = `${options.board}-successor`;
	const predecessor = await lockModule.holdBoard({
		board: options.board,
		holder: { id: predecessorId, kind: "agent" },
		waitMs: 0,
	});
	const waiting = lockModule.holdBoard({
		board: options.board,
		holder: { id: successorId, kind: "agent" },
		waitMs: 1_000,
	});
	await flushLockTurns();
	if (options.failStamp) {
		withFailingLockRename(() =>
			expect(
				lockModule.recordLockCommit(
					options.board,
					predecessor.leaseToken,
					options.hash ?? "unrecorded-hash",
				),
			).toBeFalse(),
		);
	} else if (options.hash !== undefined) {
		expect(
			lockModule.recordLockCommit(options.board, predecessor.leaseToken, options.hash),
		).toBeTrue();
	}
	expect(lockModule.releaseHold(options.board, predecessorId)).toBeTrue();
	options.rewriteReceipt?.(handoffPath(options.board));
	jest.advanceTimersByTime(timingModule.LOCK_POLL_MS);
	await flushLockTurns();
	const successor = await waiting;
	expect(existsSync(handoffPath(options.board))).toBeFalse();
	return { hold: successor, release: () => lockModule.releaseHold(options.board, successorId) };
}

async function expectUnprovenFreshAcquire(board: string, id: string): Promise<void> {
	const acquired = await lockModule.holdBoard({
		board,
		holder: { id, kind: "agent" },
		waitMs: 0,
	});
	expect(acquired.predecessorHash, id).toBeUndefined();
	expect(existsSync(handoffPath(board)), id).toBeFalse();
	expect(lockModule.releaseHold(board, id), id).toBeTrue();
}

function write(
	id: string,
	tellPanes: BoardWriteModule.TellPanes,
	options: {
		target?: ReturnType<typeof ownedTarget>;
		afterPersist?: BoardWriteModule.BoardWriteRequest<string>["afterPersist"];
	} = {},
): Record<string, unknown> {
	const owned = options.target ?? ownedTarget();
	return writeModule.writeBoard(
		{
			source: owned,
			origin: "agent",
			mutation: writeModule.elementMutation(() => ({
				input: {
					upserts: [{ id, type: "rectangle", x: 0, y: 0, width: 40, height: 40 }],
					origin: "agent",
				},
				value: () => id,
			})),
			...(options.afterPersist ? { afterPersist: options.afterPersist } : {}),
			answer: ({ written }) => ({ success: true, version: written?.version }),
		},
		tellPanes,
	);
}

async function flushNotifications(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe.serial("post-commit pane observers", () => {
	test("returns one committed write before a synchronous observer runs", async () => {
		let observerClock = 0;
		ownedTarget();
		atomicWriteSpy.mockClear();
		const result = write("first", () => {
			observerClock += 1_000;
		});
		expect(result).toMatchObject({ success: true, version: 2 });
		expect(observerClock).toBe(0);
		expect(atomicWriteSpy).toHaveBeenCalledTimes(1);
		expect(readFileSync(join(root, "observer-test.excalidraw.md"), "utf8")).toContain(
			'"id": "first"',
		);
		await flushNotifications();
		expect(observerClock).toBe(1_000);
	});

	test("keeps a committed answer when lease proof stamping fails", async () => {
		const owned = ownedTarget("stamp-failure-answer");
		const beforeHash = owned.board.baseline!.hash;
		const beforeVersion = owned.board.baseline!.version;
		const holderId = "stamp-failure-holder";
		const hold = await lockModule.holdBoard({
			board: owned.key,
			holder: { id: holderId, kind: "agent" },
			waitMs: 0,
		});
		atomicWriteSpy.mockClear();
		const result = withFailingLockRename(() =>
			write("committed", () => undefined, {
				target: owned,
				afterPersist: ({ written }) => {
					if (written) {
						lockModule.recordLockCommit(owned.key, hold.leaseToken, written.hash);
					}
				},
			}),
		);
		expect(result).toEqual({ success: true, version: 2 });
		expect(atomicWriteSpy).toHaveBeenCalledTimes(1);
		const committed = readFileSync(owned.board.file);
		expect(committed.toString()).toMatch(/^version: 2$/m);
		expect(committed.toString()).toContain('"id": "committed"');
		expect(lockModule.releaseHold(owned.key, holderId)).toBeTrue();
		expect(existsSync(handoffPath(owned.key))).toBeFalse();

		storeModule.recordBaseline(owned.board, owned.board.file, beforeHash, beforeVersion);
		expect(() =>
			ioModule.writeBoardContent(owned.board, ioModule.readBoardContent(owned.board), {
				saveCommand: "board save",
			}),
		).toThrow(ioModule.BoardWriteConflictError);
		expect(atomicWriteSpy).toHaveBeenCalledTimes(1);
		expect(readFileSync(owned.board.file)).toEqual(committed);
	});

	test("rejects unproven, stale, and replayed lease receipts", async () => {
		jest.useFakeTimers();
		try {
			const rejectionTable = [
				{ name: "absent" },
				{
					name: "malformed",
					rewriteReceipt: (file: string) => writeFileSync(file, "{broken"),
				},
				{
					name: "identity",
					hash: "committed-hash",
					rewriteReceipt: (file: string) => {
						const receipt = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
						writeFileSync(file, JSON.stringify({ ...receipt, token: "different-lease" }));
					},
				},
				{ name: "stamp-failure", hash: "unrecorded-hash", failStamp: true },
			] as const;
			for (const proofCase of rejectionTable) {
				const successor = await acquireAfterObservedPredecessor({
					board: `proof-${proofCase.name}`,
					...(proofCase.hash ? { hash: proofCase.hash } : {}),
					...(proofCase.failStamp ? { failStamp: true } : {}),
					...(proofCase.rewriteReceipt ? { rewriteReceipt: proofCase.rewriteReceipt } : {}),
				});
				expect(successor.hold.predecessorHash, proofCase.name).toBeUndefined();
				expect(successor.release(), proofCase.name).toBeTrue();
			}

			const owned = ownedTarget("proof-external");
			const baseline = { ...owned.board.baseline! };
			const committed = ioModule.writeBoardContent(
				owned.board,
				{ elements: new Map([["archboard", boxElement("archboard")]]), files: new Map() },
				{ saveCommand: "board save" },
			);
			storeModule.recordBaseline(owned.board, baseline.file, baseline.hash, baseline.version);
			const hashMismatch = await acquireAfterObservedPredecessor({
				board: owned.key,
				hash: committed.hash,
			});
			const external = `${readFileSync(owned.board.file, "utf8")}\n<!-- external -->\n`;
			writeFileSync(owned.board.file, external);
			ioModule.materializeResolvedBoard(ioModule.resolveBoardNote(owned.key), {
				write: true,
				trustedPredecessorHash: hashMismatch.hold.predecessorHash,
			});
			expect(owned.board.baseline).toMatchObject(baseline);
			expect(readFileSync(owned.board.file, "utf8")).toBe(external);
			expect(hashMismatch.release()).toBeTrue();

			const replay = await acquireAfterObservedPredecessor({
				board: "proof-replay",
				hash: "one-use-hash",
			});
			expect(replay.hold.predecessorHash).toBe("one-use-hash");
			expect(replay.release()).toBeTrue();
			await expectUnprovenFreshAcquire("proof-replay", "replay-reader");

			const intermediateBoard = "proof-intermediate";
			const predecessor = await lockModule.holdBoard({
				board: intermediateBoard,
				holder: { id: "before-intermediate", kind: "agent" },
				waitMs: 0,
			});
			expect(
				lockModule.recordLockCommit(intermediateBoard, predecessor.leaseToken, "prior-hash"),
			).toBeTrue();
			expect(lockModule.releaseHold(intermediateBoard, "before-intermediate")).toBeTrue();
			for (const id of ["intermediate", "after-intermediate"]) {
				await expectUnprovenFreshAcquire(intermediateBoard, id);
			}
		} finally {
			jest.useRealTimers();
		}
	});

	test("schedules commit order without waiting for failures or unresolved delivery", async () => {
		const scheduled: string[] = [];
		const never = new Promise<void>(() => {});
		const observe = (message: { type: string; created?: Array<{ id: string }> }) => {
			const id = message.created?.[0]?.id ?? message.type;
			scheduled.push(id);
			if (id === "second") return never;
			if (id === "third") throw new Error("socket failed");
			if (id === "fourth") return Promise.reject(new Error("socket rejected"));
		};
		const second = write("second", observe as BoardWriteModule.TellPanes);
		const third = write("third", observe as BoardWriteModule.TellPanes);
		const fourth = write("fourth", observe as BoardWriteModule.TellPanes);
		expect([second.version, third.version, fourth.version]).toEqual([3, 4, 5]);
		expect(scheduled).toEqual([]);
		await flushNotifications();
		expect(scheduled).toEqual(["second", "third", "fourth"]);
		expect(readFileSync(join(root, "observer-test.excalidraw.md"), "utf8")).toContain(
			'"id": "fourth"',
		);
	});
});
