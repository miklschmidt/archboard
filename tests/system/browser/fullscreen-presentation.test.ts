import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Rect } from "../../../src/runtime/engine/panes.ts";
import {
	PANE_SETTLE_CAP_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
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
	readShellNotice,
	seedBoard,
	waitForPanes,
} from "./support/fullscreen-presentation.ts";

interface HeldBoard {
	board: string;
	fromScreen: boolean;
	writes: number;
}
interface BoardBody {
	elements?: Array<{ id: string }>;
	file?: string;
	held?: HeldBoard;
}

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");
const CURRENT = "current-board";
const PROPOSAL = "proposal";

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
		await browser.run(["set", "viewport", "1440", "900"]);
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
		await browser.run(["click", `.pane[aria-label="Pane A"] .excalidraw`]);
		expect(await paneAppAction(browser, "Pane A", "current", "select")).toBe(true);
		await waitForPanes(
			request,
			(report) =>
				report.panes.find((pane) => pane.clientId === currentPane.clientId)?.selection
					.elementIds[0] === "current",
			"the browser selection to be reported",
		);

		const info = await request<BoardBody>(`/api/boards/info?board=${CURRENT}`);
		writeFileSync(info.body.file!, readFileSync(info.body.file!, "utf8") + "\n");
		await pollUntil(
			() =>
				browser.eval<string | null>(
					`document.querySelector('.chip-elsewhere')?.textContent ?? null`,
				),
			(text) => /note changed on disk/.test(text ?? ""),
			"the pane to notice the foreign note",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		expect(await paneAppAction(browser, "Pane A", "current", "move")).toBe(true);
		const heldBefore = await pollUntil(
			async () => (await request<BoardBody>(`/api/elements?board=${CURRENT}`)).body.held,
			(held) => held?.board === CURRENT && held.fromScreen,
			"the actual browser edit to create a held board",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);

		const before = await waitForPanes(
			request,
			(report) => report.paneCount === 2 && report.focused === currentPane.paneId,
			"the focused pane and held selection to settle",
		);
		const beforeRects = paneRects(before);
		const beforeIdentities = paneIdentities(before);
		const beforeDomRects = await browser.eval<Rect[]>(`(() => {
		window.__task139PaneNodes = [...document.querySelectorAll('.pane')];
		window.__task139PaneRects = window.__task139PaneNodes.map(node => {
			const rect = node.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		});
			return window.__task139PaneRects;
		})()`);
		expect(await publishActionableNotice(browser)).toBe(true);
		expect(await readShellNotice(browser)).toEqual({
			text: PERSISTENT_NOTICE_TEXT,
			action: "Opener settings",
			visible: true,
		});

		await browser.run(["click", 'button[aria-label="Present Pane A fullscreen"]']);
		const entered = await pollUntil(
			() => readPageView(browser),
			(view) => view.fullscreen && view.dockVisible && view.chromeHidden,
			"Pane A to own the fullscreen display",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		expect(entered.controlDisplays.length).toBeGreaterThan(0);
		expect(entered.controlDisplays).toEqual(entered.controlDisplays.map(() => "none"));
		expect(entered.dockFocused).toBe(true);
		expect(entered.sameNodes).toBe(true);
		expect(entered.panes.filter((pane) => pane.rect.width > 0)).toHaveLength(1);
		expect(entered.panes.find((pane) => pane.label === "Pane B")).toMatchObject({
			hidden: true,
			inert: true,
			rect: { x: 0, y: 0, width: 0, height: 0 },
		});
		expect(await readShellNotice(browser)).toEqual({
			text: PERSISTENT_NOTICE_TEXT,
			action: "Opener settings",
			visible: false,
		});

		await browser.run(["click", 'button[aria-label="Present Pane B"]']);
		const during = await waitForPanes(
			request,
			(report) =>
				report.paneCount === 2 &&
				report.focused === report.panes.find((pane) => pane.board === PROPOSAL)?.paneId &&
				report.panes.find((pane) => pane.board === CURRENT)?.rect.width === 0,
			"presentation to transfer to Pane B and update existing focus",
		);
		expect(paneIdentities(during)).toEqual(beforeIdentities);
		expect(during.panes.find((pane) => pane.board === PROPOSAL)?.rect).toEqual({
			x: 0,
			y: 0,
			width: 1440,
			height: 900,
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
		await browser.run(["click", ".presentation-exit"]);
		const exitRefusal = await pollUntil(
			() =>
				browser.eval<{ alert: string | null; fullscreen: boolean; current: string | null }>(
					`(() => ({
					alert: document.querySelector('.presentation-dock [role="alert"]')?.textContent ?? null,
					fullscreen: document.fullscreenElement === document.querySelector('.shell'),
					current: document.querySelector('.presentation-current')?.getAttribute('aria-label') ?? null,
				}))()`,
				),
			(view) => /exit blocked for test/.test(view.alert ?? ""),
			"the refused exit to remain visible in the dock",
		);
		expect(exitRefusal).toMatchObject({ fullscreen: true, current: "Pane B" });
		await browser.eval<boolean>(
			`(() => { document.exitFullscreen = window.__task139Exit; return true; })()`,
		);
		expect(await readExitButton(browser)).toMatchObject({
			display: "flex",
			height: 44,
			text: "Exit",
		});
		await browser.run(["click", ".presentation-exit"]);
		const restored = await waitForPanes(
			request,
			(report) =>
				report.paneCount === 2 && JSON.stringify(paneRects(report)) === JSON.stringify(beforeRects),
			"the exact pane rectangles to return",
		);
		expect(restored.focused).toBe(
			restored.panes.find((pane) => pane.board === PROPOSAL)?.paneId ?? null,
		);
		expect(paneIdentities(restored)).toEqual(beforeIdentities);
		expect(
			await browser.eval<Rect[]>(`(() => {
			if (document.fullscreenElement || document.querySelector('.presentation-dock')) return [];
			const nodes = [...document.querySelectorAll('.pane')];
			if (!nodes.every((node, index) => node === window.__task139PaneNodes[index])) return [];
			return nodes.map(node => {
				const rect = node.getBoundingClientRect();
				return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
			});
			})()`),
		).toEqual(beforeDomRects);
		expect(await readShellNotice(browser)).toEqual({
			text: PERSISTENT_NOTICE_TEXT,
			action: "Opener settings",
			visible: true,
		});

		await browser.run(["click", 'button[aria-label="Present Pane B fullscreen"]']);
		await pollUntil(
			() =>
				browser.eval<boolean>("document.fullscreenElement === document.querySelector('.shell')"),
			Boolean,
			"presentation to re-enter",
		);
		await browser.run(["press", "Escape"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(
					"document.fullscreenElement === null && document.querySelector('.presentation-dock') === null",
				),
			Boolean,
			"real Escape to restore the shell",
		);
		expect(
			await browser.eval<boolean>(`(() => {
			const shell = document.querySelector('.shell');
			window.__task139Request = shell.requestFullscreen.bind(shell);
			shell.requestFullscreen = () => Promise.reject(new Error('entry blocked for test'));
			return true;
		})()`),
		).toBe(true);
		await browser.run(["click", 'button[aria-label="Present Pane B fullscreen"]']);
		const entryRefusal = await pollUntil(
			() =>
				browser.eval<{ alert: string | null; fullscreen: boolean }>(`(() => ({
				alert: document.querySelector('.notice-shell[role="alert"]')?.textContent ?? null,
				fullscreen: document.fullscreenElement !== null,
			}))()`),
			(view) => /entry blocked for test/.test(view.alert ?? ""),
			"the refused entry to stay visible in the normal shell",
		);
		expect(entryRefusal.fullscreen).toBe(false);
		await browser.run(["click", ".notice-dismiss"]);
		const preservedNotice = await pollUntil(
			() => readShellNotice(browser),
			(view) => view.text === PERSISTENT_NOTICE_TEXT && view.action === "Opener settings",
			"the refused entry notice to reveal the preserved actionable notice",
		);
		expect(preservedNotice.visible).toBe(true);
		await browser.run(["click", ".notice-dismiss"]);
		await pollUntil(
			() => browser.eval<boolean>("document.querySelector('.notice-shell') === null"),
			Boolean,
			"the ordinary actionable notice to dismiss",
		);
		await browser.eval<boolean>(`(() => {
		document.querySelector('.shell').requestFullscreen = window.__task139Request;
		return true;
	})()`);

		await browser.run(["click", 'button[aria-label="Present Pane B fullscreen"]']);
		await pollUntil(
			() =>
				browser.eval<boolean>("document.fullscreenElement === document.querySelector('.shell')"),
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
			() =>
				browser.eval<{ alert: string | null; current: string | null; panes: number }>(`(() => ({
				alert: document.querySelector('.presentation-dock [role="alert"]')?.textContent ?? null,
				current: document.querySelector('.presentation-current')?.getAttribute('aria-label') ?? null,
				panes: document.querySelectorAll('.pane').length,
			}))()`),
			(view) => view.panes === 1 && /close exit blocked/.test(view.alert ?? ""),
			"external close to transfer presentation before the refused exit",
		);
		expect(survivor.current).toBe("Pane A");
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
			display: "flex",
			height: 44,
			text: "Exit",
		});
		await browser.run(["click", ".presentation-exit"]);
		await pollUntil(
			() =>
				browser.eval<{ alert: string | null; fullscreen: boolean; paneId: string | null }>(
					`(() => ({
					alert: document.querySelector('.presentation-dock [role="alert"]')?.textContent ?? null,
					fullscreen: document.fullscreenElement !== null,
					paneId: document.querySelector('.presentation-current')?.getAttribute('aria-label') ?? null,
				}))()`,
				),
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
		await browser.run(["click", `.pane[aria-label="Pane B"] .excalidraw`]);
		await waitForPanes(
			request,
			(report) => report.focused === pendingTarget.paneId,
			"the pending-entry target to focus",
		);
		await browser.eval<boolean>(`(() => {
			const shell = document.querySelector('.shell');
			const nativeRequest = shell.requestFullscreen.bind(shell);
			const resolves = [];
			shell.requestFullscreen = () => new Promise(resolve => resolves.push(resolve));
			const trigger = document.createElement('button');
			trigger.id = 'task139-complete-entry';
			trigger.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647';
			trigger.onclick = () => void nativeRequest().then(() =>
				resolves.splice(0).forEach(resolve => resolve()));
			document.body.append(trigger);
			return true;
		})()`);
		await browser.run(["click", 'button[aria-label="Present Pane B fullscreen"]']);
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
		await browser.run(["click", "#task139-complete-entry"]);
		await pollUntil(
			() =>
				browser.eval<boolean>(`document.fullscreenElement === null &&
				document.querySelector('.presentation-dock') === null &&
				document.querySelectorAll('.presentation-current, .presentation-hidden').length === 0 &&
				document.querySelector('.pane').getBoundingClientRect().width > 0`),
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
