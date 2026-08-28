import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { wrapSceneAsObsidianMd } from "../../../src/runtime/engine/obsidian-md.ts";
import type { ServerElement } from "../../../src/runtime/engine/types.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";

interface FileRecord {
	id: string;
	dataURL: string;
	mimeType: string;
}

interface FilesBody {
	files?: Record<string, FileRecord>;
}

interface BoardBody {
	file: string;
}

interface ReaderProbe {
	rawEqual?: boolean;
	openHash?: string;
	requestHash?: string;
	openImage?: string;
	requestImage?: string;
	fingerprint?: string;
	renderable?: boolean;
	openError?: string;
	requestError?: string;
	missingOpen?: boolean;
	missingRequest?: boolean;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-image-hydration-"));
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;

beforeAll(async () => {
	canvas = await startOwnedCanvas({
		serverPath: path.join(repoRoot, "src/server.ts"),
		vault,
	});
	request = createJsonRequester(canvas);
});

afterAll(async () => {
	await canvas?.dispose();
});

function pluginNote(
	board: string,
	link: string,
	elements: ServerElement[] = [
		{
			id: "img-emb",
			type: "image",
			x: 0,
			y: 0,
			width: 40,
			height: 40,
			fileId: "emb12345",
		} as ServerElement,
	],
): string {
	const bare = wrapSceneAsObsidianMd(
		{
			type: "excalidraw",
			version: 2,
			elements,
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

function probeReaders(board: string, file: string): ReaderProbe {
	const source = `
		import { parseBoardKey } from "./src/runtime/engine/board.ts";
		import { readBoardFile, readBoardInspectionSnapshot, readNote } from "./src/runtime/engine/board-io.ts";
		let opened, requested, openError, requestError;
		try { opened = readBoardFile(parseBoardKey(process.env.ARCHBOARD_TEST_BOARD), process.env.ARCHBOARD_VAULT); }
		catch (error) { openError = error instanceof Error ? error.message : String(error); }
		try { requested = readNote(process.env.ARCHBOARD_TEST_FILE); }
		catch (error) { requestError = error instanceof Error ? error.message : String(error); }
		let snapshot;
		try { snapshot = readBoardInspectionSnapshot(process.env.ARCHBOARD_TEST_BOARD); }
		catch {}
		console.log(JSON.stringify({
			rawEqual: opened && requested ? opened.raw === requested.note : undefined,
			openHash: opened?.hash,
			requestHash: requested?.hash,
			openImage: opened ? JSON.parse(opened.sceneJson).files?.emb12345?.dataURL : undefined,
			requestImage: requested?.files.get("emb12345")?.dataURL,
			fingerprint: snapshot?.fingerprint,
			renderable: snapshot ? snapshot.renderScene !== null : undefined,
			openError,
			requestError,
			missingOpen: opened === null,
			missingRequest: requested === null,
		}));
	`;
	const child = Bun.spawnSync([process.execPath, "-e", source], {
		cwd: repoRoot,
		env: {
			...process.env,
			ARCHBOARD_VAULT: vault,
			ARCHBOARD_TEST_BOARD: board,
			ARCHBOARD_TEST_FILE: file,
		},
	});
	if (child.exitCode !== 0) throw new Error(child.stderr.toString());
	return JSON.parse(child.stdout.toString()) as ReaderProbe;
}

describe("image persistence hydration", () => {
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
		expect(resaved).toContain("## Embedded Files");
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
		const escaping = await request<BoardBody>("/api/boards/open", {
			method: "POST",
			body: { board: "escape" },
		});
		expect(escaping.status).toBe(200);
		expect(
			(await request<FilesBody>("/api/files?board=escape")).body.files?.emb12345,
		).toBeUndefined();

		fs.writeFileSync(path.join(vault, "bare-logo.png"), Buffer.from(imageBase64, "base64"));
		fs.writeFileSync(
			path.join(vault, "bare-image.excalidraw.md"),
			pluginNote("bare-image", "bare-logo.png"),
		);
		expect(
			(
				await request<BoardBody>("/api/boards/open", {
					method: "POST",
					body: { board: "bare-image" },
				})
			).status,
		).toBe(200);
		expect(
			(await request<FilesBody>("/api/files?board=bare-image")).body.files?.emb12345?.dataURL,
		).toBe(`data:image/png;base64,${imageBase64}`);

		fs.mkdirSync(path.join(vault, "duplicate-a"), { recursive: true });
		fs.mkdirSync(path.join(vault, "duplicate-b"), { recursive: true });
		fs.writeFileSync(path.join(vault, "duplicate-a/logo.png"), Buffer.from(imageBase64, "base64"));
		fs.writeFileSync(path.join(vault, "duplicate-b/logo.png"), Buffer.from(imageBase64, "base64"));
		fs.writeFileSync(
			path.join(vault, "ambiguous-image.excalidraw.md"),
			pluginNote("ambiguous-image", "logo.png"),
		);
		expect(
			(
				await request<BoardBody>("/api/boards/open", {
					method: "POST",
					body: { board: "ambiguous-image" },
				})
			).status,
		).toBe(200);
		expect(
			(await request<FilesBody>("/api/files?board=ambiguous-image")).body.files?.emb12345,
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

	test("keeps open and per-request readers identical across hydrated image changes", () => {
		const imageBase64 =
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
		fs.mkdirSync(path.join(vault, "reader-assets"), { recursive: true });
		const imageFile = path.join(vault, "reader-assets/logo.png");
		fs.writeFileSync(imageFile, Buffer.from(imageBase64, "base64"));
		const renderableFile = path.join(vault, "reader-image.excalidraw.md");
		fs.writeFileSync(renderableFile, pluginNote("reader-image", "reader-assets/logo.png"));
		const unrenderableFile = path.join(vault, "reader-unrenderable.excalidraw.md");
		fs.writeFileSync(
			unrenderableFile,
			pluginNote("reader-unrenderable", "reader-assets/logo.png", [
				{
					id: "img-emb",
					type: "image",
					x: 0,
					y: 0,
					width: 40,
					height: 40,
					fileId: "emb12345",
				} as ServerElement,
				{
					id: "bad-box",
					type: "rectangle",
					x: 80,
					y: 0,
					width: null,
					height: 40,
				} as unknown as ServerElement,
			]),
		);
		const renderableNote = fs.readFileSync(renderableFile);
		const unrenderableNote = fs.readFileSync(unrenderableFile);
		const before = probeReaders("reader-image", renderableFile);
		const rejectedBefore = probeReaders("reader-unrenderable", unrenderableFile);
		const wanted = `data:image/png;base64,${imageBase64}`;
		expect(before).toMatchObject({
			rawEqual: true,
			openImage: wanted,
			requestImage: wanted,
			renderable: true,
		});
		expect(before.openHash).toBe(before.requestHash);
		expect(rejectedBefore.renderable).toBeFalse();

		fs.writeFileSync(imageFile, Buffer.from(`${imageBase64.slice(0, -4)}AAAA`, "base64"));
		const after = probeReaders("reader-image", renderableFile);
		const rejectedAfter = probeReaders("reader-unrenderable", unrenderableFile);
		expect(fs.readFileSync(renderableFile).equals(renderableNote)).toBeTrue();
		expect(fs.readFileSync(unrenderableFile).equals(unrenderableNote)).toBeTrue();
		expect(after.fingerprint).not.toBe(before.fingerprint);
		expect(rejectedAfter.renderable).toBeFalse();
		expect(rejectedAfter.fingerprint).not.toBe(rejectedBefore.fingerprint);

		const nonNote = path.join(vault, "notanote.excalidraw.md");
		fs.writeFileSync(nonNote, "# just a heading\n");
		const refused = probeReaders("notanote", nonNote);
		expect(refused.openError).toBeDefined();
		expect(refused.openError).toBe(refused.requestError);
		expect(refused.openError).toContain("refusing to read it as a board");
		const missing = probeReaders("no-such-image-board", path.join(vault, "no-such.excalidraw.md"));
		expect(missing).toMatchObject({ missingOpen: true, missingRequest: true });
	});
});
