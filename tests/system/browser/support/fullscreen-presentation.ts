import { expect } from "bun:test";

import type { PaneReport, PanesReport, Rect } from "../../../../src/runtime/engine/panes.ts";
import { PANE_SETTLE_CAP_MS } from "../../../../src/shared/timing/timing.ts";
import type { createJsonRequester } from "../../boards/support/http.ts";
import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";

type PanesBody = PanesReport & { success: boolean };
type Request = ReturnType<typeof createJsonRequester>;
type PaneIdentity = Pick<PaneReport, "paneId" | "clientId" | "board" | "selection">;

export function paneIdentities(report: PanesBody): PaneIdentity[] {
	return report.panes
		.map(({ paneId, clientId, board, selection }) => ({ paneId, clientId, board, selection }))
		.toSorted((left, right) => left.paneId.localeCompare(right.paneId));
}

export function paneRects(report: PanesBody): Array<{ paneId: string; rect: Rect }> {
	return report.panes
		.map(({ paneId, rect }) => ({ paneId, rect }))
		.toSorted((left, right) => left.paneId.localeCompare(right.paneId));
}

export async function seedBoard(request: Request, board: string, elementId: string): Promise<void> {
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

export async function waitForPanes(
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

export async function paneAppAction(
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

export async function readPageView(browser: AgentBrowserSession) {
	return browser.eval<{
		fullscreen: boolean;
		chromeHidden: boolean;
		controlDisplays: string[];
		dockVisible: boolean;
		dockFocused: boolean;
		sameNodes: boolean;
		panes: Array<{ label: string; hidden: boolean; inert: boolean; rect: Rect }>;
	}>(`(() => {
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

export async function readExitButton(browser: AgentBrowserSession) {
	return browser.eval<{ display: string; height: number; text: string | null }>(`(() => {
		const button = document.querySelector('.presentation-exit');
		const rect = button.getBoundingClientRect();
		return {
			display: getComputedStyle(button).display,
			height: rect.height,
			text: button.textContent?.trim() ?? null,
		};
	})()`);
}
