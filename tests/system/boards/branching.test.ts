import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import { openTestPane, waitForPaneMessage, type TestPane } from "./support/pane-websocket.ts";

interface Element {
	id: string;
	type: string;
	text?: string;
	customData?: { archboard?: { node?: string; variant?: string } };
}

interface ElementsBody {
	count: number;
	elements: Element[];
}

interface SaveBody {
	board: string;
	file: string;
	savedFrom?: string;
	saveKind?: string;
	identity?: { level?: string };
	panes?: {
		moved: Array<{ place: string }>;
		kept: Array<{ place: string }>;
		onScreen: Array<{ place: string; board: string }>;
	};
}

interface CompareBody {
	summary: { nodesRemoved: number; nodesChanged: number; nodesUnchanged: number };
	nodes: {
		removed: Array<{ node: string }>;
		changed: Array<{ changes: { variantAnomaly?: { to: string } } }>;
	};
	warnings: string[];
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-branching-"));
const port = 43_000 + Math.floor(Math.random() * 2_000);
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

const promoted = (node: string, label: string, x: number, kind: string) => ({
	type: "rectangle",
	x,
	y: 400,
	width: 160,
	height: 80,
	label: { text: label },
	customData: { archboard: { node, kind, variant: "current" } },
});

async function runCli(args: string[]): Promise<{ code: number | null; stderr: string }> {
	return new Promise((resolve) => {
		const child = spawn(
			process.execPath,
			[
				path.join(repoRoot, "src/bin.ts"),
				...args,
				"--doing",
				"checking branch and promotion behavior",
			],
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

describe("branching", () => {
	test("stamps copied nodes with the destination variant and preserves the source", async () => {
		await request("/api/boards/new", {
			method: "POST",
			body: { board: "ledger", level: "service" },
		});
		const ids: string[] = [];
		for (const spec of [
			["api", "API", 0, "gateway"],
			["worker", "Worker", 300, "service"],
			["store", "Store", 600, "datastore"],
		] as const) {
			const [node, label, x, kind] = spec;
			const made = await request<{ element: Element }>("/api/elements?board=ledger", {
				method: "POST",
				body: promoted(node, label, x, kind),
			});
			ids.push(made.body.element.id);
		}
		const branch = await request<SaveBody>("/api/boards/save?board=ledger", {
			method: "POST",
			body: { name: "ledger", variant: "option-a" },
		});
		expect(branch.body).toMatchObject({
			board: "ledger@option-a",
			savedFrom: "ledger",
			identity: { level: "service" },
		});
		const copied = await request<ElementsBody>("/api/elements?board=ledger@option-a");
		const copiedVariants = copied.body.elements
			.filter((element) => element.customData?.archboard?.node)
			.map((element) => element.customData?.archboard?.variant);
		expect(copiedVariants).toEqual(["option-a", "option-a", "option-a"]);
		const origin = await request<ElementsBody>("/api/elements?board=ledger");
		expect(
			origin.body.elements
				.filter((element) => element.customData?.archboard?.node)
				.map((element) => element.customData?.archboard?.variant),
		).toEqual(["current", "current", "current"]);
		expect(fs.readFileSync(branch.body.file, "utf8")).toMatch(/^level: service$/m);

		await request(`/api/elements/${ids[1]}?board=ledger@option-a`, { method: "DELETE" });
		const diff = await request<CompareBody>("/api/boards/compare?from=ledger&to=ledger@option-a");
		expect(diff.body.summary).toMatchObject({
			nodesRemoved: 1,
			nodesChanged: 0,
			nodesUnchanged: 2,
		});
		expect(diff.body.nodes.removed[0]?.node).toBe("worker");
		expect(diff.body.warnings.some((warning) => /different variant/.test(warning))).toBeFalse();
	});

	test("detects a stale copied variant when no branch restamping occurred", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "billing" } });
		await request("/api/boards/new", { method: "POST", body: { board: "billing@option-b" } });
		await request("/api/elements?board=billing", {
			method: "POST",
			body: promoted("gw", "Gateway", 0, "gateway"),
		});
		await request("/api/elements?board=billing@option-b", {
			method: "POST",
			body: promoted("gw", "Gateway", 0, "gateway"),
		});
		const diff = await request<CompareBody>("/api/boards/compare?from=billing&to=billing@option-b");
		expect(diff.body.nodes.changed[0]?.changes.variantAnomaly?.to).toBe("current");
		expect(diff.body.warnings.some((warning) => /different variant/.test(warning))).toBeTrue();
	});

	test("promotes using the board variant unless the caller overrides it", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "shipping" } });
		await request("/api/boards/new", { method: "POST", body: { board: "shipping@option-a" } });
		const box = async (board: string, id: string) => {
			await request(`/api/elements?board=${board}`, {
				method: "POST",
				body: { id, type: "rectangle", x: 0, y: 800, width: 200, height: 100, label: { text: id } },
			});
		};
		await box("shipping@option-a", "quote");
		expect(
			(
				await runCli([
					"promote",
					"--board",
					"shipping@option-a",
					"--ids",
					"quote",
					"--kind",
					"service",
				])
			).code,
		).toBe(0);
		const promotedThere = await request<{ element: Element }>(
			"/api/elements/quote?board=shipping@option-a",
		);
		expect(promotedThere.body.element.customData?.archboard?.variant).toBe("option-a");

		await box("shipping@option-a", "printer");
		expect(
			(
				await runCli([
					"promote",
					"--board",
					"shipping@option-a",
					"--ids",
					"printer",
					"--kind",
					"service",
					"--variant",
					"option-z",
				])
			).code,
		).toBe(0);
		const overridden = await request<{ element: Element }>(
			"/api/elements/printer?board=shipping@option-a",
		);
		expect(overridden.body.element.customData?.archboard?.variant).toBe("option-z");
	});

	test("branches off screen without moving either pane", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "pane-ledger" } });
		await request("/api/elements?board=pane-ledger", {
			method: "POST",
			body: { id: "pane1", type: "rectangle", x: 0, y: 0, width: 40, height: 40 },
		});
		await request("/api/boards/save?board=pane-ledger", {
			method: "POST",
			body: { variant: "option-a" },
		});
		const left = await openTestPane(port, request, "branch-left", 0, {
			primary: true,
			focused: true,
		});
		const right = await openTestPane(port, request, "branch-right", 640);
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
		expect(branch.body.panes?.moved).toEqual([]);
		expect(branch.body.panes?.kept.map((entry) => entry.place)).toEqual(["left"]);
		expect(branch.body.panes?.onScreen.map((entry) => `${entry.place}:${entry.board}`)).toEqual([
			"left:pane-ledger",
			"right:pane-ledger@option-a",
		]);
		expect(
			left.seen.slice(leftStart).some((message) => message.type === "board_switched"),
		).toBeFalse();
		expect(
			right.seen.slice(rightStart).some((message) => message.type === "board_switched"),
		).toBeFalse();
		expect(
			(await request<ElementsBody>("/api/elements?board=pane-ledger@option-c")).body.count,
		).toBe(1);
	});

	test("refreshes an on-screen save-as destination with an exact replacement delta", async () => {
		await Promise.all(panes.map((pane) => pane.close()));
		await Bun.sleep(100);
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
		await request("/api/boards/save?board=save-source", { method: "POST" });
		await request("/api/boards/save?board=save-destination", { method: "POST" });
		const left = await openTestPane(port, request, "replacement-left", 0, {
			primary: true,
			focused: true,
		});
		const right = await openTestPane(port, request, "replacement-right", 640);
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
		const rightStart = right.since();
		const saved = await request<SaveBody>("/api/boards/save?board=save-source", {
			method: "POST",
			body: { name: "save-destination" },
		});
		const replacement = await waitForPaneMessage(right, rightStart, "elements_changed");
		expect(saved.status, JSON.stringify(saved.body)).toBe(200);
		expect(((replacement?.created ?? []) as Element[]).map((element) => element.id)).toEqual([
			"created",
		]);
		expect(((replacement?.updated ?? []) as Element[]).map((element) => element.id)).toEqual([
			"same",
		]);
		expect(replacement?.deleted).toEqual(["deleted"]);
		expect(left.board()).toBe("save-source");
		expect(right.board()).toBe("save-destination");
	});
});
