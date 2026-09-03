import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { TEST_PANE_SOCKET_SETTLE_MS } from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "./support/http.ts";
import { openTestPane, type TestPane } from "./support/pane-websocket.ts";

interface Refusal {
	code?: string;
	error?: string;
	available?: string[];
	reason?: string;
}

interface BoardsBody {
	open: Array<{ key: string }>;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-public-refusals-"));
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;
const panes: TestPane[] = [];

async function runCli(args: string[]): Promise<{ code: number | null; stderr: string }> {
	return new Promise((resolve) => {
		const child = spawn(
			process.execPath,
			[path.join(repoRoot, "src/bin.ts"), ...args, "--doing", "checking browser-required refusals"],
			{
				env: {
					...process.env,
					EXPRESS_SERVER_URL: canvas.base,
					EXCALIDRAW_NO_AUTOSTART: "1",
					ARCHBOARD_VAULT: vault,
					LOG_LEVEL: "error",
				},
				stdio: ["ignore", "ignore", "pipe"],
			},
		);
		let stderr = "";
		child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
		child.once("exit", (code) => resolve({ code, stderr }));
	});
}

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
		expect(Array.isArray(unnamed.body.available)).toBeTrue();
		expect(unnamed.body.error).toContain("board list");

		const unopened = await request<Refusal>("/api/elements?board=nope");
		expect(unopened.status).toBe(404);
		expect(unopened.body.code).toBe("BOARD_RESOLUTION_FAILED");
		expect(unopened.body.error).toContain('Board "nope" was not found');
		expect(unopened.body.error).not.toMatch(/open it first|open a pane/i);
	});

	test("keeps compare resolution refusals identical with zero or one pane", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "compare-present" } });
		const url = "/api/boards/compare?from=compare-missing&to=compare-present";
		const withoutPane = await request<Refusal>(url);
		const pane = await openTestPane(canvas.base, request, "compare-refusal-pane", 0);
		try {
			const withPane = await request<Refusal>(url);
			for (const result of [withoutPane, withPane]) {
				expect(result.status).toBe(404);
				expect(result.body).toMatchObject({
					code: "BOARD_RESOLUTION_FAILED",
					reason: "missing",
				});
			}
			expect(withPane.body).toEqual(withoutPane.body);
		} finally {
			await pane.close();
		}
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

	test("keeps board creation independent from ambiguous browser placement", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "payments" } });
		await request("/api/boards/new", { method: "POST", body: { board: "payments@option-a" } });
		const left = await openTestPane(canvas.base, request, "refusal-left", 0, {
			primary: true,
			focused: true,
		});
		const right = await openTestPane(canvas.base, request, "refusal-right", 640);
		panes.push(left, right);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "payments", pane: "left" },
		});
		await left.adopt("payments");
		await right.adopt("payments");
		const paneBoardsBeforeCreate = [left.board(), right.board()];

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
		expect(create.status).toBe(200);
		expect(
			(await request<BoardsBody>("/api/boards")).body.open.some(
				(board) => board.key === "never-made",
			),
		).toBeTrue();
		expect(fs.existsSync(path.join(vault, "never-made.excalidraw.md"))).toBeTrue();
		expect([left.board(), right.board()]).toEqual(paneBoardsBeforeCreate);

		const collision = await request<Refusal>("/api/boards/new", {
			method: "POST",
			body: { board: "payments" },
		});
		expect(collision.status).toBe(409);
		expect(collision.body.error).toContain("already has a note");
		const missing = await request<Refusal>("/api/boards/open", {
			method: "POST",
			body: { board: "never-exists" },
		});
		expect(missing.status).toBe(404);
		expect(missing.body.error).toContain('Board "never-exists" was not found');
		await Promise.all([left.close(), right.close()]);
		await Bun.sleep(TEST_PANE_SOCKET_SETTLE_MS);
	});

	test("refuses unknown, unnamed, missing and over-capacity pane operations", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "pane-base" } });
		await request("/api/boards/new", { method: "POST", body: { board: "pane-base@option-a" } });
		const left = await openTestPane(canvas.base, request, "pane-refusal-left", 0, {
			primary: true,
			focused: true,
		});
		const right = await openTestPane(canvas.base, request, "pane-refusal-right", 640);
		panes.push(left, right);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "pane-base", pane: "left" },
		});
		await left.adopt("pane-base");
		await right.adopt("pane-base");
		const unknownOpen = await request<Refusal>("/api/boards/open", {
			method: "POST",
			body: { board: "pane-base@option-a", pane: "middle" },
		});
		expect(unknownOpen.status).toBe(400);
		expect(unknownOpen.body.error).toContain('No pane called "middle"');
		expect(unknownOpen.body.error).toContain("pane-base");

		const unnamedClose = await request<Refusal>("/api/panes/close", {
			method: "POST",
			body: {},
		});
		expect(unnamedClose.status).toBe(400);
		expect(unnamedClose.body.error).toContain("pane close left");
		expect(unnamedClose.body.error).toContain("pane close right");

		const full = await request<Refusal>("/api/panes/open", { method: "POST" });
		expect(full.status).toBe(409);
		expect(full.body.error).toContain("pane-base");
		expect(full.body.error).toContain("pane close");

		await right.close();
		await Bun.sleep(TEST_PANE_SOCKET_SETTLE_MS);
		const missingPane = await request<Refusal>("/api/boards/open", {
			method: "POST",
			body: { board: "pane-base@option-a", pane: "right" },
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
		await Bun.sleep(TEST_PANE_SOCKET_SETTLE_MS);
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
		for (const args of [
			["pane", "open"],
			["pane", "close", "right"],
			["viewport", "--fit"],
			["screenshot"],
		]) {
			const result = await runCli(args);
			expect(result.code, `${args.join(" ")}: ${result.stderr}`).toBe(4);
			expect(result.stderr).toMatch(/browser/i);
		}
	});
});
