import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { makeIdentity, renderBoardNote } from "../../../src/runtime/engine/board.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";

interface BoardBody {
	board?: string;
	file?: string;
	placeholder?: boolean;
	elementCount?: number;
	loadedAt?: string;
	source?: string;
	error?: string;
}

interface ElementsBody {
	count?: number;
	elements?: Array<{ type: string; width?: number; height?: number; text?: string }>;
	error?: string;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-scratch-board-"));
const scratchNote = path.join(vault, ".archboard", "scratch.excalidraw.md");
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;

beforeAll(async () => {
	canvas = await startOwnedCanvas({
		serverPath: path.join(repoRoot, "src/server.ts"),
		vault,
	});
	request = createJsonRequester(canvas);
	await request("/api/elements?board=scratch", {
		method: "POST",
		body: {
			type: "rectangle",
			x: 5,
			y: 5,
			width: 60,
			height: 30,
			label: { text: "thinking" },
		},
	});
});

afterAll(async () => {
	await canvas?.dispose();
});

describe("scratch board", () => {
	test("survives a malformed persisted scratch note without repairing it", async () => {
		const malformedVault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-malformed-scratch-"));
		const malformedNote = path.join(malformedVault, ".archboard", "scratch.excalidraw.md");
		fs.mkdirSync(path.dirname(malformedNote), { recursive: true });
		const malformed = renderBoardNote(
			{
				type: "excalidraw",
				version: 2,
				elements: [
					{
						id: "shlv",
						type: "text",
						x: 20,
						y: 30,
						text: "malformed scratch",
						fontFamily: 2,
						autoResize: true,
					},
				],
				appState: {},
				files: {},
			},
			null,
			makeIdentity({ board: "scratch" }),
		);
		fs.writeFileSync(malformedNote, malformed);
		const malformedCanvas = await startOwnedCanvas({
			serverPath: path.join(repoRoot, "src/server.ts"),
			vault: malformedVault,
		});
		const malformedRequest = createJsonRequester(malformedCanvas);
		try {
			const response = await malformedRequest<ElementsBody>("/api/elements?board=scratch");
			expect(response.status).toBe(400);
			expect(response.body.error).toContain("invalid element shlv (text) at element.width");
			expect(fs.readFileSync(malformedNote, "utf8")).toBe(malformed);
		} finally {
			await malformedCanvas.dispose();
		}
	});

	test("has a hidden home and stays out of the named board list", async () => {
		const info = await request<BoardBody>("/api/boards/info?board=scratch");
		expect(info.body).toMatchObject({ board: "scratch", file: scratchNote, placeholder: true });
		const saved = await request<BoardBody>("/api/boards/save?board=scratch", { method: "POST" });
		expect(saved.status).toBe(200);
		expect(saved.body.file).toBe(scratchNote);
		expect(fs.existsSync(scratchNote)).toBeTrue();
		const list = await request<{ boards: unknown[]; open: Array<{ key: string }> }>("/api/boards");
		expect(list.body.boards).toEqual([]);
		expect(list.body.open.some((board) => board.key === "scratch")).toBeTrue();
	});

	test("reads the same drawing after a graceful restart", async () => {
		await canvas.restart();
		const content = await request<ElementsBody>("/api/elements?board=scratch");
		expect(
			content.body.elements?.some(
				(element) => element.type === "rectangle" && element.width === 60 && element.height === 30,
			),
		).toBeTrue();
		const info = await request<BoardBody>("/api/boards/info?board=scratch");
		expect(info.body.elementCount).toBe(2);
		expect(info.body.loadedAt).toBeString();
	});

	test("persists scratch and a newly named board before a forced process death", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "unsaved" } });
		await request("/api/elements?board=unsaved", {
			method: "POST",
			body: {
				type: "rectangle",
				x: 40,
				y: 40,
				width: 123,
				height: 45,
				label: { text: "never saved" },
			},
		});
		await request("/api/elements?board=scratch", {
			method: "POST",
			body: { type: "ellipse", x: 300, y: 300, width: 77, height: 33 },
		});
		const beforeKill = await request<ElementsBody>("/api/elements?board=scratch");
		await canvas.restart({ signal: "SIGKILL" });

		const survived = await request<ElementsBody>("/api/elements?board=scratch");
		expect(
			survived.body.elements?.some((element) => element.type === "ellipse" && element.width === 77),
		).toBeTrue();
		expect(survived.body.elements?.length).toBe(beforeKill.body.elements?.length);

		const reopened = await request<BoardBody>("/api/boards/open", {
			method: "POST",
			body: { board: "unsaved" },
		});
		expect(reopened.status).toBe(200);
		expect(reopened.body.source).toBe("vault");
		const unsaved = await request<ElementsBody>("/api/elements?board=unsaved");
		expect(unsaved.body.elements?.some((element) => element.width === 123)).toBeTrue();
		expect(unsaved.body.elements?.some((element) => element.text === "never saved")).toBeTrue();
	});
});
