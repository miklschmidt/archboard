import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { TEST_BROWSER_COMMAND_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	runCanvasCli,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import {
	readInspector,
	readInspectorContract,
	waitInspector,
} from "./support/selection-inspector.ts";
import {
	BOARD_NAME_EXPRESSION,
	INSPECTOR,
	PANE_SECTIONS,
	PANE_TABS,
	currentTheme,
	dismissNotice,
	shellNotices,
	stageIsFullscreen,
	switchTheme,
} from "./support/shell-dom.ts";

type Panes = {
	paneCount: number;
	panes: Array<{ clientId: string; board: string; place: string }>;
};
type ChangeFeed = { feedId: string; cursor: number; events: unknown[] };

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");
const fakeOpener = join(repoRoot, "tests/system/code-targets/fixtures/fake-opener.ts");
const repository = "github.com/acme/inspector";
/** WCAG 2.5.8 target size floor. */
const MIN_TARGET = 24;

function git(cwd: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe" });
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.toString());
	}
}

function shape(id: string, x: number, archboard: Record<string, unknown>) {
	return {
		id,
		type: "rectangle",
		x,
		y: 100,
		width: 180,
		height: 100,
		backgroundColor: "#dce7ff",
		customData: { archboard },
	};
}

async function select(
	browser: AgentBrowserSession,
	paneLabel: string,
	ids: readonly string[],
): Promise<void> {
	const applied = await browser.eval<boolean>(`(() => {
		const pane = [...document.querySelectorAll('${PANE_SECTIONS}')]
			.find(candidate => candidate.getAttribute('aria-label') === ${JSON.stringify(paneLabel)});
		const node = pane?.querySelector('.excalidraw');
		const key = node && Object.keys(node).find(candidate => candidate.startsWith('__reactFiber$'));
		let fiber = key ? node[key] : null;
		let app = null;
		for (let depth = 0; fiber && depth < 60; depth += 1, fiber = fiber.return) {
			if (fiber.stateNode?.scene?.getElementsIncludingDeleted) {
				app = fiber.stateNode;
				break;
			}
		}
		if (!app) return false;
		app.updateScene({ appState: { selectedElementIds: Object.fromEntries(
			${JSON.stringify(ids)}.map(id => [id, true])
		) } });
		return true;
	})()`);
	expect(applied).toBe(true);
}

function clickInspector(browser: AgentBrowserSession, name: string): Promise<string> {
	return browser.run(["find", "role", "button", "click", "--name", name, "--exact"]);
}

test(
	"the focused selection inspector stays presentation-only and opens code through recovery",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { ownerRoot } = browserTestRoots();
		const vault = join(ownerRoot, "vault");
		const checkout = join(ownerRoot, "checkout");
		const state = join(ownerRoot, "state");
		const captures = join(ownerRoot, "captures");
		const exits = join(ownerRoot, "exits");
		const marker = join(ownerRoot, "release");
		const registry = join(state, "repos.json");
		const openerConfig = join(state, "opener.json");
		for (const directory of [vault, join(checkout, "src"), state, captures, exits]) {
			mkdirSync(directory, { recursive: true });
		}
		writeFileSync(join(checkout, "src", "checkout.ts"), "export {};\n");
		git(checkout, "init", "-q");
		git(checkout, "remote", "add", "origin", `https://${repository}.git`);
		writeFileSync(
			registry,
			JSON.stringify([
				{ repo: repository, root: checkout, source: "declared", addedAt: "2026-01-01" },
			]),
		);
		writeFileSync(
			openerConfig,
			JSON.stringify({
				version: 1,
				kind: "custom",
				executable: process.execPath,
				argv: [fakeOpener, "immediate", captures, marker, exits, "{path}"],
			}),
		);

		const canvas = await startOwnedCanvas({
			serverPath,
			vault,
			env: canvasTestEnvironment({
				ARCHBOARD_REPOS: registry,
				ARCHBOARD_OPENER_CONFIG: openerConfig,
			}),
		});
		resources.defer(() => canvas.dispose());
		registerCanvasBase(canvas.base);
		const api = createJsonRequester(canvas);
		for (const board of ["selection-a", "selection-b"]) {
			expect((await api("/api/boards/new", { method: "POST", body: { board } })).status).toBe(200);
			const elements =
				board === "selection-a"
					? [
							{ id: "leftmark", type: "text", x: 100, y: 260, text: "LEFT ONLY MARKER" },
							shape("bound-local", 100, {
								node: "checkout-service",
								kind: "service",
								name: "Checkout Service",
								variant: "current",
								level: "component",
								binding: {
									repo: repository,
									path: "src/checkout.ts",
									branch: "main",
									commit: "62f0cef",
									confirmedAt: "2026-08-24T10:30:00Z",
								},
								unknownField: "must-not-render",
							}),
							shape("unbound", 320, { node: "queue", kind: "queue" }),
							shape("malformed", 540, {
								binding: { repo: repository, path: "/home/person/private.ts" },
							}),
						]
					: [
							{ id: "rightmrk", type: "text", x: 100, y: 260, text: "RIGHT ONLY MARKER" },
							shape("right-bound", 100, {
								node: "right-service",
								binding: { repo: repository, path: "src/right.ts" },
							}),
						];
			expect(
				(await api(`/api/elements/batch?board=${board}`, { method: "POST", body: { elements } }))
					.status,
			).toBe(200);
			expect((await api("/api/boards/save", { method: "POST", body: { board } })).status).toBe(200);
		}
		const notePaths = ["selection-a", "selection-b"].map((board) =>
			join(vault, `${board}.excalidraw.md`),
		);
		const beforeNotes = notePaths.map((path) => readFileSync(path));

		const browser = resources.use(await createAgentBrowser());
		await browser.run(["open", canvas.base]);
		await browser.run(["set", "viewport", "1920", "1080"]);
		await pollUntil(
			() => api<Panes>("/api/panes").then((response) => response.body),
			(value) => value.paneCount === 1,
			"the initial pane",
		);
		runCanvasCli(canvas.base, vault, ["browser", "show", "selection-a", "--pane", "primary"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					`(${BOARD_NAME_EXPRESSION}) === 'selection-a' && document.querySelector('${INSPECTOR}') === null`,
				),
			Boolean,
			"the empty selection to leave the canvas unobstructed",
		);
		runCanvasCli(canvas.base, vault, ["browser", "open"]);
		const panes = await pollUntil(
			() => api<Panes>("/api/panes").then((response) => response.body),
			(value) => value.paneCount === 2,
			"two rendered panes",
		);
		const left = panes.panes.find((pane) => pane.place === "left")!;
		const right = panes.panes.find((pane) => pane.place === "right")!;
		runCanvasCli(canvas.base, vault, ["browser", "show", "selection-b", "--pane", "right"]);
		await browser.eval<boolean>(`(() => {
			const original = window.fetch;
			window.__selectionChangeReports = 0;
			window.fetch = function(input, init) {
				const url = typeof input === 'string' ? input : input?.url ?? '';
				const method = (init?.method ?? input?.method ?? 'GET').toUpperCase();
				if (method === 'POST' && url.includes('/api/elements/changes')) {
					window.__selectionChangeReports += 1;
				}
				return original.apply(this, arguments);
			};
			return true;
		})()`);
		const feedBefore = await Promise.all(
			["selection-a", "selection-b"].map((board) =>
				api<ChangeFeed>(`/api/changes?board=${board}&since=0`).then((response) => response.body),
			),
		);

		// The second pane took focus when it opened; the inspector follows the active pane.
		await browser.run(["click", `${PANE_TABS}:first-child`]);
		await select(browser, "Pane A", ["unbound"]);
		// An element without a name is titled by its id; its node key stays on its own row.
		const unbound = await waitInspector(browser, "unbound", "Not bound to code");
		expect(unbound.title).toBe("unbound");
		expect(unbound.text).toContain("queue");
		await select(browser, "Pane A", ["malformed"]);
		expect((await waitInspector(browser, "malformed", "The binding cannot be read")).title).toBe(
			"malformed",
		);
		await select(browser, "Pane A", ["unbound", "bound-local"]);
		expect((await waitInspector(browser, "multiple", "2 elements selected")).title).toBe("");
		await select(browser, "Pane A", ["not-in-scene"]);
		expect((await waitInspector(browser, "missing", "is no longer on the board")).text).toContain(
			"not-in-scene",
		);
		await select(browser, "Pane A", ["bound-local"]);
		const bound = await waitInspector(browser, "bound", "src/checkout.ts");
		expect(bound.title).toBe("Checkout Service");
		for (const value of [
			"bound-local",
			"rectangle",
			"checkout-service",
			"service",
			"Checkout Service",
			"current",
			"component",
			repository,
			"main",
			"62f0cef",
			"2026-08-24T10:30:00Z",
		]) {
			expect(bound.text.toLowerCase()).toContain(value.toLowerCase());
		}
		expect(bound.text).not.toContain(checkout);
		expect(bound.text).not.toContain("must-not-render");

		await select(browser, "Pane B", ["right-bound"]);
		for (const [clientId, elementId] of [
			[left.clientId, "bound-local"],
			[right.clientId, "right-bound"],
		] as const) {
			expect(
				(
					await api("/api/selection", {
						method: "POST",
						body: { clientId, elementIds: [elementId] },
					})
				).status,
			).toBe(200);
		}
		const leftSelection = JSON.parse(
			runCanvasCli(canvas.base, vault, ["browser", "selection", "--pane", "left"]),
		) as { board: string; elementIds: string[] };
		const rightSelection = JSON.parse(
			runCanvasCli(canvas.base, vault, ["browser", "selection", "--pane", "right"]),
		) as { board: string; elementIds: string[] };
		expect(leftSelection).toMatchObject({ board: "selection-a", elementIds: ["bound-local"] });
		expect(rightSelection).toMatchObject({ board: "selection-b", elementIds: ["right-bound"] });
		const rightCapture = runCanvasCli(canvas.base, vault, [
			"browser",
			"capture",
			"--pane",
			"right",
			"--format",
			"svg",
		]);
		expect(rightCapture).toContain("RIGHT ONLY MARKER");
		expect(rightCapture).not.toContain("LEFT ONLY MARKER");
		await browser.run(["click", `${PANE_TABS}:nth-child(2)`]);
		const transferred = await waitInspector(browser, "bound", "src/right.ts");
		expect(transferred.pane).toContain("Pane B");
		await browser.run(["click", `${PANE_TABS}:nth-child(1)`]);
		await waitInspector(browser, "bound", "src/checkout.ts");

		const themes: string[] = [];
		for (let index = 0; index < 2; index += 1) {
			const theme = await currentTheme(browser);
			themes.push(theme);
			expect((await readInspector(browser)).text).toContain("src/checkout.ts");
			const contract = await readInspectorContract(browser);
			expect(contract.sections).toEqual(["Inspect", "Bound repository", "Path focus"]);
			// The type roles (TASK-150.08): human text 11px or more in Onest; the
			// section kickers are the 10px uppercase 600 role, readable by contrast.
			for (const type of [
				contract.titleType,
				contract.labelType,
				contract.humanType,
				contract.copyType,
				contract.controlType,
			]) {
				expect(type.family).toContain("archboard onest");
				expect(type.size).toBeGreaterThanOrEqual(11);
				expect(type.lineHeight).toBeGreaterThanOrEqual(type.size);
			}
			for (const kicker of [contract.kickerType, contract.sectionType]) {
				expect(kicker.family).toContain("archboard onest");
				expect(kicker).toMatchObject({ size: 10, weight: 600, transform: "uppercase" });
				expect(kicker.lineHeight).toBeGreaterThanOrEqual(kicker.size);
			}
			expect(contract.technicalType.family).toContain("archboard dm mono");
			expect(contract).toMatchObject({
				titleType: { weight: 600 },
				technicalType: { weight: 400 },
			});
			expect(contract.kickerContrast).toBeGreaterThanOrEqual(4.5);
			expect(contract.labelContrast).toBeGreaterThanOrEqual(4.5);
			expect(contract.openHeight).toBeGreaterThanOrEqual(MIN_TARGET);
			expect(contract.focusHeight).toBeGreaterThanOrEqual(MIN_TARGET);
			if (index === 0) {
				await switchTheme(browser, theme === "light" ? "dark" : "light");
			}
		}
		expect(themes.toSorted()).toEqual(["dark", "light"]);

		await clickInspector(browser, "Open code");
		const capture = await pollUntil(
			() => readdirSync(captures).filter((file) => file.endsWith(".json")),
			(files) => files.length === 1,
			"the inspector code target to open",
		);
		const opened = JSON.parse(readFileSync(join(captures, capture[0]!), "utf8")) as {
			target: string;
		};
		expect(opened.target).toBe(join(checkout, "src", "checkout.ts"));
		writeFileSync(
			openerConfig,
			JSON.stringify({
				version: 1,
				kind: "custom",
				executable: join(ownerRoot, "missing"),
				argv: ["{path}"],
			}),
		);
		await clickInspector(browser, "Open code");
		const recovery = await pollUntil(
			() => shellNotices(browser),
			(notices) =>
				notices.some(
					(notice) => notice.actions.includes("Opener settings") && notice.links.length > 0,
				),
			"opener settings and GitHub recovery actions",
		);
		const recoveryNotice = recovery.find((notice) => notice.actions.includes("Opener settings"))!;
		expect(recoveryNotice.role).toBe("alert");
		expect(recoveryNotice.description).toContain("was not found");
		expect(recoveryNotice.links[0]).toBe(
			"https://github.com/acme/inspector/tree/62f0cef/src/checkout.ts",
		);
		const recoveryOverlapsInspector = await browser.eval<boolean>(`(() => {
			const notice = [...document.querySelectorAll('[data-slot="alert"]')].find(node => /was not found/.test(node.textContent));
			const inspector = document.querySelector('${INSPECTOR}');
			const noticeRect = notice.getBoundingClientRect();
			const inspectorRect = inspector.getBoundingClientRect();
			return noticeRect.left < inspectorRect.right && noticeRect.right > inspectorRect.left &&
				noticeRect.top < inspectorRect.bottom && noticeRect.bottom > inspectorRect.top;
		})()`);
		expect(recoveryOverlapsInspector).toBe(false);
		await browser.run(["find", "role", "button", "click", "--name", "Opener settings", "--exact"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					`(() => {
						const dialog = [...document.querySelectorAll('[role="dialog"]')].find(node =>
							[...node.querySelectorAll('[data-slot="dialog-title"]')].some(title => title.textContent?.trim() === 'Opener settings'));
						const close = [...(dialog?.querySelectorAll('button') ?? [])]
							.find(node => node.textContent?.trim() === 'Close');
						return close?.disabled === false && dialog.contains(document.activeElement);
					})()`,
				),
			Boolean,
			"the opener settings recovery dialog to finish loading",
		);
		await browser.run(["press", "Escape"]);
		await pollUntil(
			() => browser.eval<boolean>("!document.querySelector('[role=\"dialog\"]')"),
			Boolean,
			"the opener settings recovery dialog to close",
		);
		expect(await dismissNotice(browser, "Code target")).toBe(true);

		await browser.run(["click", 'button[aria-label="Present pane A fullscreen"]']);
		const presented = await pollUntil(
			async () => ({
				fullscreen: await stageIsFullscreen(browser),
				inspectorInside: await browser.eval<boolean>(
					`document.fullscreenElement?.contains(document.querySelector('${INSPECTOR}')) === true`,
				),
			}),
			(value) => value.fullscreen,
			"confirmed fullscreen to present the canvas alone",
		);
		expect(presented.inspectorInside).toBe(false);
		await browser.run([
			"find",
			"role",
			"button",
			"click",
			"--name",
			"Exit presentation",
			"--exact",
		]);
		await pollUntil(
			() => browser.eval<boolean>("document.fullscreenElement === null"),
			Boolean,
			"fullscreen to exit",
		);

		const desktop = await browser.eval<{
			viewport: [number, number];
			visible: boolean;
			bodyVisible: boolean;
			insideViewport: boolean;
		}>(`(() => {
			const inspector = document.querySelector('${INSPECTOR}');
			const panel = inspector.getBoundingClientRect();
			return {
				viewport: [innerWidth, innerHeight],
				visible: panel.width > 0 && panel.height > 0,
				bodyVisible: inspector.querySelector('h2').getBoundingClientRect().height > 0,
				insideViewport: panel.left >= 0 && panel.right <= innerWidth && panel.top >= 0 && panel.bottom <= innerHeight
			};
		})()`);
		expect(desktop).toEqual({
			viewport: [1920, 1080],
			visible: true,
			bodyVisible: true,
			insideViewport: true,
		});
		expect(await browser.eval<number>("window.__selectionChangeReports ?? -1")).toBe(0);
		for (const [index, path] of notePaths.entries()) {
			expect(readFileSync(path)).toEqual(beforeNotes[index]!);
		}
		for (const [index, board] of ["selection-a", "selection-b"].entries()) {
			const before = feedBefore[index]!;
			const after = (await api<ChangeFeed>(`/api/changes?board=${board}&since=${before.cursor}`))
				.body;
			expect(after).toMatchObject({ feedId: before.feedId, cursor: before.cursor, events: [] });
		}
		expect(await readInspector(browser)).not.toMatchObject({
			text: expect.stringContaining(checkout),
		});
		await canvas.assertRunning();
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 2,
);
