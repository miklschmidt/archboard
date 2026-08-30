import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

type Panes = {
	paneCount: number;
	panes: Array<{ clientId: string; board: string; place: string }>;
};
type InspectorView = { state: string | null; text: string; pane: string };
type ChangeFeed = { feedId: string; cursor: number; events: unknown[] };

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");
const fakeOpener = join(repoRoot, "tests/system/code-targets/fixtures/fake-opener.ts");
const repository = "github.com/acme/inspector";

function git(cwd: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
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
		const pane = [...document.querySelectorAll('.pane')]
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

function readInspector(browser: AgentBrowserSession): Promise<InspectorView> {
	return browser.eval<InspectorView>(`(() => {
		const inspector = document.querySelector('.selection-inspector');
		return {
			state: inspector?.getAttribute('data-selection-state') ?? null,
			text: inspector?.innerText ?? '',
			pane: inspector?.getAttribute('aria-label') ?? ''
		};
	})()`);
}

async function waitInspector(
	browser: AgentBrowserSession,
	state: string,
	text: string,
): Promise<InspectorView> {
	return pollUntil(
		() => readInspector(browser),
		(view) => view.state === state && view.text.includes(text),
		`${state} selection inspector state`,
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
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
								node: "broken",
								binding: { repo: repository, path: "/home/person/private.ts" },
							}),
						]
					: [
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

		const browser = resources.use(await createAgentBrowser());
		await browser.run(["open", canvas.base]);
		let panes = await pollUntil(
			() => api<Panes>("/api/panes").then((response) => response.body),
			(value) => value.paneCount === 1,
			"the initial pane",
		);
		await api("/api/boards/open", {
			method: "POST",
			body: { board: "selection-a", pane: panes.panes[0]!.clientId, reload: true },
		});
		await waitInspector(browser, "empty", "No selection");
		expect((await api("/api/panes/open", { method: "POST" })).status).toBe(200);
		panes = await pollUntil(
			() => api<Panes>("/api/panes").then((response) => response.body),
			(value) => value.paneCount === 2,
			"two rendered panes",
		);
		const right = panes.panes.find((pane) => pane.place === "right")!;
		await api("/api/boards/open", {
			method: "POST",
			body: { board: "selection-b", pane: right.clientId, reload: true },
		});
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
		const notePaths = ["selection-a", "selection-b"].map((board) =>
			join(vault, `${board}.excalidraw.md`),
		);
		const beforeNotes = notePaths.map((path) => readFileSync(path));
		const feedBefore = await Promise.all(
			["selection-a", "selection-b"].map((board) =>
				api<ChangeFeed>(`/api/changes?board=${board}&since=0`).then((response) => response.body),
			),
		);

		await select(browser, "Pane A", ["unbound"]);
		await waitInspector(browser, "unbound", "Not bound");
		await select(browser, "Pane A", ["malformed"]);
		await waitInspector(browser, "malformed", "Binding unavailable");
		await select(browser, "Pane A", ["unbound", "bound-local"]);
		await waitInspector(browser, "multiple", "2 elements selected");
		await select(browser, "Pane A", ["not-in-scene"]);
		await waitInspector(browser, "missing", "Selection disappeared");
		await select(browser, "Pane A", ["bound-local"]);
		const bound = await waitInspector(browser, "bound", "src/checkout.ts");
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
		])
			expect(bound.text).toContain(value);
		expect(bound.text).not.toContain(checkout);
		expect(bound.text).not.toContain("must-not-render");

		await select(browser, "Pane B", ["right-bound"]);
		await browser.run(["click", ".pane-tab:nth-child(2)"]);
		const transferred = await waitInspector(browser, "bound", "src/right.ts");
		expect(transferred.pane).toContain("Pane B");
		await browser.run(["click", ".pane-tab:nth-child(1)"]);
		await waitInspector(browser, "bound", "src/checkout.ts");

		const themes: string[] = [];
		for (let index = 0; index < 2; index += 1) {
			const theme = await browser.eval<string>(
				"document.querySelector('.shell')?.dataset.theme ?? ''",
			);
			themes.push(theme);
			expect((await readInspector(browser)).text).toContain("src/checkout.ts");
			if (index === 0)
				await browser.run([
					"click",
					`.bar-actions [aria-label="Use ${theme === "light" ? "dark" : "light"} theme"]`,
				]);
		}
		expect(themes.toSorted()).toEqual(["dark", "light"]);

		await browser.run(["click", ".selection-inspector-open"]);
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
		await browser.run(["click", ".selection-inspector-open"]);
		const recovery = await pollUntil(
			() =>
				browser.eval<{ settings: boolean; github: string | null; alert: string }>(`(() => ({
				settings: Boolean(document.querySelector('.notice-actions button')),
				github: document.querySelector('.notice-actions a')?.href ?? null,
				alert: document.querySelector('.notice-shell[role="alert"]')?.innerText ?? ''
			}))()`),
			(value) => value.settings && value.github !== null,
			"opener settings and GitHub recovery actions",
		);
		expect(recovery.alert).toContain("was not found");
		expect(recovery.github).toBe("https://github.com/acme/inspector/tree/62f0cef/src/checkout.ts");
		await browser.run(["click", ".notice-actions button"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					"Boolean(document.querySelector('dialog[aria-label=\"Opener settings\"] .modal-footer [data-autofocus]:not(:disabled)'))",
				),
			Boolean,
			"the opener settings recovery dialog to finish loading",
		);
		await browser.run(["click", "dialog .modal-footer [data-autofocus]:not(:disabled)"]);
		await pollUntil(
			() =>
				browser.eval<boolean>("!document.querySelector('dialog[aria-label=\"Opener settings\"]')"),
			Boolean,
			"the opener settings recovery dialog to close",
		);
		await browser.run(["click", ".notice-dismiss"]);

		await browser.run(["set", "viewport", "1440", "900"]);
		await browser.run(["click", '.present-button[aria-label="Present Pane A fullscreen"]']);
		const presented = await pollUntil(
			() =>
				browser.eval<{ fullscreen: boolean; inspector: string }>(`(() => ({
				fullscreen: document.fullscreenElement === document.querySelector('.shell'),
				inspector: getComputedStyle(document.querySelector('.selection-inspector')).display
			}))()`),
			(value) => value.fullscreen && value.inspector === "none",
			"confirmed fullscreen to hide the inspector",
		);
		expect(presented.inspector).toBe("none");
		await browser.run(["click", ".presentation-exit"]);
		await pollUntil(
			() => browser.eval<boolean>("document.fullscreenElement === null"),
			Boolean,
			"fullscreen to exit",
		);

		await browser.run(["set", "viewport", "420", "700"]);
		const narrow = await browser.eval<{
			collapsed: boolean;
			pane: number;
			inspector: number;
			workbench: number;
			page: number;
		}>(`(() => {
			const pane = document.querySelector('.pane').getBoundingClientRect();
			const inspector = document.querySelector('.selection-inspector');
			const workbench = document.querySelector('.agent-workbench').getBoundingClientRect();
			return {
				collapsed: inspector.querySelector('.selection-inspector-disclosure').getAttribute('aria-expanded') === 'false' &&
					getComputedStyle(inspector.querySelector('.selection-inspector-body')).display === 'none',
				pane: pane.height,
				inspector: inspector.getBoundingClientRect().height,
				workbench: workbench.height,
				page: document.documentElement.scrollWidth
			};
		})()`);
		expect(narrow.collapsed).toBe(true);
		expect(narrow.page).toBe(420);
		expect(narrow.pane).toBeGreaterThan(narrow.inspector + narrow.workbench);
		await browser.run(["click", ".selection-inspector-disclosure"]);
		const disclosed = await browser.eval<{
			visible: boolean;
			button: number;
			fits: boolean;
		}>(`(() => {
			const body = document.querySelector('.selection-inspector-body');
			const button = document.querySelector('.selection-inspector-open').getBoundingClientRect();
			const panel = document.querySelector('.selection-inspector').getBoundingClientRect();
			return {
				visible: getComputedStyle(body).display !== 'none',
				button: button.height,
				fits: panel.left >= 0 && panel.right <= innerWidth && panel.bottom <= innerHeight
			};
		})()`);
		expect(disclosed).toEqual({ visible: true, button: 44, fits: true });

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
