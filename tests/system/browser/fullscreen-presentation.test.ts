import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Rect } from "../../../src/runtime/engine/panes.ts";
import { PANE_SETTLE_CAP_MS } from "../../../src/shared/timing/timing.ts";
import { TEST_BROWSER_COMMAND_TIMEOUT_MS } from "../support/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { evidenceRoot } from "./support/shell-render-matrix.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import {
	PERSISTENT_NOTICE_TEXT,
	paneAppAction,
	paneIdentities,
	paneRects,
	publishActionableNotice,
	readExitButton,
	readPageView,
	readPresentationAlert,
	readPresentedPane,
	readShellNotice,
	seedBoard,
	waitForPanes,
	type BoardBody,
} from "./support/fullscreen-presentation.ts";
import {
	PANE_SECTIONS,
	PANE_TABS,
	PRESENTATION_BAR,
	STAGE_ROOT,
	dismissNotice,
	paneSection,
	shellNotices,
	stageIsFullscreen,
} from "./support/shell-dom.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");
const CURRENT = "current-board";
const PROPOSAL = "proposal";
const MIN_TARGET = 24;
const PANE_RECTS = `[...document.querySelectorAll('${PANE_SECTIONS}')].map(node => { const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; })`;

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
		await browser.run(["set", "viewport", "1920", "1080"]);
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
		await browser.run(["click", `${paneSection("Pane B")} .excalidraw`]);
		expect(await paneAppAction(browser, "Pane B", "propose", "select")).toBe(true);
		await browser.run(["click", `${paneSection("Pane A")} .excalidraw`]);
		expect(await paneAppAction(browser, "Pane A", "current", "select")).toBe(true);
		await waitForPanes(
			request,
			(report) =>
				report.panes.find((pane) => pane.clientId === currentPane.clientId)?.selection
					.elementIds[0] === "current" &&
				report.panes.find((pane) => pane.board === PROPOSAL)?.selection.elementIds[0] === "propose",
			"both browser selections to be reported",
		);

		const info = await request<BoardBody>(`/api/boards/info?board=${CURRENT}`);
		writeFileSync(info.body.file!, readFileSync(info.body.file!, "utf8") + "\n");
		const elsewhere = await pollUntil(
			() => shellNotices(browser),
			(notices) => notices.some((notice) => /written elsewhere/.test(notice.title)),
			"the pane to notice the foreign note",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		const elsewhereNotice = elsewhere.find((notice) => /written elsewhere/.test(notice.title))!;
		expect(elsewhereNotice.actions).toContain("Choose");
		await pollUntil(
			() => browser.eval<boolean>("document.querySelector('[role=\"alertdialog\"]') !== null"),
			Boolean,
			"the note-written-elsewhere dialog to open",
		);
		await browser.run(["find", "role", "button", "click", "--name", "Decide later", "--exact"]);
		await pollUntil(
			() => browser.eval<boolean>("document.querySelector('[role=\"alertdialog\"]') === null"),
			Boolean,
			"the note-written-elsewhere dialog to close",
		);
		const headerMark = await browser.eval<string | null>(
			`[...document.querySelectorAll('header span')].map(node => node.textContent.trim()).find(text => text === 'Note written elsewhere') ?? null`,
		);
		expect(headerMark).toBe("Note written elsewhere");
		expect(await paneAppAction(browser, "Pane A", "current", "move")).toBe(true);
		const heldBefore = await pollUntil(
			async () => (await request<BoardBody>(`/api/elements?board=${CURRENT}`)).body.held,
			(held) => held?.board === CURRENT && held.fromScreen,
			"the actual browser edit to create a held board",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		await pollUntil(
			() => browser.eval<boolean>("document.querySelector('[role=\"alertdialog\"]') !== null"),
			Boolean,
			"the board-stopped-saving dialog to open",
		);
		await browser.run(["find", "role", "button", "click", "--name", "Decide later", "--exact"]);
		await pollUntil(
			() => browser.eval<boolean>("document.querySelector('[role=\"alertdialog\"]') === null"),
			Boolean,
			"the board-stopped-saving dialog to close",
		);

		expect(await publishActionableNotice(browser)).toBe(true);
		await pollUntil(
			() => readShellNotice(browser),
			(view) =>
				view.text === PERSISTENT_NOTICE_TEXT && view.action === "Opener settings" && view.visible,
			"the actionable notice to render in the workspace",
		);
		const beforeDomRects = await browser.eval<Rect[]>(`(() => {
			window.__task139PaneNodes = [...document.querySelectorAll('${PANE_SECTIONS}')];
			return ${PANE_RECTS};
		})()`);
		const before = await waitForPanes(
			request,
			(report) =>
				report.paneCount === 2 &&
				report.focused === currentPane.paneId &&
				report.panes.every((pane) =>
					beforeDomRects.some((rect) => rect.y === pane.rect.y && rect.height === pane.rect.height),
				),
			"the focused pane and its published rectangles to settle",
		);
		const beforeRects = paneRects(before);
		const beforeNotices = (await shellNotices(browser)).map((notice) => notice.title);
		const beforeIdentities = paneIdentities(before);
		const evidence = evidenceRoot();
		await browser.run(["screenshot", join(evidence, "two-panes-light.png")]);

		await browser.run(["click", 'button[aria-label="Present pane A fullscreen"]']);
		const entered = await pollUntil(
			() => readPageView(browser),
			(view) => view.fullscreen && view.barVisible && view.chromeHidden,
			"Pane A to own the fullscreen display",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		expect(entered.controlDisplays.length).toBeGreaterThan(0);
		expect(entered.controlDisplays).toEqual(
			entered.controlDisplays.map((entry) => `${entry.split(":")[0]}:none`),
		);
		expect(entered.focusInside).toBe(true);
		expect(entered.barHeight).toBeGreaterThan(0);
		expect(entered.barHeight).toBeLessThan(150);
		expect(entered.sameNodes).toBe(true);
		await browser.run(["screenshot", join(evidence, "fullscreen-pane-a-light.png")]);
		const exitButton = await readExitButton(browser);
		expect(exitButton.visible).toBe(true);
		expect(exitButton.height).toBeGreaterThanOrEqual(MIN_TARGET);
		expect(exitButton.text).toBe("Exit presentation");
		expect(entered.panes.filter((pane) => pane.rect.width > 0)).toHaveLength(1);
		expect(entered.panes.find((pane) => pane.label === "Pane B")).toMatchObject({
			hidden: true,
			rect: { x: 0, y: 0, width: 0, height: 0 },
		});
		expect(await readShellNotice(browser)).toEqual({
			text: PERSISTENT_NOTICE_TEXT,
			action: "Opener settings",
			visible: false,
		});

		// Transfer: leave with Escape (focus sits on the exit control), then focus
		// the other pane by its tab so no selection changes, and present it.
		await browser.run(["press", "Escape"]);
		await pollUntil(
			() => stageIsFullscreen(browser),
			(value) => !value,
			"Escape to leave",
		);
		await browser.run(["click", `${PANE_TABS}:nth-child(2)`]);
		await waitForPanes(
			request,
			(report) => report.focused === report.panes.find((pane) => pane.board === PROPOSAL)?.paneId,
			"Pane B to take focus",
		);
		await browser.run(["click", 'button[aria-label="Present pane B fullscreen"]']);
		const during = await waitForPanes(
			request,
			(report) =>
				report.paneCount === 2 &&
				report.focused === report.panes.find((pane) => pane.board === PROPOSAL)?.paneId &&
				report.panes.find((pane) => pane.board === CURRENT)?.rect.width === 0,
			"presentation to transfer to Pane B and update existing focus",
		);
		expect(paneIdentities(during)).toEqual(beforeIdentities);
		const presentedBar = await readPageView(browser);
		expect(during.panes.find((pane) => pane.board === PROPOSAL)?.rect).toEqual({
			x: 0,
			y: presentedBar.barHeight,
			width: 1920,
			height: 1080 - presentedBar.barHeight,
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
		await browser.run([
			"find",
			"role",
			"button",
			"click",
			"--name",
			"Exit presentation",
			"--exact",
		]);
		const exitRefusal = await pollUntil(
			async () => ({
				alert: await readPresentationAlert(browser),
				fullscreen: await stageIsFullscreen(browser),
				current: await readPresentedPane(browser),
			}),
			(view) => /exit blocked for test/.test(view.alert ?? ""),
			"the refused exit to remain visible in the presentation",
		);
		expect(exitRefusal).toMatchObject({ fullscreen: true, current: "B" });
		await browser.eval<boolean>(
			`(() => { document.exitFullscreen = window.__task139Exit; return true; })()`,
		);
		expect(await readExitButton(browser)).toMatchObject({
			visible: true,
			text: "Exit presentation",
		});
		await browser.run([
			"find",
			"role",
			"button",
			"click",
			"--name",
			"Exit presentation",
			"--exact",
		]);
		const restored = await waitForPanes(
			request,
			(report) => report.paneCount === 2 && report.panes.every((pane) => pane.rect.width > 0),
			"both panes to return to the workspace",
		);
		expect({
			rects: paneRects(restored),
			notices: (await shellNotices(browser)).map((notice) => notice.title),
		}).toEqual({ rects: beforeRects, notices: beforeNotices });
		expect(restored.focused).toBe(
			restored.panes.find((pane) => pane.board === PROPOSAL)?.paneId ?? null,
		);
		expect(paneIdentities(restored)).toEqual(beforeIdentities);
		expect(
			await browser.eval<Rect[]>(`(() => {
			if (document.fullscreenElement || document.querySelector('${PRESENTATION_BAR}')) return [];
			const nodes = [...document.querySelectorAll('${PANE_SECTIONS}')];
			if (!nodes.every((node, index) => node === window.__task139PaneNodes[index])) return [];
			return ${PANE_RECTS};
			})()`),
		).toEqual(beforeDomRects);
		expect(await readShellNotice(browser)).toEqual({
			text: PERSISTENT_NOTICE_TEXT,
			action: "Opener settings",
			visible: true,
		});

		await browser.run(["click", 'button[aria-label="Present pane B fullscreen"]']);
		await pollUntil(() => stageIsFullscreen(browser), Boolean, "presentation to re-enter");
		await browser.run(["press", "Escape"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					`document.fullscreenElement === null && document.querySelector('${PRESENTATION_BAR}') === null`,
				),
			Boolean,
			"real Escape to restore the shell",
		);
		expect(
			await browser.eval<boolean>(`(() => {
			const stage = document.querySelector('${STAGE_ROOT}');
			window.__task139Request = stage.requestFullscreen.bind(stage);
			stage.requestFullscreen = () => Promise.reject(new Error('entry blocked for test'));
			return true;
		})()`),
		).toBe(true);
		await browser.run(["click", 'button[aria-label="Present pane B fullscreen"]']);
		const entryRefusal = await pollUntil(
			async () => ({
				notices: await shellNotices(browser),
				fullscreen: await stageIsFullscreen(browser),
			}),
			(view) => view.notices.some((notice) => /entry blocked for test/.test(notice.description)),
			"the refused entry to stay visible in the normal shell",
		);
		expect(entryRefusal.fullscreen).toBe(false);
		expect(await dismissNotice(browser, "Presentation")).toBe(true);
		const preservedNotice = await pollUntil(
			() => readShellNotice(browser),
			(view) => view.text === PERSISTENT_NOTICE_TEXT && view.action === "Opener settings",
			"the refused entry notice to reveal the preserved actionable notice",
		);
		expect(preservedNotice.visible).toBe(true);
		expect(await dismissNotice(browser, "Code target")).toBe(true);
		await pollUntil(
			() => readShellNotice(browser),
			(view) => view.text === null,
			"the ordinary actionable notice to dismiss",
		);
		await browser.eval<boolean>(`(() => {
			document.querySelector('${STAGE_ROOT}').requestFullscreen = window.__task139Request;
			return true;
		})()`);

		await browser.run(["click", 'button[aria-label="Present pane B fullscreen"]']);
		await pollUntil(
			() => stageIsFullscreen(browser),
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
			async () => ({
				current: await readPresentedPane(browser),
				fullscreen: await stageIsFullscreen(browser),
				panes: await browser.eval<number>(`document.querySelectorAll('${PANE_SECTIONS}').length`),
				visible: await browser.eval<number>(
					`[...document.querySelectorAll('${PANE_SECTIONS}')].filter(node => !node.hidden).length`,
				),
			}),
			(view) => view.panes === 1 && view.current === "A" && view.visible === 1,
			"external close to transfer presentation to the survivor",
		);
		expect(survivor.fullscreen).toBe(true);
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
		expect(await readExitButton(browser)).toMatchObject({
			visible: true,
			text: "Exit presentation",
		});
		await browser.run([
			"find",
			"role",
			"button",
			"click",
			"--name",
			"Exit presentation",
			"--exact",
		]);
		await pollUntil(
			async () => ({
				alert: await readPresentationAlert(browser),
				fullscreen: await stageIsFullscreen(browser),
				paneId: await readPresentedPane(browser),
			}),
			(view) => !view.fullscreen && view.paneId === null && view.alert === null,
			"the survivor to leave presentation",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);

		expect((await request("/api/panes/open", { method: "POST", body: {} })).status).toBe(200);
		const pendingSplit = await waitForPanes(
			request,
			(report) => report.paneCount === 2,
			"a second pane for pending-entry removal",
		);
		const pendingTarget = pendingSplit.panes.find(
			(pane) => pane.clientId !== currentPane.clientId,
		)!;
		await browser.run(["click", `${PANE_TABS}:nth-child(2)`]);
		await waitForPanes(
			request,
			(report) => report.focused === pendingTarget.paneId,
			"the pending-entry target to focus",
		);
		await browser.eval<boolean>(`(() => {
			const stage = document.querySelector('${STAGE_ROOT}');
			const nativeRequest = stage.requestFullscreen.bind(stage);
			const resolves = [];
			stage.requestFullscreen = () => new Promise(resolve => resolves.push(resolve));
			const trigger = document.createElement('button');
			trigger.id = 'task139-complete-entry';
			trigger.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647';
			trigger.onclick = () => void nativeRequest().then(() =>
				resolves.splice(0).forEach(resolve => resolve()));
			document.body.append(trigger);
			return true;
		})()`);
		await browser.run(["click", 'button[aria-label="Present pane B fullscreen"]']);
		expect(
			(await request("/api/panes/close", { method: "POST", body: { pane: "focused" } })).status,
		).toBe(200);
		const pendingSurvivor = await waitForPanes(
			request,
			(report) => report.paneCount === 1 && report.focused === report.panes[0]?.paneId,
			"the pending-entry survivor to remain focused",
		);
		expect(paneIdentities(pendingSurvivor)).toEqual(
			beforeIdentities.filter((pane) => pane.clientId === currentPane.clientId),
		);
		await browser.eval<boolean>(
			"(document.getElementById('task139-complete-entry').click(), true)",
		);
		await pollUntil(
			() =>
				browser.eval<boolean>(`document.fullscreenElement === null &&
				document.querySelector('${PRESENTATION_BAR}') === null &&
				[...document.querySelectorAll('${PANE_SECTIONS}')].every(node => !node.hidden) &&
				document.querySelector('${PANE_SECTIONS}').getBoundingClientRect().width > 0`),
			Boolean,
			"pending entry to relinquish fullscreen without hiding the survivor",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		expect((await request<BoardBody>(`/api/elements?board=${CURRENT}`)).body.held).toEqual(
			heldBefore,
		);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
);
