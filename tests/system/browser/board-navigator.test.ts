import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PanesReport } from "../../../src/runtime/engine/panes.ts";
import { PANE_SETTLE_CAP_MS } from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import type { NavigatorContract } from "./support/shell-contract-types.ts";

type PanesBody = PanesReport & { success: boolean };
type Requester = ReturnType<typeof createJsonRequester>;
type BoardsBody = { open: Array<{ key: string }> };
type HealthBody = { websocket_clients: number };
type ElementsBody = { elements: unknown[] };
type ChangesBody = { cursor: number };
interface PreviewView {
	board?: string;
	cardWidth?: number;
	flat?: boolean;
	focusables?: number;
	frameHeight?: number;
	rawSvg?: number;
	source?: string;
	src?: string;
	state?: string;
}

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");

async function createBoard(
	request: Requester,
	board: string,
	options: { save?: boolean; variant?: string } = {},
): Promise<string> {
	const key = options.variant ? `${board}@${options.variant}` : board;
	expect(
		(
			await request("/api/boards/new", {
				method: "POST",
				body: { board, variant: options.variant, level: "service" },
			})
		).status,
	).toBe(200);
	if (options.save !== false) {
		expect(
			(await request("/api/boards/save", { method: "POST", body: { board: key } })).status,
		).toBe(200);
	}
	return key;
}

async function addBox(request: Requester, board: string, id: string, label: string): Promise<void> {
	expect(
		(
			await request(`/api/elements?board=${encodeURIComponent(board)}`, {
				method: "POST",
				body: {
					id,
					type: "rectangle",
					x: 40,
					y: 60,
					width: 240,
					height: 120,
					backgroundColor: "#dbe4ff",
					label: { text: label },
				},
			})
		).status,
	).toBe(200);
}

test("the operator strip keeps empty, loading, retry, and scratch naming states actionable", async () => {
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
	const initScript = join(ownerRoot, "delay-board-listing.js");
	writeFileSync(
		initScript,
		`{ const nativeFetch = window.fetch.bind(window); let delayed = false; window.fetch = (input, init) => { const requestUrl = typeof input === 'string' ? input : input.url; const url = new URL(requestUrl, location.href); if (!delayed && url.pathname === '/api/boards') { delayed = true; return new Promise((resolve, reject) => { setTimeout(() => nativeFetch(input, init).then(resolve, reject), 350); }); } return nativeFetch(input, init); }; }`,
	);

	await browser.run(["--init-script", initScript, "open", canvas.base]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
	await browser.run(["set", "viewport", "1440", "900"]);
	await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(state) => state.paneCount === 1,
		"the empty-vault pane to register",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	const loading = await pollUntil(
		() =>
			browser.eval<string | null>("document.querySelector('.board-nav-empty')?.textContent.trim()"),
		(text) => text === "Reading the vault…",
		"the delayed real board listing to expose its loading state",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(loading).toBe("Reading the vault…");
	await pollUntil(
		() =>
			browser.eval<string | null>("document.querySelector('.board-nav-empty')?.textContent.trim()"),
		(text) => text === "No named boards yet.",
		"the real empty named-board state",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);

	const empty = await browser.eval<{
		actionLabels: string[];
		targets: Array<{ height: number; width: number }>;
		currentScratch: boolean;
		pageFits: boolean;
	}>(
		`(() => { const targets = [...document.querySelectorAll('.board-nav-tools button, .scratch-top, .board-preview-control, .name-button')]; return { actionLabels: [...document.querySelectorAll('.board-nav-tools button')].map(button => button.getAttribute('aria-label')), targets: targets.map(node => { const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height }; }), currentScratch: Boolean(document.querySelector('.scratch-section .board-nav-row[aria-current="page"]')), pageFits: document.documentElement.scrollWidth === innerWidth }; })()`,
	);
	expect(empty.actionLabels).toEqual(["Refresh boards", "New board"]);
	expect(empty.targets).toHaveLength(5);
	expect(empty.targets.every(({ width, height }) => width >= 43.5 && height >= 43.5)).toBe(true);
	expect(empty.currentScratch).toBe(true);
	expect(empty.pageFits).toBe(true);

	await browser.run(["click", ".name-button"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				"Boolean(document.querySelector('dialog[aria-label=\"Save this board as\"]'))",
			),
		Boolean,
		"contextual scratch naming to open",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await browser.run(["click", '.modal-close[aria-label="Close dialog"]']);

	expect(
		await browser.eval<boolean>(
			`(() => { if (window.__archboardNativeFetch) return false; window.__archboardNativeFetch = window.fetch; window.fetch = async (input, init) => { const requestUrl = typeof input === 'string' ? input : input.url; const url = new URL(requestUrl, location.href); if (url.pathname === '/api/boards') return new Response(JSON.stringify({ success: false, error: 'forced board-list failure' }), { status: 503, headers: { 'Content-Type': 'application/json' } }); return window.__archboardNativeFetch(input, init); }; document.querySelector('.board-nav-tools [aria-label="Refresh boards"]')?.click(); return true; })()`,
		),
	).toBe(true);
	const retry = await pollUntil(
		() =>
			browser.eval<{ height?: number; label?: string; text?: string }>(
				`(() => { const button = document.querySelector('.board-nav-error'); if (!button) return {}; return { label: button.getAttribute('aria-label'), text: button.textContent.trim(), height: button.getBoundingClientRect().height }; })()`,
			),
		(state) => state.label === "Retry board listing",
		"the board-list retry state",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(retry.text).toBe("Could not read the vault. Try again.");
	expect(retry.height ?? 0).toBeGreaterThanOrEqual(43.5);
	expect(
		await browser.eval<boolean>(
			`(() => { const retry = document.querySelector('.board-nav-error'); if (!retry || !window.__archboardNativeFetch) return false; window.fetch = window.__archboardNativeFetch; delete window.__archboardNativeFetch; retry.click(); return true; })()`,
		),
	).toBe(true);
	await pollUntil(
		() =>
			browser.eval<boolean>(`!document.querySelector('.board-nav-error') &&
        document.querySelector('.board-nav-empty')?.textContent.trim() === 'No named boards yet.'`),
		Boolean,
		"the empty list to recover after retry",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
}, 20_000);

test("the strip keeps every real board reachable and replaces the focused pane", async () => {
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
	const request = createJsonRequester(canvas);
	const primary = await createBoard(request, "primary");
	const option = await createBoard(request, "primary", { variant: "option-a" });
	for (const board of ["alpha", "beta", "gamma", "secondary"]) await createBoard(request, board);
	await addBox(request, primary, "pbox", "Primary service");
	await addBox(request, option, "obox", "Option A");
	await addBox(request, "beta", "bbox", "Beta service");
	await addBox(request, "gamma", "gbox", "Gamma service");
	await canvas.restart();
	await createBoard(request, "draft-probe", { save: false });

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", canvas.base]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
	await browser.run(["set", "viewport", "1440", "900"]);
	await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(state) => state.paneCount === 1,
		"the navigator pane to register",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await pollUntil(
		() =>
			browser.eval<number>(
				"document.querySelectorAll('.board-group:not(.scratch-section)').length",
			),
		(count) => count === 6,
		"all real named boards to enter the strip",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);

	const desktop = await browser.eval<NavigatorContract>(
		`(() => { const nav = document.querySelector('.board-nav'); const primaryRows = [...document.querySelectorAll('.board-group[aria-label="primary"] .board-nav-row')]; const targets = [...document.querySelectorAll('.board-nav-tools button, .board-preview-control, .board-variants .board-nav-row, .scratch-top, .name-button')]; const humanCopy = [...document.querySelectorAll('.board-group-copy strong, .board-group-copy small, .board-nav-variant')]; const technicalCopy = [...document.querySelectorAll('.board-nav-markers > span')]; return { boardCount: document.querySelectorAll('.board-group:not(.scratch-section)').length, draftMarkers: [...document.querySelectorAll('.board-group[aria-label="draft-probe"] .board-nav-markers > span')].map(node => node.textContent.trim()), humanFonts: humanCopy.map(node => { const style = getComputedStyle(node); return { family: style.fontFamily, size: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), transform: style.textTransform }; }), initials: document.querySelectorAll('.board-glyph').length, navWidth: nav.getBoundingClientRect().width, primaryVariants: primaryRows.map(row => row.dataset.boardKey), targets: targets.map(node => { const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height }; }), technicalFonts: technicalCopy.map(node => getComputedStyle(node).fontFamily.toLowerCase()) }; })()`,
	);
	expect(desktop.boardCount).toBe(6);
	expect(desktop.navWidth).toBeCloseTo(184, 0);
	expect(desktop.primaryVariants).toEqual([primary, option]);
	expect(desktop.draftMarkers).toEqual(["open", "draft"]);
	expect(desktop.initials).toBe(0);
	expect(
		desktop.humanFonts.every(
			({ family, size, transform }) =>
				family.toLowerCase().includes("archboard onest") && size >= 12 && transform === "none",
		),
	).toBe(true);
	expect(desktop.humanFonts.every(({ lineHeight, size }) => lineHeight >= size * 1.18)).toBe(true);
	expect(desktop.technicalFonts.every((family) => family.includes("archboard dm mono"))).toBe(true);
	expect(desktop.targets.every(({ width, height }) => width >= 43.5 && height >= 43.5)).toBe(true);

	await browser.run(["click", `[data-board-key="${primary}"]`]);
	await pollUntil(
		() => browser.eval<string | null>("document.querySelector('.board-name')?.textContent.trim()"),
		(name) => name === primary,
		"the primary board to open",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	const readPreview = () =>
		browser.eval<PreviewView>(
			`(() => { const card = document.querySelector('.board-preview-card'); const frame = card?.querySelector('.board-preview-frame'); if (!card || !frame) return {}; const cardStyle = getComputedStyle(card); const frameStyle = getComputedStyle(frame); return { board: card.dataset.previewBoard, state: card.dataset.previewState, source: card.dataset.previewSource, src: card.querySelector('img')?.src, cardWidth: card.getBoundingClientRect().width, flat: cardStyle.boxShadow === 'none' && parseFloat(cardStyle.borderRadius) === 4 && frameStyle.backgroundImage === 'none' && frameStyle.animationName === 'none', frameHeight: frame.getBoundingClientRect().height, focusables: card.querySelectorAll('button, a, input, [tabindex]').length, rawSvg: card.querySelectorAll('svg').length }; })()`,
		);

	await browser.run(["hover", `[data-board-key="${primary}"]`]);
	const mountedPreview = await pollUntil(
		readPreview,
		(view) => view.board === primary && view.state === "ready" && view.source === "mounted",
		"pointer hover to render the mounted primary scene",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(mountedPreview.src).toMatch(/^blob:/);
	expect(mountedPreview.cardWidth).toBeCloseTo(308, 0);
	expect(mountedPreview.frameHeight).toBeCloseTo(176, 0);
	expect(mountedPreview.focusables).toBe(0);
	expect(mountedPreview.rawSvg).toBe(0);

	expect(
		await browser.eval<boolean>(
			`(() => { window.__previewProbe = { requests: [], failBoard: null, delayBoard: null }; window.__previewNativeFetch = window.fetch.bind(window); window.fetch = async (input, init) => { const requestUrl = typeof input === 'string' ? input : input.url; const url = new URL(requestUrl, location.href); if (url.pathname !== '/api/boards/preview') return window.__previewNativeFetch(input, init); const board = url.searchParams.get('board'); window.__previewProbe.requests.push({ board, method: (init?.method || 'GET').toUpperCase() }); if (window.__previewProbe.failBoard === board) return new Response('{}', { status: 503 }); if (window.__previewProbe.delayBoard === board) await new Promise(resolve => setTimeout(resolve, 350)); return window.__previewNativeFetch(input, init); }; return true; })()`,
		),
	).toBe(true);
	const before = {
		boards: (await request<BoardsBody>("/api/boards")).body.open
			.map((entry) => entry.key)
			.toSorted(),
		panes: await request<PanesBody>("/api/panes").then((response) => response.body),
		health: await request<HealthBody>("/health").then((response) => response.body),
		elements: await request<ElementsBody>(`/api/elements?board=${primary}`).then(
			(response) => response.body.elements,
		),
		cursor: await request<ChangesBody>(`/api/changes?board=${primary}&since=0&settle=0`).then(
			(response) => response.body.cursor,
		),
	};
	expect(
		await browser.eval<boolean>(
			`(() => { const row = document.querySelector('[data-board-key=${JSON.stringify(option)}]'); if (!row) return false; row.focus(); return document.activeElement === row; })()`,
		),
	).toBe(true);
	const vaultPreview = await pollUntil(
		readPreview,
		(view) => view.board === option && view.state === "ready" && view.source === "vault",
		"keyboard focus to render the cold option scene",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(vaultPreview.src).toMatch(/^blob:/);
	const after = {
		boards: (await request<BoardsBody>("/api/boards")).body.open
			.map((entry) => entry.key)
			.toSorted(),
		panes: await request<PanesBody>("/api/panes").then((response) => response.body),
		health: await request<HealthBody>("/health").then((response) => response.body),
		elements: await request<ElementsBody>(`/api/elements?board=${primary}`).then(
			(response) => response.body.elements,
		),
		cursor: await request<ChangesBody>(`/api/changes?board=${primary}&since=0&settle=0`).then(
			(response) => response.body.cursor,
		),
	};
	expect(after.boards).toEqual(before.boards);
	expect(after.boards).not.toContain(option);
	expect(after.panes.focused).toBe(before.panes.focused);
	expect(after.panes.panes.map((pane) => pane.board)).toEqual(
		before.panes.panes.map((pane) => pane.board),
	);
	expect(after.health.websocket_clients).toBe(before.health.websocket_clients);
	expect(after.elements).toEqual(before.elements);
	expect(after.cursor).toBe(before.cursor);

	expect(
		await browser.eval<boolean>(
			`(() => { const control = document.querySelector('.board-group[aria-label="alpha"] .board-preview-control'); if (!control) return false; control.click(); return control.getBoundingClientRect().width >= 43.5; })()`,
		),
	).toBe(true);
	await pollUntil(
		readPreview,
		(view) => view.board === "alpha" && view.state === "empty",
		"the 44px preview control to disclose an empty board",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);

	await browser.eval<boolean>(
		`(() => { window.__previewProbe.failBoard = 'beta'; document.querySelector('[data-board-key="beta"]')?.focus(); return true; })()`,
	);
	await pollUntil(
		readPreview,
		(view) => view.board === "beta" && view.state === "unavailable",
		"a failed preview to remain quiet and recoverable",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await browser.eval<boolean>(
		`(() => { window.__previewProbe.failBoard = null; const row = document.querySelector('[data-board-key="beta"]'); row?.blur(); row?.focus(); return true; })()`,
	);
	await pollUntil(
		readPreview,
		(view) => view.board === "beta" && view.state === "ready",
		"the failed preview to recover on the next disclosure",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);

	const optionLight = vaultPreview.src;
	await browser.eval<boolean>(
		`(() => { document.querySelector('[data-board-key=${JSON.stringify(option)}]')?.focus(); document.querySelector('[aria-label="Use dark theme"]')?.click(); return true; })()`,
	);
	const optionDark = await pollUntil(
		readPreview,
		(view) => view.board === option && view.state === "ready" && view.src !== optionLight,
		"the dark theme to render a separately keyed SVG",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(optionDark.src).toMatch(/^blob:/);

	await browser.eval<boolean>(
		`(() => { window.__previewProbe.delayBoard = 'gamma'; document.querySelector('[data-board-key="gamma"]')?.focus(); return true; })()`,
	);
	await pollUntil(
		readPreview,
		(view) => view.board === "gamma" && view.state === "loading" && view.flat === true,
		"the delayed preview request to begin",
	);
	await browser.eval<void>(
		`{
			document.querySelector('[data-board-key="secondary"]')?.focus();
			document.querySelector('.board-nav-list')?.dispatchEvent(new Event('scroll'));
			document.querySelector('[data-board-key=${JSON.stringify(option)}]')?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
		}`,
	);
	await pollUntil(
		readPreview,
		(view) => view.board === "secondary" && view.state === "empty",
		"a later disclosure to win over the delayed completion",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await Bun.sleep(400);
	expect((await readPreview()).board).not.toBe("gamma");
	await browser.eval<void>(
		`{
			const list = document.querySelector('.board-nav-list');
			if (!list) throw new Error('Board navigator list is missing');
			list.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
			list.dispatchEvent(new Event('scroll'));
		}`,
	);
	await pollUntil(readPreview, (view) => !view.board, "intentional list scroll dismissal");
	expect(
		await browser.eval<Array<{ board: string; method: string }>>("window.__previewProbe.requests"),
	).toSatisfy(
		(requests) => requests.length >= 5 && requests.every(({ method }) => method === "GET"),
	);

	await browser.eval<boolean>(
		`(() => { window.__previewProbe.delayBoard = null; document.querySelector('[data-board-key=${JSON.stringify(primary)}]')?.focus(); return true; })()`,
	);
	const beforeInvalidation = await pollUntil(
		readPreview,
		(view) => view.board === primary && view.state === "ready" && view.source === "mounted",
		"the mounted preview before invalidation",
	);
	await addBox(request, primary, "newbox", "Updated primary");
	await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(report) => report.panes.some((pane) => pane.board === primary && pane.elementCount === 4),
		"the mounted pane to receive the new canonical scene",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await browser.eval<boolean>(
		`(() => { const row = document.querySelector('[data-board-key=${JSON.stringify(primary)}]'); row?.blur(); row?.focus(); return true; })()`,
	);
	await pollUntil(
		readPreview,
		(view) =>
			view.board === primary && view.state === "ready" && view.src !== beforeInvalidation.src,
		"the real mounted-scene fingerprint to invalidate the cached SVG",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(
		await browser.eval<boolean>(`(() => {
      const split = document.querySelector('.bar-actions [aria-label="Split"]');
      if (!split) return false;
      split.click();
      return true;
    })()`),
	).toBe(true);
	const split = await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(state) => state.paneCount === 2,
		"the shell to expose two panes",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	const rightPaneId = split.panes.toSorted((a, b) => a.position - b.position)[1]?.paneId;
	expect(rightPaneId).toBeTruthy();
	expect(
		await browser.eval<boolean>(`(() => {
      const tabs = [...document.querySelectorAll('.pane-tab')];
      const right = tabs.at(-1);
      if (!right) return false;
      right.click();
      return true;
    })()`),
	).toBe(true);
	await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(state) => state.focused === rightPaneId,
		"the right pane to become focused",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(
		await browser.eval<boolean>(`(() => {
      const row = document.querySelector('[data-board-key=${JSON.stringify(option)}]');
      if (!row) return false;
      row.click();
      return true;
    })()`),
	).toBe(true);
	const replaced = await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(state) =>
			state.focused === rightPaneId &&
			state.panes.find((pane) => pane.paneId === rightPaneId)?.board === option,
		"the selected variant to replace only the focused pane",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(replaced.panes.find((pane) => pane.paneId !== rightPaneId)?.board).toBe(primary);

	await browser.run(["click", `button[aria-label="Present Pane B fullscreen"]`]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.fullscreenElement === document.querySelector('.shell') &&
			getComputedStyle(document.querySelector('.board-nav')).display === 'none' &&
			(!document.querySelector('.board-preview-card') || document.querySelector('.board-preview-card').getBoundingClientRect().width === 0)`),
		Boolean,
		"fullscreen to hide the navigator and any disclosed preview",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await browser.run(["click", ".presentation-exit"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.fullscreenElement === null &&
			Math.abs(document.querySelector('.board-nav').getBoundingClientRect().width - 184) < 0.6`),
		Boolean,
		"the exact desktop navigator to return after fullscreen",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
}, 20_000);
