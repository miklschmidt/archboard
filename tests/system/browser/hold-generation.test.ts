import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import {
	LOCK_RENEW_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_PANE_DEBOUNCE_MARGIN_MS,
} from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { LIVE_SESSION_BOARD, LIVE_SESSION_SEED } from "./fixtures/live-session-scene.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { EXCALIDRAW_APP_EXPRESSION } from "./support/page-scene.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const BOARD = LIVE_SESSION_BOARD;

interface PaneList {
	paneCount: number;
	panes: Array<{ board: string; clientId: string }>;
}

interface ElementsBody {
	elements: ExcalidrawElement[];
}

interface HoldRaceState {
	pending: string[];
	started: string[];
}

interface ReportCounts {
	done: number;
	holds: number;
	sent: number;
}

async function openSeededBoard(resources: AsyncDisposableStack): Promise<{
	browser: AgentBrowserSession;
	paneClient: string;
	request: ReturnType<typeof createJsonRequester>;
}> {
	const { ownerRoot } = browserTestRoots();
	const root = mkdtempSync(join(ownerRoot, "hold-generation-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const canvas = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault: join(root, "vault"),
		env: canvasTestEnvironment({ LOG_FILE_PATH: join(root, "canvas.log") }),
	});
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);

	expect(
		(await request("/api/boards/new", { method: "POST", body: { board: BOARD, level: "service" } }))
			.status,
	).toBe(200);
	const seeded = await request<ElementsBody>(`/api/elements/changes?board=${BOARD}`, {
		method: "POST",
		body: { origin: "agent", upserts: LIVE_SESSION_SEED },
	});
	expect(seeded.status).toBe(200);
	expect(seeded.body.elements).toHaveLength(8);
	expect(
		(await request("/api/boards/save", { method: "POST", body: { board: BOARD } })).status,
	).toBe(200);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", canvas.base]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/Headless/i);
	const panes = await pollUntil(
		async () => (await request<PaneList>("/api/panes")).body,
		(value) => value.paneCount === 1 && typeof value.panes[0]?.clientId === "string",
		"the real browser to register one pane",
	);
	const paneClient = panes.panes[0]!.clientId;
	expect(
		(
			await request("/api/boards/open", {
				method: "POST",
				body: { board: BOARD, pane: paneClient, reload: true },
			})
		).status,
	).toBe(200);
	await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
				const app = ${EXCALIDRAW_APP_EXPRESSION};
				return Boolean(app?.scene.getElementsIncludingDeleted().some(element => element.id === "auth"));
			})()`),
		Boolean,
		"the pane to render the seeded board",
	);
	await browser.run(["click", ".excalidraw"]);
	return { browser, paneClient, request };
}

const installHoldRecorder = (browser: AgentBrowserSession): Promise<unknown> =>
	browser.eval(`(() => {
		window.__holdGeneration = {
			reports: { sent: 0, done: 0, holds: 0 },
			remaining: 0,
			pending: [],
			started: [],
		};
		window.__delayHolds = count => { window.__holdGeneration.remaining = count; };
		window.__releaseDelayedHold = index => {
			const [entry] = window.__holdGeneration.pending.splice(index, 1);
			if (!entry) return { error: "no delayed hold at " + index };
			entry.release();
			return { board: entry.board, pending: window.__holdGeneration.pending.length };
		};
		const original = window.fetch;
		window.fetch = function(input, init) {
			const url = typeof input === "string" ? input : input?.url ?? "";
			const method = init?.method ?? input?.method ?? "GET";
			const report = method === "POST" && url.includes("/api/elements/changes");
			const hold = method === "POST" && url.includes("/api/boards/hold")
				&& !url.includes("/api/boards/hold/release");
			if (report) window.__holdGeneration.reports.sent += 1;
			if (hold) window.__holdGeneration.reports.holds += 1;
			const answer = original.apply(this, arguments);
			if (hold && window.__holdGeneration.remaining > 0) {
				window.__holdGeneration.remaining -= 1;
				const board = new URL(url, location.href).searchParams.get("board");
				window.__holdGeneration.started.push(board);
				return new Promise((resolve, reject) => {
					window.__holdGeneration.pending.push({
						board,
						release: () => answer.then(resolve, reject),
					});
				});
			}
			if (!report) return answer;
			const delay = window.__delayNextReport ?? 0;
			window.__delayNextReport = 0;
			return answer
				.then(response => delay
					? new Promise(resolve => setTimeout(() => resolve(response), delay))
					: response)
				.then(response => {
					window.__holdGeneration.reports.done += 1;
					return response;
				});
		};
		return { installed: true };
	})()`);

const move = (browser: AgentBrowserSession, id: string, dx: number): Promise<{ ok?: boolean }> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		if (!app) return { error: "no Excalidraw app instance" };
		const elements = app.scene.getElementsIncludingDeleted().map(element =>
			element.id === ${JSON.stringify(id)} ? { ...element, x: element.x + ${dx} } : element);
		app.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
		return { ok: true };
	})()`);

const raceState = (browser: AgentBrowserSession): Promise<HoldRaceState> =>
	browser.eval(`(() => ({
		pending: window.__holdGeneration.pending.map(entry => entry.board),
		started: [...window.__holdGeneration.started],
	}))()`);

const counts = (browser: AgentBrowserSession): Promise<ReportCounts> =>
	browser.eval("({ ...window.__holdGeneration.reports })");

test(
	"a late A1 hold cannot clear or retry over the newer A2 generation",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { browser, paneClient, request } = await openSeededBoard(resources);
		await installHoldRecorder(browser);
		const beforeRace = await counts(browser);
		await browser.eval("window.__delayHolds(2)");
		expect((await move(browser, "auth", 3)).ok).toBe(true);
		const first = await pollUntil(
			() => raceState(browser),
			(value) => value.pending.length === 1,
			"the first A hold to remain delayed",
		);
		expect(first.pending).toEqual([BOARD]);

		expect(
			(
				await request("/api/boards/open", {
					method: "POST",
					body: { board: "scratch", pane: paneClient },
				})
			).status,
		).toBe(200);
		expect(
			(
				await request("/api/boards/open", {
					method: "POST",
					body: { board: BOARD, pane: paneClient },
				})
			).status,
		).toBe(200);
		const returned = await pollUntil(
			async () => ({
				pane: (await request<PaneList>("/api/panes")).body.panes[0],
				hasAuth: await browser.eval<boolean>(`(() => {
					const app = ${EXCALIDRAW_APP_EXPRESSION};
					return Boolean(app?.scene.getElementsIncludingDeleted().some(element => element.id === "auth"));
				})()`),
			}),
			(value) => value.pane?.board === BOARD && value.hasAuth,
			"the pane to complete the A to scratch to A switch",
		);
		expect(returned.pane?.board).toBe(BOARD);
		expect(returned.hasAuth).toBe(true);
		await browser.run(["click", ".excalidraw"]);

		const beforeA2 = (
			await request<ElementsBody>(`/api/elements?board=${BOARD}`)
		).body.elements.find((element) => element.id === "auth");
		await browser.eval(`window.__delayNextReport = ${LOCK_RENEW_MS * 3}`);
		expect((await move(browser, "auth", 13)).ok).toBe(true);
		const second = await pollUntil(
			() => raceState(browser),
			(value) => value.pending.length === 2,
			"the distinct second A hold to remain delayed",
		);
		expect(second.pending).toEqual([BOARD, BOARD]);

		const releasedA1 = await browser.eval<{ board?: string; pending?: number; error?: string }>(
			"window.__releaseDelayedHold(0)",
		);
		expect(releasedA1.board).toBe(BOARD);
		const holdsWithA2Pending = (await counts(browser)).holds;
		await Bun.sleep(LOCK_RENEW_MS + TEST_PANE_DEBOUNCE_MARGIN_MS);
		const afterOldFinally = await counts(browser);
		const pendingAfterOldFinally = await raceState(browser);
		expect(pendingAfterOldFinally.pending).toEqual([BOARD]);
		expect(afterOldFinally.holds).toBe(holdsWithA2Pending);
		expect(holdsWithA2Pending - beforeRace.holds).toBe(2);

		const releasedA2 = await browser.eval<{ board?: string; pending?: number; error?: string }>(
			"window.__releaseDelayedHold(0)",
		);
		expect(releasedA2.board).toBe(BOARD);
		const settled = await pollUntil(
			async () => ({
				reports: await counts(browser),
				server: (await request<ElementsBody>(`/api/elements?board=${BOARD}`)).body.elements.find(
					(element) => element.id === "auth",
				),
				local: await browser.eval<number | null>(`(() => {
					const app = ${EXCALIDRAW_APP_EXPRESSION};
					return app?.scene.getElementsIncludingDeleted().find(element => element.id === "auth")?.x ?? null;
				})()`),
			}),
			(value) =>
				value.reports.done === value.reports.sent &&
				value.server !== undefined &&
				value.local !== null &&
				Math.abs(value.server.x - value.local) < 0.001,
			"A2's report to finish and persist its edit",
		);
		expect(settled.reports.done).toBe(settled.reports.sent);
		expect(settled.server).toBeDefined();
		expect(beforeA2).toBeDefined();
		expect(settled.server!.x).toBeCloseTo(beforeA2!.x + 13, 3);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 4,
);
