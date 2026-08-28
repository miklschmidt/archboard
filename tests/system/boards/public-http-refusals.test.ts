import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import { openTestPane, type TestPane } from "./support/pane-websocket.ts";

interface Refusal {
	code?: string;
	error?: string;
	open?: string[];
}

interface BoardsBody {
	open: Array<{ key: string }>;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-public-refusals-"));
const port = 53_000 + Math.floor(Math.random() * 2_000);
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

describe("public HTTP refusals", () => {
	test("refuses unnamed and unopened boards with actionable bodies", async () => {
		const unnamed = await request<Refusal>("/api/elements", {
			method: "POST",
			body: { type: "rectangle", x: 10, y: 10, width: 100, height: 60 },
		});
		expect(unnamed.status).toBe(400);
		expect(unnamed.body.code).toBe("BOARD_REQUIRED");
		expect(unnamed.body.error).toContain("Nothing was done");
		expect(unnamed.body.error).toContain("--board <key>");
		expect(unnamed.body.open).toContain("scratch");

		const unopened = await request<Refusal>("/api/elements?board=nope");
		expect(unopened.status).toBe(400);
		expect(unopened.body.error).toContain('Board "nope" is not open');
		expect(unopened.body.error).toContain("Open right now");
	});

	test("refuses every destructive board-blind route without changing state", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "qualified" } });
		await request("/api/elements?board=qualified", {
			method: "POST",
			body: { id: "kept", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
		});
		const save = await request<Refusal>("/api/boards/save", { method: "POST", body: {} });
		const clear = await request<Refusal>("/api/elements/clear", { method: "DELETE" });
		const filesGet = await request<Refusal>("/api/files");
		const filesPost = await request<Refusal>("/api/files", {
			method: "POST",
			body: { files: [] },
		});
		expect([save.status, clear.status, filesGet.status, filesPost.status]).toEqual([
			400, 400, 400, 400,
		]);
		for (const refusal of [save, clear, filesGet, filesPost]) {
			expect(refusal.body.code).toBe("BOARD_REQUIRED");
		}
		const after = await request<{ count: number; elements: Array<{ id: string }> }>(
			"/api/elements?board=qualified",
		);
		expect(after.body).toMatchObject({ count: 1, elements: [{ id: "kept" }] });
	});

	test("refuses ambiguous board placement before creating or opening anything", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "payments" } });
		await request("/api/boards/new", { method: "POST", body: { board: "payments@option-a" } });
		const left = await openTestPane(port, request, "refusal-left", 0, {
			primary: true,
			focused: true,
		});
		const right = await openTestPane(port, request, "refusal-right", 640);
		panes.push(left, right);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "payments", pane: "left" },
		});
		await left.adopt("payments");
		await right.adopt("payments");

		const open = await request<Refusal>("/api/boards/open", {
			method: "POST",
			body: { board: "payments@option-a" },
		});
		expect(open.status).toBe(400);
		expect(open.body.error).toMatch(/--pane left \| right/);
		const create = await request<Refusal>("/api/boards/new", {
			method: "POST",
			body: { board: "never-made", level: "service" },
		});
		expect(create.status).toBe(400);
		expect(
			(await request<BoardsBody>("/api/boards")).body.open.some(
				(board) => board.key === "never-made",
			),
		).toBeFalse();
		expect(fs.existsSync(path.join(vault, "never-made.excalidraw.md"))).toBeFalse();

		const collision = await request<Refusal>("/api/boards/new", {
			method: "POST",
			body: { board: "payments" },
		});
		expect(collision.status).toBe(409);
		expect(collision.body.error).toContain("already open");
		const missing = await request<Refusal>("/api/boards/open", {
			method: "POST",
			body: { board: "never-made" },
		});
		expect(missing.status).toBe(404);
		expect(missing.body.error).toContain('No board "never-made"');
		await Promise.all([left.close(), right.close()]);
		await Bun.sleep(100);
	});

	test("refuses unknown, unnamed, missing and over-capacity pane operations", async () => {
		const left = await openTestPane(port, request, "pane-refusal-left", 0, {
			primary: true,
			focused: true,
		});
		const right = await openTestPane(port, request, "pane-refusal-right", 640);
		panes.push(left, right);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "payments", pane: "left" },
		});
		await left.adopt("payments");
		await right.adopt("payments");
		const unknownOpen = await request<Refusal>("/api/boards/open", {
			method: "POST",
			body: { board: "payments@option-a", pane: "middle" },
		});
		expect(unknownOpen.status).toBe(400);
		expect(unknownOpen.body.error).toContain('No pane called "middle"');
		expect(unknownOpen.body.error).toContain("payments");

		const unnamedClose = await request<Refusal>("/api/panes/close", {
			method: "POST",
			body: {},
		});
		expect(unnamedClose.status).toBe(400);
		expect(unnamedClose.body.error).toContain("pane close left");
		expect(unnamedClose.body.error).toContain("pane close right");

		const full = await request<Refusal>("/api/panes/open", { method: "POST" });
		expect(full.status).toBe(409);
		expect(full.body.error).toContain("payments");
		expect(full.body.error).toContain("pane close");

		await right.close();
		await Bun.sleep(100);
		const missingPane = await request<Refusal>("/api/boards/open", {
			method: "POST",
			body: { board: "payments@option-a", pane: "right" },
		});
		expect(missingPane.status).toBe(400);
		expect(missingPane.body.error).toContain("archboard pane open");

		const last = await request<Refusal>("/api/panes/close", {
			method: "POST",
			body: { pane: "1" },
		});
		expect(last.status).toBe(409);
		expect(last.body.error).toContain("board is unaffected");
	});

	test("reports browser-required when no pane exists", async () => {
		await Promise.all(panes.map((pane) => pane.close()));
		await Bun.sleep(100);
		const open = await request<Refusal>("/api/panes/open", { method: "POST" });
		const close = await request<Refusal>("/api/panes/close", {
			method: "POST",
			body: { pane: "left" },
		});
		const viewport = await request<Refusal>("/api/viewport", {
			method: "POST",
			body: { scrollToContent: true },
		});
		const image = await request<Refusal>("/api/export/image", {
			method: "POST",
			body: { format: "png" },
		});
		for (const refusal of [open, close, viewport, image]) {
			expect(refusal.status).toBe(503);
			expect(refusal.body.code).toBe("BROWSER_REQUIRED");
		}
	});
});
