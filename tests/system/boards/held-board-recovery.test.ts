import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { expandElements } from "../../../src/runtime/engine/expand-elements.ts";
import { createJsonRequester } from "./support/http.ts";
import { openTestPane, type TestPane } from "./support/pane-websocket.ts";

interface HeldReport {
	board: string;
	writes: number;
	since: string;
	fromScreen?: boolean;
	conflict?: {
		outcomes?: { reload?: string; overwrite?: string; saveAs?: string };
	};
}

interface WriteBody {
	error?: string;
	held?: HeldReport;
	resolvedHold?: { outcome: string; writes: number };
	file?: string;
	panes?: { moved: Array<{ place: string }>; kept: Array<{ place: string }> };
}

interface ElementsBody {
	elements: Array<{ id: string }>;
	held?: HeldReport;
}

interface BoardInfo {
	file: string;
	savedAt?: string;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-held-recovery-"));
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;
const panes: TestPane[] = [];

async function runCli(args: string[]): Promise<{ code: number | null; stderr: string }> {
	return new Promise((resolve) => {
		const child = spawn(
			process.execPath,
			[path.join(repoRoot, "src/bin.ts"), ...args, "--doing", "checking held recovery"],
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

async function stopSaving(
	board: string,
	theirId: string,
): Promise<{ file: string; refusal: WriteBody }> {
	await request("/api/boards/new", { method: "POST", body: { board } });
	await request(`/api/elements?board=${board}`, {
		method: "POST",
		body: { id: "ours1", type: "rectangle", x: 10, y: 10, width: 50, height: 50 },
	});
	const file = (await request<BoardInfo>(`/api/boards/info?board=${board}`)).body.file;
	const note = fs.readFileSync(file, "utf8");
	const foreign = expandElements(
		[{ id: theirId, type: "rectangle", x: 800, y: 800, width: 999, height: 40 }],
		{ forStore: true },
	)[0]!;
	fs.writeFileSync(
		file,
		note.replace('"id": "ours1"', `${JSON.stringify(foreign).slice(1, -1)}}, {"id": "ours1"`),
	);
	const refused = await request<WriteBody>(`/api/elements?board=${board}`, {
		method: "POST",
		body: { id: "lost1", type: "ellipse", x: 5, y: 5, width: 20, height: 20 },
	});
	expect(refused.status).toBe(409);
	return { file, refusal: refused.body };
}

describe("held board recovery", () => {
	test("keeps foreign-note baselines independent between boards", async () => {
		for (const board of ["baseline-a", "baseline-b"]) {
			await request("/api/boards/new", { method: "POST", body: { board } });
			await request(`/api/elements?board=${board}`, {
				method: "POST",
				body: { id: board, type: "rectangle", x: 0, y: 0, width: 40, height: 40 },
			});
		}
		const first = await request<WriteBody>("/api/boards/save?board=baseline-a", {
			method: "POST",
		});
		const second = await request<WriteBody>("/api/boards/save?board=baseline-b", {
			method: "POST",
		});
		expect([first.status, second.status]).toEqual([200, 200]);
		expect(first.body.file).not.toBe(second.body.file);
		fs.appendFileSync(first.body.file!, "\nedited elsewhere\n");
		expect(
			(await request<WriteBody>("/api/boards/save?board=baseline-a", { method: "POST" })).status,
		).toBe(409);
		expect(
			(await request<WriteBody>("/api/boards/save?board=baseline-b", { method: "POST" })).status,
		).toBe(200);
	});

	test("stops saving after a foreign note edit and keeps later writes only in the held copy", async () => {
		const held = await stopSaving("holdover", "theirs1");
		expect(held.refusal.held).toMatchObject({ board: "holdover", writes: 0 });
		expect(held.refusal.held?.since).toBeString();
		expect(held.refusal.held?.conflict?.outcomes).toMatchObject({
			reload: expect.any(String),
			overwrite: expect.any(String),
			saveAs: expect.any(String),
		});
		expect(held.refusal.error).toContain("Refusing to save");
		expect(
			(await request<ElementsBody>("/api/elements?board=holdover")).body.elements.some(
				(element) => element.id === "lost1",
			),
		).toBeFalse();

		const savedAt = (await request<BoardInfo>("/api/boards/info?board=holdover")).body.savedAt;
		const accepted = await request<WriteBody>("/api/elements?board=holdover", {
			method: "POST",
			body: { id: "held1", type: "rectangle", x: 100, y: 100, width: 30, height: 30 },
		});
		expect(accepted.status).toBe(200);
		expect(fs.readFileSync(held.file, "utf8")).not.toContain("held1");
		const read = await request<ElementsBody>("/api/elements?board=holdover");
		expect(read.body.elements.some((element) => element.id === "held1")).toBeTrue();
		expect(read.body.held?.writes).toBe(1);
		const listed = await request<{ open: Array<{ key: string; held?: HeldReport }> }>(
			"/api/boards",
		);
		expect(listed.body.open.find((entry) => entry.key === "holdover")?.held).toMatchObject({
			board: "holdover",
			writes: 1,
		});
		expect((await request<BoardInfo>("/api/boards/info?board=holdover")).body.savedAt).toBe(
			savedAt,
		);

		const fullReport = await request<WriteBody>("/api/elements/changes?board=holdover", {
			method: "POST",
			body: {
				upserts: [
					{ id: "ours1", type: "rectangle", x: 10, y: 10, width: 50, height: 50 },
					{ id: "held1", type: "rectangle", x: 100, y: 100, width: 30, height: 30 },
				],
				deletes: [],
				fullReport: true,
				clientId: "a-pane",
			},
		});
		expect(fullReport.status).toBe(200);
		const after = await request<ElementsBody>("/api/elements?board=holdover");
		expect(after.body.elements.map((element) => element.id).toSorted()).toEqual(["held1", "ours1"]);
		expect(after.body.held?.fromScreen).toBeTrue();
	});

	test("overwrites with the held copy and resumes normal persistence", async () => {
		const held = await stopSaving("holdforce", "theirs-force");
		await request("/api/elements?board=holdforce", {
			method: "POST",
			body: { id: "held-force", type: "rectangle", x: 100, y: 100, width: 30, height: 30 },
		});
		await request("/api/elements/changes?board=holdforce", {
			method: "POST",
			body: {
				upserts: [
					{ id: "ours1", type: "rectangle", x: 10, y: 10, width: 50, height: 50 },
					{ id: "held-force", type: "rectangle", x: 100, y: 100, width: 30, height: 30 },
				],
				deletes: [],
				fullReport: true,
				clientId: "a-pane",
			},
		});
		await request("/api/elements?board=holdforce", {
			method: "POST",
			body: { id: "held-force-2", type: "ellipse", x: 140, y: 100, width: 20, height: 20 },
		});
		const forced = await request<WriteBody>("/api/boards/save", {
			method: "POST",
			body: { board: "holdforce", force: true },
		});
		expect(forced.status).toBe(200);
		expect(forced.body.resolvedHold).toMatchObject({ outcome: "overwrite", writes: 3 });
		expect(forced.body.held).toBeUndefined();
		const file = held.file;
		expect(fs.readFileSync(file, "utf8")).toContain("held-force");
		expect(fs.readFileSync(file, "utf8")).not.toContain("theirs-force");
		const afterForce = await request("/api/elements?board=holdforce", {
			method: "POST",
			body: { id: "after1", type: "rectangle", x: 0, y: 0, width: 9, height: 9 },
		});
		expect(fs.readFileSync(file, "utf8")).toContain("after1");
		expect(afterForce.status).toBe(200);
		const refused = await request<WriteBody>("/api/elements/changes?board=holdforce", {
			method: "POST",
			body: {
				upserts: [{ id: "ours1", type: "rectangle", x: 1, y: 1, width: 5, height: 5 }],
				deletes: [],
				fullReport: true,
				clientId: "a-pane",
			},
		});
		expect(refused.status).toBe(400);
		expect(refused.body.error).toContain("full report");
	});

	test("reload discards the held copy and resumes from the foreign note", async () => {
		await stopSaving("holdreload", "theirs2");
		await request("/api/elements?board=holdreload", {
			method: "POST",
			body: { id: "held2", type: "rectangle", x: 100, y: 100, width: 30, height: 30 },
		});
		const took = await request<WriteBody>("/api/boards/open", {
			method: "POST",
			body: { board: "holdreload", reload: true },
		});
		expect(took.status).toBe(200);
		expect(took.body.held).toBeUndefined();
		const after = await request<ElementsBody>("/api/elements?board=holdreload");
		expect(after.body.elements.some((element) => element.id === "held2")).toBeFalse();
		expect(after.body.elements.some((element) => element.id === "theirs2")).toBeTrue();
		const resumed = await request("/api/elements?board=holdreload", {
			method: "POST",
			body: { id: "after-reload", type: "rectangle", x: 0, y: 0, width: 11, height: 11 },
		});
		expect(resumed.status).toBe(200);
	});

	test("save elsewhere keeps both versions and moves the held pane onto the recovered copy", async () => {
		const pane = await openTestPane(canvas.base, request, "held-pane", 0, {
			primary: true,
			focused: true,
		});
		panes.push(pane);
		const stopped = await stopSaving("holdelse", "theirs3");
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "holdelse", pane: "held-pane" },
		});
		await pane.adopt("holdelse");
		await request("/api/elements?board=holdelse", {
			method: "POST",
			body: { id: "held3", type: "rectangle", x: 100, y: 100, width: 30, height: 30 },
		});
		const elsewhere = await request<WriteBody>("/api/boards/save", {
			method: "POST",
			body: { board: "holdelse", name: "holdmine" },
		});
		expect(elsewhere.status).toBe(200);
		expect(elsewhere.body.resolvedHold?.outcome).toBe("elsewhere");
		expect(elsewhere.body.held).toBeUndefined();
		expect(fs.readFileSync(elsewhere.body.file!, "utf8")).toContain("held3");
		expect(fs.readFileSync(stopped.file, "utf8")).toContain("theirs3");
		expect(fs.readFileSync(stopped.file, "utf8")).not.toContain("held3");
		expect(elsewhere.body.panes?.moved.map((entry) => entry.place)).toEqual(["the only pane"]);
		expect(elsewhere.body.panes?.kept).toEqual([]);
		expect(pane.board()).toBe("holdmine");
		const source = await request<ElementsBody>("/api/elements?board=holdelse");
		expect(source.body.held).toBeUndefined();
		expect(source.body.elements.some((element) => element.id === "theirs3")).toBeTrue();
		expect(source.body.elements.some((element) => element.id === "held3")).toBeFalse();
	});

	test("CLI held refusal exits 5 and the following held write succeeds", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "cliheld" } });
		await request("/api/elements?board=cliheld", {
			method: "POST",
			body: { id: "cli-box", type: "rectangle", x: 0, y: 0, width: 30, height: 30 },
		});
		const file = (await request<BoardInfo>("/api/boards/info?board=cliheld")).body.file;
		fs.writeFileSync(
			file,
			fs
				.readFileSync(file, "utf8")
				.replace('"type": "rectangle"', '"type": "rectangle", "angle": 0.5'),
		);
		const add = (x: number) =>
			runCli([
				"add",
				"--board",
				"cliheld",
				"--one",
				`{"type":"ellipse","x":${x},"y":${x},"width":10,"height":10}`,
			]);
		const refused = await add(1);
		expect(refused.code).toBe(5);
		expect(refused.stderr).toMatch(/Refusing to save/);
		expect(refused.stderr).toMatch(/has stopped saving/);
		expect(refused.stderr).toMatch(/board open cliheld --reload/);
		const accepted = await add(2);
		expect(accepted.code).toBe(0);
		expect(accepted.stderr).toMatch(/stopped saving/);
	});
});
