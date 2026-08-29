import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type * as BoardModule from "../../../src/runtime/engine/board.ts";
import type * as IoModule from "../../../src/runtime/engine/board-io.ts";
import type { BoardState } from "../../../src/runtime/engine/board-store.ts";
import type { ServerElement } from "../../../src/runtime/engine/types.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";

interface ErrorBody {
	error?: string;
}

interface BoardBody {
	file: string;
}

interface ElementsBody {
	count: number;
	elements: Array<{ id: string }>;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const callerVault = process.env.ARCHBOARD_VAULT;
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-malformed-input-"));
// The direct engine calls below share this test process. Configure their vault
// before config.ts is first evaluated; the canvas child still receives it explicitly.
process.env.ARCHBOARD_VAULT = vault;
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;
let configuredVault: string | undefined;
let makeIdentity: typeof BoardModule.makeIdentity;
let renderBoardNote: typeof BoardModule.renderBoardNote;
let vaultPathFor: typeof BoardModule.vaultPathFor;
let readBoardContent: typeof IoModule.readBoardContent;
let writeBoardContent: typeof IoModule.writeBoardContent;

beforeAll(async () => {
	({ makeIdentity, renderBoardNote, vaultPathFor } =
		await import("../../../src/runtime/engine/board.ts"));
	({ readBoardContent, writeBoardContent } =
		await import("../../../src/runtime/engine/board-io.ts"));
	configuredVault = (await import("../../../src/runtime/engine/config.ts")).ARCHBOARD_VAULT;
	canvas = await startOwnedCanvas({
		serverPath: path.join(repoRoot, "src/server.ts"),
		vault,
	});
	request = createJsonRequester(canvas);
});

afterAll(async () => {
	try {
		await canvas?.dispose();
	} finally {
		try {
			fs.rmSync(vault, { recursive: true, force: true });
		} finally {
			if (callerVault === undefined) delete process.env.ARCHBOARD_VAULT;
			else process.env.ARCHBOARD_VAULT = callerVault;
		}
	}
});

describe("malformed input", () => {
	test("uses its owned vault for same-process engine calls", () => {
		expect(process.env.ARCHBOARD_VAULT).toBe(vault);
		expect(configuredVault).toBe(vault);
	});

	test("names the exact non-finite pane telemetry field", async () => {
		const response = await request<ErrorBody>("/api/panes", {
			method: "POST",
			body: {
				clientId: "invalid-pane",
				paneId: "invalid-pane",
				board: "scratch",
				primary: true,
				focused: true,
				elementCount: 0,
				rect: { x: 0, y: 0, width: 640, height: 800 },
				viewport: { x: Number.NaN, y: 0, width: 640, height: 800, zoom: 1 },
			},
		});
		expect(response.status).toBe(400);
		expect(response.body.error).toContain("viewport.x");
	});

	test("refuses a malformed legacy note without rewriting or registering it", async () => {
		const identity = makeIdentity({ board: "legacy-geometry" });
		const file = vaultPathFor(identity, vault);
		const note = renderBoardNote(
			{
				type: "excalidraw",
				version: 2,
				elements: [
					{
						id: "helv",
						type: "text",
						x: 40,
						y: 60,
						text: "legacy",
						fontFamily: 2,
						autoResize: true,
						isDeleted: false,
					},
				],
				appState: {},
				files: {},
			},
			null,
			identity,
		);
		fs.writeFileSync(file, note);
		const opened = await request<ErrorBody>("/api/boards/open", {
			method: "POST",
			body: { board: "legacy-geometry" },
		});
		expect(opened.status).toBe(400);
		expect(opened.body.error).toContain("invalid element helv (text) at element.width");
		expect(fs.readFileSync(file, "utf8")).toBe(note);
		const boards = await request<{ open: Array<{ key: string }> }>("/api/boards");
		expect(boards.body.open.some((board) => board.key === "legacy-geometry")).toBeFalse();
	});

	test("refuses an entire mixed agent batch and preserves exact note bytes", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "geometry-write" } });
		const seeded = await request("/api/elements?board=geometry-write", {
			method: "POST",
			body: { id: "seed", type: "rectangle", x: 0, y: 0, width: 120, height: 60 },
		});
		expect(seeded.status).toBe(200);
		const file = (await request<BoardBody>("/api/boards/info?board=geometry-write")).body.file;
		const before = fs.readFileSync(file);
		const response = await request<ErrorBody>("/api/elements/batch?board=geometry-write", {
			method: "POST",
			body: {
				elements: [
					{ id: "would-have-landed", type: "rectangle", x: 200, y: 0, width: 120, height: 60 },
					{ id: "helvetica", type: "text", x: 20, y: 120, text: "unmeasurable", fontFamily: 2 },
				],
			},
		});
		expect(response.status).toBe(400);
		expect(response.body.error).toContain("invalid element helvetica (text) at element.width");
		expect(fs.readFileSync(file).equals(before)).toBeTrue();
		const after = await request<ElementsBody>("/api/elements?board=geometry-write");
		expect(after.body).toMatchObject({ count: 1, elements: [{ id: "seed" }] });
	});

	test("settles a foreign id before geometry refusal and changes no byte", async () => {
		const identity = makeIdentity({ board: "final-geometry-guard" });
		const file = vaultPathFor(identity, vault);
		const board: BoardState = { identity, file };
		const valid = readBoardContent(board);
		valid.elements.set("seed", {
			id: "seed",
			type: "rectangle",
			x: 0,
			y: 0,
			width: 100,
			height: 50,
		} as ServerElement);
		writeBoardContent(board, valid, { saveCommand: "board save" });
		const before = fs.readFileSync(file);
		const foreignId = "foreign-text-id-needing-settlement";
		const malformed = readBoardContent(board);
		malformed.elements.set(foreignId, {
			id: foreignId,
			type: "text",
			x: 20,
			y: 80,
			text: "legacy Helvetica",
			fontFamily: 2,
			autoResize: true,
		} as ServerElement);
		let error: Error | undefined;
		try {
			writeBoardContent(board, malformed, { saveCommand: "board save" });
		} catch (cause) {
			error = cause as Error;
		}
		expect(error).toBeInstanceOf(Error);
		expect(error?.message).toMatch(
			/Invalid render geometry: [A-Za-z0-9_-]{1,8} \(text\): width, height/,
		);
		expect(error?.message).not.toContain(foreignId);
		expect(fs.readFileSync(file).equals(before)).toBeTrue();
	});

	test("refuses the same malformed geometry on the human change route", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "human-geometry" } });
		await request("/api/elements?board=human-geometry", {
			method: "POST",
			body: { id: "seed", type: "rectangle", x: 0, y: 0, width: 120, height: 60 },
		});
		const file = (await request<BoardBody>("/api/boards/info?board=human-geometry")).body.file;
		const before = fs.readFileSync(file);
		const response = await request<ErrorBody>("/api/elements/changes?board=human-geometry", {
			method: "POST",
			body: {
				upserts: [
					{
						id: "browser-text",
						type: "text",
						x: 40,
						y: 160,
						text: "browser",
						fontFamily: 2,
						autoResize: true,
					},
				],
				deletes: [],
				clientId: "a-browser",
			},
		});
		expect(response.status).toBe(400);
		expect(response.body.error).toContain("invalid element browser-text (text) at element.width");
		expect(fs.readFileSync(file).equals(before)).toBeTrue();
	});
});
