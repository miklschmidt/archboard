import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
import type { NavigatorContract, NavigatorPreviewView } from "./support/shell-contract-types.ts";
import { createBoard, addBox } from "./support/navigator-fixture.ts";
import {
	serverPath,
	type ChangesBody,
	type ElementsBody,
	type HealthBody,
	type PanesBody,
} from "./support/navigator-support.ts";
import {
	BOARD_NAME_EXPRESSION,
	NAVIGATOR,
	PANE_TABS,
	clickNavigatorRow,
	navigatorRow,
	stageIsFullscreen,
	switchTheme,
} from "./support/shell-dom.ts";

/** WCAG 2.5.8 target size floor. */
const MIN_TARGET = 24;
/** The navigator's listing line: loading, empty, or the failure. */
const LISTING_LINE = `[...document.querySelectorAll('${NAVIGATOR} p')].map(node => node.textContent.trim())`;
/** The persisted board groups: menu items whose button names a board. */
const GROUP_NAMES = `[...document.querySelectorAll('${NAVIGATOR} [data-sidebar="menu-item"] > button')].map(node => node.textContent.trim())`;
/** The collapsible trigger of one board group, by the board it names. */
const groupButton = (board: string): string =>
	`[...document.querySelectorAll('${NAVIGATOR} [data-sidebar="menu-item"] > button')].find(node => node.textContent.trim() === ${JSON.stringify(board)})`;

test("the navigator keeps empty, loading, retry, and scratch naming states actionable", async () => {
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
		`{ const nativeFetch = window.fetch.bind(window); let released = false; const pending = []; window.fetch = (input, init) => { const requestUrl = typeof input === 'string' ? input : input.url; const url = new URL(requestUrl, location.href); if (!released && url.pathname === '/api/boards') return new Promise((resolve, reject) => { pending.push(() => nativeFetch(input, init).then(resolve, reject)); window.__releaseBoardListing = () => { released = true; delete window.__releaseBoardListing; for (const start of pending.splice(0)) start(); return true; }; }); return nativeFetch(input, init); }; }`,
	);
	await browser.run(["--init-script", initScript, "open", canvas.base]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(state) => state.paneCount === 1,
		"the empty-vault pane to register",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await pollUntil(
		() => browser.eval<string[]>(LISTING_LINE),
		(lines) => lines.includes("Reading the vault…"),
		"the delayed real board listing to expose its loading state",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(await browser.eval<boolean>("window.__releaseBoardListing?.() ?? false")).toBe(true);
	await pollUntil(
		() => browser.eval<string[]>(LISTING_LINE),
		(lines) => lines.includes("No named boards yet."),
		"the real empty named-board state",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	const empty = await pollUntil(
		() =>
			browser.eval<{
				actionLabels: string[];
				targets: Array<{ height: number; width: number }>;
				currentScratch: boolean;
				pageFits: boolean;
			}>(`(() => {
				const nav = document.querySelector('${NAVIGATOR}');
				const actions = [...nav.querySelectorAll('button')].filter(node =>
					['Refresh boards', 'New board', 'Needs a name'].includes((node.getAttribute('aria-label') ?? node.textContent).trim()));
				const rows = [...nav.querySelectorAll('[data-board-key]')];
				return {
					actionLabels: actions.map(node => (node.getAttribute('aria-label') ?? node.textContent).trim()),
					targets: [...actions, ...rows].map(node => { const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height }; }),
					currentScratch: rows.some(row => row.getAttribute('aria-current') === 'true'),
					pageFits: document.documentElement.scrollWidth === innerWidth,
				};
			})()`),
		(state) => state.targets.length === 4,
		"the empty navigation controls to settle",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(empty.actionLabels).toEqual(["Refresh boards", "Needs a name", "New board"]);
	expect(
		empty.targets.every(({ width, height }) => width >= MIN_TARGET && height >= MIN_TARGET),
	).toBe(true);
	expect(empty.currentScratch).toBe(true);
	expect(empty.pageFits).toBe(true);
	await browser.run(["find", "role", "button", "click", "--name", "Needs a name", "--exact"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`[...document.querySelectorAll('[role="dialog"] [data-slot="dialog-title"]')].some(node => node.textContent.trim() === 'Save as')`,
			),
		Boolean,
		"contextual scratch naming to open",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await browser.run(["press", "Escape"]);
	await pollUntil(
		() => browser.eval<boolean>("document.querySelector('[role=\"dialog\"]') === null"),
		Boolean,
		"the naming dialog to close",
	);
	expect(
		await browser.eval<boolean>(
			`(() => { if (window.__archboardNativeFetch) return false; window.__archboardNativeFetch = window.fetch; window.fetch = async (input, init) => { const requestUrl = typeof input === 'string' ? input : input.url; const url = new URL(requestUrl, location.href); if (url.pathname === '/api/boards') return new Response(JSON.stringify({ success: false, error: 'forced board-list failure' }), { status: 503, headers: { 'Content-Type': 'application/json' } }); return window.__archboardNativeFetch(input, init); }; document.querySelector('${NAVIGATOR} [aria-label="Refresh boards"]')?.click(); return true; })()`,
		),
	).toBe(true);
	const retry = await pollUntil(
		() =>
			browser.eval<{ height: number; text: string | null; live: string | null }>(
				`(() => { const line = [...document.querySelectorAll('${NAVIGATOR} p')].find(node => /could not be read/.test(node.textContent)); const refresh = document.querySelector('${NAVIGATOR} [aria-label="Refresh boards"]'); return { text: line?.textContent.trim() ?? null, live: line?.getAttribute('aria-live') ?? null, height: refresh?.getBoundingClientRect().height ?? 0 }; })()`,
			),
		(state) => state.text !== null,
		"the board-list failure state",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(retry.text).toContain("The board listing could not be read");
	expect(retry.live).toBe("polite");
	expect(retry.height).toBeGreaterThanOrEqual(MIN_TARGET);
	expect(
		await browser.eval<boolean>(
			`(() => { if (!window.__archboardNativeFetch) return false; window.fetch = window.__archboardNativeFetch; delete window.__archboardNativeFetch; document.querySelector('${NAVIGATOR} [aria-label="Refresh boards"]')?.click(); return true; })()`,
		),
	).toBe(true);
	await pollUntil(
		() => browser.eval<string[]>(LISTING_LINE),
		(lines) =>
			lines.includes("No named boards yet.") && !lines.some((line) => /could not/.test(line)),
		"the empty list to recover after retry",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
}, 20_000);

test("the navigator keeps every real board reachable and replaces the focused pane", async () => {
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
	for (const board of [
		"alpha",
		"beta",
		"gamma-production-event-processing-architecture",
		"secondary",
	]) {
		await createBoard(request, board);
	}
	await addBox(request, primary, "pbox", "Primary service");
	await addBox(request, option, "obox", "Option A");
	await addBox(request, "beta", "bbox", "Beta service");
	await addBox(request, "gamma-production-event-processing-architecture", "gbox", "Gamma service");
	await canvas.restart();
	await createBoard(request, "draft-probe", { save: false });
	const browser = resources.use(await createAgentBrowser());
	const initScript = join(ownerRoot, "preview-probe.js");
	writeFileSync(
		initScript,
		`{ window.__previewProbe = { requests: [], failBoard: 'beta' }; const nativeFetch = window.fetch.bind(window); window.fetch = async (input, init) => { const requestUrl = typeof input === 'string' ? input : input.url; const url = new URL(requestUrl, location.href); if (url.pathname !== '/api/boards/preview') return nativeFetch(input, init); const board = url.searchParams.get('board'); window.__previewProbe.requests.push({ board, method: (init?.method || 'GET').toUpperCase() }); if (window.__previewProbe.failBoard === board) return new Response('{}', { status: 503 }); return nativeFetch(input, init); }; }`,
	);
	await browser.run(["--init-script", initScript, "open", canvas.base]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(state) => state.paneCount === 1,
		"the navigator pane to register",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await pollUntil(
		() => browser.eval<string[]>(GROUP_NAMES),
		(names) => names.length === 6,
		"all real named boards to enter the navigator",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);

	const desktop = await browser.eval<NavigatorContract>(
		`(() => { const nav = document.querySelector('${NAVIGATOR}'); const rows = [...nav.querySelectorAll('[data-board-key]')]; const primaryRows = rows.filter(row => row.getAttribute('data-board-key').startsWith('primary')); const targets = [...nav.querySelectorAll('button')].filter(node => node.getBoundingClientRect().height > 0); const humanCopy = [...nav.querySelectorAll('[data-sidebar="menu-item"] > button > span, [data-board-key] > span > span:first-child')]; const technicalCopy = [...nav.querySelectorAll('[data-board-key] .font-mono')]; return { boardCount: ${GROUP_NAMES}.length, draftMarkers: [...(nav.querySelector('[data-board-key="draft-probe"]')?.querySelectorAll('span') ?? [])].map(node => node.textContent.trim()).filter(text => text === 'Draft'), humanFonts: humanCopy.map(node => { const style = getComputedStyle(node); return { family: style.fontFamily, size: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), transform: style.textTransform }; }), initials: nav.querySelectorAll('svg[aria-label], .board-glyph').length, navWidth: nav.getBoundingClientRect().width, primaryVariants: primaryRows.map(row => row.getAttribute('data-board-key')), targets: targets.map(node => { const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height }; }), technicalFonts: technicalCopy.map(node => getComputedStyle(node).fontFamily.toLowerCase()) }; })()`,
	);
	expect(desktop.boardCount).toBe(6);
	expect(desktop.navWidth).toBeGreaterThan(160);
	expect(
		await browser.eval<boolean>(`(() => {
			const group = [...document.querySelectorAll('${NAVIGATOR} [data-sidebar="menu-item"] > button')]
				.find(node => node.textContent.trim() === 'gamma-production-event-processing-architecture');
			const name = group?.querySelector('span');
			if (!name) return false;
			const rect = name.getBoundingClientRect();
			return rect.height > parseFloat(getComputedStyle(name).lineHeight) && name.scrollWidth <= name.clientWidth;
		})()`),
	).toBe(true);
	expect(desktop.primaryVariants).toEqual([primary, option]);
	// The note is the board: a board the vault lists is persisted, so the
	// open-but-unlisted "Draft" marker must not appear on it.
	expect(desktop.draftMarkers).toEqual([]);
	expect(desktop.initials).toBe(0);
	expect(desktop.humanFonts.length).toBeGreaterThan(6);
	expect(
		desktop.humanFonts.every(
			({ family, size, transform }) =>
				family.toLowerCase().includes("archboard onest") && size >= 12 && transform === "none",
		),
	).toBe(true);
	expect(desktop.humanFonts.every(({ lineHeight, size }) => lineHeight >= size * 1.18)).toBe(true);
	expect(desktop.technicalFonts.every((family) => family.includes("archboard dm mono"))).toBe(true);
	expect(
		desktop.targets.every(({ width, height }) => width >= MIN_TARGET && height >= MIN_TARGET),
	).toBe(true);
	const navigationOrder = () =>
		browser.eval<string[]>(
			`[...document.querySelectorAll('${NAVIGATOR} [data-sidebar="menu-item"] [data-board-key]')].map(row => row.getAttribute('data-board-key'))`,
		);
	const stableOrder = [
		"alpha",
		"beta",
		"draft-probe",
		"gamma-production-event-processing-architecture",
		primary,
		option,
		"secondary",
	];
	expect(await navigationOrder()).toEqual(stableOrder);
	expect(
		await browser.eval<boolean>(`(() => { ${groupButton("primary")}?.click(); return true; })()`),
	).toBe(true);
	await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
			const button = ${groupButton("primary")};
			const row = document.querySelector(${JSON.stringify(navigatorRow(option))});
			return button?.getAttribute('aria-expanded') === 'false' && (!row || row.checkVisibility() === false);
		})()`),
		Boolean,
		"the primary group to collapse its variants",
	);
	expect(
		await browser.eval<boolean>(`(() => { ${groupButton("primary")}?.click(); return true; })()`),
	).toBe(true);
	await pollUntil(
		() => navigationOrder(),
		(order) => JSON.stringify(order) === JSON.stringify(stableOrder),
		"the primary group to expand again",
	);

	expect(await clickNavigatorRow(browser, primary)).toBe(true);
	await pollUntil(
		() => browser.eval<string | null>(BOARD_NAME_EXPRESSION),
		(name) => name === primary,
		"the primary board to open",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	// The listing refetches once the pane reports its new board; until then the
	// abandoned scratch board is still listed as open.
	await pollUntil(
		() => navigationOrder(),
		(order) => JSON.stringify(order) === JSON.stringify(stableOrder),
		"the listing to drop the abandoned scratch board",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	const readPreview = (key: string) =>
		browser.eval<NavigatorPreviewView>(
			`(() => { const row = document.querySelector(${JSON.stringify(navigatorRow(key))}); if (!row) return {}; const img = row.querySelector('img'); const box = [...row.querySelectorAll('span')].map(node => node.textContent.trim()).find(text => /^(Empty board|Rendering preview|No preview yet)/.test(text)); const style = img ? getComputedStyle(img) : null; return { board: ${JSON.stringify(key)}, state: img ? 'ready' : box?.startsWith('Empty board') ? 'empty' : box?.startsWith('No preview') ? 'unavailable' : 'loading', src: img?.src, cardWidth: (img ?? row).getBoundingClientRect().width, flat: !style || (style.boxShadow === 'none' && style.backgroundImage === 'none'), frameHeight: img?.getBoundingClientRect().height ?? 0, focusables: row.querySelectorAll('button, a, input, [tabindex]').length, rawSvg: row.querySelectorAll('svg').length }; })()`,
		);
	const mountedPreview = await pollUntil(
		() => readPreview(primary),
		(view) => view.state === "ready",
		"the mounted primary scene to render as a preview",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(mountedPreview.src).toMatch(/^blob:/);
	expect(mountedPreview.cardWidth).toBeGreaterThan(120);
	expect(mountedPreview.frameHeight).toBeGreaterThan(40);
	expect(mountedPreview.flat).toBe(true);
	expect(mountedPreview.focusables).toBe(0);
	expect(mountedPreview.rawSvg).toBe(0);
	const before = {
		panes: await request<PanesBody>("/api/panes").then((response) => response.body),
		health: await request<HealthBody>("/health").then((response) => response.body),
		elements: await request<ElementsBody>(`/api/elements?board=${primary}`).then(
			(response) => response.body.elements,
		),
		cursor: await request<ChangesBody>(`/api/changes?board=${primary}&since=0&settle=0`).then(
			(response) => response.body.cursor,
		),
	};
	const vaultPreview = await pollUntil(
		() => readPreview(option),
		(view) => view.state === "ready",
		"the cold option scene to render from the server's snapshot",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(vaultPreview.src).toMatch(/^blob:/);
	expect((await readPreview("alpha")).state).toBe("empty");
	expect((await readPreview("beta")).state).toBe("unavailable");
	const after = {
		panes: await request<PanesBody>("/api/panes").then((response) => response.body),
		health: await request<HealthBody>("/health").then((response) => response.body),
		elements: await request<ElementsBody>(`/api/elements?board=${primary}`).then(
			(response) => response.body.elements,
		),
		cursor: await request<ChangesBody>(`/api/changes?board=${primary}&since=0&settle=0`).then(
			(response) => response.body.cursor,
		),
	};
	expect(after.panes.focused).toBe(before.panes.focused);
	expect(after.panes.panes.map((pane) => pane.board)).toEqual(
		before.panes.panes.map((pane) => pane.board),
	);
	expect(after.panes.panes.map((pane) => pane.board)).not.toContain(option);
	expect(after.health.websocket_clients).toBe(before.health.websocket_clients);
	expect(after.elements).toEqual(before.elements);
	expect(after.cursor).toBe(before.cursor);

	await browser.eval<boolean>("(window.__previewProbe.failBoard = null, true)");
	await browser.run(["click", `${NAVIGATOR} [aria-label="Refresh boards"]`]);
	await pollUntil(
		() => readPreview("beta"),
		(view) => view.state === "ready",
		"the failed preview to recover on the next refresh",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(
		await browser.eval<Array<{ board: string; method: string }>>("window.__previewProbe.requests"),
	).toSatisfy(
		(requests) =>
			requests.length >= 5 &&
			requests.every(({ method }) => method === "GET") &&
			requests.filter(({ board }) => board === "beta").length >= 2,
	);
	const optionLight = vaultPreview.src;
	await switchTheme(browser, "dark");
	const optionDark = await pollUntil(
		() => readPreview(option),
		(view) => view.state === "ready" && view.src !== optionLight,
		"the dark theme to render a separately keyed SVG",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(optionDark.src).toMatch(/^blob:/);
	const beforeInvalidation = await readPreview(primary);
	await addBox(request, primary, "newbox", "Updated primary");
	await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(report) => report.panes.some((pane) => pane.board === primary && pane.elementCount === 4),
		"the mounted pane to receive the new canonical scene",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await pollUntil(
		() => readPreview(primary),
		(view) => view.state === "ready" && view.src !== beforeInvalidation.src,
		"the real mounted-scene fingerprint to invalidate the cached SVG",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(await navigationOrder()).toEqual(stableOrder);

	await browser.run(["click", 'button[aria-label="Add pane"]']);
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
			const tabs = [...document.querySelectorAll('${PANE_TABS}')];
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
	expect(await clickNavigatorRow(browser, option)).toBe(true);
	const replaced = await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(state) =>
			state.focused === rightPaneId &&
			state.panes.find((pane) => pane.paneId === rightPaneId)?.board === option,
		"the selected variant to replace only the focused pane",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(replaced.panes.find((pane) => pane.paneId !== rightPaneId)?.board).toBe(primary);
	expect(await navigationOrder()).toEqual(stableOrder);

	await browser.run(["click", `button[aria-label="Present pane B fullscreen"]`]);
	await pollUntil(
		async () =>
			(await stageIsFullscreen(browser)) &&
			(await browser.eval<boolean>(
				`!document.fullscreenElement.contains(document.querySelector('${NAVIGATOR}'))`,
			)),
		Boolean,
		"fullscreen to leave the navigator outside the presented stage",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await browser.run(["find", "role", "button", "click", "--name", "Exit presentation", "--exact"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.fullscreenElement === null &&
			Math.abs(document.querySelector('${NAVIGATOR}').getBoundingClientRect().width - ${desktop.navWidth}) < 0.6`),
		Boolean,
		"the exact desktop navigator to return after fullscreen",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
}, 20_000);
