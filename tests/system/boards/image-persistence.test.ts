import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildScene } from "../../../src/runtime/engine/scene-document.ts";
import { TEST_PANE_SOCKET_SETTLE_MS } from "../../../src/shared/timing/timing.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import {
	openTestPane,
	type PaneMessage,
	type TestPane,
	waitForPaneMessage,
} from "./support/pane-websocket.ts";

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
const pngA = "data:image/png;base64,QUJPQVJEQUFBQQ==";
const pngB = "data:image/png;base64,QUJPQVJEQkJCQg==";
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;
const panes: TestPane[] = [];

beforeAll(async () => {
	canvas = await startOwnedCanvas({
		serverPath: path.join(repoRoot, "src/server.ts"),
		vault,
	});
	request = createJsonRequester(canvas);
});

afterAll(async () => {
	await Promise.all(panes.map((pane) => pane.close()));
	await canvas?.dispose();
});

async function addImage(
	board: string,
	fileId: string,
	dataURL: string,
): Promise<{ status: number; body: FilesBody }> {
	await request(`/api/elements?board=${board}`, {
		method: "POST",
		body: { type: "image", x: 0, y: 0, width: 80, height: 80, fileId },
	});
	return request<FilesBody>(`/api/files?board=${board}`, {
		method: "POST",
		body: { files: [{ id: fileId, dataURL, mimeType: "image/png" }] },
	});
}

describe("image persistence", () => {
	test("assembles only images referenced by the owning board", () => {
		const files = {
			"img-a": { id: "img-a", dataURL: pngA, mimeType: "image/png" },
			"img-b": { id: "img-b", dataURL: pngB, mimeType: "image/png" },
		};
		const withImage = buildScene(
			[{ id: "e1", type: "image", x: 0, y: 0, width: 10, height: 10, fileId: "img-a" }],
			files,
		);
		expect(Object.keys(withImage.scene.files ?? {})).toEqual(["img-a"]);
		const withoutImage = buildScene(
			[{ id: "e2", type: "rectangle", x: 0, y: 0, width: 10, height: 10 }],
			files,
		);
		expect(withoutImage.scene.files).toBeUndefined();
	});

	test("keeps each board's images in only that board and note", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "picsa" } });
		await request("/api/boards/new", { method: "POST", body: { board: "picsb" } });
		const addedA = await addImage("picsa", "img-a", pngA);
		await addImage("picsb", "img-b", pngB);
		expect(addedA.status).toBe(200);
		expect(addedA.body.board).toBe("picsa");
		expect(addedA.body.count).toBe(1);

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
		expect([savedA.status, savedB.status]).toEqual([200, 200]);
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
		const coldResave = await request<BoardBody>("/api/boards/save?board=picsc", { method: "POST" });
		expect(coldResave.status).toBe(200);
		expect(fs.readFileSync(coldFile, "utf8")).toContain(pngA);

		const pane = await openTestPane(canvas.base, request, "pic-pane", 0, {
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

	test("returns a successful image export result from the addressed pane", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "export-pic" } });
		await request("/api/boards/new", { method: "POST", body: { board: "export-other" } });
		const pane = await openTestPane(canvas.base, request, "image-export-pane", 0, {
			primary: true,
			focused: true,
		});
		const other = await openTestPane(canvas.base, request, "image-export-other", 640);
		panes.push(pane, other);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "export-pic", pane: pane.clientId },
		});
		await pane.adopt("export-pic");
		const start = pane.since();
		const otherStart = other.since();
		const pending = request<{ success?: boolean; format?: string; data?: string }>(
			"/api/export/image",
			{ method: "POST", body: { format: "png", pane: pane.clientId } },
		);
		const message = (await waitForPaneMessage(pane, start, "export_image_request")) as
			| PaneMessage
			| undefined;
		expect(message?.requestId).toBeString();
		expect(
			pane.seen.slice(start).some((entry) => entry.type === "export_image_request"),
		).toBeTrue();
		expect(
			other.seen.slice(otherStart).some((entry) => entry.type === "export_image_request"),
		).toBeFalse();
		const callback = await request("/api/export/image/result", {
			method: "POST",
			body: { requestId: message?.requestId, format: "png", data: "aGk=" },
		});
		expect(callback.status).toBe(200);
		expect(await pending).toMatchObject({
			status: 200,
			body: { success: true, format: "png", data: "aGk=" },
		});
		await Promise.all([pane.close(), other.close()]);
		await Bun.sleep(TEST_PANE_SOCKET_SETTLE_MS);
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
		const orphanSave = await request<BoardBody>("/api/boards/save?board=branch-pics", {
			method: "POST",
		});
		expect(orphanSave.status).toBe(200);
		expect(fs.readFileSync(sourceFile, "utf8")).not.toContain("T1JQSEFO");
	});
});
