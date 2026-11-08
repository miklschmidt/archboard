import { expect, test } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

/**
 * How far the conversation moves when something below its foot is scrolled into view: the
 * column under it must clip, never scroll, or it draws a second scroll bar beside the
 * conversation's own and moves the conversation under its header.
 */
const SCROLL_BELOW_THE_CONVERSATION = `(() => {
	const panel = document.querySelector('${AGENT_PANEL}');
	const before = panel.getBoundingClientRect().top;
	const below = document.createElement('div');
	below.style.cssText = 'position: absolute; top: 100%; left: 0; width: 10px; height: 300px';
	panel.querySelector('[data-slot="agent-panel-footer"]').append(below);
	below.scrollIntoView({ block: 'end' });
	const moved = panel.getBoundingClientRect().top - before;
	below.remove();
	return moved;
})()`;

/** The lone pane's width, and the size of its window on the picture. */
/** The pane letters, present only while two panes are open. */
const READ_PANE_LETTERS = `(() => {
	const letters = [...document.querySelectorAll('${PANE_LETTERS}')];
	return { count: letters.length, active: letters.filter(letter => letter.hasAttribute('data-active')).length };
})()`;

/**
 * What the left column says an agent is doing on the one model: the latest
 * doing line under "Working now", at the top of the agent's card, and whether
 * the model's row carries a mark of the agent: the lamp of its write, or the claim
 * mark while the claim that it wrote under has not yet ended.
 */
const READ_ACTIVITY = `(() => {
	const nav = document.querySelector('${NAVIGATOR}');
	const section = document.querySelector('[data-slot="navigator-column"] [data-slot="working-now"]');
	const entries = [...(section?.querySelectorAll('li') ?? [])];
	const line = entries[0]?.querySelector('[data-slot="activity-doing"]');
	const own = line ? [...line.childNodes].filter(child => child.nodeType === 3)
		.map(child => child.textContent).join('').trim() : null;
	const row = nav?.querySelector('[role="treeitem"][aria-selected="true"]');
	return { entries: entries.length, doing: own, lamp: !!row?.querySelector('[data-slot="agent-activity"], [data-slot="claim-mark"]') };
})()`;

test(
	"the desktop shell stays usable and accessible across the canonical render matrix",
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
			(shown) => shown === "fixedpoint",
			"fixedpoint to become the visible model",
			{ timeoutMs: TEST_BROWSER_CONDITION_TIMEOUT_MS },
		);
		await pollUntil(
			() =>
				browser.eval<string | null>(
					`document.querySelector('[data-slot="model-reading-selector"]')?.getAttribute('title') ?? null`,
				),
			(state) => state?.includes(proposal.name) === true,
			"the header to name the proposal being read",
			{ timeoutMs: TEST_BROWSER_CONDITION_TIMEOUT_MS },
		);
		await pollUntil(
			() => modelDrawn(browser.eval.bind(browser)),
			Boolean,
			"the model to be drawn in its pane",
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

		const themes = matrix.cells
			.filter(({ viewport, mode }) => viewport === "desktop" && mode === "normal")
			.map(({ themeSnapshot }) => themeSnapshot);
		expect(themes.map(({ theme }) => theme).toSorted()).toEqual(["dark", "light"]);
		for (const snapshot of themes) {
			expect(snapshot.wordmark).toBe("archboard");
			const colors = readThemeColors(`:root { --status: ${snapshot.status}; }`).light;
			expect(colors["--status"]).toBe(themeColor(snapshot.theme, "--status"));
			expect(snapshot.inkContrast).toBeGreaterThanOrEqual(4.5);
			expect(snapshot.visibleFocus).toBe(true);
			expect(snapshot.modelIdentity).toBe("fixedpoint");
			expect(snapshot.stateName).toContain(proposal.name);
			// The navigator marks the model the one focused pane reads.
			expect(snapshot.selectedRepository).toBe(repository);
			expect(snapshot.focusedPaneCount).toBe(1);
			// A live socket says nothing in the pane header.
			expect(snapshot.connectionTrouble).toBe(0);
			// The shell works offline: every face it declares loads, from its own server.
			expect(snapshot.fontsLoaded).toBe(true);
			expect(snapshot.fontResources.length).toBeGreaterThan(0);
			expect(
				snapshot.fontResources.every((url) => new URL(url).origin === new URL(server.base).origin),
			).toBe(true);
			expect(
				snapshot.actionTargets.every(
					({ width, height }) => width >= MIN_TARGET && height >= MIN_TARGET,
				),
			).toBe(true);
			expect(snapshot.presentTarget.height).toBeGreaterThanOrEqual(MIN_TARGET);
		}
		expect(themes[0]?.background).not.toBe(themes[1]?.background);

		const closed = await browser.eval<DesktopShell>(READ_DESKTOP);
		expect(closed.panel).toBeNull();
		expect(closed.composer).toBeNull();

		// The conversation opens with its composer, and the page does not scroll under it.
		await roleAction(browser, "button", "Open the conversation");
		await pollUntil(
			() => browser.eval<DesktopShell>(READ_DESKTOP),
			(layout) => layout.panel !== null && layout.composer !== null,
			"the conversation to open with its composer",
		);
		expect(await browser.eval<number>(SCROLL_BELOW_THE_CONVERSATION)).toBe(0);
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
		const closing = await api<{ closed: { position: number } }>("/api/panes/close", {
			method: "POST",
			body: { pane: "focused" },
		});
		expect(closing.status).toBe(200);
		// The command reads the closed pane as it reads an opened one: with its position.
		expect(closing.body.closed.position).toBeGreaterThan(0);
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
					const text = notice?.querySelector('[data-slot="alert-description"]');
					const action = notice?.querySelector('[data-slot="alert-action"] button');
					const dismiss = notice?.querySelector('button[aria-label^="Dismiss notice"]');
					if (!notice || !text || !action || !dismiss) return null;
					// The toast slides in with a transform, which a box measured mid-flight carries.
					if ((notice.closest('[data-sonner-toast]') ?? notice).getAnimations({ subtree: true }).some(animation => animation.playState === 'running')) return null;
					return { actionHeight: action.getBoundingClientRect().height,
						dismissHeight: dismiss.getBoundingClientRect().height,
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
		expect(notice.actionHeight).toBeGreaterThanOrEqual(MIN_TARGET);
		expect(notice.dismissHeight).toBeGreaterThanOrEqual(MIN_TARGET);

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
