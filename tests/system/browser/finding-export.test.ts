import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { FindingRenderManifest } from "../../../src/cli/finding-rendering/index.ts";
import { inspectBoard } from "../../../src/runtime/board-inspection/index.ts";
import {
	PANE_SETTLE_CAP_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { findingElements, findingFile, fixedPointElements } from "./fixtures/fixed-point-scene.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import { READ_PAGE_SCENE_EXPRESSION } from "./support/page-scene.ts";

type SceneElement = ExcalidrawElement & Record<string, unknown>;
type PageScene = { error?: string; elements?: SceneElement[] };
type Pane = {
	board?: string;
	selection?: unknown;
	viewport?: unknown;
};
type PanesBody = { paneCount?: number; panes?: Pane[] };
type ExportBody = { data?: string };
type CommandResult = { status: number; stdout: string; stderr: string };

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");
const ignored = new Set([
	"createdAt",
	"updatedAt",
	"syncedAt",
	"source",
	"syncTimestamp",
	"version",
	"versionNonce",
	"updated",
]);

function strip(element: SceneElement): Record<string, unknown> {
	return Object.fromEntries(Object.entries(element).filter(([field]) => !ignored.has(field)));
}

async function settledScene(
	browser: Awaited<ReturnType<typeof createAgentBrowser>>,
): Promise<Record<string, unknown>[]> {
	let previous = "";
	let repeats = 0;
	const page = await pollUntil(
		() => browser.eval<PageScene>(READ_PAGE_SCENE_EXPRESSION),
		(read) => {
			if (read.error) throw new Error(read.error);
			const shot = JSON.stringify((read.elements ?? []).map(strip));
			repeats = shot === previous ? repeats + 1 : 0;
			previous = shot;
			return repeats >= 2;
		},
		"the visible scene to stop changing",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	return (page.elements ?? []).map(strip);
}

async function runArchboard(
	args: readonly string[],
	env: Readonly<Record<string, string>>,
): Promise<CommandResult> {
	const child = Bun.spawn([join(repoRoot, "bin/canvas"), ...args], {
		cwd: repoRoot,
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			child.kill("SIGTERM");
			reject(new Error(`archboard ${args[0]} exceeded its browser command timeout`));
		}, TEST_BROWSER_COMMAND_TIMEOUT_MS);
	});
	try {
		const stdout = new Response(child.stdout).text();
		const stderr = new Response(child.stderr).text();
		const status = await Promise.race([child.exited, timeout]);
		return { status, stdout: await stdout, stderr: await stderr };
	} finally {
		if (timer) clearTimeout(timer);
		if (child.exitCode === null) {
			child.kill("SIGKILL");
			await child.exited;
		}
	}
}

function pngBytes(directory: string): Record<string, string> {
	return Object.fromEntries(
		readdirSync(directory)
			.filter((name) => name.endsWith(".png"))
			.toSorted()
			.map((name) => [name, readFileSync(join(directory, name)).toString("base64")]),
	);
}

function closeTo(pixel: readonly number[] | undefined, rgb: readonly number[]): boolean {
	return (
		pixel?.length === 4 &&
		rgb.every((channel, index) => Math.abs(pixel[index]! - channel) <= 8) &&
		pixel[3] === 255
	);
}

async function persistedInspection(board: string, vault: string) {
	const original = process.env.ARCHBOARD_VAULT;
	process.env.ARCHBOARD_VAULT = vault;
	try {
		const { readBoardInspectionSnapshot } = await import("../../../src/runtime/engine/board-io.ts");
		return readBoardInspectionSnapshot(board);
	} finally {
		if (original === undefined) delete process.env.ARCHBOARD_VAULT;
		else process.env.ARCHBOARD_VAULT = original;
	}
}

test(
	"focused finding exports preserve the visible pane and exact artifacts",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { ownerRoot } = browserTestRoots();
		const vault = join(ownerRoot, "vault");
		const renderOne = join(ownerRoot, "render-one");
		const renderTwo = join(ownerRoot, "render-two");
		for (const directory of [vault, renderOne, renderTwo])
			mkdirSync(directory, { recursive: true });
		const canvas = await startOwnedCanvas({
			serverPath,
			vault,
			env: canvasTestEnvironment({ LOG_FILE_PATH: join(ownerRoot, "canvas.log") }),
		});
		resources.defer(() => canvas.dispose());
		registerCanvasBase(canvas.base);
		const browser = resources.use(await createAgentBrowser());
		const api = createJsonRequester(canvas);

		await api("/api/boards/new", {
			method: "POST",
			body: { board: "fixedpoint", level: "service" },
		});
		await api("/api/elements/batch?board=fixedpoint", {
			method: "POST",
			body: { elements: fixedPointElements },
		});
		await api("/api/boards/save", { method: "POST", body: { board: "fixedpoint" } });
		await api("/api/boards/new", {
			method: "POST",
			body: { board: "finding-render", level: "service" },
		});
		const findingBoard = await api("/api/elements/batch?board=finding-render", {
			method: "POST",
			body: { elements: findingElements },
		});
		await api("/api/files?board=finding-render", {
			method: "POST",
			body: { files: [findingFile] },
		});
		const findingBridge = await api("/api/bridges?board=finding-render", {
			method: "POST",
			body: { over: "fover", under: "funder", background: "#ffffff" },
		});
		const findingSaved = await api("/api/boards/save?board=finding-render", { method: "POST" });
		expect(findingBoard.status).toBe(200); // check-fixed-point.mjs:959
		expect(findingBridge.status).toBe(200); // check-fixed-point.mjs:959
		expect(findingSaved.status).toBe(200); // check-fixed-point.mjs:959

		await browser.run(["open", canvas.base]);
		expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
		await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body),
			(state) => (state.paneCount ?? 0) === 1,
			"the finding-export pane to register",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		await api("/api/boards/open", {
			method: "POST",
			body: { board: "fixedpoint", reload: true },
		});
		await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body.panes?.[0]),
			(pane) => pane?.board === "fixedpoint",
			"fixedpoint to remain the visible board",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);

		const visibleSceneBefore = await settledScene(browser);
		const visiblePaneBefore = (await api<PanesBody>("/api/panes")).body.panes?.[0];
		const fullScreenshotBefore = await api<ExportBody>("/api/export/image", {
			method: "POST",
			body: { format: "png", background: true },
		});
		const commandEnv = {
			...browser.env,
			ARCHBOARD_VAULT: vault,
			EXPRESS_SERVER_URL: canvas.base,
			EXCALIDRAW_NO_AUTOSTART: "1",
		};
		const first = await runArchboard(
			["render-findings", "--board", "finding-render", "--out", renderOne],
			commandEnv,
		);
		const firstManifest = JSON.parse(first.stdout) as FindingRenderManifest;
		const visiblePaneAfterFirst = (await api<PanesBody>("/api/panes")).body.panes?.[0];
		const fullScreenshotAfter = await api<ExportBody>("/api/export/image", {
			method: "POST",
			body: { format: "png", background: true },
		});
		const source = await persistedInspection("finding-render", vault);
		const expectedReport = inspectBoard(source.elements);
		expect(first.status).toBe(0); // check-fixed-point.mjs:1780
		expect(firstManifest.board).toBe("finding-render"); // check-fixed-point.mjs:1780
		expect(firstManifest.entries.some((entry) => entry.status === "rendered")).toBe(true); // check-fixed-point.mjs:1780
		expect(firstManifest.report.counts.byCode.CONNECTOR_INTERSECTION_UNMARKED).toBe(1); // check-fixed-point.mjs:1787
		expect(firstManifest.report).toEqual(expectedReport); // check-fixed-point.mjs:1792
		expect(firstManifest.sourceFingerprint).toBe(source.fingerprint); // check-fixed-point.mjs:1792
		expect(firstManifest.entries.map((entry) => entry.findingIndex)).toEqual(
			firstManifest.entries.map((_, index) => index),
		); // check-fixed-point.mjs:1792

		const crossingIndex = firstManifest.report.findings.findIndex(
			(finding) => finding.code === "CONNECTOR_INTERSECTION_UNMARKED",
		);
		const crossing = firstManifest.report.findings[crossingIndex];
		const crossingEntry = firstManifest.entries[crossingIndex];
		if (!crossing?.focusBBox || crossingEntry?.status !== "rendered") {
			throw new Error("The unmarked crossing did not produce a focused PNG.");
		}
		const crossingBytes = readFileSync(join(renderOne, crossingEntry.file)).toString("base64");
		const raster = await browser.eval<{
			width: number;
			height: number;
			pixels: number[][];
		}>(`(async () => {
    const image = new Image();
    image.src = ${JSON.stringify(`data:image/png;base64,${crossingBytes}`)};
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const focus = ${JSON.stringify(crossing.focusBBox)};
    const points = ${JSON.stringify([
			[239, 89],
			[241, 108],
			[249, 105],
			[265, 114],
		])};
    return { width: canvas.width, height: canvas.height, pixels: points.map(([x, y]) => {
      const px = Math.floor((x - focus.x) * canvas.width / focus.width);
      const py = Math.floor((y - focus.y) * canvas.height / focus.height);
      return Array.from(context.getImageData(px, py, 1, 1).data);
    }) };
  })()`);
		expect(raster.width).toBe(crossingEntry.width); // check-fixed-point.mjs:1840
		expect(raster.height).toBe(crossingEntry.height); // check-fixed-point.mjs:1840
		expect(closeTo(raster.pixels[0], [0, 0, 255])).toBe(true); // check-fixed-point.mjs:1840
		expect(closeTo(raster.pixels[1], [255, 0, 0])).toBe(true); // check-fixed-point.mjs:1840
		expect(closeTo(raster.pixels[2], [0, 255, 0])).toBe(true); // check-fixed-point.mjs:1840
		expect(closeTo(raster.pixels[3], [255, 255, 255])).toBe(true); // check-fixed-point.mjs:1840
		expect(await settledScene(browser)).toEqual(visibleSceneBefore); // check-fixed-point.mjs:1850
		expect(visiblePaneAfterFirst?.board).toBe(visiblePaneBefore?.board); // check-fixed-point.mjs:1850
		expect(visiblePaneAfterFirst?.selection).toEqual(visiblePaneBefore?.selection); // check-fixed-point.mjs:1850
		expect(visiblePaneAfterFirst?.viewport).toEqual(visiblePaneBefore?.viewport); // check-fixed-point.mjs:1850
		expect(fullScreenshotBefore.status).toBe(200); // check-fixed-point.mjs:1859
		expect(fullScreenshotAfter.status).toBe(200); // check-fixed-point.mjs:1859
		expect(fullScreenshotAfter.body.data).toBe(fullScreenshotBefore.body.data); // check-fixed-point.mjs:1859

		const movedViewport = await api("/api/viewport", {
			method: "POST",
			body: { x: 777, y: 555, zoom: 1.25 },
		});
		expect(movedViewport.status).toBe(200); // check-fixed-point.mjs:1871
		const paneBeforeSecond = await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body.panes?.[0]),
			(pane) => JSON.stringify(pane?.viewport) !== JSON.stringify(visiblePaneBefore?.viewport),
			"the explicitly moved viewport to publish",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		const second = await runArchboard(
			["render-findings", "--board", "finding-render", "--out", renderTwo],
			commandEnv,
		);
		const paneAfterSecond = (await api<PanesBody>("/api/panes")).body.panes?.[0];
		expect(second.status).toBe(0); // check-fixed-point.mjs:1884
		expect(readdirSync(renderTwo).toSorted()).toEqual(readdirSync(renderOne).toSorted()); // check-fixed-point.mjs:1884
		expect(pngBytes(renderTwo)).toEqual(pngBytes(renderOne)); // check-fixed-point.mjs:1884, PNG bytes
		expect(readFileSync(join(renderTwo, "manifest.json"))).toEqual(
			readFileSync(join(renderOne, "manifest.json")),
		); // check-fixed-point.mjs:1884, manifest bytes
		expect(second.stdout).toBe(first.stdout); // check-fixed-point.mjs:1884, manifest stdout bytes
		expect(second.stderr).toBe(first.stderr); // approved exact stream comparison
		expect(paneAfterSecond?.viewport).toEqual(paneBeforeSecond?.viewport); // check-fixed-point.mjs:1890
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 2,
);
