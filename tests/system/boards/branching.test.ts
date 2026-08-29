import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { planPromotion } from "../../../src/runtime/engine/promote.ts";
import { expandElements } from "../../../src/runtime/engine/expand-elements.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";

interface Element {
	id: string;
	customData?: { archboard?: { node?: string; variant?: string } };
}

interface ElementsBody {
	elements: Element[];
}

interface SaveBody {
	board: string;
	file: string;
	savedFrom?: string;
	identity?: { level?: string };
}

interface ChangesBody {
	events: Array<{ board: string }>;
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
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;

beforeAll(async () => {
	canvas = await startOwnedCanvas({
		serverPath: path.join(repoRoot, "src/server.ts"),
		vault,
	});
	request = createJsonRequester(canvas);
});

afterAll(async () => {
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
	test("promotion plans inherit variant but only record an explicit level", () => {
		const shape = expandElements(
			[
				{
					id: "planned",
					type: "rectangle",
					x: 0,
					y: 0,
					width: 200,
					height: 100,
				} as const,
			],
			{ deterministic: true, forStore: true },
		)[0]!;
		const inherited = planPromotion({
			targets: [shape],
			board: [shape],
			kind: "service",
			name: "Planned",
			boardVariant: "option-a",
		});
		expect(inherited.nodes[0]?.variant).toBe("option-a");
		expect(inherited.nodes[0]?.level).toBeUndefined();
		const explicit = planPromotion({
			targets: [shape],
			board: [shape],
			kind: "service",
			name: "Planned",
			boardVariant: "option-a",
			level: "service",
		});
		expect(explicit.nodes[0]?.level).toBe("service");
	});

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
		expect(branch.status).toBe(200);
		expect(branch.body.board).toBe("ledger@option-a");
		expect(branch.body).toMatchObject({
			board: "ledger@option-a",
			savedFrom: "ledger",
			identity: { level: "service" },
		});
		const changes = await request<ChangesBody>("/api/changes?board=ledger@option-a&since=0");
		expect(changes.status).toBe(200);
		expect(changes.body.events.some((event) => event.board === "ledger@option-a")).toBeTrue();
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
		const branchNote = fs.readFileSync(branch.body.file, "utf8");
		expect(branchNote).not.toMatch(/"variant"\s*:\s*"current"/);
		expect(branchNote).toMatch(/"variant"\s*:\s*"option-a"/);
		expect(branchNote).toMatch(/^level: service$/m);
		const levelled = await request<SaveBody>("/api/boards/save?board=ledger", {
			method: "POST",
			body: { name: "ledger@option-d", level: "module" },
		});
		expect(levelled.body.identity?.level).toBe("module");

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
		const box = async (board: string, id: string, label: string) => {
			await request(`/api/elements?board=${board}`, {
				method: "POST",
				body: {
					id,
					type: "rectangle",
					x: 0,
					y: 800,
					width: 200,
					height: 100,
					label: { text: label },
				},
			});
		};
		await box("shipping@option-a", "quote", "Rate Quoter");
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

		await box("shipping", "current-quote", "Rate Quoter");
		const promotedHere = await runCli([
			"promote",
			"--board",
			"shipping",
			"--ids",
			"current-quote",
			"--kind",
			"service",
		]);
		expect(promotedHere.code).toBe(0);
		const current = await request<{ element: Element }>(
			"/api/elements/current-quote?board=shipping",
		);
		expect(current.body.element.customData?.archboard?.variant).toBe("current");

		const diff = await request<CompareBody>(
			"/api/boards/compare?from=shipping&to=shipping@option-a",
		);
		expect(diff.body.summary.nodesChanged).toBe(0);
		expect(diff.body.summary.nodesUnchanged).toBe(1);
		expect(diff.body.warnings.some((warning) => /different variant/.test(warning))).toBeFalse();

		await box("shipping@option-a", "printer", "Label Printer");
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
});
