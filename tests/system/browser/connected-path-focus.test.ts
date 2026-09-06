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
import {
	INSPECTOR,
	THEME_EXPRESSION,
	stageIsFullscreen,
	switchTheme,
} from "./support/shell-dom.ts";

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

interface TypeMetrics {
	readonly size: number;
	readonly lineHeight: number;
}

/** What the inspector's path-focus section and the stage overlay show. */
interface FocusView {
	readonly error?: string;
	/** inactive, connected or no-path, from the section's words and controls. */
	readonly state: string | null;
	/** The reason words while there is no path, or null. */
	readonly reason: string | null;
	/** The connected count the section states, or 0. */
	readonly focusedCount: number;
	/** How many rings the overlay draws. */
	readonly ringCount: number;
	readonly selectedIds: string[];
	readonly text: string;
	readonly dim: string;
	readonly pointerEvents: string;
	readonly theme: string;
	readonly focusHeight: number;
	readonly exitHeight: number;
	readonly sections: string[];
	readonly titleType: TypeMetrics | null;
	readonly copyType: TypeMetrics | null;
	readonly controlType: TypeMetrics | null;
	readonly fullscreen: boolean;
}

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");
const board = "path-focus";
/** WCAG 2.5.8 target size floor. */
const MIN_TARGET = 24;

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
  const inspector = document.querySelector('${INSPECTOR}');
  const overlay = document.querySelector('svg[data-slot="path-focus-overlay"]');
  const dimmer = overlay?.querySelector('rect[mask]');
  const metrics = node => {
    if (!node) return null;
    const style = getComputedStyle(node);
    return { size: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight) };
  };
  const named = name => [...(inspector?.querySelectorAll('button') ?? [])].find(node => node.textContent.trim() === name) ?? null;
  const focusButton = named('Focus path');
  const exitButton = named('Exit focus');
  const headings = [...(inspector?.querySelectorAll('h3') ?? [])];
  const section = headings.find(node => node.textContent.trim() === 'Path focus')?.parentElement ?? null;
  const sectionText = section?.innerText ?? '';
  const connected = sectionText.match(/(\\d+) connected elements/);
  const reasons = {
    empty: 'Select an element to focus its path.',
    multiple: 'Select one element to focus its path.',
    missing: 'The selected element is no longer on the board.',
    isolated: 'The selected element has no arrows connecting it to anything.',
    broken: 'An arrow on this path points at an element that is not on the board.',
  };
  const reason = Object.entries(reasons).find(([, words]) => sectionText.includes(words))?.[0] ?? null;
  const state = !inspector ? 'inactive' : connected ? 'connected' : reason ? 'no-path' : 'inactive';
  return {
    state,
    reason,
    focusedCount: connected ? Number(connected[1]) : 0,
    ringCount: overlay ? overlay.querySelectorAll('rect[fill="none"]').length : 0,
    selectedIds: Object.entries(app.state.selectedElementIds ?? {})
      .filter(([, selected]) => selected).map(([id]) => id).sort(),
    text: inspector?.innerText ?? '',
    dim: dimmer ? getComputedStyle(dimmer).fill : '',
    pointerEvents: overlay ? getComputedStyle(overlay).pointerEvents : '',
    theme: ${THEME_EXPRESSION},
    focusHeight: focusButton?.getBoundingClientRect().height ?? 0,
    exitHeight: exitButton?.getBoundingClientRect().height ?? 0,
    sections: headings.map(heading => heading.textContent.trim()),
    titleType: metrics(inspector?.querySelector('h2')),
    copyType: metrics(section?.querySelector('p')),
    controlType: metrics(exitButton ?? focusButton),
    fullscreen: document.fullscreenElement !== null &&
      document.fullscreenElement === document.querySelector('[data-slot="canvas-stages"]')
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

/**
 * The rings the overlay draws, one per focused element, in stage pixels.
 * @param browser The page.
 * @returns The ring count and the expected count from the focus snapshot's words.
 */
function clickInspector(browser: AgentBrowserSession, name: string): Promise<string> {
	return browser.run(["find", "role", "button", "click", "--name", name, "--exact"]);
}

test(
	"connected path focus stays browser-only while selection and presentation change",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { ownerRoot } = browserTestRoots();
		const vault = join(ownerRoot, "vault");
		mkdirSync(vault, { recursive: true });
		const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
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
		await browser.run(["set", "viewport", "1920", "1080"]);
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
		const exportBefore = await api<ExportBody>("/api/browser/capture", {
			method: "POST",
			body: { format: "svg", background: true },
		});

		expect(await select(browser, ["a"])).toBe(true);
		await waitFocus(browser, "inactive");
		await clickInspector(browser, "Focus path");
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
		expect(view.focusedCount).toBe(component.expected.length);
		expect(view.ringCount).toBe(component.expected.length);
		expect(view.pointerEvents).toBe("none");
		expect(view.sections).toEqual(["Inspect", "Bound repository", "Path focus"]);
		expect(view.titleType?.size).toBeGreaterThanOrEqual(14);
		expect(view.copyType?.size).toBeGreaterThanOrEqual(12);
		expect(view.controlType?.size).toBeGreaterThanOrEqual(12);

		const originalTheme = view.theme === "dark" ? "dark" : "light";
		const lightOrDarkFill = view.dim;
		await switchTheme(browser, originalTheme === "light" ? "dark" : "light");
		view = await pollUntil(
			() => focusView(browser),
			(next) => next.state === "connected" && next.theme !== originalTheme,
			"focus contrast in the opposite theme",
		);
		expect(view.dim).not.toBe(lightOrDarkFill);
		expect([view.dim, lightOrDarkFill].every((fill) => fill.includes("("))).toBe(true);
		await switchTheme(browser, originalTheme);
		await pollUntil(
			() => focusView(browser),
			(next) => next.theme === originalTheme,
			"theme restore",
		);

		expect(await select(browser, ["bc"])).toBe(true);
		expect((await waitFocus(browser, "connected")).focusedCount).toBe(component.expected.length);
		expect(await select(browser, [component.labelId!])).toBe(true);
		expect((await waitFocus(browser, "connected")).focusedCount).toBe(component.expected.length);
		expect(await select(browser, ["broken"])).toBe(true);
		expect((await waitFocus(browser, "no-path", "broken")).text).toContain(
			"points at an element that is not on the board",
		);
		expect(await select(browser, ["a"])).toBe(true);
		await waitFocus(browser, "connected");

		const unrelated = await screenPoint(browser, "u");
		await browser.run(["mouse", "move", String(unrelated.x), String(unrelated.y)]);
		await browser.run(["mouse", "down"]);
		await browser.run(["mouse", "up"]);
		view = await waitFocus(browser, "no-path", "isolated");
		expect(view.selectedIds).toEqual(["u"]);
		expect(view.text).toContain("no arrows connecting it to anything");
		expect(await select(browser, ["a"])).toBe(true);
		await waitFocus(browser, "connected");

		view = await waitFocus(browser, "connected");
		expect(view.exitHeight).toBeGreaterThanOrEqual(MIN_TARGET);
		await clickInspector(browser, "Exit focus");
		view = await waitFocus(browser, "inactive");
		expect(view.focusHeight).toBeGreaterThanOrEqual(MIN_TARGET);
		expect(view.ringCount).toBe(0);
		expect(view.sections.at(-1)).toBe("Path focus");
		await clickInspector(browser, "Focus path");
		await waitFocus(browser, "connected");

		await browser.run(["click", 'button[aria-label="Present pane A fullscreen"]']);
		await pollUntil(
			() => focusView(browser),
			(next) => next.fullscreen && next.ringCount > 0,
			"the focused overlay in fullscreen",
		);
		expect(await stageIsFullscreen(browser)).toBe(true);
		await browser.run(["press", "Escape"]);
		view = await pollUntil(
			() => focusView(browser),
			(next) => !next.fullscreen && next.state === "connected" && next.ringCount > 0,
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
		const exportAfter = await api<ExportBody>("/api/browser/capture", {
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
