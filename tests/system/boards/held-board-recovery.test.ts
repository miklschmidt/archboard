import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import { openTestPane, type PaneMessage, type TestPane } from "./support/pane-websocket.ts";

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
const port = 51_000 + Math.floor(Math.random() * 2_000);
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
	fs.writeFileSync(
		file,
		note.replace(
			'"id": "ours1"',
			`"id": "${theirId}", "type": "rectangle", "x": 800, "y": 800, ` +
				'"width": 999, "height": 40}, {"id": "ours1"',
		),
	);
	const refused = await request<WriteBody>(`/api/elements?board=${board}`, {
		method: "POST",
		body: { id: "lost1", type: "ellipse", x: 5, y: 5, width: 20, height: 20 },
	});
	expect(refused.status).toBe(409);
	return { file, refusal: refused.body };
}

describe("held board recovery", () => {
	test("stops saving after a foreign note edit and keeps later writes only in the held copy", async () => {
		const held = await stopSaving("holdover", "theirs1");
		expect(held.refusal.held).toMatchObject({ board: "holdover", writes: 0 });
		expect(held.refusal.held?.since).toBeString();
		expect(held.refusal.held?.conflict?.outcomes).toMatchObject({
			reload: expect.any(String),
			overwrite: expect.any(String),
			saveAs: expect.any(String),
		});
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
		const forced = await request<WriteBody>("/api/boards/save", {
			method: "POST",
			body: { board: "holdforce", force: true },
		});
		expect(forced.status).toBe(200);
		expect(forced.body.resolvedHold).toMatchObject({ outcome: "overwrite", writes: 2 });
		expect(forced.body.held).toBeUndefined();
		const file = held.file;
		expect(fs.readFileSync(file, "utf8")).toContain("held-force");
		expect(fs.readFileSync(file, "utf8")).not.toContain("theirs-force");
		await request("/api/elements?board=holdforce", {
			method: "POST",
			body: { id: "after1", type: "rectangle", x: 0, y: 0, width: 9, height: 9 },
		});
		expect(fs.readFileSync(file, "utf8")).toContain("after1");
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
	});

	test("save elsewhere keeps both versions and moves the held pane onto the recovered copy", async () => {
		const pane = await openTestPane(port, request, "held-pane", 0, {
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
		expect(fs.readFileSync(elsewhere.body.file!, "utf8")).toContain("held3");
		expect(fs.readFileSync(stopped.file, "utf8")).toContain("theirs3");
		expect(fs.readFileSync(stopped.file, "utf8")).not.toContain("held3");
		expect(elsewhere.body.panes?.moved.map((entry) => entry.place)).toEqual(["the only pane"]);
		expect(pane.board()).toBe("holdmine");
		const source = await request<ElementsBody>("/api/elements?board=holdelse");
		expect(source.body.held).toBeUndefined();
		expect(source.body.elements.some((element) => element.id === "theirs3")).toBeTrue();
	});

	test("notifies a pane once when its note changes and clears the mark on reload", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "watched" } });
		await request("/api/elements?board=watched", {
			method: "POST",
			body: { id: "seen1", type: "rectangle", x: 1, y: 1, width: 40, height: 40 },
		});
		const pane = await openTestPane(port, request, "note-pane", 640, {
			primary: true,
			focused: true,
		});
		panes.push(pane);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "watched", pane: "note-pane" },
		});
		await pane.adopt("watched");
		const file = (await request<BoardInfo>("/api/boards/info?board=watched")).body.file;
		const start = pane.since();
		fs.writeFileSync(file, `${fs.readFileSync(file, "utf8")}\n<!-- theirs -->\n`);
		let changed: PaneMessage | undefined;
		const deadline = Date.now() + 4_000;
		while (Date.now() < deadline && !changed) {
			changed = pane.seen
				.slice(start)
				.find(
					(message) =>
						message.type === "board_note" &&
						(message.writtenElsewhere as { reason?: string } | null)?.reason === "changed",
				);
			if (!changed) await Bun.sleep(50);
		}
		expect(changed).toBeDefined();
		expect(
			pane.seen
				.slice(start)
				.filter((message) => message.type === "board_note" && message.writtenElsewhere !== null),
		).toHaveLength(1);
		expect(pane.seen.slice(start).some((message) => message.type === "board_hold")).toBeFalse();
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "watched", pane: "note-pane", reload: true },
		});
		const clearedDeadline = Date.now() + 1_000;
		while (
			Date.now() < clearedDeadline &&
			!pane.seen
				.slice(start)
				.some((message) => message.type === "board_note" && message.writtenElsewhere === null)
		) {
			await Bun.sleep(20);
		}
		expect(
			pane.seen
				.slice(start)
				.some((message) => message.type === "board_note" && message.writtenElsewhere === null),
		).toBeTrue();
	});
});
