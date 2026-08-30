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
type InspectorView = { state: string | null; text: string; pane: string; title: string };
type TypeMetrics = { family: string; size: number; lineHeight: number };
type InspectorContract = {
	sections: string[];
	titleType: TypeMetrics;
	statusType: TypeMetrics;
	kickerType: TypeMetrics;
	sectionType: TypeMetrics;
	labelType: TypeMetrics;
	humanType: TypeMetrics;
	technicalType: TypeMetrics;
	copyType: TypeMetrics;
	controlType: TypeMetrics;
	kickerContrast: number;
	labelContrast: number;
	openHeight: number;
	focusHeight: number;
};
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
			pane: inspector?.getAttribute('aria-label') ?? '',
			title: inspector?.querySelector('.selection-inspector-title')?.textContent ?? ''
		};
	})()`);
}

function readInspectorContract(browser: AgentBrowserSession): Promise<InspectorContract> {
	return browser.eval<InspectorContract>(`(() => {
		const inspector = document.querySelector('.selection-inspector');
		const metrics = selector => {
			const style = getComputedStyle(inspector.querySelector(selector));
			return {
				family: style.fontFamily.toLowerCase(),
				size: parseFloat(style.fontSize),
				lineHeight: parseFloat(style.lineHeight)
			};
		};
		const rgb = value => (value.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number);
		const luminance = value => {
			const [red, green, blue] = rgb(value).map(channel => {
				const normalized = channel / 255;
				return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
		};
		const contrast = (foreground, background) => {
			const light = Math.max(luminance(foreground), luminance(background));
			const dark = Math.min(luminance(foreground), luminance(background));
			return (light + 0.05) / (dark + 0.05);
		};
		const background = getComputedStyle(inspector).backgroundColor;
		const kicker = inspector.querySelector('.selection-inspector-kicker');
		const label = inspector.querySelector('.selection-inspector-row dt');
		return {
			sections: [...inspector.querySelectorAll('.selection-inspector-section > h2')]
				.map(heading => heading.textContent),
			titleType: metrics('.selection-inspector-title'),
			statusType: metrics('.selection-inspector-status'),
			kickerType: metrics('.selection-inspector-kicker'),
			sectionType: metrics('.selection-inspector-section > h2'),
			labelType: metrics('.selection-inspector-row dt'),
			humanType: metrics('.selection-inspector-value-human'),
			technicalType: metrics('.selection-inspector-value-technical'),
			copyType: metrics('.path-focus-section .selection-inspector-copy'),
			controlType: metrics('.selection-inspector-focus'),
			kickerContrast: contrast(getComputedStyle(kicker).color, background),
			labelContrast: contrast(getComputedStyle(label).color, background),
			openHeight: inspector.querySelector('.selection-inspector-open').getBoundingClientRect().height,
			focusHeight: inspector.querySelector('.selection-inspector-focus').getBoundingClientRect().height
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
		await browser.run(["set", "viewport", "1440", "900"]);
		let panes = await pollUntil(
			() => api<Panes>("/api/panes").then((response) => response.body),
			(value) => value.paneCount === 1,
			"the initial pane",
		);
		await api("/api/boards/open", {
			method: "POST",
			body: { board: "selection-a", pane: panes.panes[0]!.clientId, reload: true },
		});
		expect((await waitInspector(browser, "empty", "No selection")).title).toBe("No selection");
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
		expect((await waitInspector(browser, "unbound", "Not bound")).title).toBe("queue");
		await select(browser, "Pane A", ["malformed"]);
		expect((await waitInspector(browser, "malformed", "Binding unavailable")).title).toBe(
			"malformed",
		);
		await select(browser, "Pane A", ["unbound", "bound-local"]);
		expect((await waitInspector(browser, "multiple", "2 elements selected")).title).toBe(
			"2 elements",
		);
		await select(browser, "Pane A", ["not-in-scene"]);
		expect((await waitInspector(browser, "missing", "Selection disappeared")).title).toBe(
			"Selection disappeared",
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
			const contract = await readInspectorContract(browser);
			expect(contract.sections).toEqual([
				"Architecture path",
				"Code binding",
				"Element",
				"Archboard metadata",
			]);
			const types = [
				contract.titleType,
				contract.statusType,
				contract.kickerType,
				contract.sectionType,
				contract.labelType,
				contract.humanType,
				contract.technicalType,
				contract.copyType,
				contract.controlType,
			];
			expect(types.map(({ size, lineHeight }) => `${size}/${lineHeight}`).join(" ")).toBe(
				"14/20 12/16 9/12 12/16 12/16 12/16 10/14 12/16 12/16",
			);
			expect(
				types
					.filter((_, typeIndex) => ![2, 6].includes(typeIndex))
					.every((type) => type.family.includes("inter")),
			).toBe(true);
			expect(contract.kickerType.family).toContain("ui-monospace");
			expect(contract.technicalType.family).toContain("ui-monospace");
			expect(contract.kickerContrast).toBeGreaterThanOrEqual(4.5);
			expect(contract.labelContrast).toBeGreaterThanOrEqual(4.5);
			expect(contract.openHeight).toBeGreaterThanOrEqual(44);
			expect(contract.focusHeight).toBeGreaterThanOrEqual(44);
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
		const recoveryOverlapsInspector = await browser.eval<boolean>(`(() => {
			const notice = document.querySelector('.notice-shell');
			const inspector = document.querySelector('.selection-inspector');
			const noticeRect = notice.getBoundingClientRect();
			const inspectorRect = inspector.getBoundingClientRect();
			return noticeRect.left < inspectorRect.right && noticeRect.right > inspectorRect.left &&
				noticeRect.top < inspectorRect.bottom && noticeRect.bottom > inspectorRect.top;
		})()`);
		expect(recoveryOverlapsInspector).toBe(false);
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

		const desktop = await browser.eval<{
			viewport: [number, number];
			visible: boolean;
			bodyVisible: boolean;
			insideViewport: boolean;
		}>(`(() => {
			const inspector = document.querySelector('.selection-inspector');
			const panel = inspector.getBoundingClientRect();
			return {
				viewport: [innerWidth, innerHeight],
				visible: getComputedStyle(inspector).display === 'flex',
				bodyVisible: getComputedStyle(inspector.querySelector('.selection-inspector-body')).display !== 'none',
				insideViewport: panel.left >= 0 && panel.right <= innerWidth && panel.top >= 0 && panel.bottom <= innerHeight
			};
		})()`);
		expect(desktop).toEqual({
			viewport: [1440, 900],
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
