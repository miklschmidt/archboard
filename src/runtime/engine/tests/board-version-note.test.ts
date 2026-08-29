import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as BoardModule from "../board.js";
import type * as VersionModule from "../board-version.js";
import type * as StoreModule from "../board-store.js";
import type * as IoModule from "../board-io.js";
import type * as WatchModule from "../note-watch.js";
import type { ServerElement } from "../types.js";
import { extractSceneJsonFromObsidianMd } from "../obsidian-md.js";
import { applyElementInput, HumanElementChangeSchema } from "../apply-element-input.js";
import { presentElement } from "../presentation.js";
import { completeElement } from "./support/elements.js";

const root = mkdtempSync(join(tmpdir(), "archboard-version-note-"));
const ownedKeys = new Set<string>();

let boardModule: typeof BoardModule;
let versionModule: typeof VersionModule;
let storeModule: typeof StoreModule;
let ioModule: typeof IoModule;
let watchModule: typeof WatchModule;
let atomicWriteSpy: { mockClear(): void; mock: { calls: unknown[][] } };

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
	const atomic = await import("../atomic-write.js");
	atomicWriteSpy = spyOn(atomic, "writeFileAtomic") as unknown as typeof atomicWriteSpy;
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

	test("legacy tracking migrates only inside the next one-write mutation", () => {
		const identity = boardModule.makeIdentity({ board: "tracking-migration" });
		const { board } = ownBoard(identity, "tracking-migration.excalidraw.md");
		ioModule.writeBoardContent(board, contentOf(box("legacy", 10)), { saveCommand: "board save" });
		const note = readFileSync(board.file, "utf8");
		const scene = JSON.parse(extractSceneJsonFromObsidianMd(note)) as {
			elements: Array<Record<string, unknown>>;
		};
		const legacy = scene.elements[0]!;
		const custom = legacy.customData as { archboard: Record<string, unknown> };
		for (const key of ["createdAt", "updatedAt", "syncedAt", "source", "syncTimestamp"]) {
			if (custom.archboard[key] !== undefined) legacy[key] = custom.archboard[key];
			delete custom.archboard[key];
		}
		if (Object.keys(custom.archboard).length === 0) delete legacy.customData;
		const legacyNote = boardModule.renderBoardNote(scene, note, identity);
		writeFileSync(board.file, legacyNote);
		storeModule.recordBaseline(
			board,
			board.file,
			boardModule.hashBoardBytes(readFileSync(board.file)),
			1,
		);

		const before = readFileSync(board.file);
		const beforeMtime = statSync(board.file).mtimeMs;
		const read = ioModule.readNote(board.file)!;
		expect(read.elements.get("legacy")?.createdAt).toBe("2026-01-01T00:00:00.000Z");
		expect(readFileSync(board.file)).toEqual(before);
		expect(statSync(board.file).mtimeMs).toBe(beforeMtime);
		expect(read.version).toBe(1);

		read.elements.set("requested", box("requested", 200));
		atomicWriteSpy.mockClear();
		const written = ioModule.writeBoardContent(board, read, { saveCommand: "board save" });
		expect(atomicWriteSpy.mock.calls).toHaveLength(1);
		expect(written.version).toBe(2);
		const reread = ioModule.readNote(board.file)!;
		expect(reread.version).toBe(2);
		expect(reread.elements.has("requested")).toBeTrue();
		const migrated = reread.elements.get("legacy")!;
		expect(migrated.createdAt).toBe("2026-01-01T00:00:00.000Z");
		const persistedScene = JSON.parse(
			extractSceneJsonFromObsidianMd(readFileSync(board.file, "utf8")),
		);
		const persisted = persistedScene.elements.find(
			(element: { id: string }) => element.id === "legacy",
		);
		expect(persisted).not.toHaveProperty("createdAt");
		expect(persisted.customData.archboard.createdAt).toBe("2026-01-01T00:00:00.000Z");
	});

	test("an incomplete trusted note refuses without repair, version, or atomic write", () => {
		const identity = boardModule.makeIdentity({ board: "strict-read" });
		const { board } = ownBoard(identity, "strict-read.excalidraw.md");
		ioModule.writeBoardContent(board, contentOf(box("strict", 10)), { saveCommand: "board save" });
		const note = readFileSync(board.file, "utf8");
		const scene = JSON.parse(extractSceneJsonFromObsidianMd(note)) as {
			elements: Array<Record<string, unknown>>;
		};
		delete scene.elements[0]!.angle;
		const malformed = boardModule.renderBoardNote(scene, note, identity);
		writeFileSync(board.file, malformed);
		const before = readFileSync(board.file);
		const beforeMtime = statSync(board.file).mtimeMs;
		atomicWriteSpy.mockClear();
		expect(() => ioModule.readNote(board.file)).toThrow(
			`${board.file}: invalid element strict (rectangle) at element.angle`,
		);
		expect(atomicWriteSpy.mock.calls).toHaveLength(0);
		expect(readFileSync(board.file)).toEqual(before);
		expect(statSync(board.file).mtimeMs).toBe(beforeMtime);
		expect(versionModule.versionNumber(readFileSync(board.file, "utf8"))).toBe(1);
	});

	test("binding aliases and extensions are spent before one real write and trusted reread", () => {
		const identity = boardModule.makeIdentity({ board: "binding-ingress" });
		const { board } = ownBoard(identity, "binding-ingress.excalidraw.md");
		const content = contentOf(
			completeElement({ id: "left", type: "rectangle", x: 0, y: 0, width: 40, height: 40 }),
			completeElement({ id: "right", type: "rectangle", x: 200, y: 0, width: 40, height: 40 }),
		);
		applyElementInput(content.elements, {
			origin: "agent",
			upserts: [
				{
					id: "joined",
					type: "arrow",
					x: 40,
					y: 20,
					startBinding: { elementId: "left", focus: 0, gap: 4, mode: "inside" },
					endBinding: { elementId: "right", focus: 0.5, gap: 8, mode: "outside" },
				},
			],
		});
		atomicWriteSpy.mockClear();
		ioModule.writeBoardContent(board, content, { saveCommand: "board save" });
		expect(atomicWriteSpy.mock.calls).toHaveLength(1);
		const note = readFileSync(board.file, "utf8");
		expect(note).not.toContain('"mode"');
		const persisted = (
			JSON.parse(extractSceneJsonFromObsidianMd(note)) as {
				elements: Array<Record<string, unknown>>;
			}
		).elements.find((element) => element.id === "joined")!;
		for (const end of ["startBinding", "endBinding"] as const)
			expect(Object.keys(persisted[end] as object).toSorted()).toEqual([
				"elementId",
				"focus",
				"gap",
			]);
		const reread = ioModule.readNote(board.file)!.elements.get("joined")!;
		expect(reread.type).toBe("arrow");
		if (reread.type !== "arrow") throw new Error("reread did not retain the arrow");
		expect(reread.startBinding).toMatchObject({ elementId: "left", focus: 0, gap: 4 });
		expect(reread.endBinding).toMatchObject({ elementId: "right", focus: 0.5, gap: 8 });
	});

	test("an opaque presentation link never enters canonical note bytes", () => {
		const identity = boardModule.makeIdentity({ board: "opaque-link" });
		const { board } = ownBoard(identity, "opaque-link.excalidraw.md");
		const humanLink = "https://human.example/architecture-note";
		const opaqueTarget = "opaque:resolver-owned-target";
		const canonical = completeElement({
			id: "bound",
			type: "rectangle",
			x: 0,
			y: 0,
			width: 100,
			height: 50,
			link: humanLink,
			customData: { archboard: { binding: { repo: "opaque", path: "opaque" } } },
		});
		ioModule.writeBoardContent(board, contentOf(canonical), { saveCommand: "board save" });
		const loaded = ioModule.readNote(board.file)!;
		const presented = presentElement(loaded.elements.get("bound")!, opaqueTarget);
		applyElementInput(loaded.elements, {
			origin: "human",
			upserts: [HumanElementChangeSchema.parse(presented)],
			presentationLinks: new Map([["bound", opaqueTarget]]),
		});
		ioModule.writeBoardContent(board, loaded, { saveCommand: "board save" });
		const note = readFileSync(board.file, "utf8");
		expect(note).not.toContain(opaqueTarget);
		expect(note).toContain(humanLink);
		const persisted = (
			JSON.parse(extractSceneJsonFromObsidianMd(note)) as {
				elements: Array<{ id: string; link: string | null }>;
			}
		).elements.find((element) => element.id === "bound")!;
		expect(persisted.link).toBe(humanLink);
		expect(ioModule.readNote(board.file)!.elements.get("bound")?.link).toBe(humanLink);
		const beforeIdempotentWrite = readFileSync(board.file);
		ioModule.writeBoardContent(board, loaded, { saveCommand: "board save" });
		expect(readFileSync(board.file)).toEqual(beforeIdempotentWrite);
	});
});
