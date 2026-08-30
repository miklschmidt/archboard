import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import {
	REPORT_IDLE_SETTLE_MS,
	REPORT_PROGRESS_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_BROWSER_POLL_MS,
	TEST_HUMAN_PERFORMANCE_OPEN_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { processExists, startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import { inExcalidrawApp } from "./support/page-scene.ts";
import {
	HUMAN_PERFORMANCE_FIXTURE_SIZE,
	humanPerformanceScene,
} from "./fixtures/human-performance-scene.ts";
import { readFsyncTrace, tracerPids } from "./fixtures/traced-canvas-process.ts";

interface ProbeResponse {
	startedAt: number;
	requestFullReport: boolean;
	bytes: number;
	parseMs: number;
	hasDocument: boolean;
	corrections: number;
	correctionUpserts: number;
	correctionDeletes: number;
	correctionIds: string[];
	correctionDiff: unknown[][];
	returnedAt: number;
	replacementsAfter: number | null;
}

interface PerformanceProbe {
	holds: number;
	releases: number;
	reports: number;
	agentWrites: number;
	inflight: number;
	bodyBytes: number[];
	reportStarts: number[];
	responses: ProbeResponse[];
	frames: Array<{ at: number; gap: number }>;
	replacements: number;
}

type PageElement = Pick<ExcalidrawElement, "id" | "x" | "y" | "width" | "height">;

interface PageState {
	perf: PerformanceProbe;
	zoom: number;
	tool: string;
	editing: string | null;
	typing: string | null;
	elements: PageElement[];
}

interface Point {
	x: number;
	y: number;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const realServer = path.join(repoRoot, "src/server.ts");
const tracedServer = path.join(import.meta.dir, "fixtures/traced-canvas-process.ts");
const responseDelayMs = REPORT_PROGRESS_MS + TEST_BROWSER_POLL_MS * 6;

const installProbe = inExcalidrawApp(`
  const perf = window.__abHumanPerf = {
    holds: 0, releases: 0, reports: 0, agentWrites: 0, inflight: 0,
    bodyBytes: [], reportStarts: [], responses: [], frames: [], replacements: 0,
    nextResponseDelay: null
  };
  let lastFrame = performance.now();
  const frame = now => {
    perf.frames.push({ at: now, gap: now - lastFrame });
    if (perf.frames.length > 2000) perf.frames.shift();
    lastFrame = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const replace = app.scene.replaceAllElements.bind(app.scene);
  app.scene.replaceAllElements = function (elements) {
    perf.replacements += 1;
    return replace(elements);
  };
  const original = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = (init && init.method) || (input && input.method) || 'GET';
    if (method === 'POST' && url.includes('/api/boards/hold/release')) perf.releases += 1;
    else if (method === 'POST' && url.includes('/api/boards/hold')) perf.holds += 1;
    if (method !== 'POST' || !url.includes('/api/elements/changes')) {
      return original.apply(this, arguments);
    }
    perf.reports += 1;
    perf.inflight += 1;
    const startedAt = performance.now();
    perf.reportStarts.push(startedAt);
    const responseDelay = perf.nextResponseDelay ?? ${responseDelayMs};
    perf.nextResponseDelay = null;
    const body = String((init && init.body) || '');
    perf.bodyBytes.push(body.length);
    let requestFullReport = false;
    try {
      const parsed = JSON.parse(body);
      if (parsed.origin === 'agent') perf.agentWrites += 1;
      requestFullReport = parsed.fullReport === true;
    } catch {}
    const response = await original.apply(this, arguments);
    const text = await response.clone().text();
    const parseStarted = performance.now();
    const answer = JSON.parse(text);
    const parseMs = performance.now() - parseStarted;
    const upserts = answer.corrections?.upserts || [];
    const deletes = answer.corrections?.deletes || [];
    const correctionSample = upserts.find(element => /^f/.test(element.id));
    const visibleSample = correctionSample
      ? app.scene.getElementsIncludingDeleted().find(element => element.id === correctionSample.id)
      : null;
    const correctionDiff = correctionSample && visibleSample
      ? [...new Set([...Object.keys(correctionSample), ...Object.keys(visibleSample)])]
        .filter(key => JSON.stringify(correctionSample[key]) !== JSON.stringify(visibleSample[key]))
        .slice(0, 12).map(key => [key, visibleSample[key], correctionSample[key]])
      : [];
    const record = {
      startedAt, requestFullReport, bytes: text.length, parseMs,
      hasDocument: Object.prototype.hasOwnProperty.call(answer, 'document'),
      corrections: upserts.length + deletes.length,
      correctionUpserts: upserts.length, correctionDeletes: deletes.length,
      correctionIds: upserts.slice(0, 4).map(element => element.id), correctionDiff,
      returnedAt: 0, replacementsAtReturn: 0, replacementsAfter: null
    };
    perf.responses.push(record);
    await new Promise(resolve => setTimeout(resolve, responseDelay));
    record.returnedAt = performance.now();
    record.replacementsAtReturn = perf.replacements;
    setTimeout(() => {
      record.replacementsAfter = perf.replacements - record.replacementsAtReturn;
    }, ${TEST_BROWSER_POLL_MS * 3});
    perf.inflight -= 1;
    return response;
  };
  return { installed: true };
`);

const readPageState = inExcalidrawApp(`
  const perf = window.__abHumanPerf;
  return {
    perf,
    zoom: app.state.zoom?.value ?? 1,
    tool: app.state.activeTool.type,
    editing: app.state.editingTextElement?.id ?? null,
    typing: document.querySelector('textarea.excalidraw-wysiwyg')?.value ?? null,
    elements: app.scene.getElementsIncludingDeleted().filter(element => !element.isDeleted)
      .filter(element => ['drag', 'resize', 'typing'].includes(element.id))
      .map(element => ({ id: element.id, x: element.x, y: element.y,
        width: element.width, height: element.height }))
  };
`);

test(
	"10,000-element human editing stays local and receives compact acknowledgements",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { ownerRoot } = browserTestRoots();
		const vault = path.join(ownerRoot, "vault");
		const traceFile = path.join(ownerRoot, "fsync.trace");
		fs.mkdirSync(vault, { recursive: true });
		const canvas = await startOwnedCanvas({
			serverPath: tracedServer,
			vault,
			env: canvasTestEnvironment({
				ARCHBOARD_TEST_SERVER_ENTRY: realServer,
				ARCHBOARD_TEST_FSYNC_TRACE: traceFile,
				LOG_FILE_PATH: path.join(ownerRoot, "canvas.log"),
			}),
		});
		resources.defer(() => canvas.dispose());
		registerCanvasBase(canvas.base);
		const request = createJsonRequester(canvas);
		const browser = resources.use(await createAgentBrowser());
		const pageState = () => browser.eval<PageState>(readPageState);
		const pointOf = (id: string, edge = false) =>
			browser.eval<Point>(
				inExcalidrawApp(`
          const element = app.scene.getElementsIncludingDeleted()
            .find(candidate => candidate.id === ${JSON.stringify(id)});
          if (!element) return { error: 'missing ${id}' };
          const zoom = app.state.zoom?.value ?? 1;
          const x = element.x + (${edge} ? element.width : element.width / 2);
          const y = element.y + (${edge} ? element.height : element.height / 2);
          return { x: Math.round((x + app.state.scrollX) * zoom + app.state.offsetLeft),
            y: Math.round((y + app.state.scrollY) * zoom + app.state.offsetTop) };
        `),
			);
		const dragFrom = async (point: Point, dx: number, dy: number) => {
			if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0)
				throw new Error(`Cannot drive pointer from ${JSON.stringify(point)}.`);
			await browser.run(["mouse", "move", String(point.x), String(point.y)]);
			await browser.run(["mouse", "down"]);
			for (let step = 1; step <= 4; step += 1)
				await browser.run([
					"mouse",
					"move",
					String(Math.round(point.x + (dx * step) / 4)),
					String(Math.round(point.y + (dy * step) / 4)),
				]);
			await browser.run(["mouse", "up"]);
		};
		const frameElement = async (id: string) => {
			let previous = "";
			let stableSamples = 0;
			const response = await request<{ error?: string }>("/api/viewport", {
				method: "POST",
				body: { scrollToElementIds: [id], viewportZoomFactor: 0.5 },
				doing: "checking human editing performance",
			});
			if (response.status !== 200)
				throw new Error(`Cannot frame ${id}: ${response.status} ${response.body.error ?? ""}`);
			return pollUntil(
				() => pointOf(id),
				(point) => {
					const sample = `${point.x}:${point.y}`;
					stableSamples = sample === previous ? stableSamples + 1 : 0;
					previous = sample;
					return Number.isFinite(point.x) && Number.isFinite(point.y) && stableSamples >= 3;
				},
				`${id} to enter the viewport`,
			);
		};

		const health = (await fetch(`${canvas.base}/health`).then((response) => response.json())) as {
			pid: number;
		};
		expect(health.pid).toBe(canvas.pid!);
		await request("/api/boards/new", {
			method: "POST",
			body: { board: "performance", level: "service" },
			doing: "checking human editing performance",
		});
		const seeded = await request<{ count: number }>("/api/elements/changes?board=performance", {
			method: "POST",
			body: { clientId: "fixture", upserts: humanPerformanceScene(), deletes: [] },
			doing: "checking human editing performance",
		});
		expect(seeded.status).toBe(200);
		expect(seeded.body.count).toBe(HUMAN_PERFORMANCE_FIXTURE_SIZE);
		await request("/api/boards/save", {
			method: "POST",
			body: { board: "performance" },
			doing: "checking human editing performance",
		});

		await browser.run(["open", canvas.base], {
			timeoutMs: TEST_HUMAN_PERFORMANCE_OPEN_TIMEOUT_MS,
		});
		const panes = await pollUntil(
			() => request<{ paneCount: number }>("/api/panes"),
			(response) => response.body.paneCount === 1,
			"one browser pane to register",
		);
		const userAgent = await browser.eval<string>("navigator.userAgent");
		expect(panes.body.paneCount).toBe(1);
		expect(userAgent).toMatch(/headless/i);
		const opened = await request<{ elementCount: number }>("/api/boards/open", {
			method: "POST",
			body: { board: "performance", reload: true },
			doing: "checking human editing performance",
		});
		expect(opened.body.elementCount).toBe(HUMAN_PERFORMANCE_FIXTURE_SIZE);
		const document = await request<{ elements: unknown[] }>("/api/elements?board=performance");
		const fullDocumentBytes = JSON.stringify(document.body.elements).length;
		await browser.eval(installProbe);
		const fsyncBefore = readFsyncTrace(traceFile).calls.length;

		const isolatedPoint = await frameElement("drag");
		const isolatedBefore = await pageState();
		const isolatedDragX = isolatedBefore.elements.find((element) => element.id === "drag")?.x;
		expect(isolatedBefore.tool).toBe("selection");
		expect(isolatedBefore.editing).toBeNull();
		expect(isolatedBefore.perf.reports).toBe(0);
		expect(isolatedBefore.perf.responses).toHaveLength(0);
		expect(isolatedBefore.perf.inflight).toBe(0);
		expect(Number.isFinite(isolatedDragX)).toBeTrue();
		await dragFrom(isolatedPoint, 20, 0);
		const isolatedAfter = await pollUntil(
			pageState,
			(state) =>
				state.perf.responses.length === 1 && state.perf.responses[0]?.replacementsAfter !== null,
			"the isolated acknowledgement and replacement sample",
		);
		const isolatedDrag = isolatedAfter.elements.find((element) => element.id === "drag");
		const isolatedResponse = isolatedAfter.perf.responses[0]!;
		expect(Number.isFinite(isolatedDragX)).toBeTrue();
		expect((isolatedDrag!.x - isolatedDragX!) * isolatedBefore.zoom).toBeGreaterThan(10);
		expect(isolatedAfter.perf.reports).toBe(1);
		expect(isolatedAfter.perf.responses).toHaveLength(1);
		expect(isolatedResponse.requestFullReport).toBeFalse();
		expect(isolatedResponse.hasDocument).toBeFalse();
		expect(isolatedResponse.corrections).toBe(0);
		expect(isolatedResponse.correctionUpserts).toBe(0);
		expect(isolatedResponse.correctionDeletes).toBe(0);
		expect(isolatedResponse.bytes * 20).toBeLessThan(fullDocumentBytes);
		expect(isolatedResponse.replacementsAfter).toBe(0);

		await frameElement("drag");
		const beforeDrag = await pageState();
		const dragXBefore = beforeDrag.elements.find((element) => element.id === "drag")!.x;
		await browser.eval(`window.__abHumanPerf.nextResponseDelay = ${REPORT_PROGRESS_MS}; true`);
		await dragFrom(await pointOf("drag"), 20, 0);
		const afterDragProgress = await pollUntil(
			pageState,
			(state) => state.perf.reports === beforeDrag.perf.reports + 1 && state.perf.inflight === 1,
			"the first drag progress report to remain in flight",
		);
		expect(afterDragProgress.perf.reports).toBe(beforeDrag.perf.reports + 1);
		expect(afterDragProgress.perf.inflight).toBe(1);
		const afterFirstX = afterDragProgress.elements.find((element) => element.id === "drag")!.x;
		const reportsBeforeIdle = afterDragProgress.perf.reports;
		const finalEditAt = await browser.eval<number>("performance.now()");
		await browser.run(["press", "ArrowRight"]);
		const dragDuring = await pageState();
		const draggedX = dragDuring.elements.find((element) => element.id === "drag")!.x;
		expect(dragDuring.perf.inflight).toBe(1);
		expect((draggedX - dragXBefore) * beforeDrag.zoom).toBeGreaterThan(10);
		expect(draggedX).toBeGreaterThan(afterFirstX);
		await Bun.sleep(REPORT_PROGRESS_MS + TEST_BROWSER_POLL_MS * 2);
		const afterFinalProgress = await pageState();
		expect(afterFinalProgress.perf.reports).toBe(reportsBeforeIdle);
		const afterFinalIdle = await pollUntil(
			pageState,
			(state) => state.perf.reports === reportsBeforeIdle + 1,
			"the trailing idle report to start",
		);
		const idleStart = afterFinalIdle.perf.reportStarts.find(
			(startedAt) => startedAt >= finalEditAt,
		);
		expect(afterFinalIdle.perf.reports).toBe(reportsBeforeIdle + 1);
		expect(idleStart).toBeDefined();
		expect(idleStart! - finalEditAt).toBeGreaterThanOrEqual(
			REPORT_IDLE_SETTLE_MS - REPORT_PROGRESS_MS / 4,
		);
		const settledAfterIdle = await pollUntil(
			pageState,
			(state) => state.perf.responses.length === state.perf.reports && state.perf.inflight === 0,
			"the accepted idle report to settle",
		);
		const settledReportCount = settledAfterIdle.perf.reports;
		await Bun.sleep(TEST_BROWSER_POLL_MS * 3);
		const noTail = await pageState();
		expect(noTail.perf.reports).toBe(settledReportCount);
		expect(noTail.perf.responses).toHaveLength(noTail.perf.reports);
		expect(noTail.perf.inflight).toBe(0);

		await frameElement("resize");
		const resizeBeforeState = await pageState();
		const resizeBefore = resizeBeforeState.elements.find((element) => element.id === "resize")!;
		await browser.run(["click", ".excalidraw"]);
		await dragFrom(await pointOf("resize", true), 24, 18);
		await pollUntil(pageState, (state) => state.perf.inflight === 1, "the resize report to start");
		await dragFrom(await pointOf("resize", true), 24, 18);
		const resizeDuring = await pageState();
		const resized = resizeDuring.elements.find((element) => element.id === "resize")!;
		expect(resizeDuring.perf.inflight).toBe(1);
		expect((resized.width - resizeBefore.width) * resizeBeforeState.zoom).toBeGreaterThan(10);
		await pollUntil(
			pageState,
			(state) => state.perf.inflight === 0 && state.perf.responses.length === state.perf.reports,
			"the resize reports to settle",
		);

		await frameElement("typing");
		await browser.run(["dblclick", ".excalidraw"]);
		await pollUntil(pageState, (state) => state.typing !== null, "the text editor to open");
		await browser.run(["keyboard", "type", "responsive"]);
		await browser.eval(
			inExcalidrawApp(`
          const all = app.scene.getElementsIncludingDeleted().map(element => ({ ...element }));
          app.updateScene({ elements: all.map(element => element.id === 'drag'
            ? { ...element, y: element.y + 7 } : element), captureUpdate: 'IMMEDIATELY' });
          return { nudged: true };
        `),
		);
		await pollUntil(pageState, (state) => state.perf.inflight === 1, "the typing report to start");
		await browser.run(["keyboard", "type", " typing"]);
		const typingDuring = await pageState();
		expect(typingDuring.perf.inflight).toBe(1);
		expect(typingDuring.typing).toBe("responsive typing");
		await browser.run(["press", "Escape"]);
		const finalState = await pollUntil(
			pageState,
			(state) =>
				state.perf.inflight === 0 &&
				state.perf.responses.length === state.perf.reports &&
				state.perf.responses.every((response) => response.replacementsAfter !== null),
			"all human reports and replacement samples to settle",
		);
		const finalProbe = finalState.perf;
		const fsyncs = readFsyncTrace(traceFile).calls.length - fsyncBefore;
		expect(finalProbe.responses.length).toBeGreaterThanOrEqual(3);
		for (const response of finalProbe.responses) {
			expect(response.requestFullReport).toBeFalse();
			expect(response.hasDocument).toBeFalse();
		}
		expect(Math.max(...finalProbe.responses.map((response) => response.bytes)) * 20).toBeLessThan(
			fullDocumentBytes,
		);
		expect(finalProbe.reports).toBeGreaterThanOrEqual(3);
		expect(finalProbe.agentWrites).toBe(0);
		expect(finalProbe.reports).toBeLessThanOrEqual(8);
		expect(finalProbe.holds).toBeLessThanOrEqual(finalProbe.reports + 3);
		expect(finalProbe.releases).toBeLessThanOrEqual(finalProbe.holds);
		expect(fsyncs).toBeGreaterThanOrEqual(finalProbe.reports * 2);
		expect(fsyncs).toBeLessThanOrEqual(finalProbe.reports * 4 + 2);

		const gaps = finalProbe.frames
			.map((frame) => frame.gap)
			.filter((gap) => gap > 0)
			.toSorted((left, right) => left - right);
		const median = gaps[Math.floor(gaps.length / 2)] || 1;
		const reportGaps = finalProbe.responses.flatMap((response) =>
			finalProbe.frames
				.filter((frame) => Math.abs(frame.at - response.returnedAt) <= median * 8)
				.map((frame) => frame.gap),
		);
		const worstReportGap = Math.max(0, ...reportGaps);
		expect(reportGaps.length).toBeGreaterThan(0);
		expect(worstReportGap).toBeLessThanOrEqual(median * 8);

		// oxlint-disable-next-line no-console -- retained measurement diagnostics aid failure triage.
		console.log(
			`# measured: bodies ${finalProbe.bodyBytes.join("/")} B; responses ` +
				`${finalProbe.responses.map((response) => response.bytes).join("/")} B; ` +
				`shapes ${finalProbe.responses
					.map((response) =>
						response.hasDocument
							? `document(full:${response.requestFullReport})`
							: `corrections:${response.correctionUpserts}+/${response.correctionDeletes}-` +
								`[${response.correctionIds.join(",")}](full:${response.requestFullReport})`,
					)
					.join("/")}; sample ` +
				`${JSON.stringify(finalProbe.responses.find((response) => response.correctionDiff.length)?.correctionDiff ?? [])}; ` +
				`replacement samples ${finalProbe.responses.map((response) => response.replacementsAfter).join("/")}; ` +
				`${finalProbe.replacements} total replacements; JSON ` +
				`${finalProbe.responses.map((response) => response.parseMs.toFixed(2)).join("/")} ms; ` +
				`${fsyncs} fsyncs; frame median ${median.toFixed(1)} ms; ` +
				`worst report-correlated ${worstReportGap.toFixed(1)} ms`,
		);

		const tracers = tracerPids(process.pid);
		expect(tracers.length).toBeGreaterThan(0);
		await browser.close();
		await canvas.dispose();
		await pollUntil(
			() => tracers.filter(processExists),
			(live) => live.length === 0,
			"the traced canvas descendant to disappear",
		);
		expect(readFsyncTrace(traceFile).incomplete).toEqual([]);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 8,
);
