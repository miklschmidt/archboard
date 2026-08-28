import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as BoardModule from "../board.js";
import type * as VersionModule from "../board-version.js";
import type * as StoreModule from "../board-store.js";
import type * as IoModule from "../board-io.js";
import type * as WatchModule from "../note-watch.js";
import type { ServerElement } from "../types.js";

const root = mkdtempSync(join(tmpdir(), "archboard-version-conflict-"));
const ownedKeys = new Set<string>();

let boardModule: typeof BoardModule;
let versionModule: typeof VersionModule;
let storeModule: typeof StoreModule;
let ioModule: typeof IoModule;
let watchModule: typeof WatchModule;

const box = (id: string, x: number) =>
	({ id, type: "rectangle", x, y: 10, width: 60, height: 40, version: 1 }) as ServerElement;
const contentOf = (...elements: ServerElement[]) => ({
	elements: new Map(elements.map((element) => [element.id, element])),
	files: new Map(),
});

beforeAll(async () => {
	boardModule = await import("../board.js");
	versionModule = await import("../board-version.js");
	storeModule = await import("../board-store.js");
	ioModule = await import("../board-io.js");
	watchModule = await import("../note-watch.js");
});

afterAll(() => {
	try {
		versionModule?.forgetRememberedVersions("board-version-conflict-");
		for (const key of ownedKeys) storeModule?.boards.delete(key);
		ownedKeys.clear();
		watchModule?.forgetNoteWatch();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

const ownBoard = (identity: ReturnType<typeof boardModule.makeIdentity>, filename: string) => {
	const owned = storeModule.getOrCreateBoard(identity);
	owned.board.file = join(root, filename);
	ownedKeys.add(owned.key);
	return owned as typeof owned & { board: typeof owned.board & { file: string } };
};

describe.serial("board version conflict diagnosis", () => {
	test("foreign, reverted, ahead, and unknown versions are distinct", () => {
		const identity = boardModule.makeIdentity({ board: "ledger-conflict" });
		const { board } = ownBoard(identity, "ledger-conflict.excalidraw.md");
		ioModule.writeBoardContent(board, contentOf(box("aaa", 10)), { saveCommand: "board save" });
		ioModule.writeBoardContent(board, contentOf(box("aaa", 10), box("bbb", 200)), {
			saveCommand: "board save",
		});
		const clean = readFileSync(board.file, "utf-8");

		writeFileSync(board.file, `${clean}\n<!-- somebody else was here -->\n`);
		const foreign = ioModule.foreignWriteTo(board.file, readFileSync(board.file));
		expect(foreign).toMatchObject({
			versionMove: "unchanged",
			expectedVersion: 2,
			actualVersion: 2,
		});

		let refusal: ReturnType<typeof ioModule.foreignWriteTo> = null;
		let refusalMessage = "";
		try {
			ioModule.writeBoardContent(board, contentOf(box("aaa", 10)), { saveCommand: "board save" });
		} catch (error) {
			refusal =
				(error as { conflict?: ReturnType<typeof ioModule.foreignWriteTo> }).conflict ?? null;
			refusalMessage = (error as Error).message;
		}
		expect(refusal).toMatchObject({
			versionMove: "unchanged",
			expectedVersion: 2,
			actualVersion: 2,
		});
		expect(refusalMessage).toMatch(/does not keep that mark/);

		writeFileSync(board.file, clean.replace(/^version: 2$/m, "version: 1"));
		expect(ioModule.foreignWriteTo(board.file, readFileSync(board.file))).toMatchObject({
			versionMove: "behind",
			expectedVersion: 2,
			actualVersion: 1,
		});

		writeFileSync(
			board.file,
			clean.replace(/^version: 2$/m, "version: 5").replace('"x": 10', '"x": 44'),
		);
		expect(ioModule.foreignWriteTo(board.file, readFileSync(board.file))).toMatchObject({
			versionMove: "ahead",
			expectedVersion: 2,
			actualVersion: 5,
		});
		expect(versionModule.versionMove(null, 5)).toBe("unknown");
		expect(versionModule.versionMove(2, null)).toBe("unknown");
	});

	test("note-watch marks reuse the same ahead and foreign diagnoses", () => {
		const identity = boardModule.makeIdentity({ board: "watched-version" });
		const { key, board } = ownBoard(identity, "watched-version.excalidraw.md");
		ioModule.writeBoardContent(board, contentOf(box("aaa", 10)), { saveCommand: "board save" });
		ioModule.writeBoardContent(board, contentOf(box("aaa", 10), box("bbb", 200)), {
			saveCommand: "board save",
		});
		const clean = readFileSync(board.file, "utf-8");

		writeFileSync(
			board.file,
			clean.replace(/^version: 2$/m, "version: 5").replace('"x": 10', '"x": 44'),
		);
		watchModule.forgetNoteWatch();
		const ahead = watchModule.noteWrittenElsewhere(key);
		expect(ahead).toMatchObject({ versionMove: "ahead", version: 5, ourVersion: 2 });
		expect(ahead?.message).toMatch(/another archboard wrote it 3 time\(s\)/);

		writeFileSync(board.file, `${clean}\n<!-- somebody else was here -->\n`);
		watchModule.forgetNoteWatch();
		const foreign = watchModule.noteWrittenElsewhere(key);
		expect(foreign?.versionMove).toBe("unchanged");
		expect(foreign?.message).toMatch(/does not keep that mark/);

		watchModule.forgetNoteWatch();
	});
});
