import { expect } from "bun:test";

import type { PaneReport, PanesReport, Rect } from "../../../../src/runtime/engine/panes.ts";
import { PANE_SETTLE_CAP_MS } from "../../../../src/shared/timing/timing.ts";
import type { createJsonRequester } from "../../boards/support/http.ts";
import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";
import { PANE_SECTIONS, PRESENTATION_BAR, SHELL_NOTICES, STAGE_ROOT } from "./shell-dom.ts";

type PanesBody = PanesReport & { success: boolean };
/** A board read with its held state, as the owners compare it across a presentation. */
interface BoardBody {
	elements?: Array<{ id: string }>;
	file?: string;
	held?: { board: string; fromScreen: boolean; writes: number };
}
type Request = ReturnType<typeof createJsonRequester>;
/** A pane's identity: who it is, what it holds and what is selected, without report clocks. */
type PaneIdentity = Pick<PaneReport, "paneId" | "clientId" | "board"> & {
	selectedIds: readonly string[];
};

function paneIdentities(report: PanesBody): PaneIdentity[] {
	return report.panes
		.map(({ paneId, clientId, board, selection }) => ({
			paneId,
			clientId,
			board,
			selectedIds: selection.elementIds,
		}))
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
		const pane = [...document.querySelectorAll('${PANE_SECTIONS}')]
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

/** What the page shows about the presentation. */
interface PageView {
	fullscreen: boolean;
	/** The stage fills the viewport and the header, navigator and pane bar sit outside it. */
	chromeHidden: boolean;
	/** The presentation bar's height. */
	barHeight: number;
	/** The presented pane's Excalidraw chrome, as `class:display`; every display is `none`. */
	controlDisplays: string[];
	barVisible: boolean;
	/** Keyboard focus sits inside the presented stage. */
	focusInside: boolean;
	sameNodes: boolean;
	panes: Array<{ label: string; hidden: boolean; rect: Rect }>;
}

async function readPageView(browser: AgentBrowserSession): Promise<PageView> {
	return browser.eval<PageView>(`(() => {
		const stage = document.querySelector('${STAGE_ROOT}');
		const nodes = [...document.querySelectorAll('${PANE_SECTIONS}')];
		const rectOf = node => {
			const rect = node.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		};
		const chrome = ['header', '[data-slot="sidebar"]', '[data-slot="toggle-group"][aria-label="Pane"]'];
		const bar = document.querySelector('${PRESENTATION_BAR}');
		const presented = nodes.find(node => !node.hidden);
		const controls = [...(presented?.querySelectorAll(
			'.layer-ui__wrapper, .App-menu, .App-toolbar-container') ?? [])];
		const stageRect = stage ? rectOf(stage) : null;
		return {
			fullscreen: document.fullscreenElement === stage,
			barHeight: bar?.getBoundingClientRect().height ?? 0,
			chromeHidden: document.fullscreenElement === stage && !!stageRect &&
				stageRect.x === 0 && stageRect.y === 0 && stageRect.width === innerWidth &&
				stageRect.height === innerHeight &&
				chrome.every(selector => {
					const node = document.querySelector(selector);
					return !!node && !stage.contains(node);
				}),
			controlDisplays: controls.map(node => node.className.split(' ')[0] + ':' + (node.checkVisibility() ? getComputedStyle(node).display : 'none')),
			barVisible: !!bar && bar.getBoundingClientRect().height > 0,
			focusInside: !!stage && stage.contains(document.activeElement),
			sameNodes: !!window.__task139PaneNodes &&
				nodes.every((node, index) => node === window.__task139PaneNodes[index]),
			panes: nodes.map(node => ({
				label: node.getAttribute('aria-label'),
				hidden: node.hidden === true,
				rect: rectOf(node),
			})),
		};
	})()`);
}

async function readExitButton(browser: AgentBrowserSession) {
	return browser.eval<{ visible: boolean; height: number; text: string | null }>(`(() => {
		const button = [...document.querySelectorAll('${PRESENTATION_BAR} button')]
			.find(node => node.textContent.trim() === 'Exit presentation');
		if (!button) return { visible: false, height: 0, text: null };
		const rect = button.getBoundingClientRect();
		return { visible: rect.width > 0 && rect.height > 0, height: rect.height,
			text: button.textContent?.trim() ?? null };
	})()`);
}

/** The presentation bar's own recovery message, or null. */
function readPresentationAlert(browser: AgentBrowserSession): Promise<string | null> {
	return browser.eval<string | null>(
		`document.querySelector('${PRESENTATION_BAR} [role="alert"]')?.textContent?.trim() ?? null`,
	);
}

/** The presented pane the bar names, or null outside a presentation. */
function readPresentedPane(browser: AgentBrowserSession): Promise<string | null> {
	return browser.eval<string | null>(
		`document.querySelector('${PRESENTATION_BAR}')?.getAttribute('data-presentation') ?? null`,
	);
}

const PERSISTENT_NOTICE_TEXT = "Persistent actionable notice survives presentation.";

function publishActionableNotice(browser: AgentBrowserSession): Promise<boolean> {
	return browser.eval<boolean>(`(() => {
		const stage = document.querySelector('[data-slot="excalidraw-stage"]');
		const key = stage && Object.keys(stage).find(candidate => candidate.startsWith('__reactFiber$'));
		let fiber = key ? stage[key] : null;
		for (let depth = 0; fiber && depth < 60; depth += 1, fiber = fiber.return) {
			const notify = fiber.memoizedProps?.options?.onCodeTargetNotice;
			if (typeof notify !== 'function') continue;
			notify({ message: ${JSON.stringify(PERSISTENT_NOTICE_TEXT)},
				actions: [{ kind: 'settings', label: 'Opener settings' }] });
			return true;
		}
		return false;
	})()`);
}

/** The persistent notice as the owner reads it: its words, first action, and visibility. */
function readShellNotice(browser: AgentBrowserSession) {
	return browser.eval<{ text: string | null; action: string | null; visible: boolean }>(`(() => {
		const notice = ${SHELL_NOTICES}.find(node =>
			node.querySelector('[data-slot="alert-description"]')?.textContent?.trim() === ${JSON.stringify(PERSISTENT_NOTICE_TEXT)});
		const rect = notice?.getBoundingClientRect();
		const shown = !!rect && rect.width > 0 && rect.height > 0 &&
			(document.fullscreenElement === null || document.fullscreenElement.contains(notice));
		return {
			text: notice?.querySelector('[data-slot="alert-description"]')?.textContent?.trim() ?? null,
			action: notice?.querySelector('[data-slot="alert-action"] button')?.textContent?.trim() ?? null,
			visible: shown,
		};
	})()`);
}

export {
	type BoardBody,
	paneIdentities,
	paneRects,
	seedBoard,
	waitForPanes,
	paneAppAction,
	readPageView,
	readExitButton,
	readPresentationAlert,
	readPresentedPane,
	PERSISTENT_NOTICE_TEXT,
	publishActionableNotice,
	readShellNotice,
};
