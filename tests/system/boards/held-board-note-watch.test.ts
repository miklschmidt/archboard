import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { beginHold, releaseHold } from "../../../src/runtime/engine/board-hold.ts";
import { emptyContent, writeBoardContent } from "../../../src/runtime/engine/board-io.ts";
import {
	boards,
	getOrCreateBoard,
	recordBaseline,
} from "../../../src/runtime/engine/board-store.ts";
import { hashBoardBytes, makeIdentity } from "../../../src/runtime/engine/board.ts";
import {
	versionNumber,
	type BoardWriteConflict,
} from "../../../src/runtime/engine/board-version.ts";
import { forgetNoteWatch, noteWrittenElsewhere } from "../../../src/runtime/engine/note-watch.ts";
import {
	TEST_NOTE_WATCH_CLEAR_TIMEOUT_MS,
	TEST_NOTE_WATCH_MESSAGE_POLL_MS,
	TEST_NOTE_WATCH_MESSAGE_TIMEOUT_MS,
	TEST_PANE_MESSAGE_POLL_MS,
} from "../../../src/shared/timing/timing.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import { openTestPane, type PaneMessage, type TestPane } from "./support/pane-websocket.ts";

interface BoardInfo {
	file: string;
}

interface WrittenElsewhere {
	board?: string;
	reason?: string;
	outcomes?: unknown;
	writes?: unknown;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-held-note-watch-"));
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;
let pane: TestPane | undefined;

beforeAll(async () => {
	canvas = await startOwnedCanvas({
		serverPath: path.join(repoRoot, "src/server.ts"),
		vault,
	});
	request = createJsonRequester(canvas);
});

afterAll(async () => {
	await pane?.close();
	await canvas?.dispose();
});

describe("held board note watch", () => {
	test("direct note watch tracks cache, conflict, hold, release, and baseline", () => {
		const directVault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-note-watch-direct-"));
		const identity = makeIdentity({ board: "notewatch-direct" });
		const { key, board } = getOrCreateBoard(identity);
		board.file = path.join(directVault, "notewatch-direct.excalidraw.md");
		forgetNoteWatch();
		try {
			expect(noteWrittenElsewhere(key)).toBeNull();
			writeBoardContent(board, emptyContent(), { saveCommand: "board save" });
			expect(noteWrittenElsewhere(key)).toBeNull();

			const pinned = new Date(Math.floor(Date.now() / 1_000) * 1_000);
			fs.utimesSync(board.file, pinned, pinned);
			noteWrittenElsewhere(key);
			const original = fs.readFileSync(board.file);
			const tweaked = Buffer.from(original);
			tweaked[tweaked.length - 1] = 0x20;
			fs.writeFileSync(board.file, tweaked);
			fs.utimesSync(board.file, pinned, pinned);
			const restored = fs.statSync(board.file);
			expect([restored.size, restored.mtimeMs, noteWrittenElsewhere(key)]).toEqual([
				original.length,
				pinned.getTime(),
				null,
			]);

			fs.writeFileSync(board.file, `${original.toString("utf8")}\n<!-- foreign -->\n`);
			const written = noteWrittenElsewhere(key);
			expect(written).toMatchObject({
				board: key,
				reason: "changed",
				versionMove: "unchanged",
				version: 1,
				ourVersion: 1,
			});
			expect(written?.writtenAt).toBeString();
			expect(written?.lastReadAt).toBeString();
			expect(written?.message).toBe(
				[
					`${board.file} has been written by something other than archboard since archboard last wrote it, so this pane is showing a board the vault no longer holds.`,
					"The note is still marked version 1, which archboard also wrote, so whatever wrote it does not keep that mark — Obsidian, a sync client or a text editor.",
					"Nothing has been written and nothing is lost: the next change to this board will be refused rather than saved over theirs.",
					"Take the note with `board open notewatch-direct --reload`, which discards what is on this canvas, or carry on drawing and choose when you are asked.",
					"Keep a board open in one editor at a time.",
				].join("\n"),
			);

			let conflict: BoardWriteConflict | undefined;
			try {
				writeBoardContent(board, emptyContent(), { saveCommand: "board save" });
			} catch (error) {
				conflict = (error as { conflict?: BoardWriteConflict }).conflict;
			}
			expect(conflict).toMatchObject({ board: key, reason: written?.reason });
			beginHold(key, conflict!, emptyContent());
			expect(noteWrittenElsewhere(key)).toBeNull();
			releaseHold(key);
			expect(noteWrittenElsewhere(key)?.reason).toBe("changed");

			const bytes = fs.readFileSync(board.file);
			recordBaseline(
				board,
				board.file,
				hashBoardBytes(bytes),
				versionNumber(bytes.toString("utf8")),
			);
			expect(noteWrittenElsewhere(key)).toBeNull();
		} finally {
			releaseHold(key);
			forgetNoteWatch();
			boards.delete(key);
			fs.rmSync(directVault, { recursive: true, force: true });
		}
	});

	test("notifies a pane once when its note changes and clears the mark on reload", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "watched" } });
		await request("/api/elements?board=watched", {
			method: "POST",
			body: { id: "seen1", type: "rectangle", x: 1, y: 1, width: 40, height: 40 },
		});
		pane = await openTestPane(canvas.base, request, "note-pane", 640, {
			primary: true,
			focused: true,
		});
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "watched", pane: "note-pane" },
		});
		await pane.adopt("watched");

		let arrivalNotes: PaneMessage[] = [];
		const arrivalDeadline = Date.now() + TEST_NOTE_WATCH_MESSAGE_TIMEOUT_MS;
		while (Date.now() < arrivalDeadline && arrivalNotes.length === 0) {
			arrivalNotes = pane.seen.filter(
				(message) => message.type === "board_note" && message.board === "watched",
			);
			if (arrivalNotes.length === 0) await Bun.sleep(TEST_NOTE_WATCH_MESSAGE_POLL_MS);
		}
		expect(arrivalNotes.length).toBeGreaterThan(0);
		expect(arrivalNotes.at(-1)?.writtenElsewhere).toBeNull();

		const file = (await request<BoardInfo>("/api/boards/info?board=watched")).body.file;
		const start = pane.since();
		fs.writeFileSync(file, `${fs.readFileSync(file, "utf8")}\n<!-- theirs -->\n`);
		let changed: PaneMessage | undefined;
		const deadline = Date.now() + TEST_NOTE_WATCH_MESSAGE_TIMEOUT_MS;
		while (Date.now() < deadline && !changed) {
			changed = pane.seen
				.slice(start)
				.find(
					(message) =>
						message.type === "board_note" &&
						(message.writtenElsewhere as WrittenElsewhere | null)?.reason === "changed",
				);
			if (!changed) await Bun.sleep(TEST_NOTE_WATCH_MESSAGE_POLL_MS);
		}
		expect(changed).toBeDefined();
		const writtenElsewhere = changed?.writtenElsewhere as WrittenElsewhere | null | undefined;
		expect(writtenElsewhere?.reason).toBe("changed");
		expect(writtenElsewhere?.board).toBe("watched");
		expect(
			pane.seen
				.slice(start)
				.filter((message) => message.type === "board_note" && message.writtenElsewhere !== null),
		).toHaveLength(1);
		expect(pane.seen.slice(start).some((message) => message.type === "board_hold")).toBeFalse();
		expect(writtenElsewhere?.outcomes).toBeUndefined();
		expect(writtenElsewhere?.writes).toBeUndefined();
		const locks = pane.seen
			.slice(start)
			.filter((message) => message.type === "board_lock" && message.board === "watched");
		expect(locks.at(-1)?.held).toBeFalse();

		await request("/api/boards/open", {
			method: "POST",
			body: { board: "watched", pane: "note-pane", reload: true },
		});
		const clearedDeadline = Date.now() + TEST_NOTE_WATCH_CLEAR_TIMEOUT_MS;
		while (
			Date.now() < clearedDeadline &&
			!pane.seen
				.slice(start)
				.some((message) => message.type === "board_note" && message.writtenElsewhere === null)
		) {
			await Bun.sleep(TEST_PANE_MESSAGE_POLL_MS);
		}
		expect(
			pane.seen
				.slice(start)
				.some((message) => message.type === "board_note" && message.writtenElsewhere === null),
		).toBeTrue();
	});
});
