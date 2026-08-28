import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { TEST_PANE_SOCKET_SETTLE_MS } from "../../../src/shared/timing/timing.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import {
	openTestPane,
	waitForPaneMessage,
	type PaneMessage,
	type TestPane,
} from "./support/pane-websocket.ts";

interface Element {
	id: string;
	type: string;
	text?: string;
}

interface ElementsBody {
	count: number;
	elements: Element[];
}

interface SaveBody {
	savedFrom?: string;
	saveKind?: string;
	panes?: {
		moved: Array<{ place: string }>;
		kept: Array<{ place: string }>;
		onScreen: Array<{ place: string; board: string }>;
	};
}

interface PanesBody {
	panes: Array<{ clientId: string; board: string }>;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-branching-effects-"));
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;
const panes: TestPane[] = [];

beforeAll(async () => {
	canvas = await startOwnedCanvas({ serverPath: path.join(repoRoot, "src/server.ts"), vault });
	request = createJsonRequester(canvas);
});

afterAll(async () => {
	await Promise.all(panes.map((pane) => pane.close()));
	await canvas?.dispose();
});

async function closePanes(): Promise<void> {
	await Promise.all(panes.map((pane) => pane.close()));
	panes.length = 0;
	await Bun.sleep(TEST_PANE_SOCKET_SETTLE_MS);
}

async function runCli(args: string[]): Promise<{ code: number | null; stderr: string }> {
	return new Promise((resolve) => {
		const child = spawn(
			process.execPath,
			[path.join(repoRoot, "src/bin.ts"), ...args, "--doing", "checking branch pane effects"],
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

describe("branching pane effects", () => {
	test("branches off screen without moving either pane", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "pane-ledger" } });
		for (const [id, label, x] of [
			["api", "API", 0],
			["worker", "Worker", 300],
			["store", "Store", 600],
		] as const) {
			await request("/api/elements?board=pane-ledger", {
				method: "POST",
				body: { id, type: "rectangle", x, y: 0, width: 160, height: 80, label: { text: label } },
			});
		}
		await request("/api/elements?board=pane-ledger", {
			method: "POST",
			body: { id: "loose-note", type: "text", x: 0, y: 160, text: "a note to self" },
		});
		await request("/api/boards/save?board=pane-ledger", {
			method: "POST",
			body: { variant: "option-a" },
		});
		const left = await openTestPane(canvas.base, request, "branch-left", 0, {
			primary: true,
			focused: true,
		});
		const right = await openTestPane(canvas.base, request, "branch-right", 640);
		panes.push(left, right);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "pane-ledger", pane: "left" },
		});
		await left.adopt("pane-ledger");
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "pane-ledger@option-a", pane: "right" },
		});
		await right.adopt("pane-ledger@option-a");
		const leftStart = left.since();
		const rightStart = right.since();
		const branch = await request<SaveBody>("/api/boards/save?board=pane-ledger", {
			method: "POST",
			body: { variant: "option-c" },
		});
		expect(branch.body.saveKind).toBe("branch");
		expect(branch.body.savedFrom).toBe("pane-ledger");
		expect(branch.body.panes?.moved).toEqual([]);
		expect(branch.body.panes?.kept.map((entry) => entry.place)).toEqual(["left"]);
		expect(branch.body.panes?.onScreen.map((entry) => `${entry.place}:${entry.board}`)).toEqual([
			"left:pane-ledger",
			"right:pane-ledger@option-a",
		]);
		expect(left.board()).toBe("pane-ledger");
		expect(right.board()).toBe("pane-ledger@option-a");
		expect(
			left.seen.slice(leftStart).every((message) => message.type !== "board_switched"),
		).toBeTrue();
		expect(
			right.seen.slice(rightStart).every((message) => message.type !== "board_switched"),
		).toBeTrue();
		const offScreen = await request<ElementsBody>("/api/elements?board=pane-ledger@option-c");
		expect(offScreen.body.count).toBe(7);
		expect(
			offScreen.body.elements.some(
				(element) => element.type === "text" && element.text === "a note to self",
			),
		).toBeTrue();
	});

	test("refreshes an on-screen save-as destination with an exact replacement delta", async () => {
		await closePanes();
		await request("/api/boards/new", { method: "POST", body: { board: "save-source" } });
		await request("/api/boards/new", { method: "POST", body: { board: "save-destination" } });
		for (const [board, element] of [
			["save-source", { id: "same", type: "rectangle", x: 10, y: 10, width: 80, height: 40 }],
			["save-source", { id: "created", type: "ellipse", x: 120, y: 10, width: 60, height: 60 }],
			["save-destination", { id: "same", type: "rectangle", x: 30, y: 30, width: 40, height: 40 }],
			[
				"save-destination",
				{ id: "deleted", type: "diamond", x: 220, y: 10, width: 60, height: 60 },
			],
		] as const) {
			await request(`/api/elements?board=${board}`, { method: "POST", body: element });
		}
		const left = await openTestPane(canvas.base, request, "replacement-left", 0, {
			primary: true,
			focused: true,
		});
		const right = await openTestPane(canvas.base, request, "replacement-right", 640);
		panes.push(left, right);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "save-source", pane: "left" },
		});
		await left.adopt("save-source");
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "save-destination", pane: "right" },
		});
		await right.adopt("save-destination");
		const sourceStart = left.since();
		const destinationStart = right.since();
		const acknowledgeViewport = async (message: PaneMessage): Promise<void> => {
			if (message.type !== "set_viewport") return;
			await request("/api/viewport/result", {
				method: "POST",
				body: { requestId: message.requestId, success: true },
			});
		};
		left.socket.on("message", (data) => {
			void acknowledgeViewport(JSON.parse(data.toString()) as PaneMessage);
		});
		const saved = await request<SaveBody>("/api/boards/save?board=save-source", {
			method: "POST",
			body: { name: "save-destination" },
		});
		const replacement = await waitForPaneMessage(right, destinationStart, "elements_changed");
		const persistedReplacement = await request<ElementsBody>(
			"/api/elements?board=save-destination",
		);
		const replacementById = new Map(
			persistedReplacement.body.elements.map((element) => [element.id, element]),
		);
		const barrierStart = left.since();
		const sourceBarrier = await request("/api/viewport", {
			method: "POST",
			body: { scrollToContent: true, pane: "left" },
		});
		const sourceBarrierMessage = await waitForPaneMessage(left, barrierStart, "set_viewport");
		const authoritative = await request<PanesBody>("/api/panes");
		expect(saved.status, JSON.stringify(saved.body)).toBe(200);
		expect(replacement?.board).toBe("save-destination");
		expect((replacement?.created ?? []) as Element[]).toEqual([replacementById.get("created")!]);
		expect((replacement?.updated ?? []) as Element[]).toEqual([replacementById.get("same")!]);
		expect(replacement?.deleted).toEqual(["deleted"]);
		expect(sourceBarrier.status).toBe(200);
		expect(sourceBarrierMessage).toBeDefined();
		expect(left.board()).toBe("save-source");
		expect(
			left.seen.slice(sourceStart).every((message) => message.type !== "board_switched"),
		).toBeTrue();
		expect(saved.body.panes?.moved).toHaveLength(0);
		expect(
			authoritative.body.panes.find((pane) => pane.clientId === "replacement-left")?.board,
		).toBe("save-source");
		expect(
			authoritative.body.panes.find((pane) => pane.clientId === "replacement-right")?.board,
		).toBe("save-destination");
		expect(right.board()).toBe("save-destination");
	});

	test("reports branch capacity, moves named scratch, and notifies same-board saves", async () => {
		await closePanes();
		await request("/api/boards/new", { method: "POST", body: { board: "response-source" } });
		await request("/api/elements?board=response-source", {
			method: "POST",
			body: { id: "response-box", type: "rectangle", x: 0, y: 0, width: 40, height: 40 },
		});
		const left = await openTestPane(canvas.base, request, "response-left", 0, {
			primary: true,
			focused: true,
		});
		const right = await openTestPane(canvas.base, request, "response-right", 640);
		panes.push(left, right);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "response-source", pane: "left" },
		});
		await left.adopt("response-source");
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "scratch", pane: "right" },
		});
		await right.adopt("scratch");
		await request("/api/elements?board=scratch", {
			method: "POST",
			body: { id: "scratch-box", type: "rectangle", x: 0, y: 0, width: 40, height: 40 },
		});
		const named = await request<SaveBody>("/api/boards/save?board=scratch", {
			method: "POST",
			body: { name: "response-sketch", level: "module" },
		});
		expect(named.body).toMatchObject({ saveKind: "named", panes: { kept: [] } });
		expect(named.body.panes?.moved.map((entry) => entry.place)).toEqual(["right"]);
		expect(right.board()).toBe("response-sketch");
		expect(left.board()).toBe("response-source");

		const sameStart = left.since();
		const same = await request<SaveBody>("/api/boards/save?board=response-source", {
			method: "POST",
		});
		expect(same.body).toMatchObject({ saveKind: "same-board", panes: { moved: [], kept: [] } });
		expect((await waitForPaneMessage(left, sameStart, "elements_changed"))?.board).toBe(
			"response-source",
		);

		const full = await runCli([
			"board",
			"save",
			"--board",
			"response-source",
			"--variant",
			"option-full",
		]);
		expect(full.code).toBe(0);
		expect(full.stderr).toMatch(/board open response-source@option-full --pane left/);
		expect(full.stderr).toMatch(/--pane left` replaces "response-source"/);
		expect(full.stderr).toMatch(/--pane right` replaces "response-sketch"/);

		await right.close();
		await Bun.sleep(TEST_PANE_SOCKET_SETTLE_MS);
		const room = await runCli([
			"board",
			"save",
			"--board",
			"response-source",
			"--variant",
			"option-room",
		]);
		expect(room.code).toBe(0);
		expect(room.stderr).toMatch(/pane open --board response-source@option-room/);
		expect(room.stderr).not.toMatch(/board open/);
		expect(room.stderr).toMatch(/the only pane still holds "response-source"/);
	});
});
