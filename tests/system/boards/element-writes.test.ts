import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { labelTextIdFor } from "../../../src/runtime/engine/labels.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import { openTestPane, type TestPane } from "./support/pane-websocket.ts";

interface Element {
	id: string;
	type: string;
	containerId?: string;
	text?: string;
	source?: string;
	customData?: { archboard?: { source?: string } };
}

interface WriteBody {
	element?: Element;
	elements?: Element[];
	id?: string;
	count?: number;
	version?: number;
	fingerprint?: { version: number | null };
	code?: string;
	error?: string;
	document?: Element[];
	versionConflict?: { expected?: number; actual?: number };
}

interface BoardBody {
	file: string;
	version?: number;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-element-writes-"));
const port = 35_000 + Math.floor(Math.random() * 2_000);
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

describe("element writes", () => {
	test("mints note-safe ids and persists the exact converted document", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "idcheck" } });
		const drawn = await request<WriteBody>("/api/elements/batch?board=idcheck", {
			method: "POST",
			body: {
				elements: [
					{ type: "rectangle", x: 0, y: 0, width: 200, height: 100, label: { text: "Auth" } },
					{ type: "rectangle", x: 400, y: 0, width: 200, height: 100, label: { text: "Gateway" } },
					{
						type: "arrow",
						x: 200,
						y: 50,
						points: [
							[0, 0],
							[200, 0],
						],
						label: { text: "HTTP" },
					},
					{ type: "text", x: 0, y: 300, text: "a note somebody left" },
				],
			},
		});
		expect([200, 201]).toContain(drawn.status);
		const stored = await request<{ count: number; elements: Element[] }>(
			"/api/elements?board=idcheck",
		);
		expect(stored.body.count).toBe(7);
		expect(
			stored.body.elements.every((element) => /^[A-Za-z0-9-]{1,8}$/.test(element.id)),
		).toBeTrue();

		const saved = await request<BoardBody>("/api/boards/save?board=idcheck", { method: "POST" });
		expect(saved.status).toBe(200);
		const note = fs.readFileSync(saved.body.file, "utf8");
		const scene = JSON.parse(note.match(/```json\n([\s\S]*?)\n```/)![1]!) as {
			elements: Element[];
		};
		expect(scene.elements.map((element) => element.id)).toEqual(
			stored.body.elements.map((element) => element.id),
		);
		for (const label of scene.elements.filter((element) => element.containerId)) {
			expect(label.id).toBe(labelTextIdFor(label.containerId!));
			expect(note).toContain(`^${label.id}`);
		}
	});

	test("returns the settled id and leaves already-valid ids unchanged", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "blockids" } });
		const long = await request<WriteBody>("/api/elements?board=blockids", {
			method: "POST",
			body: {
				id: "a-caption-id-nobody-can-reference",
				type: "text",
				x: 0,
				y: 0,
				text: "a caption",
			},
		});
		const settled = long.body.element?.id;
		expect(settled).toMatch(/^[A-Za-z0-9-]{1,8}$/);
		expect(settled).not.toBe("a-caption-id-nobody-can-reference");
		if (!settled) throw new Error("The write did not return the settled element id.");
		const reread = await request<{ elements: Element[] }>("/api/elements?board=blockids");
		expect(reread.body.elements.map((element) => element.id)).toEqual([settled]);

		const short = await request<WriteBody>("/api/elements?board=blockids", {
			method: "POST",
			body: { id: "cap2", type: "text", x: 0, y: 60, text: "another" },
		});
		expect(short.body.element?.id).toBe("cap2");
		const file = (await request<BoardBody>("/api/boards/info?board=blockids")).body.file;
		expect(fs.readFileSync(file, "utf8")).toContain(`a caption ^${settled}`);
	});

	test("replaces one element and rejects a stale board version with the current document", async () => {
		const created = await request<WriteBody>("/api/boards/new", {
			method: "POST",
			body: { board: "versions" },
		});
		const first = await request<WriteBody>("/api/elements?board=versions", {
			method: "POST",
			body: { id: "same", type: "rectangle", x: 0, y: 0, width: 80, height: 40 },
		});
		const expectedVersion = first.body.fingerprint?.version ?? undefined;
		expect(expectedVersion).toBeGreaterThan(created.body.version ?? 0);
		const replaced = await request<WriteBody>(
			`/api/elements/same?board=versions&expectVersion=${expectedVersion}`,
			{
				method: "PUT",
				body: { id: "same", type: "rectangle", x: 30, y: 30, width: 40, height: 40 },
			},
		);
		expect(replaced.status).toBe(200);
		const stale = await request<WriteBody>(
			`/api/elements?board=versions&expectVersion=${expectedVersion}`,
			{
				method: "POST",
				body: { id: "late", type: "ellipse", x: 0, y: 0, width: 10, height: 10 },
			},
		);
		expect(stale.status).toBe(409);
		expect(stale.body.code).toBe("BOARD_VERSION_CONFLICT");
		expect(stale.body.document?.map((element) => element.id)).toEqual(["same"]);
		expect(stale.body.versionConflict?.actual).toBeGreaterThan(expectedVersion!);
	});

	test("tags pane-originated upserts as frontend sync", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "frontend" } });
		const pane = await openTestPane(port, request, "frontend-pane", 0, {
			primary: true,
			focused: true,
		});
		panes.push(pane);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "frontend", pane: "frontend-pane" },
		});
		await pane.adopt("frontend");
		const changed = await request<WriteBody>("/api/elements/changes?board=frontend", {
			method: "POST",
			body: {
				upserts: [{ id: "human1", type: "rectangle", x: 5, y: 5, width: 50, height: 30 }],
				deletes: [],
				clientId: "frontend-pane",
			},
		});
		expect(changed.status).toBe(200);
		const read = await request<{ elements: Element[] }>("/api/elements?board=frontend");
		expect(read.body.elements[0]?.source).toBe("frontend_sync");
	});

	test("renames the note atomically and leaves no temporary file", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "atomic" } });
		await request("/api/elements?board=atomic", {
			method: "POST",
			body: { type: "rectangle", x: 0, y: 0, width: 100, height: 60, label: { text: "before" } },
		});
		const first = await request<BoardBody>("/api/boards/save?board=atomic", { method: "POST" });
		const before = fs.readFileSync(first.body.file, "utf8");
		const beforeInode = fs.statSync(first.body.file).ino;
		const heldOpen = fs.openSync(first.body.file, "r");
		await request("/api/elements?board=atomic", {
			method: "POST",
			body: { type: "rectangle", x: 200, y: 0, width: 100, height: 60, label: { text: "after" } },
		});
		await request("/api/boards/save?board=atomic", { method: "POST" });
		expect(fs.readFileSync(heldOpen, "utf8")).toBe(before);
		fs.closeSync(heldOpen);
		expect(fs.statSync(first.body.file).ino).not.toBe(beforeInode);
		expect(fs.readdirSync(vault).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});
});
