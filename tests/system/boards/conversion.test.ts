import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { labelTextIdFor } from "../../../src/runtime/engine/labels.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import { openTestPane, waitForPaneMessage, type TestPane } from "./support/pane-websocket.ts";

interface Element {
	id: string;
	type: string;
	label?: unknown;
	start?: unknown;
	end?: unknown;
	containerId?: string;
	text?: string;
	startBinding?: { elementId: string } | null;
	endBinding?: { elementId: string } | null;
	boundElements?: Array<{ id: string; type: string }>;
}

interface MermaidBody {
	pane?: { place: string };
	code?: string;
	error?: string;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-conversion-"));
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

describe("write-boundary conversion", () => {
	test("spends labels and arrow endpoint references on the way in", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "converted" } });
		const written = await request<{ elements: Element[] }>("/api/elements/batch?board=converted", {
			method: "POST",
			body: {
				elements: [
					{
						id: "left",
						type: "rectangle",
						x: 0,
						y: 0,
						width: 200,
						height: 100,
						label: { text: "Client" },
					},
					{
						id: "right",
						type: "rectangle",
						x: 400,
						y: 0,
						width: 200,
						height: 100,
						label: { text: "API" },
					},
					{
						id: "edge",
						type: "arrow",
						x: 200,
						y: 50,
						points: [
							[0, 0],
							[200, 0],
						],
						start: { id: "left" },
						end: { id: "right" },
						label: { text: "HTTP" },
					},
				],
			},
		});
		expect(written.status).toBe(200);
		const board = await request<{ count: number; elements: Element[] }>(
			"/api/elements?board=converted",
		);
		expect(board.body.count).toBe(6);
		expect(board.body.elements.every((element) => element.label === undefined)).toBeTrue();
		expect(board.body.elements.every((element) => element.start === undefined)).toBeTrue();
		expect(board.body.elements.every((element) => element.end === undefined)).toBeTrue();
		const edge = board.body.elements.find((element) => element.id === "edge")!;
		expect(edge.startBinding?.elementId).toBe("left");
		expect(edge.endBinding?.elementId).toBe("right");
		for (const container of board.body.elements.filter((element) => element.boundElements)) {
			const labelId = container.boundElements?.find((entry) => entry.type === "text")?.id;
			expect(labelId).toBe(labelTextIdFor(container.id));
			expect(board.body.elements.find((element) => element.id === labelId)?.containerId).toBe(
				container.id,
			);
		}
	});

	test("routes Mermaid conversion to the pane holding the named board", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "payments" } });
		await request("/api/boards/new", { method: "POST", body: { board: "payments@option-a" } });
		const left = await openTestPane(canvas.base, request, "convert-left", 0, {
			primary: true,
			focused: true,
		});
		const right = await openTestPane(canvas.base, request, "convert-right", 640);
		panes.push(left, right);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "payments", pane: "left" },
		});
		await left.adopt("payments");
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "payments@option-a", pane: "right" },
		});
		await right.adopt("payments@option-a");

		const diagram = { mermaidDiagram: "graph TD; A[Client] --> B[API];" };
		const leftStart = left.since();
		const rightStart = right.since();
		const converted = await request<MermaidBody>(
			"/api/elements/from-mermaid?board=payments@option-a",
			{ method: "POST", body: diagram },
		);
		expect(converted.status).toBe(200);
		expect(converted.body.pane?.place).toBe("right");
		expect((await waitForPaneMessage(right, rightStart, "mermaid_convert"))?.board).toBe(
			"payments@option-a",
		);
		expect(
			left.seen.slice(leftStart).some((message) => message.type === "mermaid_convert"),
		).toBeFalse();

		const otherLeftStart = left.since();
		const otherRightStart = right.since();
		const onLeft = await request<MermaidBody>("/api/elements/from-mermaid?board=payments", {
			method: "POST",
			body: diagram,
		});
		expect(onLeft.status).toBe(200);
		expect(onLeft.body.pane?.place).toBe("left");
		expect(await waitForPaneMessage(left, otherLeftStart, "mermaid_convert")).toBeDefined();
		expect(
			right.seen.slice(otherRightStart).some((message) => message.type === "mermaid_convert"),
		).toBeFalse();
		await Promise.all([left.close(), right.close()]);
	});

	test("refuses conversion for an off-screen board without sending it elsewhere", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "visible-left" } });
		await request("/api/boards/new", { method: "POST", body: { board: "visible-right" } });
		const left = await openTestPane(canvas.base, request, "offscreen-left", 0, {
			primary: true,
			focused: true,
		});
		const right = await openTestPane(canvas.base, request, "offscreen-right", 640);
		panes.push(left, right);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "visible-left", pane: "left" },
		});
		await left.adopt("visible-left");
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "visible-right", pane: "right" },
		});
		await right.adopt("visible-right");
		const leftStart = left.since();
		const rightStart = right.since();
		const refused = await request<MermaidBody>("/api/elements/from-mermaid?board=scratch", {
			method: "POST",
			body: { mermaidDiagram: "graph TD; A --> B;" },
		});
		expect(refused.status).toBe(409);
		expect(refused.body.error).toContain("left (visible-left)");
		expect(refused.body.error).toContain("right (visible-right)");
		expect(refused.body.error).toMatch(/board open scratch --pane <left\|right>/);
		expect(
			left.seen.slice(leftStart).some((message) => message.type === "mermaid_convert"),
		).toBeFalse();
		expect(
			right.seen.slice(rightStart).some((message) => message.type === "mermaid_convert"),
		).toBeFalse();
		await Promise.all([left.close(), right.close()]);
	});

	test("offers a free pane and reports the exact no-browser conversion refusal", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "mermaid-visible" } });
		await request("/api/boards/new", {
			method: "POST",
			body: { board: "payments@option-a" },
		});
		const only = await openTestPane(canvas.base, request, "mermaid-only", 0, {
			primary: true,
			focused: true,
		});
		panes.push(only);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "mermaid-visible" },
		});
		await only.adopt("mermaid-visible");
		const diagram = { mermaidDiagram: "graph TD; A --> B;" };
		const roomForOne = await request<MermaidBody>(
			"/api/elements/from-mermaid?board=payments@option-a",
			{ method: "POST", body: diagram },
		);
		expect(roomForOne.status).toBe(409);
		expect(roomForOne.body.error).toContain("archboard pane open --board payments@option-a");
		expect(roomForOne.body.error).not.toContain("board open");

		await only.close();
		const headless = await request<MermaidBody & { success?: boolean }>(
			"/api/elements/from-mermaid?board=payments@option-a",
			{ method: "POST", body: diagram },
		);
		expect(headless.status).toBe(503);
		expect(headless.body).toEqual({
			success: false,
			code: "BROWSER_REQUIRED",
			error:
				"No browser is open, and mermaid conversion happens in the browser. Open the canvas first.",
		});
	});
});
