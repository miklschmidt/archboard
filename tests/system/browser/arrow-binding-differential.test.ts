import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
	ExcalidrawElement,
	ExcalidrawLinearElement,
} from "@excalidraw/excalidraw/element/types";

import { PANE_SETTLE_CAP_MS } from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { fixedPointElements, humanArrowInput } from "./fixtures/fixed-point-scene.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import { inExcalidrawApp, READ_PAGE_SCENE_EXPRESSION } from "./support/page-scene.ts";

type SceneElement = ExcalidrawElement;
type ElementsBody = { elements?: SceneElement[] };
type Pane = { board?: string };
type PanesBody = { paneCount?: number; panes?: Pane[] };
type PageScene = { error?: string; elements?: SceneElement[] };
type ScreenPoint = {
	error?: string;
	x?: number;
	y?: number;
	zoom?: number;
	rect?: { left: number; top: number; right: number; bottom: number };
};
type ReportGate = {
	error?: string;
	installed?: boolean;
	intercepted?: number;
	held?: boolean;
	released?: boolean;
	settled?: boolean;
};

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

function requiredElement(elements: readonly SceneElement[], id: string): SceneElement {
	const element = elements.find((candidate) => candidate.id === id);
	expect(element).toBeDefined();
	if (!element) throw new Error(`Scene is missing ${id}.`);
	return element;
}

function requiredLinear(elements: readonly SceneElement[], id: string): ExcalidrawLinearElement {
	const element = requiredElement(elements, id);
	expect(["arrow", "line"]).toContain(element.type);
	if (element.type !== "arrow" && element.type !== "line") {
		throw new Error(`${id} is not a linear element.`);
	}
	return element;
}

function endpoint(
	element: ExcalidrawLinearElement,
	index: number,
): { x: number; y: number } | null {
	const point = element.points?.[index];
	if (!point || ![element.x, element.y, point[0], point[1]].every(Number.isFinite)) return null;
	return { x: element.x + point[0], y: element.y + point[1] };
}

function geometry(element: SceneElement): Record<string, unknown> {
	return {
		type: element.type,
		x: element.x,
		y: element.y,
		width: element.width,
		height: element.height,
		angle: element.angle,
	};
}

function compareEndpoints(
	serverEndpoint: { x: number; y: number } | null,
	browserEndpoint: { x: number; y: number } | null,
) {
	const dx = serverEndpoint && browserEndpoint ? browserEndpoint.x - serverEndpoint.x : Number.NaN;
	const dy = serverEndpoint && browserEndpoint ? browserEndpoint.y - serverEndpoint.y : Number.NaN;
	const separation = Math.hypot(dx, dy);
	return {
		serverEndpoint,
		browserEndpoint,
		dx: Number.isFinite(dx) ? dx : null,
		dy: Number.isFinite(dy) ? dy : null,
		separation: Number.isFinite(separation) ? separation : null,
		agrees: Number.isFinite(separation) && separation <= 1,
	};
}

test("a held human drag gives an independent binding oracle", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "vault");
	mkdirSync(vault, { recursive: true });
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
	const humanReported = await api("/api/elements/changes?board=fixedpoint", {
		method: "POST",
		body: { upserts: [humanArrowInput], deletes: [], clientId: "fixed-point-person" },
	});
	const humanSettled = await api("/api/elements/human-node?board=fixedpoint", {
		method: "PUT",
		body: { x: 1000, y: 1000 },
	});
	const fixedPoint =
		(await api<ElementsBody>("/api/elements?board=fixedpoint")).body.elements ?? [];
	const fixtureArrow = requiredLinear(fixedPoint, "human-arrow");
	expect(humanReported.status).toBe(200); // check-fixed-point.mjs:820
	expect(humanSettled.status).toBe(200); // check-fixed-point.mjs:820
	expect(fixtureArrow.endBinding?.elementId).toBe("human-node"); // check-fixed-point.mjs:820
	expect(fixtureArrow.endBinding?.focus).toBe(0.9); // check-fixed-point.mjs:820
	expect(fixtureArrow.endBinding?.gap).toBe(15); // check-fixed-point.mjs:820
	await api("/api/boards/save", { method: "POST", body: { board: "fixedpoint" } });

	const comparisonCreated = await api("/api/boards/new", {
		method: "POST",
		body: { board: "binding-differential", level: "service" },
	});
	expect(comparisonCreated.status).toBe(200); // check-fixed-point.mjs:968

	await browser.run(["open", canvas.base]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
	await pollUntil(
		() => api<PanesBody>("/api/panes").then((response) => response.body),
		(state) => (state.paneCount ?? 0) === 1,
		"the differential pane to register",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await api("/api/boards/open", {
		method: "POST",
		body: { board: "fixedpoint", reload: true },
	});
	const initialPage = await pollUntil(
		() => browser.eval<PageScene>(READ_PAGE_SCENE_EXPRESSION),
		(page) =>
			page.elements?.some((element) => element.id === "human-node") === true &&
			page.elements.some((element) => element.id === "human-arrow") &&
			page.elements.some((element) => element.id === "text1"),
		"fixedpoint geometry to reach the browser",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	const initialElements = initialPage.elements ?? [];
	const initialBrowserNode = requiredElement(initialElements, "human-node");
	const initialBrowserArrow = requiredLinear(initialElements, "human-arrow");
	expect(initialBrowserArrow.endBinding?.elementId).toBe("human-node"); // check-fixed-point.mjs:1371
	expect(initialBrowserArrow.endBinding?.focus).toBe(0.9); // check-fixed-point.mjs:1371
	expect(initialBrowserArrow.endBinding?.gap).toBe(15); // check-fixed-point.mjs:1371

	const comparisonNode = strip(initialBrowserNode);
	delete comparisonNode.boundElements;
	const nodeSeed = await api("/api/elements/batch?board=binding-differential", {
		method: "POST",
		body: { elements: [comparisonNode] },
	});
	const arrowSeed = await api("/api/elements/changes?board=binding-differential", {
		method: "POST",
		body: {
			upserts: [strip(initialBrowserArrow)],
			deletes: [],
			clientId: "fixed-point-person",
		},
	});
	const comparisonBefore =
		(await api<ElementsBody>("/api/elements?board=binding-differential")).body.elements ?? [];
	const initialServerNode = requiredElement(comparisonBefore, "human-node");
	const initialServerArrow = requiredLinear(comparisonBefore, "human-arrow");
	const initialBrowserStart = endpoint(initialBrowserArrow, 0);
	const initialBrowserEnd = endpoint(initialBrowserArrow, initialBrowserArrow.points.length - 1);
	const initialServerStart = endpoint(initialServerArrow, 0);
	const initialServerEnd = endpoint(initialServerArrow, initialServerArrow.points.length - 1);
	expect(nodeSeed.status).toBe(200); // check-fixed-point.mjs:1427
	expect(arrowSeed.status).toBe(200); // check-fixed-point.mjs:1427
	expect(geometry(initialServerNode)).toEqual(geometry(initialBrowserNode)); // check-fixed-point.mjs:1427
	expect(initialServerStart).toEqual(initialBrowserStart); // check-fixed-point.mjs:1427
	expect(initialServerEnd).toEqual(initialBrowserEnd); // check-fixed-point.mjs:1427
	expect(initialServerArrow.endBinding).toEqual(initialBrowserArrow.endBinding); // check-fixed-point.mjs:1427
	const paneBeforeDrag = (await api<PanesBody>("/api/panes")).body.panes?.[0];
	expect(paneBeforeDrag?.board).toBe("fixedpoint"); // check-fixed-point.mjs:1458
	expect(initialElements.some((element) => element.id === "text1" && !element.isDeleted)).toBe(
		true,
	); // check-fixed-point.mjs:1458

	const framed = await api("/api/viewport", {
		method: "POST",
		body: { scrollToElementIds: ["human-node"], viewportZoomFactor: 0.5 },
	});
	const screenPoint = await pollUntil(
		() =>
			browser.eval<ScreenPoint>(
				inExcalidrawApp(`
          const node = document.querySelector('.excalidraw');
          const element = app.scene.getElementsIncludingDeleted()
            .find(candidate => candidate.id === 'human-node');
          if (!node || !element) return { error: 'human-node is missing' };
          const zoom = app.state.zoom?.value ?? 1;
          const rect = node.getBoundingClientRect();
          return {
            x: Math.round((element.x + element.width / 2 + app.state.scrollX) * zoom + app.state.offsetLeft),
            y: Math.round((element.y + element.height / 2 + app.state.scrollY) * zoom + app.state.offsetTop),
            zoom,
            rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
          };`),
			),
		(point) =>
			point.rect !== undefined &&
			Number.isFinite(point.x) &&
			Number.isFinite(point.y) &&
			point.x! >= point.rect!.left &&
			point.y! >= point.rect!.top &&
			point.x! + 40 <= point.rect!.right &&
			point.y! + 30 <= point.rect!.bottom,
		"the framed human node to lie inside Excalidraw",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(framed.status).toBe(200); // check-fixed-point.mjs:1519
	expect(screenPoint.error).toBeUndefined(); // check-fixed-point.mjs:1519
	expect(Number.isFinite(screenPoint.x)).toBe(true); // check-fixed-point.mjs:1519
	expect(Number.isFinite(screenPoint.y)).toBe(true); // check-fixed-point.mjs:1519
	expect(screenPoint.x!).toBeGreaterThanOrEqual(screenPoint.rect!.left); // check-fixed-point.mjs:1519
	expect(screenPoint.y!).toBeGreaterThanOrEqual(screenPoint.rect!.top); // check-fixed-point.mjs:1519
	expect(screenPoint.x! + 40).toBeLessThanOrEqual(screenPoint.rect!.right); // check-fixed-point.mjs:1519
	expect(screenPoint.y! + 30).toBeLessThanOrEqual(screenPoint.rect!.bottom); // check-fixed-point.mjs:1519

	const installed = await browser.eval<ReportGate>(`(() => {
    const gate = window.__task090ReportGate = {
      original: window.fetch, intercepted: 0, pending: null, released: false, settled: false
    };
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : input?.url ?? '';
      const method = init?.method ?? input?.method ?? 'GET';
      if (method !== 'POST' || !url.includes('/api/elements/changes')) {
        return gate.original.apply(this, arguments);
      }
      if (gate.pending) throw new Error('received a second change report while one was held');
      const receiver = this;
      const args = [...arguments];
      gate.intercepted += 1;
      return new Promise((resolve, reject) => {
        gate.pending = { release: () => {
          gate.released = true;
          gate.original.apply(receiver, args).then(
            response => { gate.settled = true; resolve(response); },
            error => { gate.settled = true; reject(error); }
          );
        }};
      });
    };
    return { installed: true };
  })()`);
	expect(installed.installed).toBe(true); // check-fixed-point.mjs:1565

	await browser.run(["mouse", "move", String(screenPoint.x), String(screenPoint.y)]);
	await browser.run(["mouse", "down"]);
	for (let step = 1; step <= 4; step += 1) {
		await browser.run([
			"mouse",
			"move",
			String(screenPoint.x! + step * 10),
			String(Math.round(screenPoint.y! + step * 7.5)),
		]);
	}
	await browser.run(["mouse", "up"]);

	const oracle = await pollUntil(
		() =>
			browser.eval<PageScene & { gate?: ReportGate }>(`(() => {
        const read = ${READ_PAGE_SCENE_EXPRESSION};
        const gate = window.__task090ReportGate;
        return { ...read, gate: gate ? { intercepted: gate.intercepted,
          held: gate.pending !== null, released: gate.released, settled: gate.settled } : null };
      })()`),
		(state) => state.gate?.held === true,
		"the one human report to be held",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	const browserNode = requiredElement(oracle.elements ?? [], "human-node");
	const browserArrow = requiredLinear(oracle.elements ?? [], "human-arrow");
	const browserStart = endpoint(browserArrow, 0);
	const browserEnd = endpoint(browserArrow, browserArrow.points.length - 1);
	expect([browserNode.x, browserNode.y]).not.toEqual([initialBrowserNode.x, initialBrowserNode.y]); // check-fixed-point.mjs:1610
	expect(browserStart).toEqual(initialBrowserStart); // check-fixed-point.mjs:1610
	expect(browserEnd).not.toEqual(initialBrowserEnd); // check-fixed-point.mjs:1610
	expect(browserArrow.endBinding?.focus).toBe(0.9); // check-fixed-point.mjs:1610
	expect(browserArrow.endBinding?.gap).toBe(15); // check-fixed-point.mjs:1610

	const fixedPointBeforeRelease =
		(await api<ElementsBody>("/api/elements?board=fixedpoint")).body.elements ?? [];
	const serverStillNode = requiredElement(fixedPointBeforeRelease, "human-node");
	const serverStillArrow = requiredLinear(fixedPointBeforeRelease, "human-arrow");
	expect(serverStillNode.x).toBe(initialBrowserNode.x); // check-fixed-point.mjs:1630
	expect(serverStillNode.y).toBe(initialBrowserNode.y); // check-fixed-point.mjs:1630
	expect(endpoint(serverStillArrow, serverStillArrow.points.length - 1)).toEqual(initialBrowserEnd); // check-fixed-point.mjs:1630
	expect(oracle.gate?.released).toBe(false); // check-fixed-point.mjs:1630
	expect(oracle.gate?.settled).toBe(false); // check-fixed-point.mjs:1630

	const released = await browser.eval<ReportGate>(`(() => {
    const gate = window.__task090ReportGate;
    window.fetch = gate.original;
    gate.pending?.release();
    return { intercepted: gate.intercepted, held: gate.pending !== null, released: gate.released };
  })()`);
	const settled = await pollUntil(
		() => browser.eval<ReportGate>("(() => ({ ...window.__task090ReportGate }))()"),
		(state) => state.settled === true,
		"the released human report to settle",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await browser.eval("(() => { delete window.__task090ReportGate; return true; })()");
	expect(oracle.gate?.held).toBe(true); // check-fixed-point.mjs:1672
	expect(released.released).toBe(true); // check-fixed-point.mjs:1672
	expect(settled.settled).toBe(true); // check-fixed-point.mjs:1672

	const agentMove = await api("/api/elements/human-node?board=binding-differential", {
		method: "PUT",
		body: { x: browserNode.x, y: browserNode.y },
	});
	const serverAfterMove =
		(await api<ElementsBody>("/api/elements?board=binding-differential")).body.elements ?? [];
	const serverNode = requiredElement(serverAfterMove, "human-node");
	const serverArrow = requiredLinear(serverAfterMove, "human-arrow");
	const serverStart = endpoint(serverArrow, 0);
	const serverEnd = endpoint(serverArrow, serverArrow.points.length - 1);
	expect(agentMove.status).toBe(200); // check-fixed-point.mjs:1717
	expect(geometry(serverNode)).toEqual(geometry(browserNode)); // check-fixed-point.mjs:1717
	expect(serverStart).toEqual(browserStart); // check-fixed-point.mjs:1717
	expect(serverArrow.endBinding).toEqual(browserArrow.endBinding); // check-fixed-point.mjs:1717

	const comparison = compareEndpoints(serverEnd, browserEnd);
	expect({
		agrees: comparison.agrees,
		focus: serverArrow.endBinding?.focus,
		gap: serverArrow.endBinding?.gap,
		serverNode: geometry(serverNode),
		browserNode: geometry(browserNode),
		serverEndpoint: comparison.serverEndpoint,
		browserEndpoint: comparison.browserEndpoint,
		separation: comparison.separation,
	}).toEqual({
		agrees: true,
		focus: 0.9,
		gap: 15,
		serverNode: geometry(browserNode),
		browserNode: geometry(browserNode),
		serverEndpoint: serverEnd,
		browserEndpoint: browserEnd,
		separation: expect.any(Number),
	}); // check-fixed-point.mjs:1735
	expect(comparison.separation).toBeLessThanOrEqual(1); // check-fixed-point.mjs:1735

	const wrong = browserEnd ? { x: browserEnd.x + 2, y: browserEnd.y } : null;
	const negative = compareEndpoints(wrong, browserEnd);
	expect(negative.agrees).toBe(false); // check-fixed-point.mjs:1751
	expect(negative.separation).toBe(2); // check-fixed-point.mjs:1751
});
