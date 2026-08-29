import { expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { derivedId, isBlockId } from "../../../src/shared/ids/ids.ts";
import { TEST_BROWSER_COMMAND_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	type AgentBrowserSession,
} from "./support/agent-browser.js";
import { inExcalidrawApp } from "./support/page-scene.js";

setDefaultTimeout(TEST_BROWSER_COMMAND_TIMEOUT_MS);

const repoRoot = resolve(import.meta.dir, "../../..");
const BOARD = "typed";

type TextElement = Extract<ExcalidrawElement, { type: "text" }>;
type ElementView = Pick<ExcalidrawElement, "id" | "type" | "x" | "boundElements"> &
	Partial<Pick<TextElement, "text" | "containerId">>;
type PaneElementView = Pick<ExcalidrawElement, "id" | "type" | "x"> & {
	text: TextElement["text"] | null;
	containerId: TextElement["containerId"];
	boundElements: Array<NonNullable<ExcalidrawElement["boundElements"]>[number]["id"]>;
};
type PostedElementView = Pick<ExcalidrawElement, "id" | "type">;

interface PaneState {
	editing: string | null;
	typing: string | null;
	elements: PaneElementView[];
}

interface PostedState {
	reports: number;
	upserts: PostedElementView[];
}

const paneNow = (browser: AgentBrowserSession): Promise<PaneState> =>
	browser.eval<PaneState>(
		inExcalidrawApp(`
const textarea = document.querySelector('textarea.excalidraw-wysiwyg');
return {
  editing: app.state.editingTextElement?.id ?? null,
  typing: textarea instanceof HTMLTextAreaElement ? textarea.value : null,
  elements: app.scene.getElementsIncludingDeleted()
    .filter((element) => !element.isDeleted)
    .map((element) => ({
      id: element.id,
      type: element.type,
      x: element.x,
      text: element.text ?? null,
      containerId: element.containerId ?? null,
      boundElements: (element.boundElements ?? []).map((bound) => bound.id),
    })),
};
`),
	);

const posted = (browser: AgentBrowserSession): Promise<PostedState> =>
	browser.eval<PostedState>("(() => ({ ...window.__archboardTypedTextPosted }))()");

test("trusted typing survives Excalidraw id settlement across writes", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const canvas = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault: join(ownerRoot, "vault"),
		env: canvasTestEnvironment({ LOG_FILE_PATH: join(ownerRoot, "canvas.log") }),
	});
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);

	await request("/api/boards/new", {
		method: "POST",
		body: { board: BOARD, level: "service" },
		doing: "preparing the typed-text browser check",
	});
	await request(`/api/elements/changes?board=${BOARD}`, {
		method: "POST",
		body: {
			origin: "agent",
			upserts: [
				{
					id: "auth",
					type: "rectangle",
					x: 100,
					y: 100,
					width: 220,
					height: 90,
					backgroundColor: "#ffffff",
					fillStyle: "solid",
				},
				{
					id: "other",
					type: "rectangle",
					x: 100,
					y: 400,
					width: 160,
					height: 70,
					backgroundColor: "#ffffff",
					fillStyle: "solid",
				},
			],
		},
		doing: "seeding two shapes for trusted typing",
	});
	await request("/api/boards/save", {
		method: "POST",
		body: { board: BOARD },
		doing: "saving the typed-text fixture",
	});

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", canvas.base]);
	const panes = await pollUntil(
		async () => (await request<{ paneCount: number }>("/api/panes")).body,
		(value) => value.paneCount >= 1,
		"the trusted browser to register its pane",
	);
	expect(panes.paneCount).toBe(1);

	const userAgent = await browser.eval<string>("navigator.userAgent");
	expect(userAgent).toMatch(/Headless/i);

	const opened = await request<{ elementCount?: number; source?: string }>("/api/boards/open", {
		method: "POST",
		body: { board: BOARD, reload: true },
		doing: "opening the typed-text fixture",
	});
	expect(opened.status).toBe(200);
	expect(opened.body.elementCount).toBe(2);

	await browser.eval(`(() => {
  window.__archboardTypedTextPosted = { upserts: [], reports: 0 };
  const original = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : input?.url ?? '';
    const method = init?.method ?? input?.method ?? 'GET';
    if (method === 'POST' && url.includes('/api/elements/changes')) {
      window.__archboardTypedTextPosted.reports += 1;
      const body = JSON.parse(init?.body ?? '{}');
      for (const element of body.upserts ?? []) {
        window.__archboardTypedTextPosted.upserts.push({ id: element.id, type: element.type });
      }
    }
    return original.apply(this, arguments);
  };
  return true;
})()`);
	await browser.run(["click", ".excalidraw"]);

	const canvasBox = await browser.eval<{ x: number; y: number; width: number; height: number }>(
		`(() => {
  const rect = document.querySelector('.excalidraw').getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
})()`,
	);

	await browser.run(["press", "t"]);
	const tool = await browser.eval<{ tool: string }>(
		inExcalidrawApp("return { tool: app.state.activeTool.type };"),
	);
	expect(tool.tool).toBe("text");

	const drawX = Math.round(canvasBox.x + canvasBox.width * 0.62);
	const drawY = Math.round(canvasBox.y + canvasBox.height * 0.72);
	await browser.run(["mouse", "move", String(drawX), String(drawY)]);
	await browser.run(["mouse", "down"]);
	await browser.run(["mouse", "up"]);
	const born = await pollUntil(
		() => paneNow(browser),
		(value) => value.editing !== null && value.typing !== null,
		"Excalidraw to open the trusted text-tool editor",
	);
	const drawnId = born.editing;
	expect(typeof drawnId).toBe("string");
	expect(born.typing).toBe("");
	expect(drawnId).toHaveLength(21);
	expect(typeof drawnId).toBe("string");
	expect(isBlockId(drawnId)).toBe(false);
	const expectedDrawnId = derivedId(drawnId!, new Set(born.elements.map((element) => element.id)));

	await browser.run(["keyboard", "type", "hello"]);
	const reportsBeforeNudge = (await posted(browser)).reports;
	const nudged = await browser.eval<{ ok?: boolean; error?: string }>(
		inExcalidrawApp(`
const all = app.scene.getElementsIncludingDeleted().map((element) => ({ ...element }));
if (!all.some((element) => element.id === 'other')) return { error: 'missing other' };
app.updateScene({
  elements: all.map((element) => element.id === 'other'
    ? { ...element, x: element.x + 13 }
    : element),
  captureUpdate: 'IMMEDIATELY',
});
return { ok: true };
`),
	);
	expect(nudged.ok).toBe(true);

	const firstWrite = await pollUntil(
		async () => {
			const wire = await posted(browser);
			const board = (await request<{ elements: ElementView[] }>(`/api/elements?board=${BOARD}`))
				.body.elements;
			return { wire, board };
		},
		(value) =>
			value.wire.reports > reportsBeforeNudge &&
			value.board.some((element) => element.id === "other" && element.x === 113),
		"the nudge to reach the server while the text editor remains open",
	);
	expect(firstWrite.wire.reports).toBeGreaterThan(reportsBeforeNudge);
	expect(firstWrite.board.some((element) => element.id === "other")).toBe(true);

	const midEdit = await paneNow(browser);
	expect(midEdit.editing).toBe(drawnId);
	expect(midEdit.typing).toBe("hello");
	expect(midEdit.elements.some((element) => element.id === drawnId)).toBe(true);
	expect(firstWrite.board.some((element) => element.id === drawnId)).toBe(false);
	expect(
		midEdit.elements.some((element) => element.type === "text" && element.id !== drawnId),
	).toBe(false);

	await browser.run(["keyboard", "type", " world"]);
	await browser.run(["press", "Escape"]);
	const boardAfterDraw = await pollUntil(
		async () => (await request<{ elements: ElementView[] }>(`/api/elements?board=${BOARD}`)).body,
		(value) =>
			value.elements.some((element) => element.type === "text" && element.text === "hello world"),
		"the complete trusted text-tool value to settle on the server",
	);
	const drawnText = boardAfterDraw.elements.find(
		(element) => element.type === "text" && element.text === "hello world",
	);
	expect(drawnText?.text).toBe("hello world");
	expect(isBlockId(drawnText?.id)).toBe(true);
	expect(drawnText?.id).toBe(expectedDrawnId);
	const paneAfterDraw = await pollUntil(
		() => paneNow(browser),
		(value) => value.elements.some((element) => element.id === drawnText?.id),
		"the pane to receive the settled trusted text-tool id",
	);
	const paneDrawnText = paneAfterDraw.elements.find((element) => element.id === drawnText?.id);
	expect(paneDrawnText).toBeDefined();
	expect(paneDrawnText?.text).toBe("hello world");

	const centre = await browser.eval<{ x: number; y: number }>(
		inExcalidrawApp(`
const state = app.state;
return {
  x: state.width / 2 / state.zoom.value - state.scrollX,
  y: state.height / 2 / state.zoom.value - state.scrollY,
};
`),
	);
	await request(`/api/elements/changes?board=${BOARD}`, {
		method: "POST",
		body: { origin: "agent", upserts: [{ id: "auth", x: centre.x - 110, y: centre.y - 45 }] },
		doing: "centering the shape for trusted label input",
	});
	await pollUntil(
		() => paneNow(browser),
		(value) =>
			value.elements.some((element) => element.id === "auth" && element.x === centre.x - 110),
		"the centered label container to reach the pane",
	);

	const reportsBeforeLabel = (await posted(browser)).reports;
	await browser.run(["dblclick", ".excalidraw"]);
	const labelBorn = await pollUntil(
		() => paneNow(browser),
		(value) =>
			value.editing !== null &&
			value.elements.some(
				(element) => element.id === value.editing && element.containerId === "auth",
			),
		"Excalidraw to open the trusted double-click label editor",
	);
	const labelId = labelBorn.editing;
	expect(typeof labelId).toBe("string");
	const bornLabel = labelBorn.elements.find((element) => element.id === labelId);
	expect(bornLabel).toBeDefined();
	expect(bornLabel?.containerId).toBe("auth");
	expect(labelId).toHaveLength(21);
	expect(typeof labelId).toBe("string");
	expect(isBlockId(labelId)).toBe(false);
	const expectedLabelId = derivedId(
		labelId!,
		new Set(labelBorn.elements.map((element) => element.id)),
	);

	await browser.run(["keyboard", "type", "ABCDE"]);
	const labelWrite = await pollUntil(
		async () => {
			const wire = await posted(browser);
			const board = (await request<{ elements: ElementView[] }>(`/api/elements?board=${BOARD}`))
				.body.elements;
			return { wire, board };
		},
		(value) =>
			value.wire.reports > reportsBeforeLabel &&
			(value.board.find((element) => element.id === "auth")?.boundElements ?? []).some(
				(bound) => bound.id === labelId,
			),
		"the container binding to reach the server while the label editor remains open",
	);
	expect(labelWrite.wire.reports).toBeGreaterThan(reportsBeforeLabel);
	expect(
		(labelWrite.board.find((element) => element.id === "auth")?.boundElements ?? []).some(
			(bound) => bound.id === labelId,
		),
	).toBe(true);

	const labelMid = await paneNow(browser);
	expect(labelMid.editing).toBe(labelId);
	expect(labelMid.typing).toBe("ABCDE");
	expect(labelWrite.board.some((element) => element.id === labelId)).toBe(false);

	await browser.run(["keyboard", "type", "FGHIJ"]);
	await browser.run(["press", "Escape"]);
	const boardAfterLabel = await pollUntil(
		async () => (await request<{ elements: ElementView[] }>(`/api/elements?board=${BOARD}`)).body,
		(value) => value.elements.some((element) => element.containerId === "auth"),
		"the complete trusted label value to settle on the server",
	);
	const label = boardAfterLabel.elements.find((element) => element.containerId === "auth");
	expect(label?.text).toBe("ABCDEFGHIJ");
	expect(isBlockId(label?.id)).toBe(true);
	expect(label?.id).toBe(expectedLabelId);
	const auth = boardAfterLabel.elements.find((element) => element.id === "auth");
	expect((auth?.boundElements ?? []).some((bound) => bound.id === label?.id)).toBe(true);

	const paneAfterLabel = await pollUntil(
		() => paneNow(browser),
		(value) => value.elements.some((element) => element.id === label?.id),
		"the pane to receive the settled trusted label id",
	);
	const paneLabel = paneAfterLabel.elements.find((element) => element.id === label?.id);
	expect(paneLabel).toBeDefined();
	expect(paneLabel?.text).toBe("ABCDEFGHIJ");
	const paneAuth = paneAfterLabel.elements.find((element) => element.id === "auth");
	expect(paneAuth).toBeDefined();
	expect(paneAuth?.boundElements.includes(label?.id ?? "")).toBe(true);

	const wire = await posted(browser);
	const renameable = wire.upserts.filter(
		(element) => element.type === "text" && !isBlockId(element.id),
	);
	expect(renameable).toHaveLength(0);
	const postedTextIds = new Set(
		wire.upserts.filter((element) => element.type === "text").map((element) => element.id),
	);
	expect(postedTextIds.has(drawnText!.id)).toBe(true);
	expect(postedTextIds.has(label!.id)).toBe(true);

	const info = await request<{ file: string }>(`/api/boards/info?board=${BOARD}`);
	const note = readFileSync(info.body.file, "utf8");
	expect(note.includes(`hello world ^${drawnText!.id}`)).toBe(true);
	expect(note.includes(`ABCDEFGHIJ ^${label!.id}`)).toBe(true);
});
