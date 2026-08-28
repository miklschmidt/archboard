import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { wrapSceneAsObsidianMd } from "../../../src/runtime/engine/obsidian-md.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import { openTestPane, type TestPane } from "./support/pane-websocket.ts";

interface FileRecord {
	id: string;
	dataURL: string;
	mimeType: string;
}

interface FilesBody {
	board?: string;
	count?: number;
	files?: Record<string, FileRecord>;
	orphaned?: string[];
	warning?: string;
	error?: string;
}

interface BoardBody {
	board?: string;
	file: string;
	error?: string;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-image-persistence-"));
const port = 39_000 + Math.floor(Math.random() * 2_000);
const pngA = "data:image/png;base64,QUJPQVJEQUFBQQ==";
const pngB = "data:image/png;base64,QUJPQVJEQkJCQg==";
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;
const panes: TestPane[] = [];

beforeAll(async () => {
	canvas = await startOwnedCanvas({
		serverPath: path.join(repoRoot, "src/server.ts"),
		port,
		vault,
	});
	request = createJsonRequester(canvas);
});

afterAll(async () => {
	await Promise.all(panes.map((pane) => pane.close()));
	await canvas?.dispose();
});

async function addImage(board: string, fileId: string, dataURL: string): Promise<void> {
	await request(`/api/elements?board=${board}`, {
		method: "POST",
		body: { type: "image", x: 0, y: 0, width: 80, height: 80, fileId },
	});
	const added = await request<FilesBody>(`/api/files?board=${board}`, {
		method: "POST",
		body: { files: [{ id: fileId, dataURL, mimeType: "image/png" }] },
	});
	expect(added.status).toBe(200);
	expect(added.body).toMatchObject({ board, count: 1 });
}

function pluginNote(board: string, link: string): string {
	const bare = wrapSceneAsObsidianMd(
		{
			type: "excalidraw",
			version: 2,
			elements: [
				{
					id: "img-emb",
					type: "image",
					x: 0,
					y: 0,
					width: 40,
					height: 40,
					fileId: "emb12345",
				},
			],
			appState: { viewBackgroundColor: "#ffffff" },
			files: {},
		},
		null,
		{
			frontmatter: [
				["board", board],
				["variant", "current"],
			],
		},
	);
	const drawing = bare.indexOf("\n%%\n## Drawing\n");
	return `${bare.slice(0, drawing)}\n## Embedded Files\nemb12345: [[${link}]]\n${bare.slice(drawing + 1)}`;
}

describe("image persistence", () => {
	test("keeps each board's images in only that board and note", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "picsa" } });
		await request("/api/boards/new", { method: "POST", body: { board: "picsb" } });
		await addImage("picsa", "img-a", pngA);
		await addImage("picsb", "img-b", pngB);

		const orphan = await request<FilesBody>("/api/files?board=picsb", {
			method: "POST",
			body: {
				files: [
					{ id: "img-early", dataURL: "data:image/png;base64,RUFSTFk=", mimeType: "image/png" },
				],
			},
		});
		expect(orphan.body).toMatchObject({ count: 0, orphaned: ["img-early"] });
		expect(orphan.body.warning).toContain("Create the image element first");

		const onlyA = await request<FilesBody>("/api/files?board=picsa");
		expect(Object.keys(onlyA.body.files ?? {})).toEqual(["img-a"]);
		const unnamed = await request<FilesBody>("/api/files");
		expect(unnamed.status).toBe(400);

		const savedA = await request<BoardBody>("/api/boards/save?board=picsa", { method: "POST" });
		const savedB = await request<BoardBody>("/api/boards/save?board=picsb", { method: "POST" });
		const noteA = fs.readFileSync(savedA.body.file, "utf8");
		const noteB = fs.readFileSync(savedB.body.file, "utf8");
		expect(noteA).toContain(pngA);
		expect(noteA).not.toContain(pngB);
		expect(noteB).toContain(pngB);
		expect(noteB).not.toContain(pngA);
	});

	test("loads image bytes from a cold note and sends them to a pane", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "cold-source" } });
		await addImage("cold-source", "img-cold", pngA);
		const sourceSaved = await request<BoardBody>("/api/boards/save?board=cold-source", {
			method: "POST",
		});
		const source = fs.readFileSync(sourceSaved.body.file, "utf8");
		const coldFile = path.join(vault, "picsc.excalidraw.md");
		fs.writeFileSync(coldFile, source.replace(/^board: cold-source$/m, "board: picsc"));
		const opened = await request<BoardBody>("/api/boards/open", {
			method: "POST",
			body: { board: "picsc" },
		});
		expect(opened.status).toBe(200);
		const files = await request<FilesBody>("/api/files?board=picsc");
		expect(files.body.files?.["img-cold"]?.dataURL).toBe(pngA);
		await request("/api/boards/save?board=picsc", { method: "POST" });
		expect(fs.readFileSync(coldFile, "utf8")).toContain(pngA);

		const pane = await openTestPane(port, request, "pic-pane", 0, {
			primary: true,
			focused: true,
		});
		panes.push(pane);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "picsc", pane: "pic-pane" },
		});
		const switched = pane.seen.toReversed().find((message) => message.type === "board_switched") as
			| { files?: Record<string, FileRecord> }
			| undefined;
		expect(switched?.files?.["img-cold"]?.dataURL).toBe(pngA);
	});

	test("copies images into a branch and filters unreferenced files", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "branch-pics" } });
		await addImage("branch-pics", "img-branch", pngA);
		const branched = await request<BoardBody>("/api/boards/save?board=branch-pics", {
			method: "POST",
			body: { variant: "option-p" },
		});
		expect(branched.status).toBe(200);
		const branchFiles = await request<FilesBody>("/api/files?board=branch-pics@option-p");
		expect(branchFiles.body.files?.["img-branch"]?.dataURL).toBe(pngA);
		expect(branchFiles.body.files?.["img-branch"]).not.toBe(
			(await request<FilesBody>("/api/files?board=branch-pics")).body.files?.["img-branch"],
		);
		expect(fs.readFileSync(branched.body.file, "utf8")).toContain(pngA);

		const sourceFile = path.join(vault, "branch-pics.excalidraw.md");
		fs.writeFileSync(
			sourceFile,
			fs
				.readFileSync(sourceFile, "utf8")
				.replace(
					'"img-branch":',
					'"img-orphan":{"id":"img-orphan","mimeType":"image/png","dataURL":"data:image/png;base64,T1JQSEFO"},"img-branch":',
				),
		);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "branch-pics", reload: true },
		});
		await request("/api/boards/save?board=branch-pics", { method: "POST" });
		expect(fs.readFileSync(sourceFile, "utf8")).not.toContain("T1JQSEFO");
	});

	test("hydrates Obsidian embedded files and preserves their wikilinks", async () => {
		const imageBase64 =
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
		fs.mkdirSync(path.join(vault, "attachments"), { recursive: true });
		fs.writeFileSync(path.join(vault, "attachments/logo.png"), Buffer.from(imageBase64, "base64"));
		fs.writeFileSync(
			path.join(vault, "picsd.excalidraw.md"),
			pluginNote("picsd", "attachments/logo.png"),
		);
		const opened = await request<BoardBody>("/api/boards/open", {
			method: "POST",
			body: { board: "picsd" },
		});
		expect(opened.status).toBe(200);
		const hydrated = await request<FilesBody>("/api/files?board=picsd");
		expect(hydrated.body.files?.emb12345?.dataURL).toBe(`data:image/png;base64,${imageBase64}`);
		await request("/api/boards/save?board=picsd", { method: "POST" });
		const resaved = fs.readFileSync(opened.body.file, "utf8");
		expect(resaved).toContain("emb12345: [[attachments/logo.png]]");
		expect(resaved).not.toContain(imageBase64);
		const beforeReload = await request<FilesBody>("/api/files?board=picsd");
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "picsd", reload: true },
		});
		const afterReload = await request<FilesBody>("/api/files?board=picsd");
		expect(afterReload.body.files?.emb12345?.dataURL).toBe(
			beforeReload.body.files?.emb12345?.dataURL,
		);

		fs.writeFileSync(
			path.join(vault, "escape.excalidraw.md"),
			pluginNote("escape", "../../etc/passwd.png"),
		);
		await request("/api/boards/open", { method: "POST", body: { board: "escape" } });
		expect(
			(await request<FilesBody>("/api/files?board=escape")).body.files?.emb12345,
		).toBeUndefined();

		const callers: string[] = [];
		const walk = (directory: string): void => {
			for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
				const full = path.join(directory, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (entry.name.endsWith(".ts")) {
					for (const line of fs.readFileSync(full, "utf8").split("\n")) {
						if (!/\bsceneJsonWithEmbeddedImages\s*\(/.test(line)) continue;
						if (line.trim().startsWith("export function sceneJsonWithEmbeddedImages")) continue;
						callers.push(`${path.relative(repoRoot, full)}:${line.trim()}`);
					}
				}
			}
		};
		walk(path.join(repoRoot, "src"));
		expect(callers).toHaveLength(1);
		expect(callers[0]).toStartWith("src/runtime/engine/board-io.ts:");
	});
});
