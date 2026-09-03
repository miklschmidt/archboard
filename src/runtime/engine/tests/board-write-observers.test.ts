import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as BoardModule from "../board.js";
import type * as BoardIoModule from "../board-io.js";
import type * as BoardStoreModule from "../board-store.js";
import type * as BoardWriteModule from "../board-write.js";
import type * as AtomicWriteModule from "../atomic-write.js";

const root = mkdtempSync(join(tmpdir(), "archboard-board-observers-"));
const previousVault = process.env.ARCHBOARD_VAULT;
let boardModule: typeof BoardModule;
let ioModule: typeof BoardIoModule;
let storeModule: typeof BoardStoreModule;
let writeModule: typeof BoardWriteModule;
let atomicWriteSpy: ReturnType<typeof spyOn>;

beforeAll(async () => {
	process.env.ARCHBOARD_VAULT = root;
	const atomicModule: typeof AtomicWriteModule = await import("../atomic-write.js");
	atomicWriteSpy = spyOn(atomicModule, "writeFileAtomic");
	boardModule = await import("../board.js");
	ioModule = await import("../board-io.js");
	storeModule = await import("../board-store.js");
	writeModule = await import("../board-write.js");
});

afterAll(() => {
	storeModule?.boards.delete("observer-test");
	if (previousVault === undefined) delete process.env.ARCHBOARD_VAULT;
	else process.env.ARCHBOARD_VAULT = previousVault;
	rmSync(root, { recursive: true, force: true });
});

function ownedTarget() {
	const owned = storeModule.getOrCreateBoard(boardModule.makeIdentity({ board: "observer-test" }));
	owned.board.file = join(root, "observer-test.excalidraw.md");
	if (!owned.board.baseline) {
		ioModule.writeBoardContent(owned.board, ioModule.emptyContent(), {
			saveCommand: "board save",
		});
	}
	return owned;
}

function write(id: string, tellPanes: BoardWriteModule.TellPanes): Record<string, unknown> {
	const owned = ownedTarget();
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
