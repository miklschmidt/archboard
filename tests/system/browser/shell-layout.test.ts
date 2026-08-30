import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PANE_SETTLE_CAP_MS } from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { activityLines, fixedPointElements } from "./fixtures/fixed-point-scene.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import {
	PERSISTENT_NOTICE_TEXT,
	publishActionableNotice,
} from "./support/fullscreen-presentation.ts";

type PanesBody = { paneCount?: number; panes?: Array<{ board?: string }> };
type Metrics = { family: string; size: number; lineHeight: number; weight: number };
type DesktopShell = {
	navLeftOfCanvas: boolean;
	navWidth: number;
	workbenchBelowPane: boolean;
	workbenchInsideCanvas: boolean;
	columnsAlign: boolean;
	canvasLargest: boolean;
};
type ThemeSnapshot = {
	theme: "light" | "dark";
	wordmark: string;
	brandIconCount: number;
	headerHeight: number;
	selection: string;
	status: string;
	background: string;
	inkContrast: number;
	flatSurfaces: boolean;
	shadowlessSurfaces: boolean;
	visibleFocus: boolean;
	boardIdentity: string;
	level: string;
	connectionState: string;
	persistenceState: string;
	paneIdentity: string;
	legacyVaultLineCount: number;
	boardLeftAligned: boolean;
	tokens: string[];
	wordmarkType: Metrics;
	titleType: Metrics;
	bodyType: Metrics;
	kickerType: Metrics;
	controlType: Metrics;
	paneType: Metrics;
	actionTargets: Array<{ width: number; height: number }>;
	paneTarget: { width: number; height: number };
	presentTarget: { width: number; height: number };
};
type PaneBarLayout = {
	height: number;
	tabCount: number;
	tabHeights: number[];
	focusedEdgeWidth: number;
	focusedEdgeColor: string;
	focusedDotColor: string;
	labels: string[];
};
type ActivityLayout = {
	lineCount: number;
	linesFit: boolean;
	panelFits: boolean;
	canvasClear: boolean;
	timestampsAlign: boolean;
};
type NoticeLayout = {
	parentIsPanes: boolean;
	insidePanes: boolean;
	overlapsInspector: boolean;
	width: number;
	copyType: Metrics;
	actionHeight: number;
	dismissHeight: number;
	flat: boolean;
	text: string;
};

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");

test("the desktop shell keeps its type, geometry, states, and touch targets at 1440x900", async () => {
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
	const api = createJsonRequester(canvas);

	await api("/api/boards/new", {
		method: "POST",
		body: { board: "fixedpoint", level: "service" },
	});
	await api("/api/elements/batch?board=fixedpoint", {
		method: "POST",
		body: { elements: fixedPointElements },
	});
	await api("/api/boards/save", { method: "POST", body: { board: "fixedpoint" } });

	await browser.run(["open", canvas.base]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
	await browser.run(["set", "viewport", "1440", "900"]);
	await pollUntil(
		() => api<PanesBody>("/api/panes").then((response) => response.body),
		(state) => (state.paneCount ?? 0) === 1,
		"the shell pane to register",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await api("/api/boards/open", {
		method: "POST",
		body: { board: "fixedpoint", reload: true },
	});
	await pollUntil(
		() => browser.eval<string | null>("document.querySelector('.board-name')?.textContent.trim()"),
		(board) => board === "fixedpoint",
		"fixedpoint to become the visible board",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);

	const readTheme = () =>
		browser.eval<ThemeSnapshot | null>(`(() => {
			const shell = document.querySelector('.shell');
			const bar = document.querySelector('.bar');
			const wordmark = document.querySelector('.wordmark');
			const open = document.querySelector('.bar-actions [aria-label="Open board"]');
			const board = document.querySelector('.board-name');
			const meta = document.querySelector('.bar-board-meta');
			const level = document.querySelector('.level-tag');
			const connection = document.querySelector('.status');
			const persistence = document.querySelector('.meta-vault, .chip-held, .chip-elsewhere');
			const pane = document.querySelector('.pane-tab.focused');
			const present = document.querySelector('.present-button');
			const actions = [...document.querySelectorAll('.bar-actions .btn')];
			if (!shell || !bar || !wordmark || !open || !board || !meta || !level ||
				!connection || !persistence || !pane || !present) return null;
			const metrics = node => {
				const value = getComputedStyle(node);
				return {
					family: value.fontFamily.toLowerCase(),
					size: parseFloat(value.fontSize),
					lineHeight: parseFloat(value.lineHeight),
					weight: parseFloat(value.fontWeight),
				};
			};
			const style = getComputedStyle(shell);
			const flat = [
				'.shell', '.bar', '.board-nav', '.board-group.active-group',
				'.board-nav-row-current', '.scratch-section', '.scratch-card',
				'.canvas-zone', '.pane-bar', '.agent-rail', '.claim-card',
				'.statusbar', '.btn-primary'
			].map(selector => document.querySelector(selector)).filter(Boolean);
			const rgb = value => (value.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
			const luminance = value => {
				const channels = rgb(value).map(channel => {
					const unit = channel / 255;
					return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
			};
			const foreground = luminance(getComputedStyle(wordmark).color);
			const backdrop = luminance(getComputedStyle(bar).backgroundColor);
			open.focus();
			const focus = getComputedStyle(open);
			const boardRect = board.getBoundingClientRect();
			const metaRect = meta.getBoundingClientRect();
			return {
				theme: shell.dataset.theme,
				wordmark: wordmark.textContent.trim(),
				brandIconCount: document.querySelectorAll('.bar-brand svg, .brand-mark').length,
				headerHeight: bar.getBoundingClientRect().height,
				selection: style.getPropertyValue('--selection').trim().toLowerCase(),
				status: style.getPropertyValue('--status').trim().toLowerCase(),
				background: getComputedStyle(shell).backgroundColor,
				inkContrast: (Math.max(foreground, backdrop) + 0.05) /
					(Math.min(foreground, backdrop) + 0.05),
				flatSurfaces: flat.every(node => getComputedStyle(node).backgroundImage === 'none'),
				shadowlessSurfaces: flat.every(node => getComputedStyle(node).boxShadow === 'none'),
				visibleFocus: focus.outlineStyle !== 'none' && parseFloat(focus.outlineWidth) >= 2,
				boardIdentity: board.textContent.trim(),
				level: level.textContent.trim(),
				connectionState: connection.textContent.trim(),
				persistenceState: persistence.textContent.trim(),
				paneIdentity: pane.textContent.trim(),
				legacyVaultLineCount: document.querySelectorAll('.vault-name').length,
				boardLeftAligned: Math.abs(boardRect.left - metaRect.left) < 0.5,
				tokens: [
					'--type-kicker', '--type-tech', '--type-body', '--type-control',
					'--type-title', '--type-primary'
				].map(name => style.getPropertyValue(name).trim()),
				wordmarkType: metrics(wordmark),
				titleType: metrics(board),
				bodyType: metrics(meta),
				kickerType: metrics(level),
				controlType: metrics(open),
				paneType: metrics(pane),
				actionTargets: actions.map(button => {
					const rect = button.getBoundingClientRect();
					return { width: rect.width, height: rect.height };
				}),
				paneTarget: (() => { const rect = pane.getBoundingClientRect(); return { width: rect.width, height: rect.height }; })(),
				presentTarget: (() => { const rect = present.getBoundingClientRect(); return { width: rect.width, height: rect.height }; })(),
			};
		})()`);

	const firstTheme = await readTheme();
	expect(firstTheme).not.toBeNull();
	const nextTheme = firstTheme?.theme === "light" ? "dark" : "light";
	expect(
		await browser.eval<boolean>(`(() => {
			const button = document.querySelector('.bar-actions [aria-label="Use ${nextTheme} theme"]');
			if (!button) return false;
			button.click();
			return true;
		})()`),
	).toBe(true);
	const themeTransition = await pollUntil(
		() =>
			browser.eval<
				Record<"theme" | "toggleLabel", string | null> &
					Record<"shellCount" | "rootChildCount", number>
			>(`(() => {
				const shells = [...document.querySelectorAll('.shell')];
				const toggle = document.querySelector('.bar-actions [aria-label^="Use "][aria-label$=" theme"]');
				return {
					theme: shells[0]?.getAttribute('data-theme') ?? null,
					toggleLabel: toggle?.getAttribute('aria-label') ?? null,
					shellCount: shells.length,
					rootChildCount: document.getElementById('root')?.childElementCount ?? 0,
				};
			})()`),
		(state) =>
			state.theme === nextTheme &&
			state.toggleLabel === `Use ${firstTheme?.theme ?? "light"} theme`,
		`${nextTheme} theme to become visible`,
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(themeTransition).toMatchObject({ shellCount: 1, rootChildCount: 1 });
	const secondTheme = await readTheme();
	const themes = [firstTheme, secondTheme].filter(
		(snapshot): snapshot is ThemeSnapshot => snapshot !== null,
	);
	expect(themes.map(({ theme }) => theme).toSorted()).toEqual(["dark", "light"]);
	for (const snapshot of themes) {
		expect(snapshot.wordmark).toBe("archboard");
		expect(snapshot.brandIconCount).toBe(0);
		expect(snapshot.headerHeight).toBeCloseTo(56, 0);
		expect(snapshot.selection).toBe("#155eef");
		expect(snapshot.status).toBe("#a3e635");
		expect(snapshot.inkContrast).toBeGreaterThanOrEqual(4.5);
		expect(snapshot.flatSurfaces).toBe(true);
		expect(snapshot.shadowlessSurfaces).toBe(true);
		expect(snapshot.visibleFocus).toBe(true);
		expect(snapshot.boardIdentity).toBe("fixedpoint");
		expect(snapshot.level.toLowerCase()).toBe("service");
		expect(snapshot.connectionState).toContain("Live board");
		expect(snapshot.persistenceState).toContain("In the vault");
		expect(snapshot.paneIdentity).toContain("fixedpoint");
		expect(snapshot.legacyVaultLineCount).toBe(0);
		expect(snapshot.boardLeftAligned).toBe(true);
		expect(snapshot.tokens).toEqual([
			"9px/12px",
			"10px/14px",
			"12px/16px",
			"13px/18px",
			"14px/20px",
			"16px/22px",
		]);
		expect(snapshot.wordmarkType).toMatchObject({ size: 18, lineHeight: 22, weight: 800 });
		expect(snapshot.titleType).toMatchObject({ size: 14, lineHeight: 20, weight: 600 });
		expect(snapshot.bodyType).toMatchObject({ size: 12, lineHeight: 16, weight: 500 });
		expect(snapshot.kickerType).toMatchObject({ size: 9, lineHeight: 12, weight: 600 });
		expect(snapshot.controlType).toMatchObject({ size: 13, lineHeight: 18, weight: 600 });
		expect(snapshot.paneType).toMatchObject({ size: 13, lineHeight: 18, weight: 600 });
		expect(snapshot.wordmarkType.family).toContain("inter");
		expect(snapshot.titleType.family).toContain("inter");
		expect(snapshot.bodyType.family).toContain("inter");
		expect(snapshot.controlType.family).toContain("inter");
		expect(snapshot.kickerType.family).toMatch(/mono|consolas/);
		expect(
			snapshot.actionTargets.every(({ width, height }) => width >= 43.5 && height >= 43.5),
		).toBe(true);
		expect(snapshot.paneTarget.height).toBeGreaterThanOrEqual(43.5);
		expect(snapshot.presentTarget.height).toBeGreaterThanOrEqual(43.5);
	}
	expect(themes[0]?.background).not.toBe(themes[1]?.background);

	const desktop = await browser.eval<DesktopShell | null>(`(() => {
		const nav = document.querySelector('.board-nav');
		const canvas = document.querySelector('.canvas-zone');
		const rail = document.querySelector('.agent-rail');
		const pane = document.querySelector('.pane');
		if (!nav || !canvas || !rail || !pane) return null;
		const navRect = nav.getBoundingClientRect();
		const canvasRect = canvas.getBoundingClientRect();
		const railRect = rail.getBoundingClientRect();
		const paneRect = pane.getBoundingClientRect();
		return {
			navLeftOfCanvas: navRect.right <= canvasRect.left + 0.5,
			navWidth: navRect.width,
			workbenchBelowPane: railRect.top >= paneRect.bottom - 0.5,
			workbenchInsideCanvas: railRect.left >= canvasRect.left - 0.5 &&
				railRect.right <= canvasRect.right + 0.5 && railRect.bottom <= canvasRect.bottom + 0.5,
			columnsAlign: Math.abs(navRect.top - canvasRect.top) < 1 &&
				Math.abs(navRect.bottom - canvasRect.bottom) < 1,
			canvasLargest: canvasRect.width > navRect.width && paneRect.height > railRect.height,
		};
	})()`);
	expect(desktop?.navLeftOfCanvas).toBe(true);
	expect(desktop?.navWidth).toBeCloseTo(184, 0);
	expect(desktop?.workbenchBelowPane).toBe(true);
	expect(desktop?.workbenchInsideCanvas).toBe(true);
	expect(desktop?.columnsAlign).toBe(true);
	expect(desktop?.canvasLargest).toBe(true);

	const readPaneBar = () =>
		browser.eval<PaneBarLayout>(`(() => {
			const bar = document.querySelector('.pane-bar');
			const tabs = [...document.querySelectorAll('.pane-tab')];
			const focused = document.querySelector('.pane-tab.focused');
			const dot = focused?.querySelector('.focus-dot');
			const focusedStyle = getComputedStyle(focused);
			return {
				height: bar.getBoundingClientRect().height,
				tabCount: tabs.length,
				tabHeights: tabs.map(tab => tab.getBoundingClientRect().height),
				focusedEdgeWidth: parseFloat(focusedStyle.borderBottomWidth),
				focusedEdgeColor: focusedStyle.borderBottomColor,
				focusedDotColor: getComputedStyle(dot).backgroundColor,
				labels: tabs.map(tab => tab.textContent.trim()),
			};
		})()`);
	const onePaneBar = await readPaneBar();
	expect(onePaneBar).toMatchObject({ height: 45, tabCount: 1 });
	expect(onePaneBar.tabHeights.every((height) => height >= 43.5)).toBe(true);
	expect(onePaneBar.focusedEdgeWidth).toBe(2);
	expect(onePaneBar.focusedEdgeColor).toBe(onePaneBar.focusedDotColor);

	expect((await api("/api/panes/open", { method: "POST", body: {} })).status).toBe(200);
	await pollUntil(
		() => api<PanesBody>("/api/panes").then((response) => response.body),
		(state) => (state.paneCount ?? 0) === 2,
		"the desktop shell to mount two panes",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	const twoPaneBar = await pollUntil(
		readPaneBar,
		(layout) => layout.tabCount === 2,
		"the two-pane identity bar to render",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(twoPaneBar.height).toBe(45);
	expect(twoPaneBar.tabHeights.every((height) => height >= 43.5)).toBe(true);
	expect(twoPaneBar.labels).toHaveLength(2);
	expect(twoPaneBar.labels[0]).toContain("Pane A");
	expect(twoPaneBar.labels[1]).toContain("Pane B");
	expect(
		(await api("/api/panes/close", { method: "POST", body: { pane: "focused" } })).status,
	).toBe(200);
	await pollUntil(
		() => api<PanesBody>("/api/panes").then((response) => response.body),
		(state) => (state.paneCount ?? 0) === 1,
		"the desktop shell to return to one pane",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);

	const collapsedPaneHeight = await browser.eval<number>(
		"document.querySelector('.pane').getBoundingClientRect().height",
	);
	expect(
		await browser.eval<boolean>(
			"document.querySelector('.workbench-toggle').getAttribute('aria-expanded') === 'false'",
		),
	).toBe(true);
	await browser.run(["click", ".workbench-toggle"]);
	for (const [index, doing] of activityLines.entries()) {
		const wrote = await api(`/api/elements?board=fixedpoint&doing=${encodeURIComponent(doing)}`, {
			method: "POST",
			body: {
				id: `activity-${index}`,
				type: "rectangle",
				x: 900 + index * 20,
				y: 500,
				width: 10,
				height: 10,
			},
		});
		expect([200, 201]).toContain(wrote.status);
	}
	const activity = await pollUntil(
		() =>
			browser.eval<ActivityLayout | null>(`(() => {
				const rail = document.querySelector('.agent-rail');
				const panel = document.querySelector('.pane-doing');
				const lines = [...document.querySelectorAll('.pane-doing-line')];
				const pane = document.querySelector('.pane');
				if (!rail || !panel || !pane || lines.length !== 5) return null;
				const railRect = rail.getBoundingClientRect();
				const panelRect = panel.getBoundingClientRect();
				const timestamps = [...document.querySelectorAll('.pane-doing-when')]
					.map(node => node.getBoundingClientRect().left);
				return {
					lineCount: lines.length,
					linesFit: lines.every(line => line.scrollWidth <= line.clientWidth),
					panelFits: panelRect.left >= railRect.left && panelRect.right <= railRect.right &&
						panelRect.bottom <= railRect.bottom,
					canvasClear: railRect.top >= pane.getBoundingClientRect().bottom - 0.5,
					timestampsAlign: timestamps.every(left => Math.abs(left - timestamps[0]) < 0.5),
				};
			})()`),
		(layout) => layout?.lineCount === 5,
		"all five desktop activity rows to render",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(activity).toMatchObject({
		lineCount: 5,
		linesFit: true,
		panelFits: true,
		canvasClear: true,
		timestampsAlign: true,
	});
	const expandedPaneHeight = await browser.eval<number>(
		"document.querySelector('.pane').getBoundingClientRect().height",
	);
	expect(expandedPaneHeight).toBeLessThan(collapsedPaneHeight - 100);
	await browser.run(["click", ".workbench-toggle"]);

	expect(await publishActionableNotice(browser)).toBe(true);
	const notice = await pollUntil(
		() =>
			browser.eval<NoticeLayout | null>(`(() => {
				const notice = document.querySelector('.notice-shell');
				const panes = document.querySelector('.panes');
				const inspector = document.querySelector('.selection-inspector');
				const text = notice?.querySelector('.notice-text');
				const action = notice?.querySelector('.notice-actions .btn');
				const dismiss = notice?.querySelector('.notice-dismiss');
				if (!notice || !panes || !inspector || !text || !action || !dismiss) return null;
				const metrics = node => {
					const value = getComputedStyle(node);
					return {
						family: value.fontFamily.toLowerCase(),
						size: parseFloat(value.fontSize),
						lineHeight: parseFloat(value.lineHeight),
						weight: parseFloat(value.fontWeight),
					};
				};
				const noticeRect = notice.getBoundingClientRect();
				const panesRect = panes.getBoundingClientRect();
				const inspectorRect = inspector.getBoundingClientRect();
				return {
					parentIsPanes: notice.parentElement === panes,
					insidePanes: noticeRect.left >= panesRect.left && noticeRect.right <= panesRect.right &&
						noticeRect.top >= panesRect.top && noticeRect.bottom <= panesRect.bottom,
					overlapsInspector: noticeRect.left < inspectorRect.right && noticeRect.right > inspectorRect.left &&
						noticeRect.top < inspectorRect.bottom && noticeRect.bottom > inspectorRect.top,
					width: noticeRect.width,
					copyType: metrics(text),
					actionHeight: action.getBoundingClientRect().height,
					dismissHeight: dismiss.getBoundingClientRect().height,
					flat: getComputedStyle(notice).boxShadow === 'none' &&
						getComputedStyle(notice).backgroundImage === 'none',
					text: text.childNodes[0]?.textContent?.trim() ?? '',
				};
			})()`),
		(layout) => layout?.text === PERSISTENT_NOTICE_TEXT,
		"the canvas-contained recovery notice to render",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(notice).not.toBeNull();
	if (!notice) throw new Error("the canvas-contained recovery notice did not render");
	expect(notice.parentIsPanes).toBe(true);
	expect(notice.insidePanes).toBe(true);
	expect(notice.overlapsInspector).toBe(false);
	expect(notice.width).toBeCloseTo(390, 0);
	expect(notice.copyType).toMatchObject({ size: 12, lineHeight: 16, weight: 400 });
	expect(notice.copyType.family).toContain("inter");
	expect(notice.actionHeight).toBeGreaterThanOrEqual(43.5);
	expect(notice.dismissHeight).toBeGreaterThanOrEqual(43.5);
	expect(notice.flat).toBe(true);
});
