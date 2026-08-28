import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import { openTestPane, type PaneMessage, type TestPane } from "./support/pane-websocket.ts";

interface PaneReport {
	paneCount: number;
	sameBoard?: boolean;
	panes: Array<{
		paneId: string;
		clientId: string;
		board: string;
		selection?: { count: number };
	}>;
}

interface PaneAction {
	paneCount: number;
	pane?: { clientId: string; place: string };
	closed?: { clientId: string; place: string };
	error?: string;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-pane-addressing-"));
const port = 41_000 + Math.floor(Math.random() * 2_000);
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;
const panes: TestPane[] = [];
let left: TestPane;
let right: TestPane;

beforeAll(async () => {
	canvas = await startOwnedCanvas({
		serverPath: path.join(repoRoot, "src/server.ts"),
		port,
		vault,
	});
	request = createJsonRequester(canvas);
	await request("/api/boards/new", { method: "POST", body: { board: "payments" } });
	await request("/api/boards/new", { method: "POST", body: { board: "payments@option-a" } });
	left = await createPane("p-left", 0, true);
	await request("/api/boards/open", {
		method: "POST",
		body: { board: "payments" },
	});
	await left.adopt("payments");
	right = await createPane("p-right", 640);
	await request("/api/boards/open", {
		method: "POST",
		body: { board: "payments@option-a", pane: "right" },
	});
	await right.adopt("payments@option-a");
});

afterAll(async () => {
	await Promise.all(panes.map((openPane) => openPane.close()));
	await canvas?.dispose();
});

async function createPane(clientId: string, x: number, primary = false): Promise<TestPane> {
	const opened = await openTestPane(port, request, clientId, x, { primary, focused: primary });
	panes.push(opened);
	return opened;
}

describe("pane addressing", () => {
	test("switches only the addressed pane and reports reading order", async () => {
		const report = await request<PaneReport>("/api/panes");
		expect(report.body.sameBoard).toBeFalse();
		expect(report.body.panes.map((entry) => entry.board)).toEqual([
			"payments",
			"payments@option-a",
		]);
	});

	test("keeps selection with the pane that made it", async () => {
		const made = await request<{ element: { id: string } }>(
			"/api/elements?board=payments@option-a",
			{
				method: "POST",
				body: { type: "rectangle", x: 10, y: 10, width: 100, height: 60 },
			},
		);
		await request("/api/selection", {
			method: "POST",
			body: { elementIds: [made.body.element.id], clientId: right.clientId },
		});
		await left.adopt("payments");
		const report = await request<PaneReport>("/api/panes");
		expect(
			report.body.panes.find((entry) => entry.paneId === right.clientId)?.selection?.count,
		).toBe(1);
		expect(
			report.body.panes.find((entry) => entry.paneId === left.clientId)?.selection?.count,
		).toBe(0);
		await request("/api/elements/clear?board=payments", { method: "DELETE" });
		const after = await request<PaneReport>("/api/panes");
		expect(
			after.body.panes.find((entry) => entry.paneId === right.clientId)?.selection?.count,
		).toBe(1);
	});

	test("addresses viewport movement to one pane", async () => {
		const leftStart = left.since();
		const rightStart = right.since();
		const reply = async (message: PaneMessage): Promise<void> => {
			if (message.type !== "set_viewport") return;
			await request("/api/viewport/result", {
				method: "POST",
				body: { requestId: message.requestId, success: true },
			});
		};
		right.socket.on("message", (data) => void reply(JSON.parse(data.toString()) as PaneMessage));
		const moved = await request<{ success: boolean }>("/api/viewport", {
			method: "POST",
			body: { scrollToContent: true, pane: "right" },
		});
		expect(moved.status).toBe(200);
		expect(
			right.seen.slice(rightStart).some((message) => message.type === "set_viewport"),
		).toBeTrue();
		expect(
			left.seen.slice(leftStart).some((message) => message.type === "set_viewport"),
		).toBeFalse();
	});

	test("opens and closes a registered second pane through the shell messages", async () => {
		await right.close();
		await Bun.sleep(100);
		let shellPane: TestPane | undefined;
		left.socket.on("message", (data) => {
			const message = JSON.parse(data.toString()) as PaneMessage;
			if (message.type === "pane_open") {
				void createPane("p-shell", 640).then((opened) => {
					shellPane = opened;
					return undefined;
				});
			}
		});
		const split = await request<PaneAction>("/api/panes/open", { method: "POST" });
		expect(split.status).toBe(200);
		expect(split.body).toMatchObject({ paneCount: 2, pane: { place: "right" } });
		expect(shellPane?.board()).toBe("payments");

		shellPane!.socket.on("message", (data) => {
			const message = JSON.parse(data.toString()) as PaneMessage;
			if (message.type === "pane_close") void shellPane!.close();
		});
		const closed = await request<PaneAction>("/api/panes/close", {
			method: "POST",
			body: { pane: "right" },
		});
		expect(closed.status).toBe(200);
		expect(closed.body).toMatchObject({ paneCount: 1, closed: { place: "right" } });
		expect((await request<PaneReport>("/api/panes")).body.panes[0]?.paneId).toBe("p-left");
	});
});
