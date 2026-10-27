import { expect, test } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	AGENT_PANEL_WIDTH,
	CHROME_HEIGHT,
	FIT_MARGIN,
	NAVIGATOR_WIDTH,
	REFERENCE_PANE,
	SHELL_VIEWPORT,
	STAGE,
} from "@archboard/renderer/shell-geometry";
import { readThemeColors, themeColor } from "@archboard/renderer/theme";

import {
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_BROWSER_CONDITION_TIMEOUT_MS,
} from "../support/timing.ts";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
} from "./support/agent-browser.ts";
import { PERSISTENT_NOTICE_TEXT, publishActionableNotice } from "./support/shell-notices.ts";
import type { DesktopShell, NoticeLayout, PaneLetters } from "./support/shell-contract-types.ts";
import { roleAction } from "./support/opener-settings-interaction.ts";
import { captureShellRenderMatrix } from "./support/shell-render-matrix.ts";
import {
	seedCanonicalModel,
	modelAddress,
	modelDrawn,
	editCanonicalModel,
} from "./support/canonical-page.ts";
import { initializeSource } from "./support/canonical-model.ts";
import type { RepositoryEntry } from "@archboard/workspace/repositories";
import {
	AGENT_DOCK,
	AGENT_PANEL,
	MODEL_NAME_EXPRESSION,
	COMPOSER,
	NAVIGATOR,
	NAVIGATOR_COLUMN,
	PANE_LETTERS,
	PANE_SECTIONS,
	STAGE_ROOT,
	tabLineBelowHeader,
} from "./support/shell-dom.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "apps/server/src/server.ts");
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
/** The wordmark's box, set in the display face. */
const WORDMARK = { width: 70.75, height: 21 } as const;

/** The shell's columns, measured in the page. */
const READ_DESKTOP = `(() => {
	const box = node => { if (!node) return null; const value = node.getBoundingClientRect();
		return { left: value.left, top: value.top, right: value.right, bottom: value.bottom,
			width: value.width, height: value.height }; };
	return { viewport: { width: innerWidth, height: innerHeight },
		column: box(document.querySelector('${NAVIGATOR_COLUMN}')), stages: box(document.querySelector('${STAGE_ROOT}')),
		pane: box(document.querySelector('${PANE_SECTIONS}')), dock: box(document.querySelector('${AGENT_DOCK}')),
		composer: box(document.querySelector('${COMPOSER}')), panel: box(document.querySelector('${AGENT_PANEL}')) };
})()`;

/** The lone pane's width, and the size of its window on the picture. */
const READ_PICTURE = `(() => {
	const pane = document.querySelector('${PANE_SECTIONS}');
	const picture = pane?.querySelector('[data-slot="model-diagram"]')?.getBoundingClientRect();
	return { pane: pane?.getBoundingClientRect().width ?? 0, width: picture?.width ?? -1,
		height: picture?.height ?? -1 };
})()`;

/** The pane letters, present only while two panes are open. */
const READ_PANE_LETTERS = `(() => {
	const letters = [...document.querySelectorAll('${PANE_LETTERS}')];
	return { count: letters.length, active: letters.filter(letter => letter.hasAttribute('data-active')).length };
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
	const row = nav?.querySelector('[role="treeitem"][aria-selected="true"]');
	return { entries: entries.length, doing: own, lamp: !!row?.querySelector('[data-slot="agent-activity"]') };
})()`;

test(
	"the desktop shell keeps its visual contract across the canonical render matrix",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { ownerRoot } = browserTestRoots();
		const root = join(ownerRoot, "vault");
		const vault = vaultIn(root);
		const model = await seedCanonicalModel(vault, "fixedpoint");
		initializeSource(root);
		const server = await startOwnedServer({
			serverPath,
			vault,
			env: serverTestEnvironment({
				LOG_FILE_PATH: join(ownerRoot, "server.log"),
				GIT_CONFIG_GLOBAL: "/dev/null",
				GIT_CONFIG_NOSYSTEM: "1",
			}),
		});
		resources.defer(() => server.dispose());
		registerServerBase(server.base);
		const browser = resources.use(await createAgentBrowser());
		const api = createJsonRequester(server);
		const created = await editCanonicalModel(
			api,
			vault,
			"shell-proposal",
			[
				{
					type: "edit-module",
					subject: model.modules[0]!.id,
					set: { description: "Queues incoming records" },
				},
			],
			{ proposal: { type: "create", name: "Queued ingest" }, doing: "Proposing queued ingest" },
		);
		const proposal = { id: created.target.state!, name: "Queued ingest" };
		// The agent's activity row outlives its write by a product linger
		// (CLAIM_MS.activityLinger). A restart drops it, so the shell matrix captures the
		// idle navigator without waiting that linger out.
		await server.restart();

		await browser.run(["open", `${modelAddress(server.base, model)}&stateA=${proposal.id}`]);
		const listed = await browser.eval<{ repositories: RepositoryEntry[] }>(
			`fetch('/api/repositories').then(response => response.json())`,
		);
		const repository = listed.repositories.find((entry) => entry.vault === vault)?.name;
		if (repository === undefined) throw new Error("The fixture repository was not registered.");
		expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
		await browser.run(["set", "viewport", "1920", "1080", "1"]);
		await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body),
			(state) => (state.paneCount ?? 0) === 1,
			"the shell pane to register",
			{ timeoutMs: TEST_BROWSER_CONDITION_TIMEOUT_MS },
		);
		await pollUntil(
			() => browser.eval<string | null>(MODEL_NAME_EXPRESSION),
			(board) => board === "fixedpoint",
			"fixedpoint to become the visible board",
			{ timeoutMs: TEST_BROWSER_CONDITION_TIMEOUT_MS },
		);
		await pollUntil(
			() =>
				browser.eval<string | null>(
					`document.querySelector('[data-slot="model-state-details"]')?.getAttribute('data-selected-state') ?? null`,
				),
			(state) => state === proposal.id,
			"the header to name the proposal being read",
			{ timeoutMs: TEST_BROWSER_CONDITION_TIMEOUT_MS },
		);
		await pollUntil(
			() => modelDrawn(browser.eval.bind(browser)),
			Boolean,
			"the board to be drawn in its pane",
			{ timeoutMs: TEST_BROWSER_CONDITION_TIMEOUT_MS },
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

		// The shell draws what the shared geometry says, with the conversation
		// closed: the navigator's column, the chrome row at the top of every
		// column, and a lone pane's picture beside its docked sidebar, whose width
		// less the fit margin is the width a drawing's fit is measured against.
		// The reference pane's height is the renderer's page shape, not the
		// shell's (ADR 0043).
		for (const cell of matrix.cells.filter(({ viewport }) => viewport === "desktop")) {
			const { column, header, picture } = cell.geometry;
			expect(column?.width, "navigator column width").toBe(NAVIGATOR_WIDTH);
			expect(header?.height, "chrome row height").toBe(CHROME_HEIGHT);
			expect(picture!.width - 2 * FIT_MARGIN, "the reference pane's width").toBe(
				REFERENCE_PANE.width,
			);
		}
		// Below the header's edge the docked sidebar is drawn over the open tab's line (TASK-476).
		expect(await tabLineBelowHeader(browser), "the open tab's line below the header").toBe(0);
		// With its sidebar put away, the picture has the whole stage.
		await roleAction(browser, "button", "Sidebar");
		const stage = await pollUntil(
			() => browser.eval<{ pane: number; width: number; height: number }>(READ_PICTURE),
			(picture) => picture.width === picture.pane,
			"the sidebar to give the picture the pane's whole width",
		);
		expect({ width: stage.width, height: stage.height }, "the stage").toEqual(STAGE);

		const themes = matrix.cells
			.filter(({ viewport, mode }) => viewport === "desktop" && mode === "normal")
			.map(({ themeSnapshot }) => themeSnapshot);
		expect(themes.map(({ theme }) => theme).toSorted()).toEqual(["dark", "light"]);
		for (const snapshot of themes) {
			expect(snapshot.wordmark).toBe("archboard");
			// The wordmark's own face: a fallback face sets it at another size.
			expect(Math.abs(snapshot.wordmarkSize.width - WORDMARK.width)).toBeLessThan(0.02);
			expect(Math.abs(snapshot.wordmarkSize.height - WORDMARK.height)).toBeLessThan(0.02);
			// Every column starts with one chrome row, and the rows line up.
			expect(snapshot.chromeRowsAligned).toBe(true);
			const colors = readThemeColors(`:root { --status: ${snapshot.status}; }`).light;
			expect(colors["--status"]).toBe(themeColor(snapshot.theme, "--status"));
			expect(snapshot.inkContrast).toBeGreaterThanOrEqual(4.5);
			expect(snapshot.flatSurfaces).toBe(true);
			expect(snapshot.visibleFocus).toBe(true);
			expect(snapshot.modelIdentity).toBe("fixedpoint");
			expect(snapshot.stateName).toContain(proposal.name);
			// The navigator marks the board the one focused pane reads.
			expect(snapshot.selectedRepository).toBe(repository);
			expect(snapshot.focusedPaneCount).toBe(1);
			// A live socket says nothing in the pane header.
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
						family.includes("archboard onest") && transform === "none" && weight >= 500,
				),
			).toBe(true);
			expect(snapshot.titleType).toMatchObject({ weight: 650 });
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

		const closed = await browser.eval<DesktopShell>(READ_DESKTOP);
		expect(closed.viewport).toEqual(SHELL_VIEWPORT);
		expect(closed.column).toMatchObject({ left: 0, top: 0, bottom: closed.viewport.height });
		expect(closed.stages.left).toBeGreaterThanOrEqual(closed.column.right);
		expect(closed.stages.right).toBe(closed.viewport.width);
		expect(closed.dock.left).toBeGreaterThanOrEqual(closed.column.left);
		expect(closed.dock.right).toBeLessThanOrEqual(closed.column.right);
		expect(closed.dock.bottom).toBe(closed.viewport.height);
		expect(closed.panel).toBeNull();
		expect(closed.composer).toBeNull();

		// Opening the conversation puts the panel between the navigator and the
		// panes, with the composer at its foot, and takes its width from the pane
		// centre alone.
		await roleAction(browser, "button", "Open the conversation");
		const open = await pollUntil(
			() => browser.eval<DesktopShell>(READ_DESKTOP),
			(layout) =>
				layout.panel !== null && layout.stages.width === closed.stages.width - AGENT_PANEL_WIDTH,
			"the conversation to open between the navigator and the panes",
		);
		const panel = open.panel!;
		const composer = open.composer!;
		expect(panel.width).toBe(AGENT_PANEL_WIDTH);
		expect(panel.left).toBeGreaterThanOrEqual(open.column.right);
		expect(panel.right).toBeLessThanOrEqual(open.stages.left);
		expect(composer.left).toBeGreaterThanOrEqual(panel.left - 0.5);
		expect(composer.right).toBeLessThanOrEqual(panel.right + 0.5);
		expect(composer.top).toBeGreaterThanOrEqual(panel.top - 0.5);
		expect(composer.bottom).toBeLessThanOrEqual(panel.bottom + 0.5);
		expect(open.stages.right).toBe(closed.stages.right);
		expect(open.stages.height).toBe(closed.stages.height);
		expect(open.column).toEqual(closed.column);
		expect(open.dock).toEqual(closed.dock);
		await roleAction(browser, "button", "Close the conversation");
		const reclosed = await pollUntil(
			() => browser.eval<DesktopShell>(READ_DESKTOP),
			(layout) => layout.panel === null && layout.stages.width === closed.stages.width,
			"the conversation to close",
		);
		expect(reclosed.stages).toEqual(closed.stages);
		expect(reclosed.dock).toEqual(closed.dock);

		// One pane has nothing to tell apart: no letters. Two panes each carry
		// their letter in their header, and only the focused pane's is filled.
		const readPaneLetters = () => browser.eval<PaneLetters>(READ_PANE_LETTERS);
		expect((await readPaneLetters()).count).toBe(0);
		expect((await api("/api/panes/open", { method: "POST", body: {} })).status).toBe(200);
		await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body),
			(state) => (state.paneCount ?? 0) === 2,
			"the desktop shell to mount two panes",
			{ timeoutMs: TEST_BROWSER_CONDITION_TIMEOUT_MS },
		);
		const twoPanes = await pollUntil(
			readPaneLetters,
			(letters) => letters.count === 2,
			"the two pane letters to render",
			{ timeoutMs: TEST_BROWSER_CONDITION_TIMEOUT_MS },
		);
		expect(twoPanes.active).toBe(1);
		expect(
			(await api("/api/panes/close", { method: "POST", body: { pane: "focused" } })).status,
		).toBe(200);
		await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body),
			(state) => (state.paneCount ?? 0) === 1,
			"the desktop shell to return to one pane",
			{ timeoutMs: TEST_BROWSER_CONDITION_TIMEOUT_MS },
		);
		await pollUntil(readPaneLetters, (letters) => letters.count === 0, "the pane letters to go");

		const paneHeight = () =>
			browser.eval<number>(
				`document.querySelector('${PANE_SECTIONS}').getBoundingClientRect().height`,
			);
		const restingPaneHeight = await paneHeight();
		for (const [index, doing] of activityLines.entries()) {
			await editCanonicalModel(
				api,
				vault,
				`shell-activity-${index}`,
				[
					{
						type: "add-module",
						module: { name: `Step ${index + 1}`, kind: "service", order: index + 10 },
					},
				],
				{ doing },
			);
		}
		const activity = await pollUntil(
			() => browser.eval<{ entries: number; doing: string | null; lamp: boolean }>(READ_ACTIVITY),
			(view) => view.doing === activityLines.at(-1),
			"the latest thing the agent said to show in the navigator",
		);
		expect(activity.entries).toBe(1);
		expect(activity.lamp).toBe(true);
		expect(await paneHeight()).toBe(restingPaneHeight);

		expect(await publishActionableNotice(browser)).toBe(true);
		const notice = await pollUntil(
			() =>
				browser.eval<NoticeLayout | null>(`(() => {
					const notice = [...document.querySelectorAll('[data-slot="alert"]')].find(node =>
						node.querySelector('[data-slot="alert-description"]')?.textContent?.trim() === ${JSON.stringify(PERSISTENT_NOTICE_TEXT)});
					const centre = document.querySelector('${STAGE_ROOT}')?.parentElement;
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
			{ timeoutMs: TEST_BROWSER_CONDITION_TIMEOUT_MS },
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
