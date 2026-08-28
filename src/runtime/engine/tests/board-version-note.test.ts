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

const root = mkdtempSync(join(tmpdir(), "archboard-version-note-"));
const ownedKeys = new Set<string>();

let boardModule: typeof BoardModule;
let versionModule: typeof VersionModule;
let storeModule: typeof StoreModule;
let ioModule: typeof IoModule;
let watchModule: typeof WatchModule;

const box = (id: string, x: number) =>
	({
		id,
		type: "rectangle",
		x,
		y: 10,
		width: 60,
		height: 40,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		version: 1,
	}) as ServerElement;
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
		versionModule?.forgetRememberedVersions("board-version-note-");
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

describe.serial("board versions in notes", () => {
	test("first and changed writes increment one frontmatter version", () => {
		const identity = boardModule.makeIdentity({ board: "ledger-note", level: "service" });
		const { board } = ownBoard(identity, "ledger-note.excalidraw.md");

		const first = ioModule.writeBoardContent(board, contentOf(box("aaa", 10)), {
			saveCommand: "board save",
		});
		const firstNote = readFileSync(board.file, "utf-8");
		expect(first.version).toBe(1);
		expect(firstNote).toMatch(/^version: 1$/m);
		expect(firstNote).toMatch(/^board: ledger-note$/m);
		expect(firstNote).toMatch(/^level: service$/m);
		expect(ioModule.readNote(board.file)?.version).toBe(1);

		const second = ioModule.writeBoardContent(board, contentOf(box("aaa", 10), box("bbb", 200)), {
			saveCommand: "board save",
		});
		const secondNote = readFileSync(board.file, "utf-8");
		expect(second.version).toBe(2);
		expect(versionModule.versionNumber(secondNote)).toBe(2);
		expect(secondNote.match(/^version: /gm)).toHaveLength(1);
		expect(versionModule.versionOfNoteAt(board.file)).toBe(2);
	});

	test("writing the same board preserves bytes and version", () => {
		const identity = boardModule.makeIdentity({ board: "same-document" });
		const { board } = ownBoard(identity, "same-document.excalidraw.md");
		const content = contentOf(box("aaa", 10), box("bbb", 200));
		ioModule.writeBoardContent(board, content, { saveCommand: "board save" });
		const before = readFileSync(board.file);
		const again = ioModule.writeBoardContent(board, content, { saveCommand: "board save" });
		expect(readFileSync(board.file)).toEqual(before);
		expect(again.version).toBe(1);
	});

	test("stated versions override remembered versions and refusals teach the writer", () => {
		const identity = boardModule.makeIdentity({ board: "precedence" });
		const { key, board } = ownBoard(identity, "precedence.excalidraw.md");
		ioModule.writeBoardContent(board, contentOf(box("one", 10)), { saveCommand: "board save" });
		ioModule.writeBoardContent(board, contentOf(box("one", 10), box("two", 20)), {
			saveCommand: "board save",
		});

		const writer = "board-version-note-writer";
		versionModule.rememberVersion(writer, 1);
		expect(
			versionModule.checkBoardVersion({
				board: key,
				file: board.file,
				writesNote: true,
				stated: 2,
				rememberedBy: writer,
			}),
		).toBeNull();
		const conflict = versionModule.checkBoardVersion({
			board: key,
			file: board.file,
			writesNote: true,
			rememberedBy: writer,
		});
		expect(conflict).toMatchObject({ expected: 1, actual: 2 });
		expect(versionModule.rememberedVersion(writer)).toBe(2);

		versionModule.forgetRememberedVersion(writer);
		expect(
			versionModule.checkBoardVersion({ board: key, file: board.file, writesNote: true }),
		).toBeNull();
	});

	test("a nonnumeric human version is preserved and remains unversioned", () => {
		const identity = boardModule.makeIdentity({ board: "theirs-note" });
		const { board } = ownBoard(identity, "theirs-note.excalidraw.md");
		ioModule.writeBoardContent(board, contentOf(box("ccc", 10)), { saveCommand: "board save" });
		const theirs = readFileSync(board.file, "utf-8").replace(
			/^version: 1$/m,
			"version: second draft",
		);
		writeFileSync(board.file, theirs);
		storeModule.recordBaseline(
			board,
			board.file,
			boardModule.hashBoardBytes(readFileSync(board.file)),
			null,
		);

		const written = ioModule.writeBoardContent(board, contentOf(box("ccc", 10), box("ddd", 200)), {
			saveCommand: "board save",
		});
		const note = readFileSync(board.file, "utf-8");
		expect(note).toMatch(/^version: second draft$/m);
		expect(written.version).toBeNull();
		expect(versionModule.versionNumber(note)).toBeNull();
		expect(note).toContain('"id": "ddd"');
	});
});
