import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { readPngDimensions } from "../../../src/cli/finding-rendering/index.ts";
import { findingRasterDimensions } from "../../../src/shared/finding-raster/index.ts";
import { isBlockId } from "../../../src/shared/ids/ids.ts";
import {
	LOCK_LEASE_MS,
	TEST_SERVER_RENDERING_CASE_TIMEOUT_MS,
	TEST_SERVER_RENDERING_LEASE_CASE_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { findingElements, findingFile } from "../browser/fixtures/fixed-point-scene.ts";
import { processExists, startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import { pngRgbCounts } from "./support/png-colors.ts";

interface RendererStatus {
	started: boolean;
	accepting: boolean;
	active: boolean;
	queued: number;
	chromiumStarts: number;
	chromiumPid: number | null;
	tempRoot: string | null;
	profile: string | null;
	controlPort: number | null;
	fixturePort: number | null;
}

interface HealthBody {
	websocket_clients: number;
	renderer: RendererStatus;
	application: { activeMutations: Array<{ name: string; kind: string }> };
}

interface RenderBody {
	success: boolean;
	code?: string;
	error?: string;
	board: string;
	sourceFingerprint: string;
	format: "png" | "svg";
	data: string;
	width: number;
	height: number;
	backgroundColor: string;
}

interface MermaidElement {
	id: string;
	type: string;
	text?: string;
	containerId?: string | null;
	startBinding?: { elementId: string } | null;
	endBinding?: { elementId: string } | null;
}

interface FindingBody {
	board: string;
	sourceFingerprint: string;
	sourceRenderable: boolean;
	report: {
		findings: Array<{
			code: string;
			focusBBox?: { x: number; y: number; width: number; height: number };
		}>;
	};
	results: Array<{ findingIndex: number; data?: string; failure?: string }>;
}

const root = resolve(import.meta.dir, "../../..");
const fixture = readFileSync(
	join(root, "docs/design/server-rendering-boundary-fixtures/board.excalidraw.md"),
	"utf8",
);
const vault = mkdtempSync(join(tmpdir(), "archboard-server-rendering-"));
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;
let ownedRenderer: RendererStatus | null = null;

function note(board: string, content: string): void {
	writeFileSync(
		join(vault, `${board}.excalidraw.md`),
		content.replace("board: render-proof", `board: ${board}`),
	);
}

function render(board: string, body: Record<string, unknown>) {
	return request<RenderBody>(`/api/render/board?board=${encodeURIComponent(board)}`, {
		method: "POST",
		body,
	});
}

async function expectLoopbackPortReleased(port: number): Promise<void> {
	let probe: ReturnType<typeof Bun.serve> | null = null;
	try {
		probe = Bun.serve({
			hostname: "127.0.0.1",
			port,
			fetch: () => new Response("released"),
		});
		expect(probe.port).toBe(port);
	} finally {
		if (probe) await probe.stop(true);
	}
}

async function waitForHealth(
	predicate: (health: HealthBody) => boolean,
	what: string,
): Promise<HealthBody> {
	const deadline = Date.now() + 1_500;
	for (;;) {
		const health = (await request<HealthBody>("/health")).body;
		if (predicate(health)) return health;
		if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${what}.`);
		await Bun.sleep(20);
	}
}

beforeAll(async () => {
	note(
		"render-proof",
		fixture.replace(
			'"customData": { "archboard": { "kind": "service" } }',
			'"customData": { "archboard": { "kind": "service", "binding": { "repo": "github.com/acme/render", "path": "src/service.ts" } } }',
		),
	);
	note("missing-file", fixture.replace('"fileId": "pixel"', '"fileId": "absent"'));
	note("missing-font", fixture.replaceAll('"fontFamily": 5', '"fontFamily": 99'));
	canvas = await startOwnedCanvas({ serverPath: join(root, "src/server.ts"), vault });
	request = createJsonRequester(canvas);
});

afterAll(async () => {
	await canvas?.dispose();
});

describe.serial("server-owned board rendering", () => {
	test(
		"renders one immutable named-board snapshot to PNG and SVG without a browser client",
		async () => {
			const before = await request<HealthBody>("/health");
			expect(before.body.websocket_clients).toBe(0);
			expect(before.body.renderer).toMatchObject({
				started: true,
				accepting: true,
				chromiumStarts: 0,
				chromiumPid: null,
				tempRoot: null,
			});

			const [png, svg] = await Promise.all([
				render("render-proof", {
					format: "png",
					background: true,
					padding: 16,
					scale: 1,
				}),
				render("render-proof", {
					format: "svg",
					background: true,
					padding: 16,
					scale: 1,
				}),
			]);
			expect(png.status, png.body.error).toBe(200);
			expect(svg.status, svg.body.error).toBe(200);
			expect(png.body).toMatchObject({
				success: true,
				board: "render-proof",
				format: "png",
				width: 566,
				height: 417,
				backgroundColor: "#f8fafc",
			});
			expect(svg.body).toMatchObject({
				success: true,
				board: "render-proof",
				format: "svg",
				width: 566,
				height: 417,
				backgroundColor: "#f8fafc",
			});
			expect(png.body.sourceFingerprint).toBe(svg.body.sourceFingerprint);
			const pngBytes = Uint8Array.from(Buffer.from(png.body.data, "base64"));
			expect(readPngDimensions(pngBytes)).toEqual({ width: 566, height: 417 });
			const colors = pngRgbCounts(pngBytes);
			for (const color of ["248,250,252", "219,234,254", "220,252,231", "254,243,199"])
				expect(colors.get(color) ?? 0).toBeGreaterThan(100);
			expect(svg.body.data).toContain("<svg");
			expect(svg.body.data).toContain("Service API");
			expect(svg.body.data).toContain("data:image/png;base64");
			expect(svg.body.data).toContain("#dbeafe");
			expect(svg.body.data).not.toContain("/api/code-targets/open");
			expect(svg.body.data.match(/stroke="#334155"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
			const alternate = await render("render-proof", {
				format: "png",
				background: false,
				padding: 4,
				scale: 0.5,
			});
			expect(alternate.status).toBe(200);
			expect(alternate.body.data).not.toBe(png.body.data);
			const repeated = await render("render-proof", {
				format: "png",
				background: true,
				padding: 16,
				scale: 1,
			});
			expect(repeated.status).toBe(200);
			expect(repeated.body.data).toBe(png.body.data);

			for (const [board, expected] of [
				["missing-file", 'missing embedded file "absent"'],
				["missing-font", "cannot resolve font family 99"],
			] as const) {
				const refused = await render(board, { format: "png" });
				expect(refused.status).toBe(422);
				expect(refused.body.code).toBe("BOARD_NOT_RENDERABLE");
				expect(refused.body.error).toContain(expected);
			}

			const after = await request<HealthBody>("/health");
			expect(after.body.websocket_clients).toBe(0);
			expect(after.body.renderer).toMatchObject({ active: false, queued: 0 });
			expect(after.body.renderer.chromiumPid).toBeNumber();
			ownedRenderer = after.body.renderer;
			expect(after.body.renderer.chromiumStarts).toBe(1);
			expect(after.body.renderer.tempRoot).toContain("/archboard-board-renderer-");
			expect(after.body.renderer.profile).toContain("/archboard-board-renderer-");
			expect(
				after.body.renderer.profile?.startsWith(`${after.body.renderer.tempRoot}/`),
			).toBeTrue();
		},
		TEST_SERVER_RENDERING_CASE_TIMEOUT_MS,
	);

	test(
		"renders every focused finding from one persisted snapshot without changing the note",
		async () => {
			await request("/api/boards/new", { method: "POST", body: { board: "findings" } });
			expect(
				(
					await request("/api/elements/batch?board=findings", {
						method: "POST",
						body: { elements: findingElements },
					})
				).status,
			).toBe(200);
			expect(
				(
					await request("/api/files?board=findings", {
						method: "POST",
						body: { files: [findingFile] },
					})
				).status,
			).toBe(200);
			expect(
				(
					await request("/api/bridges?board=findings", {
						method: "POST",
						body: { over: "fover", under: "funder", background: "#ffffff" },
					})
				).status,
			).toBe(200);
			const boardNote = join(vault, "findings.excalidraw.md");
			const before = readFileSync(boardNote);
			const beforeMtime = statSync(boardNote, { bigint: true }).mtimeNs;
			const rendered = await request<FindingBody>("/api/export/findings?board=findings", {
				method: "POST",
				body: { policy: {} },
			});
			expect(rendered.status).toBe(200);
			expect(rendered.body).toMatchObject({ board: "findings", sourceRenderable: true });
			expect(
				rendered.body.report.findings.some(
					({ code }) => code === "CONNECTOR_INTERSECTION_UNMARKED",
				),
			).toBeTrue();
			const focusCount = rendered.body.report.findings.filter(({ focusBBox }) => focusBBox).length;
			expect(rendered.body.results).toHaveLength(focusCount);
			for (const result of rendered.body.results) {
				const focus = rendered.body.report.findings[result.findingIndex]?.focusBBox;
				if (!focus || !result.data) throw new Error("A focused finding did not return PNG data.");
				const dimensions = findingRasterDimensions(focus);
				expect(readPngDimensions(Uint8Array.from(Buffer.from(result.data, "base64")))).toEqual({
					width: dimensions.width,
					height: dimensions.height,
				});
			}
			expect(readFileSync(boardNote)).toEqual(before);
			expect(statSync(boardNote, { bigint: true }).mtimeNs).toBe(beforeMtime);
		},
		TEST_SERVER_RENDERING_CASE_TIMEOUT_MS,
	);

	test(
		"renders before the lease, maps against the locked board, and discards canceled writes",
		async () => {
			const source = "graph TD; A[Client] --> B[API]; B --> C[Store];";
			await request("/api/boards/new", { method: "POST", body: { board: "mermaid-seed" } });
			const seed = await request<{ board: string; count: number; ids: string[] }>(
				"/api/elements/from-mermaid?board=mermaid-seed",
				{
					method: "POST",
					body: { mermaidDiagram: source },
				},
			);
			expect(seed.status).toBe(200);
			const collision = seed.body.ids[0];
			if (!collision) throw new Error("The seed conversion returned no stable id.");

			await request("/api/boards/new", { method: "POST", body: { board: "mermaid" } });
			const before = await request<{ version: number }>("/api/boards/info?board=mermaid");
			const renderer = (await request<HealthBody>("/health")).body.renderer;
			if (!renderer.chromiumPid) throw new Error("The retained renderer has no process id.");
			process.kill(-renderer.chromiumPid, "SIGSTOP");
			const converted = request<{ board: string; count: number; ids: string[] }>(
				"/api/elements/from-mermaid?board=mermaid",
				{ method: "POST", body: { mermaidDiagram: source } },
			);
			await waitForHealth(
				(health) => health.renderer.active,
				"the stopped renderer to own the Mermaid job",
			);
			await Bun.sleep(LOCK_LEASE_MS + 100);
			const holder = "mermaid-concurrent-writer";
			expect(
				(
					await request("/api/boards/hold?board=mermaid", {
						method: "POST",
						body: { board: "mermaid", clientId: holder },
					})
				).status,
			).toBe(200);
			const concurrent = await request("/api/elements/changes?board=mermaid", {
				method: "POST",
				body: {
					origin: "human",
					clientId: holder,
					upserts: [{ id: collision, type: "rectangle", x: 10, y: 10, width: 80, height: 40 }],
					deletes: [],
				},
			});
			expect(concurrent.status).toBe(200);
			const afterConcurrent = await request<{ version: number }>("/api/boards/info?board=mermaid");
			expect(afterConcurrent.body.version).toBe(before.body.version + 1);
			process.kill(-renderer.chromiumPid, "SIGCONT");
			let conversionSettled = false;
			void converted.finally(() => {
				conversionSettled = true;
			});
			await Bun.sleep(200);
			expect(conversionSettled).toBeFalse();
			expect(
				(
					await request("/api/boards/hold/release?board=mermaid", {
						method: "POST",
						body: { board: "mermaid", clientId: holder },
					})
				).status,
			).toBe(200);
			const conversion = await converted;
			expect(conversion.status).toBe(200);
			expect(conversion.body.board).toBe("mermaid");
			expect(conversion.body.count).toBe(8);
			expect(conversion.body.ids).toHaveLength(8);
			expect(conversion.body.ids.every(isBlockId)).toBeTrue();
			expect(conversion.body.ids).not.toContain(collision);
			const after = await request<{ version: number }>("/api/boards/info?board=mermaid");
			expect(after.body.version).toBe(afterConcurrent.body.version + 1);

			const scene = await request<{ elements: MermaidElement[] }>("/api/elements?board=mermaid");
			expect(scene.body.elements).toHaveLength(9);
			expect(scene.body.elements.filter(({ type }) => type === "rectangle")).toHaveLength(4);
			expect(scene.body.elements.filter(({ type }) => type === "arrow")).toHaveLength(2);
			expect(
				scene.body.elements
					.filter(({ type }) => type === "text")
					.map(({ text }) => text)
					.toSorted(),
			).toEqual(["API", "Client", "Store"]);
			for (const arrow of scene.body.elements.filter(({ type }) => type === "arrow")) {
				expect(isBlockId(arrow.startBinding?.elementId ?? "")).toBeTrue();
				expect(isBlockId(arrow.endBinding?.elementId ?? "")).toBeTrue();
			}

			const invalidBefore = after.body.version;
			const invalid = await request<{ code?: string; error?: string }>(
				"/api/elements/from-mermaid?board=mermaid",
				{ method: "POST", body: { mermaidDiagram: "graph TD; A -->" } },
			);
			expect(invalid.status).toBe(422);
			expect(invalid.body.code).toBe("MERMAID_INVALID");
			expect(invalid.body.error).toContain("Mermaid conversion failed");
			expect(
				(await request<{ version: number }>("/api/boards/info?board=mermaid")).body.version,
			).toBe(invalidBefore);

			await request("/api/boards/new", { method: "POST", body: { board: "mermaid-cancel" } });
			const cancelBefore = await request<{ version: number }>(
				"/api/boards/info?board=mermaid-cancel",
			);
			const cancelHolder = "mermaid-cancel-holder";
			await request("/api/boards/hold?board=mermaid-cancel", {
				method: "POST",
				body: { board: "mermaid-cancel", clientId: cancelHolder },
			});
			const controller = new AbortController();
			const canceled = fetch(
				new URL(
					`/api/elements/from-mermaid?board=mermaid-cancel&doing=${encodeURIComponent("checking canceled Mermaid conversion")}`,
					canvas.base,
				),
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ mermaidDiagram: source }),
					signal: controller.signal,
				},
			);
			await waitForHealth(
				(health) =>
					!health.renderer.active &&
					health.application.activeMutations.some(({ name }) =>
						name.includes("POST /api/elements/from-mermaid board-lock wait"),
					),
				"the prepared Mermaid request to wait for the board lock",
			);
			controller.abort(new Error("cancel after Mermaid render"));
			await expect(canceled).rejects.toThrow();
			await waitForHealth(
				(health) =>
					!health.application.activeMutations.some(({ name }) =>
						name.includes("POST /api/elements/from-mermaid board-lock wait"),
					),
				"the canceled Mermaid request to leave the board-lock queue",
			);
			await request("/api/boards/hold/release?board=mermaid-cancel", {
				method: "POST",
				body: { board: "mermaid-cancel", clientId: cancelHolder },
			});
			expect(
				(await request<{ version: number }>("/api/boards/info?board=mermaid-cancel")).body.version,
			).toBe(cancelBefore.body.version);
		},
		TEST_SERVER_RENDERING_LEASE_CASE_TIMEOUT_MS,
	);

	test(
		"canvas shutdown removes the renderer profile before the server exits",
		async () => {
			if (
				!ownedRenderer?.chromiumPid ||
				!ownedRenderer.tempRoot ||
				!ownedRenderer.profile ||
				!ownedRenderer.controlPort ||
				!ownedRenderer.fixturePort
			)
				throw new Error("The retained renderer did not expose its owned resource identity.");
			const { chromiumPid, controlPort, fixturePort, profile, tempRoot } = ownedRenderer;
			const beforeShutdown = (await request<HealthBody>("/health")).body.renderer;
			expect(beforeShutdown.chromiumStarts).toBe(1);
			expect(beforeShutdown.chromiumPid).toBe(chromiumPid);
			await canvas.dispose();
			expect(processExists(chromiumPid)).toBeFalse();
			expect(existsSync(profile)).toBeFalse();
			expect(existsSync(tempRoot)).toBeFalse();
			await expectLoopbackPortReleased(controlPort);
			await expectLoopbackPortReleased(fixturePort);
		},
		TEST_SERVER_RENDERING_CASE_TIMEOUT_MS,
	);
});
