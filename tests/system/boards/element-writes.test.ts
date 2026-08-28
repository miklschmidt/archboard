import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { tempPathFor, writeFileAtomic } from "../../../src/runtime/engine/atomic-write.ts";
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

describe("element writes", () => {
	test("writes a qualified element only to its named board", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "payments" } });
		await request("/api/boards/new", { method: "POST", body: { board: "payments@option-a" } });
		await request("/api/elements?board=payments", {
			method: "POST",
			body: { id: "kept", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
		});
		const before = await request<{ count: number }>("/api/elements?board=payments");
		const qualified = await request<WriteBody>("/api/elements?board=payments@option-a", {
			method: "POST",
			body: { type: "rectangle", x: 10, y: 10, width: 100, height: 60 },
		});
		expect(qualified.status).toBe(200);
		const after = await request<{ count: number }>("/api/elements?board=payments");
		expect(after.body.count).toBe(before.body.count);
		const target = await request<{ count: number }>("/api/elements?board=payments@option-a");
		expect(target.body.count).toBe(1);
	});

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
		expect(stored.body.elements).toHaveLength(7);
		expect(
			stored.body.elements.every((element) => /^[A-Za-z0-9-]{1,8}$/.test(element.id)),
		).toBeTrue();

		const saved = await request<BoardBody>("/api/boards/save?board=idcheck", { method: "POST" });
		expect(saved.status).toBe(200);
		const note = fs.readFileSync(saved.body.file, "utf8");
		const scene = JSON.parse(note.match(/```json\n([\s\S]*?)\n```/)![1]!) as {
			elements: Element[];
		};
		expect(scene.elements).toHaveLength(7);
		expect(scene.elements.map((element) => element.id)).toEqual(
			stored.body.elements.map((element) => element.id),
		);
		for (const label of scene.elements.filter((element) => element.containerId)) {
			expect(label.id).toBe(labelTextIdFor(label.containerId!));
			expect(note).toContain(`^${label.id}`);
			expect(scene.elements.map((element) => element.id)).toContain(label.containerId!);
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
		expect(long.status).toBe(200);
		const settled = long.body.element?.id;
		expect(settled).toBeDefined();
		expect(settled).toMatch(/^[A-Za-z0-9-]{1,8}$/);
		expect(settled).not.toBe("a-caption-id-nobody-can-reference");
		if (!settled) throw new Error("The write did not return the settled element id.");
		const settledRead = await request<WriteBody>(`/api/elements/${settled}?board=blockids`);
		expect(settledRead.status).toBe(200);
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
		const pane = await openTestPane(canvas.base, request, "frontend-pane", 0, {
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
		const witnessDir = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-atomic-witness-"));
		let heldOpen: number | undefined;
		try {
			await request("/api/boards/new", { method: "POST", body: { board: "atomic" } });
			await request("/api/elements?board=atomic", {
				method: "POST",
				body: { type: "rectangle", x: 0, y: 0, width: 100, height: 60, label: { text: "before" } },
			});
			const first = await request<BoardBody>("/api/boards/save?board=atomic", { method: "POST" });
			expect(first.status).toBe(200);
			const before = fs.readFileSync(first.body.file, "utf8");
			const beforeInode = fs.statSync(first.body.file).ino;
			heldOpen = fs.openSync(first.body.file, "r");
			const hardLink = path.join(witnessDir, "old-note.md");
			fs.linkSync(first.body.file, hardLink);
			await request("/api/elements?board=atomic", {
				method: "POST",
				body: {
					type: "rectangle",
					x: 200,
					y: 0,
					width: 100,
					height: 60,
					label: { text: "after" },
				},
			});
			const second = await request("/api/boards/save?board=atomic", { method: "POST" });
			expect(second.status).toBe(200);
			const after = fs.readFileSync(first.body.file, "utf8");
			expect(after).not.toBe(before);
			expect(after).toContain("after");
			expect(fs.readFileSync(heldOpen, "utf8")).toBe(before);
			fs.closeSync(heldOpen);
			heldOpen = undefined;
			expect(fs.readFileSync(hardLink, "utf8")).toBe(before);
			expect(fs.statSync(first.body.file).ino).not.toBe(beforeInode);
			expect(fs.readdirSync(vault).filter((name) => name.endsWith(".tmp"))).toEqual([]);
			const listed = await request<{ boards: Array<{ key: string }> }>("/api/boards");
			expect(listed.body.boards.filter((board) => board.key === "atomic")).toHaveLength(1);
		} finally {
			if (heldOpen !== undefined) fs.closeSync(heldOpen);
			fs.rmSync(witnessDir, { recursive: true, force: true });
		}
	});

	test("hides, flushes and shares the atomic note-write boundary", () => {
		const witnessDir = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-atomic-order-"));
		try {
			const tempName = path.basename(tempPathFor(path.join(vault, "payments.excalidraw.md")));
			expect(tempName.startsWith(".")).toBeTrue();
			expect(tempName.endsWith(".tmp")).toBeTrue();

			const order: string[] = [];
			const realFsync = fs.fsyncSync;
			const realRename = fs.renameSync;
			fs.fsyncSync = (fd) => {
				order.push("fsync");
				return realFsync(fd);
			};
			fs.renameSync = (from, to) => {
				order.push("rename");
				return realRename(from, to);
			};
			try {
				writeFileAtomic(path.join(witnessDir, "ordered.md"), "contents\n");
			} finally {
				fs.fsyncSync = realFsync;
				fs.renameSync = realRename;
			}
			expect(order.slice(0, 2)).toEqual(["fsync", "rename"]);
			expect(fs.readFileSync(path.join(witnessDir, "ordered.md"), "utf8")).toBe("contents\n");

			for (const module of [
				"src/runtime/engine/board-io.ts",
				"src/runtime/engine/library.ts",
				"src/runtime/engine/repo-registry.ts",
			]) {
				const source = fs.readFileSync(path.join(repoRoot, module), "utf8");
				expect(source).not.toMatch(/\bfs\.writeFileSync\(/);
				expect(source).toMatch(/writeFileAtomic\(/);
			}
		} finally {
			fs.rmSync(witnessDir, { recursive: true, force: true });
		}
	});
});
