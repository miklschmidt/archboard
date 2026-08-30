import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PaneReport, PanesReport, Rect } from "../../../src/runtime/engine/panes.ts";
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

interface HeldBoard {
	board: string;
	fromScreen: boolean;
	writes: number;
}
interface BoardBody {
	elements?: Array<{ id: string }>;
	file?: string;
	held?: HeldBoard;
}
type PanesBody = PanesReport & { success: boolean };
type Request = ReturnType<typeof createJsonRequester>;
type PaneIdentity = Pick<PaneReport, "paneId" | "clientId" | "board" | "selection">;
interface PaneDom {
	label: string;
	hidden: boolean;
	inert: boolean;
	rect: Rect;
}
interface PageView {
	fullscreen: boolean;
	chromeHidden: boolean;
	controlDisplays: string[];
	dockVisible: boolean;
	dockFocused: boolean;
	sameNodes: boolean;
	panes: PaneDom[];
}

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");
const CURRENT = "current-board";
const PROPOSAL = "proposal";

function paneIdentities(report: PanesBody): PaneIdentity[] {
	return report.panes
		.map(({ paneId, clientId, board, selection }) => ({ paneId, clientId, board, selection }))
		.toSorted((left, right) => left.paneId.localeCompare(right.paneId));
}

function paneRects(report: PanesBody): Array<{ paneId: string; rect: Rect }> {
	return report.panes
		.map(({ paneId, rect }) => ({ paneId, rect }))
		.toSorted((left, right) => left.paneId.localeCompare(right.paneId));
}

async function seedBoard(request: Request, board: string, elementId: string): Promise<void> {
	expect(
		(await request("/api/boards/new", { method: "POST", body: { board, level: "service" } }))
			.status,
	).toBe(200);
	expect(
		(
			await request(`/api/elements/changes?board=${board}`, {
				method: "POST",
				body: {
					origin: "agent",
					upserts: [{ id: elementId, type: "rectangle", x: 80, y: 80, width: 160, height: 90 }],
				},
			})
		).status,
	).toBe(200);
	expect((await request("/api/boards/save", { method: "POST", body: { board } })).status).toBe(200);
}

async function waitForPanes(
	request: Request,
	accepts: (report: PanesBody) => boolean,
	description: string,
): Promise<PanesBody> {
	return pollUntil(
		async () => (await request<PanesBody>("/api/panes")).body,
		accepts,
		description,
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
}

async function paneAppAction(
	browser: AgentBrowserSession,
	label: string,
	elementId: string,
	action: "select" | "move",
): Promise<boolean> {
	return browser.eval<boolean>(`(() => {
		const pane = [...document.querySelectorAll('.pane')]
			.find(candidate => candidate.getAttribute('aria-label') === ${JSON.stringify(label)});
		const node = pane?.querySelector('.excalidraw');
		const key = node && Object.keys(node).find(candidate => candidate.startsWith('__reactFiber$'));
		let fiber = key ? node[key] : null;
		let app = null;
		for (let depth = 0; fiber && depth < 60; depth += 1) {
			if (fiber.stateNode?.scene?.getElementsIncludingDeleted) {
				app = fiber.stateNode;
				break;
			}
			fiber = fiber.return;
		}
		if (!app) return false;
		if (${JSON.stringify(action)} === 'select') {
			app.updateScene({ appState: { selectedElementIds: { ${JSON.stringify(elementId)}: true } } });
		} else {
			const elements = app.scene.getElementsIncludingDeleted().map(element =>
				element.id === ${JSON.stringify(elementId)} ? { ...element, x: element.x + 7 } : element);
			app.updateScene({ elements, captureUpdate: 'IMMEDIATELY' });
		}
		return true;
	})()`);
}

async function readPageView(browser: AgentBrowserSession): Promise<PageView> {
	return browser.eval<PageView>(`(() => {
		const shell = document.querySelector('.shell');
		const nodes = [...document.querySelectorAll('.pane')];
		const rectOf = node => {
			const rect = node.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		};
		const hiddenChrome = ['.bar', '.board-nav', '.agent-rail', '.statusbar', '.pane-bar'];
		const controls = [...document.querySelectorAll(
			'.presentation-current .layer-ui__wrapper, ' +
			'.presentation-current .App-menu, ' +
			'.presentation-current .App-toolbar-container'
		)];
		return {
			fullscreen: document.fullscreenElement === shell,
			chromeHidden: hiddenChrome.every(selector => {
				const node = document.querySelector(selector);
				return !!node && getComputedStyle(node).display === 'none';
			}),
			controlDisplays: controls.map(node => getComputedStyle(node).display),
			dockVisible: getComputedStyle(document.querySelector('.presentation-dock')).display !== 'none',
			dockFocused: document.activeElement === document.querySelector('.presentation-dock'),
			sameNodes: !!window.__task139PaneNodes &&
				nodes.every((node, index) => node === window.__task139PaneNodes[index]),
			panes: nodes.map(node => ({
				label: node.getAttribute('aria-label'),
				hidden: node.getAttribute('aria-hidden') === 'true',
				inert: node.inert === true,
				rect: rectOf(node),
			})),
		};
	})()`);
}

test(
	"fullscreen presents one live canvas and restores its exact session",
	async () => {
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
		const request = createJsonRequester(canvas);

		await seedBoard(request, CURRENT, "current");
		await seedBoard(request, PROPOSAL, "propose");
		await browser.run(["open", canvas.base]);
		await browser.run(["set", "viewport", "1440", "900"]);
		const first = await waitForPanes(
			request,
			(report) => report.paneCount === 1 && typeof report.panes[0]?.clientId === "string",
			"the first pane to register",
		);
		expect(
			(
				await request("/api/boards/open", {
					method: "POST",
					body: { board: CURRENT, pane: first.panes[0]!.clientId, reload: true },
				})
			).status,
		).toBe(200);
		expect((await request("/api/panes/open", { method: "POST", body: {} })).status).toBe(200);
		const split = await waitForPanes(
			request,
			(report) => report.paneCount === 2,
			"two panes to register",
		);
		const second = split.panes.find((pane) => pane.board !== CURRENT) ?? split.panes[1]!;
		expect(
			(
				await request("/api/boards/open", {
					method: "POST",
					body: { board: PROPOSAL, pane: second.clientId, reload: true },
				})
			).status,
		).toBe(200);
		const boardsReady = await waitForPanes(
			request,
			(report) =>
				report.panes
					.map((pane) => pane.board)
					.toSorted()
					.join(",") === [CURRENT, PROPOSAL].toSorted().join(","),
			"both boards to be visible",
		);
		const currentPane = boardsReady.panes.find((pane) => pane.board === CURRENT)!;
		await browser.run(["click", `.pane[aria-label="Pane A"] .excalidraw`]);
		expect(await paneAppAction(browser, "Pane A", "current", "select")).toBe(true);
		await waitForPanes(
			request,
			(report) =>
				report.panes.find((pane) => pane.clientId === currentPane.clientId)?.selection
					.elementIds[0] === "current",
			"the browser selection to be reported",
		);

		const info = await request<BoardBody>(`/api/boards/info?board=${CURRENT}`);
		writeFileSync(info.body.file!, readFileSync(info.body.file!, "utf8") + "\n");
		await pollUntil(
			() =>
				browser.eval<string | null>(
					`document.querySelector('.chip-elsewhere')?.textContent ?? null`,
				),
			(text) => /note changed on disk/.test(text ?? ""),
			"the pane to notice the foreign note",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		expect(await paneAppAction(browser, "Pane A", "current", "move")).toBe(true);
		const heldBefore = await pollUntil(
			async () => (await request<BoardBody>(`/api/elements?board=${CURRENT}`)).body.held,
			(held) => held?.board === CURRENT && held.fromScreen,
			"the actual browser edit to create a held board",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);

		const before = await waitForPanes(
			request,
			(report) => report.paneCount === 2 && report.focused === currentPane.paneId,
			"the focused pane and held selection to settle",
		);
		const beforeRects = paneRects(before);
		const beforeIdentities = paneIdentities(before);
		const beforeDomRects = await browser.eval<Rect[]>(`(() => {
		window.__task139PaneNodes = [...document.querySelectorAll('.pane')];
		window.__task139PaneRects = window.__task139PaneNodes.map(node => {
			const rect = node.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		});
		return window.__task139PaneRects;
	})()`);

		await browser.run(["click", 'button[aria-label="Present Pane A fullscreen"]']);
		const entered = await pollUntil(
			() => readPageView(browser),
			(view) => view.fullscreen && view.dockVisible && view.chromeHidden,
			"Pane A to own the fullscreen display",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		expect(entered.controlDisplays.length).toBeGreaterThan(0);
		expect(entered.controlDisplays).toEqual(entered.controlDisplays.map(() => "none"));
		expect(entered.dockFocused).toBe(true);
		expect(entered.sameNodes).toBe(true);
		expect(entered.panes.filter((pane) => pane.rect.width > 0)).toHaveLength(1);
		expect(entered.panes.find((pane) => pane.label === "Pane B")).toMatchObject({
			hidden: true,
			inert: true,
			rect: { x: 0, y: 0, width: 0, height: 0 },
		});

		await browser.run(["click", 'button[aria-label="Present Pane B"]']);
		const during = await waitForPanes(
			request,
			(report) =>
				report.paneCount === 2 &&
				report.focused === report.panes.find((pane) => pane.board === PROPOSAL)?.paneId &&
				report.panes.find((pane) => pane.board === CURRENT)?.rect.width === 0,
			"presentation to transfer to Pane B and update existing focus",
		);
		expect(paneIdentities(during)).toEqual(beforeIdentities);
		expect(during.panes.find((pane) => pane.board === PROPOSAL)?.rect).toEqual({
			x: 0,
			y: 0,
			width: 1440,
			height: 900,
		});
		expect((await request<BoardBody>(`/api/elements?board=${CURRENT}`)).body.held).toEqual(
			heldBefore,
		);

		expect(
			await browser.eval<boolean>(`(() => {
			window.__task139Exit = document.exitFullscreen.bind(document);
			document.exitFullscreen = () => Promise.reject(new Error('exit blocked for test'));
			return true;
		})()`),
		).toBe(true);
		await browser.run(["click", ".presentation-exit"]);
		const exitRefusal = await pollUntil(
			() =>
				browser.eval<{ alert: string | null; fullscreen: boolean; current: string | null }>(
					`(() => ({
					alert: document.querySelector('.presentation-dock [role="alert"]')?.textContent ?? null,
					fullscreen: document.fullscreenElement === document.querySelector('.shell'),
					current: document.querySelector('.presentation-current')?.getAttribute('aria-label') ?? null,
				}))()`,
				),
			(view) => /exit blocked for test/.test(view.alert ?? ""),
			"the refused exit to remain visible in the dock",
		);
		expect(exitRefusal).toMatchObject({ fullscreen: true, current: "Pane B" });
		await browser.eval<boolean>(
			`(() => { document.exitFullscreen = window.__task139Exit; return true; })()`,
		);
		expect(
			await browser.eval<{ display: string; height: number; text: string | null; width: number }>(
				`(() => {
				const button = document.querySelector('.presentation-exit');
				const rect = button.getBoundingClientRect();
				return {
					display: getComputedStyle(button).display,
					height: rect.height,
					text: button.textContent?.trim() ?? null,
					width: rect.width,
				};
			})()`,
			),
		).toMatchObject({ display: "flex", height: 44, text: "Exit" });
		await browser.run(["click", ".presentation-exit"]);
		const restored = await waitForPanes(
			request,
			(report) =>
				report.paneCount === 2 && JSON.stringify(paneRects(report)) === JSON.stringify(beforeRects),
			"the exact pane rectangles to return",
		);
		expect(restored.focused).toBe(
			restored.panes.find((pane) => pane.board === PROPOSAL)?.paneId ?? null,
		);
		expect(paneIdentities(restored)).toEqual(beforeIdentities);
		expect(
			await browser.eval<Rect[]>(`(() => {
			if (document.fullscreenElement || document.querySelector('.presentation-dock')) return [];
			const nodes = [...document.querySelectorAll('.pane')];
			if (!nodes.every((node, index) => node === window.__task139PaneNodes[index])) return [];
			return nodes.map(node => {
				const rect = node.getBoundingClientRect();
				return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
			});
		})()`),
		).toEqual(beforeDomRects);

		await browser.run(["click", 'button[aria-label="Present Pane B fullscreen"]']);
		await pollUntil(
			() =>
				browser.eval<boolean>("document.fullscreenElement === document.querySelector('.shell')"),
			Boolean,
			"presentation to re-enter",
		);
		await browser.run(["press", "Escape"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					"document.fullscreenElement === null && document.querySelector('.presentation-dock') === null",
				),
			Boolean,
			"real Escape to restore the shell",
		);
		expect(
			await browser.eval<boolean>(`(() => {
			const shell = document.querySelector('.shell');
			window.__task139Request = shell.requestFullscreen.bind(shell);
			shell.requestFullscreen = () => Promise.reject(new Error('entry blocked for test'));
			return true;
		})()`),
		).toBe(true);
		await browser.run(["click", 'button[aria-label="Present Pane B fullscreen"]']);
		const entryRefusal = await pollUntil(
			() =>
				browser.eval<{ alert: string | null; fullscreen: boolean }>(`(() => ({
				alert: document.querySelector('.notice-shell[role="alert"]')?.textContent ?? null,
				fullscreen: document.fullscreenElement !== null,
			}))()`),
			(view) => /entry blocked for test/.test(view.alert ?? ""),
			"the refused entry to stay visible in the normal shell",
		);
		expect(entryRefusal.fullscreen).toBe(false);
		await browser.eval<boolean>(`(() => {
		document.querySelector('.shell').requestFullscreen = window.__task139Request;
		return true;
	})()`);

		await browser.run(["click", 'button[aria-label="Present Pane B fullscreen"]']);
		await pollUntil(
			() =>
				browser.eval<boolean>("document.fullscreenElement === document.querySelector('.shell')"),
			Boolean,
			"presentation to enter before external close",
		);
		await browser.eval<boolean>(`(() => {
		window.__task139Exit = document.exitFullscreen.bind(document);
		document.exitFullscreen = () => Promise.reject(new Error('close exit blocked'));
		return true;
	})()`);
		expect(
			(await request("/api/panes/close", { method: "POST", body: { pane: "focused" } })).status,
		).toBe(200);
		const survivor = await pollUntil(
			() =>
				browser.eval<{ alert: string | null; current: string | null; panes: number }>(`(() => ({
				alert: document.querySelector('.presentation-dock [role="alert"]')?.textContent ?? null,
				current: document.querySelector('.presentation-current')?.getAttribute('aria-label') ?? null,
				panes: document.querySelectorAll('.pane').length,
			}))()`),
			(view) => view.panes === 1 && /close exit blocked/.test(view.alert ?? ""),
			"external close to transfer presentation before the refused exit",
		);
		expect(survivor.current).toBe("Pane A");
		const onePane = await waitForPanes(
			request,
			(report) => report.paneCount === 1 && report.focused === report.panes[0]?.paneId,
			"the survivor to remain registered and focused",
		);
		expect(onePane.panes[0]?.clientId).toBe(currentPane.clientId);
		expect((await request<BoardBody>(`/api/elements?board=${CURRENT}`)).body.held).toEqual(
			heldBefore,
		);
		await browser.eval<boolean>(
			`(() => { document.exitFullscreen = window.__task139Exit; return true; })()`,
		);
		expect(
			await browser.eval<{ display: string; height: number; text: string | null; width: number }>(
				`(() => {
				const button = document.querySelector('.presentation-exit');
				const rect = button.getBoundingClientRect();
				return {
					display: getComputedStyle(button).display,
					height: rect.height,
					text: button.textContent?.trim() ?? null,
					width: rect.width,
				};
			})()`,
			),
		).toMatchObject({ display: "flex", height: 44, text: "Exit" });
		await browser.run(["click", ".presentation-exit"]);
		await pollUntil(
			() =>
				browser.eval<{ alert: string | null; fullscreen: boolean; paneId: string | null }>(
					`(() => ({
					alert: document.querySelector('.presentation-dock [role="alert"]')?.textContent ?? null,
					fullscreen: document.fullscreenElement !== null,
					paneId: document.querySelector('.presentation-current')?.getAttribute('aria-label') ?? null,
				}))()`,
				),
			(view) => !view.fullscreen && view.paneId === null && view.alert === null,
			"the survivor to leave presentation",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
);
