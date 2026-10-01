import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	AGENT_PANEL_WIDTH,
	DOCK_BAR_HEIGHT,
	HEADER_HEIGHT,
	NAVIGATOR_WIDTH,
	SHELL_VIEWPORT,
	STAGE,
} from "@/shared/shell-geometry/index";
import { readThemeColors, themeColor } from "@/shared/theme/server";

import { PANE_SETTLE_CAP_MS } from "../../../src/shared/timing/timing.ts";
import { TEST_BROWSER_COMMAND_TIMEOUT_MS } from "../support/timing.ts";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
} from "./support/agent-browser.ts";
import { PERSISTENT_NOTICE_TEXT, publishActionableNotice } from "./support/shell-notices.ts";
import type { DesktopShell, NoticeLayout, PaneBarLayout } from "./support/shell-contract-types.ts";
import { roleAction } from "./support/opener-settings-interaction.ts";
import { captureShellRenderMatrix } from "./support/shell-render-matrix.ts";
import { addressShowing, seedSemanticBoard, stageState } from "./support/semantic-page.ts";
import {
	AGENT_BAR,
	AGENT_PANEL,
	BOARD_BREADCRUMB,
	BOARD_NAME_EXPRESSION,
	COMPOSER,
	NAVIGATOR,
	PANE_SECTIONS,
	PANE_TABS,
	STAGE_ROOT,
} from "./support/shell-dom.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");
type PanesBody = { paneCount?: number };
/** The lines an agent says it is doing, the latest of which the navigator shows as it works. */
const activityLines = [
	"marking the unverified regional database boundary",
	"naming what the warehouse is responsible for",
	"wiring the queue between them",
	"adding the reporting view",
	"renaming the ingest service",
] as const;
/** WCAG 2.5.8 target size: the floor every control keeps at the desktop viewport. */
const MIN_TARGET = 24;

/** The shell's columns and bars, measured in the page. */
const READ_DESKTOP = `(() => {
	const box = node => { if (!node) return null; const value = node.getBoundingClientRect();
		return { left: value.left, top: value.top, right: value.right, bottom: value.bottom,
			width: value.width, height: value.height }; };
	const nav = document.querySelector('${NAVIGATOR}');
	return { viewport: { width: innerWidth, height: innerHeight }, nav: box(nav),
		centre: box(nav?.nextElementSibling), stages: box(document.querySelector('${STAGE_ROOT}')),
		pane: box(document.querySelector('${PANE_SECTIONS}')), bar: box(document.querySelector('${AGENT_BAR}')),
		composer: box(document.querySelector('${COMPOSER}')), panel: box(document.querySelector('${AGENT_PANEL}')) };
})()`;

/** The pane tabs, present only while two panes are open. */
const READ_PANE_BAR = `(() => {
	const tabs = [...document.querySelectorAll('${PANE_TABS}')];
	const value = tabs[0] ? getComputedStyle(tabs[0]) : null;
	return { tabCount: tabs.length, tabHeights: tabs.map(tab => tab.getBoundingClientRect().height),
		pressedCount: tabs.filter(tab => tab.getAttribute('aria-pressed') === 'true').length,
		tabType: value && { family: value.fontFamily.toLowerCase(), size: parseFloat(value.fontSize),
			lineHeight: parseFloat(value.lineHeight), weight: parseFloat(value.fontWeight) } };
})()`;

/**
 * What the navigator says an agent is doing on the one board: the latest
 * doing line under "Working now", and whether the board's row carries the lamp.
 */
const READ_ACTIVITY = `(() => {
	const nav = document.querySelector('${NAVIGATOR}');
	const section = nav?.querySelector('[data-slot="working-now"]');
	const entries = [...(section?.querySelectorAll('li') ?? [])];
	const line = entries[0]?.querySelector('button > span:last-child');
	const own = line ? [...line.childNodes].filter(child => child.nodeType === 3)
		.map(child => child.textContent).join('').trim() : null;
	const row = nav?.querySelector('[role="treeitem"][data-row-kind="board"]:has([data-board-key="fixedpoint"])');
	return { entries: entries.length, doing: own, lamp: !!row?.querySelector('[data-slot="agent-activity"]') };
})()`;

test(
	"the desktop shell keeps its visual contract across the canonical render matrix",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { ownerRoot } = browserTestRoots();
		const vault = join(ownerRoot, "vault");
		mkdirSync(vault, { recursive: true });
		const server = await startOwnedServer({
			serverPath,
			vault,
			env: serverTestEnvironment({ LOG_FILE_PATH: join(ownerRoot, "server.log") }),
		});
		resources.defer(() => server.dispose());
		registerServerBase(server.base);
		const browser = resources.use(await createAgentBrowser());
		const api = createJsonRequester(server);
		await seedSemanticBoard(api, "fixedpoint");
		// Shown on a proposal rather than on what is current, so the header has a
		// variant to name: a board read through the variant its name opens has
		// nothing there to check.
		const branched = await api<{ board: { variants: Array<{ id: string; name: string }> } }>(
			"/api/semantic-boards/branch?expectVersion=1",
			{
				method: "POST",
				doing: "proposing the queued ingest",
				body: { board: "fixedpoint", branch: { from: "current", name: "Queued ingest" } },
			},
		);
		expect(branched.status).toBe(200);
		const proposal = branched.body.board.variants.find((one) => one.name === "Queued ingest")!;
		expect(proposal).toBeDefined();

		await browser.run(["open", addressShowing(server.base, `fixedpoint@${proposal.id}`)]);
		expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
		await browser.run(["set", "viewport", "1920", "1080", "1"]);
		await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body),
			(state) => (state.paneCount ?? 0) === 1,
			"the shell pane to register",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		await pollUntil(
			() => browser.eval<string | null>(BOARD_NAME_EXPRESSION),
			(board) => board === "fixedpoint",
			"fixedpoint to become the visible board",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		// And on the proposal, not merely on the board: the header names the
		// variant beside it, and a poll that stopped at the board name would run
		// the matrix against a header the show had not reached yet.
		await pollUntil(
			() =>
				browser.eval<string | null>(
					`document.querySelector('${BOARD_BREADCRUMB} [data-slot="board-state"]')?.textContent?.trim() ?? null`,
				),
			(variant) => variant === proposal.name,
			"the header to name the proposal being read",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		await pollUntil(
			() => stageState(browser.eval.bind(browser)),
			(state) => state === "drawn",
			"the board to be drawn in its pane",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		await browser.eval<boolean>("document.fonts.ready.then(() => true)");

		const matrix = await captureShellRenderMatrix(browser, repoRoot);
		expect(matrix.cells).toHaveLength(12);
		expect(new Set(matrix.cells.map(({ stateHash }) => stateHash)).size).toBe(1);
		for (const viewport of ["desktop", "flip-scaled"] as const) {
			expect(
				new Set(
					matrix.cells
						.filter((cell) => cell.viewport === viewport)
						.map(({ geometryHash }) => geometryHash),
				).size,
			).toBe(1);
		}
		for (const cell of matrix.cells) {
			expect(cell.actualDeviceScaleFactor).toBe(cell.deviceScaleFactor);
			expect(cell.queryTruth).toEqual({
				dark: cell.theme === "dark",
				reducedMotion: cell.mode === "reduced-motion",
				forcedColors: cell.mode === "forced-colors",
			});
			if (cell.mode === "reduced-motion") {
				expect(cell.motion.animationIterationCount).toBe("1");
				expect(Number.parseFloat(cell.motion.animationDuration) * 1_000).toBeCloseTo(0.001, 6);
				expect(Number.parseFloat(cell.motion.controlDuration) * 1_000).toBeCloseTo(0.001, 6);
			}
			if (cell.mode === "forced-colors") {
				expect(cell.focus.forcedColorAdjust).toBe("auto");
				expect(cell.focus.outlineStyle).not.toBe("none");
				// The forced-colours UA owns the ring width; the author rule asks for 2px and the
				// emulation draws 1px. What matters is that a visible outline replaces the ring.
				expect(cell.focus.outlineWidth).toBeGreaterThanOrEqual(1);
			}
			expect(cell.focus.ringVisible).toBe(true);
			expect(cell.focus.unclipped).toBe(true);
			expect(cell.pageOverflow).toBe(false);
			expect(cell.touchTargets.length).toBeGreaterThan(5);
			expect(
				cell.touchTargets.filter(({ width, height }) => width < MIN_TARGET || height < MIN_TARGET),
				"controls under the 24px target",
			).toEqual([]);
			expect(cell.normalizedHash).toHaveLength(64);
			expect(cell.screenshotSha256).toHaveLength(64);
		}

		// The reference pane a drawing's fit is measured against is derived from
		// these widths and heights (ADR 0028); the mounted shell is what they are,
		// with the conversation panel closed.
		for (const cell of matrix.cells.filter(({ viewport }) => viewport === "desktop")) {
			const { nav, header, stages, bar } = cell.geometry;
			expect(nav?.width, "navigator width").toBe(NAVIGATOR_WIDTH);
			expect(header?.height, "header height").toBe(HEADER_HEIGHT);
			expect(stages?.width, "stage width").toBe(STAGE.width);
			expect(stages?.height, "stage height").toBe(STAGE.height);
			expect(bar?.height, "agent bar height with its rule").toBe(DOCK_BAR_HEIGHT);
		}

		const themes = matrix.cells
			.filter(({ viewport, mode }) => viewport === "desktop" && mode === "normal")
			.map(({ themeSnapshot }) => themeSnapshot);
		expect(themes.map(({ theme }) => theme).toSorted()).toEqual(["dark", "light"]);
		for (const snapshot of themes) {
			expect(snapshot.wordmark).toBe("archboard");
			expect(Math.abs(snapshot.wordmarkSize.width - 85.7815)).toBeLessThan(0.02);
			expect(Math.abs(snapshot.wordmarkSize.height - 13.209)).toBeLessThan(0.02);
			expect(snapshot.unexpectedBrandIconCount).toBe(0);
			expect(snapshot.headerHeight).toBeCloseTo(56, 0);
			const colors = readThemeColors(
				`:root { --primary: ${snapshot.selection}; --status: ${snapshot.status}; }`,
			).light;
			expect(colors["--primary"]).toBe(themeColor(snapshot.theme, "--primary"));
			expect(colors["--status"]).toBe(themeColor(snapshot.theme, "--status"));
			expect(snapshot.inkContrast).toBeGreaterThanOrEqual(4.5);
			expect(snapshot.flatSurfaces).toBe(true);
			expect(snapshot.shadowlessSurfaces).toBe(true);
			expect(snapshot.visibleFocus).toBe(true);
			expect(snapshot.boardIdentity).toBe("fixedpoint");
			expect(snapshot.variant).toBe(proposal.name);
			// The navigator marks the board the one focused pane reads.
			expect(snapshot.selectedBoard).toBe("fixedpoint");
			expect(snapshot.focusedPaneCount).toBe(1);
			// A live socket says nothing in the header.
			expect(snapshot.connectionTrouble).toBe(0);
			expect(snapshot.headerSectionsAligned).toBe(true);
			expect(snapshot.fontChecks).toEqual([true, true, true, true, true, true]);
			expect(snapshot.fontResources).toHaveLength(3);
			expect(
				snapshot.fontResources.every((url) => new URL(url).origin === new URL(server.base).origin),
			).toBe(true);
			expect(snapshot.fontResources.join(" ")).toMatch(/Onest-wght.*DMMono-(?:Regular|Medium)/);
			// The drawn board's own faces, served from this server rather than a CDN.
			expect(snapshot.diagramFontResources.length).toBeGreaterThan(0);
			expect(
				snapshot.diagramFontResources.every(
					(url) => new URL(url).origin === new URL(server.base).origin,
				),
			).toBe(true);
			expect(snapshot.humanLabels).toHaveLength(2);
			expect(
				snapshot.humanLabels.every(
					({ family, transform, weight }) =>
						family.includes("archboard onest") &&
						transform === "none" &&
						[500, 600].includes(weight),
				),
			).toBe(true);
			// The type roles (TASK-150.08): board name 600, body 400, the state and
			// controls 500, technical tokens in the mono face at 400 or 500, and a
			// sidebar section heading 600 at the body size, never uppercase (TASK-383).
			expect(snapshot.titleType).toMatchObject({ weight: 600 });
			expect(snapshot.sectionHeading).toMatchObject({
				weight: 600,
				transform: "none",
				size: 12,
			});
			expect(snapshot.sectionHeading.family).toContain("archboard onest");
			expect(snapshot.bodyType).toMatchObject({ weight: 400 });
			expect(snapshot.stateType).toMatchObject({ weight: 500 });
			expect(snapshot.controlType).toMatchObject({ weight: 500 });
			expect([400, 500]).toContain(snapshot.technicalType.weight);
			for (const type of [
				snapshot.titleType,
				snapshot.bodyType,
				snapshot.stateType,
				snapshot.technicalType,
				snapshot.controlType,
			]) {
				expect(type.size).toBeGreaterThanOrEqual(11);
				expect(type.lineHeight).toBeGreaterThanOrEqual(type.size);
			}
			for (const type of [
				snapshot.titleType,
				snapshot.bodyType,
				snapshot.stateType,
				snapshot.controlType,
			]) {
				expect(type.family).toContain("archboard onest");
			}
			expect(snapshot.technicalType.family).toContain("archboard dm mono");
			expect(
				snapshot.actionTargets.every(
					({ width, height }) => width >= MIN_TARGET && height >= MIN_TARGET,
				),
			).toBe(true);
			expect(snapshot.presentTarget.height).toBeGreaterThanOrEqual(MIN_TARGET);
		}
		expect(themes[0]?.background).not.toBe(themes[1]?.background);

		// The columns: the navigator left of the centre, both under the header;
		// the agent bar under the panes, from the navigator's edge to the
		// viewport's; the conversation panel closed.
		const closed = await browser.eval<DesktopShell>(READ_DESKTOP);
		expect(closed.viewport).toEqual(SHELL_VIEWPORT);
		expect(closed.nav.right).toBeLessThanOrEqual(closed.centre.left + 0.5);
		expect(Math.abs(closed.nav.top - closed.centre.top)).toBeLessThan(1);
		expect(Math.abs(closed.nav.bottom - closed.centre.bottom)).toBeLessThan(1);
		expect(closed.centre.width).toBeGreaterThan(closed.nav.width);
		expect(closed.pane.height).toBeGreaterThan(closed.bar.height);
		expect(closed.bar.top).toBeGreaterThanOrEqual(closed.pane.bottom - 0.5);
		expect(closed.bar.left).toBe(closed.nav.right);
		expect(closed.bar.right).toBe(closed.viewport.width);
		expect(closed.bar.bottom).toBe(closed.viewport.height);
		expect(closed.bar.height).toBe(DOCK_BAR_HEIGHT);
		expect(closed.panel).toBeNull();

		// Opening the conversation puts the panel right of the panes, over the
		// composer's region, and takes its width from the stage alone.
		await roleAction(browser, "button", "Open the conversation");
		const open = await pollUntil(
			() => browser.eval<DesktopShell>(READ_DESKTOP),
			(layout) => layout.panel !== null && layout.stages.width < closed.stages.width,
			"the conversation panel to open beside the panes",
		);
		const panel = open.panel!;
		expect(panel.width).toBe(AGENT_PANEL_WIDTH);
		expect(panel.left).toBe(open.stages.right);
		expect(panel.right).toBe(open.viewport.width);
		expect(panel.bottom).toBeLessThanOrEqual(open.bar.top + 0.5);
		expect(open.composer.left).toBeGreaterThanOrEqual(panel.left - 0.5);
		expect(open.composer.right).toBeLessThanOrEqual(panel.right + 0.5);
		expect(open.composer.top).toBeGreaterThanOrEqual(open.bar.top - 0.5);
		expect(open.stages.width).toBe(closed.stages.width - AGENT_PANEL_WIDTH);
		expect(open.stages.height).toBe(closed.stages.height);
		expect(open.bar).toEqual(closed.bar);
		await roleAction(browser, "button", "Close the conversation");
		const reclosed = await pollUntil(
			() => browser.eval<DesktopShell>(READ_DESKTOP),
			(layout) => layout.panel === null,
			"the conversation panel to close",
		);
		expect(reclosed.stages).toEqual(closed.stages);
		expect(reclosed.bar).toEqual(closed.bar);

		// One pane has nothing to choose between: no tabs. Two panes get a tab
		// each, the focused one pressed.
		const readPaneBar = () => browser.eval<PaneBarLayout>(READ_PANE_BAR);
		expect((await readPaneBar()).tabCount).toBe(0);
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
			"the two pane tabs to render",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		expect(twoPaneBar.tabHeights.every((height) => height >= MIN_TARGET)).toBe(true);
		expect(twoPaneBar.pressedCount).toBe(1);
		expect(twoPaneBar.tabType).toMatchObject({ weight: 500 });
		expect(twoPaneBar.tabType?.family).toContain("archboard onest");
		expect(twoPaneBar.tabType?.size).toBeGreaterThanOrEqual(11);
		expect(
			(await api("/api/panes/close", { method: "POST", body: { pane: "focused" } })).status,
		).toBe(200);
		await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body),
			(state) => (state.paneCount ?? 0) === 1,
			"the desktop shell to return to one pane",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		await pollUntil(readPaneBar, (layout) => layout.tabCount === 0, "the pane tabs to go");

		// An agent at work shows in the navigator, which is where the tree never
		// moves for it: the latest thing it said under "Working now" and a lamp
		// on the board's row. The bar under the panes never grows for it.
		const paneHeight = () =>
			browser.eval<number>(
				`document.querySelector('${PANE_SECTIONS}').getBoundingClientRect().height`,
			);
		const restingPaneHeight = await paneHeight();
		// The board is at 2 already: it was branched so the header would have a
		// variant to name.
		let version = 2;
		for (const [index, doing] of activityLines.entries()) {
			const wrote = await api<{ success: boolean; version: number }>(
				`/api/semantic-boards/edit?expectVersion=${version}`,
				{
					method: "POST",
					doing,
					body: {
						board: "fixedpoint",
						origin: "agent",
						edit: { nodes: [{ name: `Step ${index + 1}`, kind: "service" }] },
					},
				},
			);
			expect(wrote.status).toBe(200);
			version = wrote.body.version;
		}
		const activity = await pollUntil(
			() => browser.eval<{ entries: number; doing: string | null; lamp: boolean }>(READ_ACTIVITY),
			(view) => view.doing === activityLines.at(-1),
			"the latest thing the agent said to show in the navigator",
		);
		expect(activity.entries).toBe(1);
		expect(activity.lamp).toBe(true);
		expect(await paneHeight()).toBe(restingPaneHeight);
		expect((await browser.eval<DesktopShell>(READ_DESKTOP)).bar).toEqual(closed.bar);

		expect(await publishActionableNotice(browser)).toBe(true);
		const notice = await pollUntil(
			() =>
				browser.eval<NoticeLayout | null>(`(() => {
					const notice = [...document.querySelectorAll('[data-slot="alert"]')].find(node =>
						node.querySelector('[data-slot="alert-description"]')?.textContent?.trim() === ${JSON.stringify(PERSISTENT_NOTICE_TEXT)});
					const centre = document.querySelector('${NAVIGATOR}')?.nextElementSibling;
					const text = notice?.querySelector('[data-slot="alert-description"]');
					const action = notice?.querySelector('[data-slot="alert-action"] button');
					const dismiss = notice?.querySelector('button[aria-label^="Dismiss notice"]');
					if (!notice || !centre || !text || !action || !dismiss) return null;
					const metrics = node => { const value = getComputedStyle(node); return { family: value.fontFamily.toLowerCase(),
						size: parseFloat(value.fontSize), lineHeight: parseFloat(value.lineHeight), weight: parseFloat(value.fontWeight) }; };
					const noticeRect = notice.getBoundingClientRect();
					const centreRect = centre.getBoundingClientRect();
					return { parentIsPanes: centre.contains(notice),
						insidePanes: noticeRect.left >= centreRect.left - 0.5 && noticeRect.right <= centreRect.right + 0.5 &&
							noticeRect.top >= centreRect.top - 0.5 && noticeRect.bottom <= centreRect.bottom + 0.5,
						width: noticeRect.width, copyType: metrics(text), actionHeight: action.getBoundingClientRect().height,
						dismissHeight: dismiss.getBoundingClientRect().height,
						flat: getComputedStyle(notice).boxShadow === 'none' && getComputedStyle(notice).backgroundImage === 'none',
						text: text.textContent?.trim() ?? '' };
				})()`),
			(layout) => layout?.text === PERSISTENT_NOTICE_TEXT,
			"the canvas-contained recovery notice to render",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		expect(notice).not.toBeNull();
		if (!notice) {
			throw new Error("the canvas-contained recovery notice did not render");
		}
		expect(notice.parentIsPanes).toBe(true);
		expect(notice.insidePanes).toBe(true);
		expect(notice.width).toBeGreaterThan(300);
		expect(notice.copyType.family).toContain("archboard onest");
		expect(notice.copyType.size).toBeGreaterThanOrEqual(12);
		expect(notice.actionHeight).toBeGreaterThanOrEqual(MIN_TARGET);
		expect(notice.dismissHeight).toBeGreaterThanOrEqual(MIN_TARGET);
		expect(notice.flat).toBe(true);

		// Settings opens its dialog directly; Escape closes it and focus returns
		// to the button that opened it.
		await roleAction(browser, "button", "Settings");
		await pollUntil(
			() => browser.eval<number>(`document.querySelectorAll('[role="dialog"]').length`),
			(count) => count === 1,
			"the settings dialog to open",
		);
		await browser.run(["press", "Escape"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					`!document.querySelector('[role="dialog"]') && document.activeElement?.getAttribute('aria-label') === 'Settings'`,
				),
			Boolean,
			"Escape to close the settings dialog and return focus to its trigger",
		);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 2,
);
