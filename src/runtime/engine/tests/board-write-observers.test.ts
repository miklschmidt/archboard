import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as BoardModule from "../board.js";
import type * as BoardIoModule from "../board-io.js";
import type * as BoardStoreModule from "../board-store.js";
import type * as BoardWriteModule from "../board-write.js";

const root = mkdtempSync(join(tmpdir(), "archboard-board-observers-"));
const previousVault = process.env.ARCHBOARD_VAULT;
let boardModule: typeof BoardModule;
let ioModule: typeof BoardIoModule;
let storeModule: typeof BoardStoreModule;
let writeModule: typeof BoardWriteModule;

beforeAll(async () => {
	process.env.ARCHBOARD_VAULT = root;
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

function write(id: string, tellPanes: BoardWriteModule.TellPanes): Record<string, unknown> {
	const target = storeModule.getOrCreateBoard(boardModule.makeIdentity({ board: "observer-test" }));
	target.board.file = join(root, "observer-test.excalidraw.md");
	if (!target.board.baseline) {
		ioModule.writeBoardContent(target.board, ioModule.emptyContent(), {
			saveCommand: "board save",
		});
	}
	return writeModule.writeBoard(
		{
			source: target,
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

describe.serial("post-commit pane observers", () => {
	test("a throwing observer cannot change the persisted result", () => {
		const result = write("first", () => {
			throw new Error("socket failed");
		});
		expect(result).toMatchObject({ success: true, version: 2 });
		expect(readFileSync(join(root, "observer-test.excalidraw.md"), "utf8")).toContain(
			'"id": "first"',
		);
	});

	test("an unresolved asynchronous observer is not awaited", () => {
		const never = new Promise<void>(() => {});
		const result = write("second", (() => never) as BoardWriteModule.TellPanes);
		expect(result).toMatchObject({ success: true, version: 3 });
		expect(readFileSync(join(root, "observer-test.excalidraw.md"), "utf8")).toContain(
			'"id": "second"',
		);
	});
});
