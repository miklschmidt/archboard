import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HEADER_HEIGHT, NAVIGATOR_WIDTH, STAGE } from "@/shared/shell-geometry/index";
import { readThemeColors, themeColor } from "@/shared/theme/server";

import { PANE_SETTLE_CAP_MS } from "../../../src/shared/timing/timing.ts";
import { TEST_BROWSER_COMMAND_TIMEOUT_MS } from "../support/timing.ts";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import { PERSISTENT_NOTICE_TEXT, publishActionableNotice } from "./support/shell-notices.ts";
import type { DesktopShell, NoticeLayout, PaneBarLayout } from "./support/shell-contract-types.ts";
import { roleAction } from "./support/opener-settings-interaction.ts";
import { captureShellRenderMatrix } from "./support/shell-render-matrix.ts";
import { addressShowing, seedSemanticBoard, stageState } from "./support/semantic-page.ts";
import { BOARD_NAME_EXPRESSION, PANE_TABS, STAGE_ROOT } from "./support/shell-dom.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");
type PanesBody = { paneCount?: number };
/** The lines an agent says it is doing, which the dock shows as it works. */
const activityLines = [
	"marking the unverified regional database boundary",
	"naming what the warehouse is responsible for",
	"wiring the queue between them",
	"adding the reporting view",
	"renaming the ingest service",
] as const;
/** WCAG 2.5.8 target size: the floor every control keeps at the desktop viewport. */
const MIN_TARGET = 24;

test(
	"the desktop shell keeps its visual contract across the canonical render matrix",
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
		const api = createJsonRequester(canvas);
		await seedSemanticBoard(api, "fixedpoint");
		// Shown on a proposal rather than on what is current, so the header has a
		// variant to name: the breadcrumb's kicker is which variant is being read,
		// and a board read through `current` has nothing there to check.
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

		await browser.run(["open", addressShowing(canvas.base, `fixedpoint@${proposal.id}`)]);
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
					`document.querySelector('nav[aria-label="Current board"] span.font-mono')?.textContent?.trim() ?? null`,
				),
			(variant) => variant === proposal.id,
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
				cell.touchTargets.every(({ width, height }) => width >= MIN_TARGET && height >= MIN_TARGET),
			).toBe(true);
			expect(cell.normalizedHash).toHaveLength(64);
			expect(cell.screenshotSha256).toHaveLength(64);
		}

		// The reference pane a drawing's fit is measured against is derived from
		// these widths and heights (ADR 0028); the mounted shell is what they are.
		for (const cell of matrix.cells.filter(({ viewport }) => viewport === "desktop")) {
			expect(cell.geometry["nav"]?.width, "navigator width").toBe(NAVIGATOR_WIDTH);
			expect(cell.geometry["header"]?.height, "header height").toBe(HEADER_HEIGHT);
			expect(cell.geometry["stages"]?.width, "stage width").toBe(STAGE.width);
			expect(cell.geometry["stages"]?.height, "stage height").toBe(STAGE.height);
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
			expect(snapshot.variant).toBe(proposal.id);
			expect(snapshot.connectionState).toBe("Connected");
			// A board that is saving normally carries no persistence warning.
			expect(snapshot.persistenceState).toBe("");
			expect(snapshot.paneIdentity).toContain("fixedpoint");
			expect(snapshot.headerSectionsAligned).toBe(true);
			expect(snapshot.fontChecks).toEqual([true, true, true, true, true, true]);
			expect(snapshot.fontResources).toHaveLength(3);
			expect(
				snapshot.fontResources.every((url) => new URL(url).origin === new URL(canvas.base).origin),
			).toBe(true);
			expect(snapshot.fontResources.join(" ")).toMatch(/Onest-wght.*DMMono-(?:Regular|Medium)/);
			// The drawn board's own faces, served from this canvas rather than a CDN.
			expect(snapshot.diagramFontResources.length).toBeGreaterThan(0);
			expect(
				snapshot.diagramFontResources.every(
					(url) => new URL(url).origin === new URL(canvas.base).origin,
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
			// The six type roles (TASK-150.08): board name 600, body 400, the level
			// badge and controls 500, and the section kicker uppercase 600 at 10px.
			expect(snapshot.titleType).toMatchObject({ weight: 600 });
			expect(snapshot.sectionKicker).toMatchObject({
				weight: 600,
				transform: "uppercase",
				size: 10,
			});
			expect(snapshot.sectionKicker.family).toContain("archboard onest");
			expect(snapshot.bodyType).toMatchObject({ weight: 400 });
			expect(snapshot.kickerType).toMatchObject({ weight: 500 });
			expect(snapshot.controlType).toMatchObject({ weight: 500 });
			expect(snapshot.paneType).toMatchObject({ weight: 500 });
			for (const type of [
				snapshot.titleType,
				snapshot.bodyType,
				snapshot.kickerType,
				snapshot.controlType,
				snapshot.paneType,
			]) {
				expect(type.size).toBeGreaterThanOrEqual(11);
				expect(type.lineHeight).toBeGreaterThanOrEqual(type.size);
			}
			expect(snapshot.titleType.family).toContain("archboard onest");
			expect(snapshot.bodyType.family).toContain("archboard onest");
			expect(snapshot.controlType.family).toContain("archboard onest");
			expect(snapshot.paneType.family).toContain("archboard onest");
			expect(snapshot.kickerType.family).toContain("archboard dm mono");
			expect(
				snapshot.actionTargets.every(
					({ width, height }) => width >= MIN_TARGET && height >= MIN_TARGET,
				),
			).toBe(true);
			expect(snapshot.paneTarget.height).toBeGreaterThanOrEqual(MIN_TARGET);
			expect(snapshot.presentTarget.height).toBeGreaterThanOrEqual(MIN_TARGET);
		}
		expect(themes[0]?.background).not.toBe(themes[1]?.background);

		const desktop = await browser.eval<DesktopShell | null>(`(() => {
			const nav = document.querySelector('[data-slot="sidebar"]');
			const centre = nav?.nextElementSibling;
			const stages = document.querySelector('${STAGE_ROOT}');
			const dock = [...document.querySelectorAll('[data-slot="collapsible"]')]
				.find(node => node.querySelector('button[aria-label$="workbench"]'));
			const pane = document.querySelector('section[aria-label^="Pane "]');
			if (!nav || !centre || !stages || !dock || !pane) return null;
			const navRect = nav.getBoundingClientRect();
			const centreRect = centre.getBoundingClientRect();
			const dockRect = dock.getBoundingClientRect();
			const paneRect = pane.getBoundingClientRect();
			return {
				navLeftOfCanvas: navRect.right <= centreRect.left + 0.5,
				navWidth: navRect.width,
				workbenchBelowPane: dockRect.top >= paneRect.bottom - 0.5,
				workbenchInsideCanvas: dockRect.left >= centreRect.left - 0.5 &&
					dockRect.right <= centreRect.right + 0.5 && dockRect.bottom <= centreRect.bottom + 0.5,
				columnsAlign: Math.abs(navRect.top - centreRect.top) < 1 &&
					Math.abs(navRect.bottom - centreRect.bottom) < 1,
				canvasLargest: centreRect.width > navRect.width && paneRect.height > dockRect.height,
			};
		})()`);
		expect(desktop?.navLeftOfCanvas).toBe(true);
		expect(desktop?.navWidth).toBeGreaterThan(160);
		expect(desktop?.workbenchBelowPane).toBe(true);
		expect(desktop?.workbenchInsideCanvas).toBe(true);
		expect(desktop?.columnsAlign).toBe(true);
		expect(desktop?.canvasLargest).toBe(true);

		const readPaneBar = () =>
			browser.eval<PaneBarLayout>(`(() => {
				const tabs = [...document.querySelectorAll('${PANE_TABS}')];
				const bar = tabs[0]?.closest('[data-slot="toggle-group"]')?.parentElement;
				const focused = tabs.find(tab => tab.getAttribute('aria-pressed') === 'true');
				return {
					height: bar?.getBoundingClientRect().height ?? 0,
					tabCount: tabs.length,
					tabHeights: tabs.map(tab => tab.getBoundingClientRect().height),
					focusedEdgeWidth: focused ? 1 : 0,
					focusedEdgeColor: focused?.getAttribute('aria-current') ?? '',
					focusedDotColor: focused?.getAttribute('aria-current') ?? '',
					labels: tabs.map(tab => tab.textContent.trim()),
				};
			})()`);
		const onePaneBar = await readPaneBar();
		expect(onePaneBar).toMatchObject({ tabCount: 1, focusedEdgeColor: "true" });
		expect(onePaneBar.height).toBeGreaterThanOrEqual(MIN_TARGET);
		expect(onePaneBar.tabHeights.every((height) => height >= MIN_TARGET)).toBe(true);

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
		expect(twoPaneBar.tabHeights.every((height) => height >= MIN_TARGET)).toBe(true);
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

		const paneHeight = () =>
			browser.eval<number>(
				"document.querySelector('section[aria-label^=\"Pane \"]').getBoundingClientRect().height",
			);
		const dockExpanded = () =>
			browser.eval<boolean>(
				"document.querySelector('button[aria-label=\"Collapse workbench\"], button[aria-label=\"Expand workbench\"]')?.getAttribute('aria-expanded') === 'true'",
			);
		if (await dockExpanded()) {
			await roleAction(browser, "button", "Collapse workbench");
		}
		await pollUntil(dockExpanded, (open) => !open, "the workbench dock to collapse");
		const collapsedPaneHeight = await paneHeight();
		await roleAction(browser, "button", "Expand workbench");
		await pollUntil(dockExpanded, Boolean, "the workbench dock to expand");
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
			() =>
				browser.eval<{ current: string | null; history: string[] }>(`(() => {
					const dock = [...document.querySelectorAll('[data-slot="collapsible"]')]
						.find(node => node.querySelector('button[aria-label$="workbench"]'));
					const history = [...(dock?.querySelectorAll('ol[aria-label="Recent activity"] li') ?? [])]
						.map(node => node.textContent.trim());
					const title = [...(dock?.querySelectorAll('span') ?? [])]
						.find(node => node.textContent.trim() === 'Agent workbench');
					const current = title?.nextElementSibling?.querySelector('span')?.textContent?.trim() ?? null;
					return { current, history };
				})()`),
			(view) => view.current === activityLines.at(-1),
			"the latest live agent action to remain visible in the dock",
		);
		expect(activity.history.at(-1)).toContain(activityLines.at(-1)!);
		expect(activity.history.length).toBeGreaterThanOrEqual(4);
		const expandedPaneHeight = await paneHeight();
		expect(expandedPaneHeight).toBeLessThanOrEqual(collapsedPaneHeight - MIN_TARGET);
		await roleAction(browser, "button", "Collapse workbench");

		expect(await publishActionableNotice(browser)).toBe(true);
		const notice = await pollUntil(
			() =>
				browser.eval<NoticeLayout | null>(`(() => {
					const notice = [...document.querySelectorAll('[data-slot="alert"]')].find(node =>
						node.querySelector('[data-slot="alert-description"]')?.textContent?.trim() === ${JSON.stringify(PERSISTENT_NOTICE_TEXT)});
					const nav = document.querySelector('[data-slot="sidebar"]');
					const centre = nav?.nextElementSibling;
					const text = notice?.querySelector('[data-slot="alert-description"]');
					const action = [...(notice?.querySelectorAll('[data-slot="alert-action"] button') ?? [])]
						.find(node => node.textContent.trim() === 'Opener settings');
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

		await roleAction(browser, "button", "Settings");
		const menu = await pollUntil(
			() =>
				browser.eval<string[]>(
					'[...document.querySelectorAll(\'[role="menu"] [role="menuitem"]\')].map(node => node.textContent.trim())',
				),
			(items) => items.length === 2,
			"the settings menu to open",
		);
		expect(menu).toEqual(["Opener settings", "Agent settings"]);
		// The menu is a portal over the shell: Escape closes it and focus returns to its trigger.
		await browser.run(["press", "Escape"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					"!document.querySelector('[role=\"menu\"]') && document.activeElement?.getAttribute('aria-label') === 'Settings'",
				),
			Boolean,
			"Escape to close the settings menu and return focus to its trigger",
		);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 2,
);
