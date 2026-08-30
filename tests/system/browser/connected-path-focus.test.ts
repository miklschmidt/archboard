import { expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { LegacyElementIngress } from "../../../src/shared/board-elements/index.ts";
import {
	PANE_SETTLE_CAP_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { inExcalidrawApp } from "./support/page-scene.ts";

interface PanesBody {
	readonly paneCount: number;
	readonly panes: Array<{ readonly clientId: string; readonly board: string }>;
}

interface ChangeFeed {
	readonly feedId: string;
	readonly cursor: number;
	readonly events: unknown[];
}

interface ExportBody {
	readonly format?: string;
	readonly data?: string;
}

interface FocusView {
	readonly error?: string;
	readonly state: string | null;
	readonly reason: string | null;
	readonly focusedIds: string[];
	readonly selectedIds: string[];
	readonly text: string;
	readonly dim: string;
	readonly pointerEvents: string;
	readonly theme: string;
	readonly focusHeight: number;
	readonly exitHeight: number;
	readonly fullscreen: boolean;
}

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");
const board = "path-focus";

const elements = [
	{
		id: "a",
		type: "rectangle",
		x: 100,
		y: 220,
		width: 160,
		height: 90,
		backgroundColor: "#dce7ff",
		fillStyle: "solid",
	},
	{
		id: "b",
		type: "rectangle",
		x: 420,
		y: 100,
		width: 160,
		height: 90,
		backgroundColor: "#e7f9b7",
		fillStyle: "solid",
	},
	{
		id: "c",
		type: "rectangle",
		x: 420,
		y: 340,
		width: 160,
		height: 90,
		backgroundColor: "#ffead5",
		fillStyle: "solid",
	},
	{
		id: "u",
		type: "rectangle",
		x: 780,
		y: 190,
		width: 160,
		height: 90,
		backgroundColor: "#fee4e2",
		fillStyle: "solid",
	},
	{
		id: "iso",
		type: "rectangle",
		x: 780,
		y: 380,
		width: 160,
		height: 90,
		backgroundColor: "#eeeeeb",
		fillStyle: "solid",
	},
	{
		id: "ab",
		type: "arrow",
		x: 260,
		y: 265,
		points: [
			[0, 0],
			[160, -120],
		],
		start: { id: "a" },
		end: { id: "b" },
		label: { text: "calls" },
	},
	{
		id: "bc",
		type: "arrow",
		x: 500,
		y: 190,
		points: [
			[0, 0],
			[0, 150],
		],
		start: { id: "b" },
		end: { id: "c" },
	},
	{
		id: "ca",
		type: "arrow",
		x: 420,
		y: 385,
		points: [
			[0, 0],
			[-160, -120],
		],
		start: { id: "c" },
		end: { id: "a" },
	},
	{
		id: "broken",
		type: "arrow",
		x: 760,
		y: 530,
		points: [
			[0, 0],
			[140, 0],
		],
	},
] as const satisfies readonly LegacyElementIngress[];

function select(browser: AgentBrowserSession, ids: readonly string[]): Promise<boolean> {
	return browser.eval<boolean>(`(() => {
  const app = window.__pathFocusApp;
  if (!app) return false;
  app.updateScene({ appState: { selectedElementIds: Object.fromEntries(
    ${JSON.stringify(ids)}.map(id => [id, true])
  ) } });
  return true;
})()`);
}

function focusView(browser: AgentBrowserSession): Promise<FocusView> {
	return browser.eval<FocusView>(`(() => {
  const app = window.__pathFocusApp;
  const inspector = document.querySelector('.selection-inspector');
  const overlay = document.querySelector('.path-focus-overlay');
  const dimmer = document.querySelector('.path-focus-dimmer');
  return {
    state: inspector?.getAttribute('data-path-focus-state') ?? null,
    reason: document.querySelector('.path-focus-none')?.getAttribute('data-path-focus-reason') ?? null,
    focusedIds: (overlay?.getAttribute('data-focused-ids') ?? '').split(' ').filter(Boolean),
    selectedIds: Object.entries(app.state.selectedElementIds ?? {})
      .filter(([, selected]) => selected).map(([id]) => id).sort(),
    text: inspector?.innerText ?? '',
    dim: dimmer ? getComputedStyle(dimmer).fill : '',
    pointerEvents: overlay ? getComputedStyle(overlay).pointerEvents : '',
    theme: document.querySelector('.shell')?.getAttribute('data-theme') ?? '',
    focusHeight: document.querySelector('.selection-inspector-focus')?.getBoundingClientRect().height ?? 0,
    exitHeight: document.querySelector('.selection-inspector-exit')?.getBoundingClientRect().height ?? 0,
    fullscreen: Boolean(document.querySelector('.shell')) &&
      document.fullscreenElement === document.querySelector('.shell')
  };
})()`);
}

function waitFocus(
	browser: AgentBrowserSession,
	state: "inactive" | "connected" | "no-path",
	reason: string | null = null,
): Promise<FocusView> {
	return pollUntil(
		() => focusView(browser),
		(view) => view.state === state && (reason === null || view.reason === reason),
		`${state}${reason ? ` ${reason}` : ""} path focus state`,
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
}

function sceneJson(browser: AgentBrowserSession): Promise<string> {
	return browser.eval<string>(
		"JSON.stringify(window.__pathFocusApp.scene.getElementsIncludingDeleted())",
	);
}

async function settledScene(browser: AgentBrowserSession): Promise<string> {
	let previous = "";
	const settled = await pollUntil(
		async () => {
			const current = await sceneJson(browser);
			const stable = current === previous && JSON.parse(current).length >= elements.length + 1;
			previous = current;
			return { current, stable };
		},
		(value) => value.stable,
		"the converted focus scene to settle",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	return settled.current;
}

async function screenPoint(
	browser: AgentBrowserSession,
	elementId: string,
): Promise<{ x: number; y: number }> {
	return browser.eval<{ x: number; y: number }>(`(() => {
  const app = window.__pathFocusApp;
  const element = app.scene.getElementsIncludingDeleted().find(item => item.id === ${JSON.stringify(elementId)});
  const zoom = app.state.zoom.value;
  return {
    x: Math.round((element.x + element.width / 2 + app.state.scrollX) * zoom + app.state.offsetLeft),
    y: Math.round((element.y + element.height / 2 + app.state.scrollY) * zoom + app.state.offsetTop)
  };
})()`);
}

test(
	"connected path focus stays browser-only while selection and presentation change",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { ownerRoot } = browserTestRoots();
		const vault = join(ownerRoot, "vault");
		mkdirSync(vault, { recursive: true });
		const canvas = await startOwnedCanvas({
			serverPath,
			vault,
			env: canvasTestEnvironment(),
		});
		resources.defer(() => canvas.dispose());
		registerCanvasBase(canvas.base);
		const api = createJsonRequester(canvas);
		expect((await api("/api/boards/new", { method: "POST", body: { board } })).status).toBe(200);
		expect(
			(await api(`/api/elements/batch?board=${board}`, { method: "POST", body: { elements } }))
				.status,
		).toBe(200);
		const saved = await api<{ file: string }>("/api/boards/save", {
			method: "POST",
			body: { board },
		});
		expect(saved.status).toBe(200);

		const browser = resources.use(await createAgentBrowser());
		await browser.run(["open", canvas.base]);
		await browser.run(["set", "viewport", "1440", "900"]);
		const panes = await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body),
			(value) => value.paneCount === 1,
			"the focus pane to register",
		);
		expect(
			(
				await api("/api/boards/open", {
					method: "POST",
					body: { board, pane: panes.panes[0]!.clientId, reload: true },
				})
			).status,
		).toBe(200);
		expect(
			await browser.eval<boolean>(
				inExcalidrawApp(`
  window.__pathFocusApp = app;
  const original = window.fetch;
  window.__pathFocusReports = 0;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : input?.url ?? '';
    const method = (init?.method ?? input?.method ?? 'GET').toUpperCase();
    if (method === 'POST' && url.includes('/api/elements/changes')) window.__pathFocusReports += 1;
    return original.apply(this, arguments);
  };
				return true;`),
			),
		).toBe(true);
		const sceneBefore = await settledScene(browser);
		const noteBefore = readFileSync(saved.body.file);
		const serverBefore = (await api<{ elements: unknown[] }>(`/api/elements?board=${board}`)).body;
		const feedBefore = (await api<ChangeFeed>(`/api/changes?board=${board}&since=0`)).body;
		const exportBefore = await api<ExportBody>("/api/export/image", {
			method: "POST",
			body: { format: "svg", background: true },
		});

		expect(await select(browser, ["a"])).toBe(true);
		await browser.run(["click", ".selection-inspector-focus"]);
		let view = await waitFocus(browser, "connected");
		const component = await browser.eval<{ expected: string[]; labelId: string | null }>(`(() => {
  const app = window.__pathFocusApp;
  const all = app.scene.getElementsIncludingDeleted();
  const core = new Set(['a', 'b', 'c', 'ab', 'bc', 'ca']);
  const label = all.find(element => element.type === 'text' && element.containerId === 'ab');
  return {
    expected: all.filter(element => core.has(element.id) || core.has(element.containerId)).map(element => element.id).sort(),
    labelId: label?.id ?? null
		};
})()`);
		expect(component.labelId).not.toBeNull();
		expect(view.focusedIds.toSorted()).toEqual(component.expected);
		expect(new Set(view.focusedIds).size).toBe(view.focusedIds.length);
		expect(view.pointerEvents).toBe("none");

		const originalTheme = view.theme;
		const lightOrDarkFill = view.dim;
		await browser.run([
			"click",
			`.bar-actions [aria-label="Use ${originalTheme === "light" ? "dark" : "light"} theme"]`,
		]);
		view = await pollUntil(
			() => focusView(browser),
			(next) => next.state === "connected" && next.theme !== originalTheme,
			"focus contrast in the opposite theme",
		);
		expect(view.dim).not.toBe(lightOrDarkFill);
		expect([view.dim, lightOrDarkFill].every((fill) => /rgba?\(/.test(fill))).toBe(true);
		await browser.run(["click", `.bar-actions [aria-label="Use ${originalTheme} theme"]`]);
		await pollUntil(
			() => focusView(browser),
			(next) => next.theme === originalTheme,
			"theme restore",
		);

		expect(await select(browser, ["bc"])).toBe(true);
		expect((await waitFocus(browser, "connected")).focusedIds.toSorted()).toEqual(
			component.expected,
		);
		expect(await select(browser, [component.labelId!])).toBe(true);
		expect((await waitFocus(browser, "connected")).focusedIds.toSorted()).toEqual(
			component.expected,
		);
		expect(await select(browser, ["broken"])).toBe(true);
		expect((await waitFocus(browser, "no-path", "broken")).text).toContain("No connected path");
		expect(await select(browser, ["a"])).toBe(true);
		await waitFocus(browser, "connected");

		const unrelated = await screenPoint(browser, "u");
		await browser.run(["mouse", "move", String(unrelated.x), String(unrelated.y)]);
		await browser.run(["mouse", "down"]);
		await browser.run(["mouse", "up"]);
		view = await waitFocus(browser, "no-path", "isolated");
		expect(view.selectedIds).toEqual(["u"]);
		expect(view.text).toContain("This element has no canonical arrow-bound path.");
		expect(await select(browser, ["a"])).toBe(true);
		await waitFocus(browser, "connected");

		view = await waitFocus(browser, "connected");
		expect(view.exitHeight).toBeGreaterThanOrEqual(44);
		await browser.run(["click", ".selection-inspector-exit"]);
		view = await waitFocus(browser, "inactive");
		expect(view.focusHeight).toBeGreaterThanOrEqual(44);
		await browser.run(["click", ".selection-inspector-focus"]);
		await waitFocus(browser, "connected");

		await browser.run(["click", '.present-button[aria-label="Present Pane A fullscreen"]']);
		view = await pollUntil(
			() => focusView(browser),
			(next) => next.fullscreen && next.state === "connected" && next.focusedIds.length > 0,
			"the focused overlay in fullscreen",
		);
		expect(view.fullscreen).toBe(true);
		await browser.run(["press", "Escape"]);
		view = await pollUntil(
			() => focusView(browser),
			(next) => !next.fullscreen && next.state === "connected" && next.focusedIds.length > 0,
			"fullscreen exit to preserve focus",
		);
		expect(view.state).toBe("connected");
		await browser.run(["press", "Escape"]);
		await waitFocus(browser, "inactive");

		expect(await select(browser, [])).toBe(true);
		const sceneAfter = await settledScene(browser);
		const serverAfter = (await api<{ elements: unknown[] }>(`/api/elements?board=${board}`)).body;
		const feedAfter = (
			await api<ChangeFeed>(`/api/changes?board=${board}&since=${feedBefore.cursor}`)
		).body;
		const exportAfter = await api<ExportBody>("/api/export/image", {
			method: "POST",
			body: { format: "svg", background: true },
		});
		expect(sceneAfter).toBe(sceneBefore);
		expect(serverAfter).toEqual(serverBefore);
		expect(readFileSync(saved.body.file)).toEqual(noteBefore);
		expect(feedAfter).toEqual({
			...feedBefore,
			events: [],
		});
		expect(exportAfter.body).toEqual(exportBefore.body);
		expect(await browser.eval<number>("window.__pathFocusReports ?? -1")).toBe(0);
		await canvas.assertRunning();
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 2,
);
