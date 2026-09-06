import { expect } from "bun:test";
import type { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

import type { createJsonRequester } from "../../boards/support/http.ts";
import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";
import { EXCALIDRAW_APP_EXPRESSION } from "./page-scene.ts";
import {
	CLAIM_BANNER,
	PANE_SECTIONS,
	currentTheme,
	navigatorRow,
	paneSection,
	switchTheme,
} from "./shell-dom.ts";
import type { WorkbenchSnapshot } from "./workbench-metrics.ts";

interface ClaimCounts {
	/** POST /api/boards/hold requests, releases excluded. */
	holds: number;
	/** POST /api/elements/changes requests started. */
	sent: number;
	/** Change reports the recorder is holding back. */
	pending: number;
	/** POST /api/boards/take-back requests. */
	takeBacks: number;
	takeBackPending: number;
	takeBackSettled: number;
	/** The last change report's URL, so its `expectVersion` can be read. */
	lastReportUrl: string | null;
	/** The last change report's status, once answered. */
	lastReportStatus: number | null;
}

interface PaneList {
	paneCount: number;
	panes: Array<{ board: string; clientId: string }>;
}

type Request = ReturnType<typeof createJsonRequester>;

/** What the navigator says about an agent's work on one board. */
interface NavigatorActivity {
	row: boolean;
	marker: string | null;
	doing: string | null;
}

/** The take-back control inside the active pane's claim banner. */
const TAKE_BACK = `${PANE_SECTIONS}[aria-current="true"] ${CLAIM_BANNER} button`;
/** WCAG 2.5.8 target size floor. */
const MIN_TARGET = 24;

/**
 * Record the pane's holds, change reports and take-backs, and let an owner
 * hold back the next change report or the next take-back, or refuse it.
 * @param browser The page.
 * @returns Resolves once installed.
 */
const installClaimRecorder = (browser: AgentBrowserSession): Promise<unknown> =>
	browser.eval(`(() => {
		window.__claimRecorder = {
			holds: 0,
			sent: 0,
			delay: false,
			pending: [],
			takeBacks: 0,
			takeBackMode: "pass",
			takeBackPending: [],
			takeBackSettled: 0,
			lastReportUrl: null,
			lastReportStatus: null,
		};
		window.__delayNextClaimReport = () => { window.__claimRecorder.delay = true; };
		window.__delayNextTakeBack = () => { window.__claimRecorder.takeBackMode = "delay"; };
		window.__failNextTakeBack = () => { window.__claimRecorder.takeBackMode = "fail"; };
		window.__releaseTakeBack = () => {
			const entry = window.__claimRecorder.takeBackPending.shift();
			if (!entry) return { released: false };
			entry.release();
			return { released: true };
		};
		window.__releaseClaimReport = () => {
			const entry = window.__claimRecorder.pending.shift();
			if (!entry) return { released: false };
			entry.release();
			return { released: true };
		};
		const original = window.fetch;
		window.fetch = function(input, init) {
			const invoke = () => original.apply(this, arguments);
			const url = typeof input === "string" ? input : input?.url ?? "";
			const method = init?.method ?? input?.method ?? "GET";
			const report = method === "POST" && url.includes("/api/elements/changes");
			const hold = method === "POST" && url.includes("/api/boards/hold")
				&& !url.includes("/api/boards/hold/release");
			const takeBack = method === "POST" && url.includes("/api/boards/take-back");
			if (report) {
				window.__claimRecorder.sent += 1;
				window.__claimRecorder.lastReportUrl = url;
				window.__claimRecorder.lastReportStatus = null;
			}
			if (hold) window.__claimRecorder.holds += 1;
			if (takeBack) window.__claimRecorder.takeBacks += 1;
			if (takeBack && window.__claimRecorder.takeBackMode === "fail") {
				window.__claimRecorder.takeBackMode = "pass";
				return Promise.resolve(new Response(JSON.stringify({ success: false, error: "refused" }), {
					status: 409,
					headers: { "Content-Type": "application/json" },
				}));
			}
			if (takeBack && window.__claimRecorder.takeBackMode === "delay") {
				window.__claimRecorder.takeBackMode = "pass";
				return new Promise((resolve, reject) => {
					window.__claimRecorder.takeBackPending.push({
						release: () => invoke().then(value => {
							window.__claimRecorder.takeBackSettled += 1;
							resolve(value);
						}, reject),
					});
				});
			}
			if (!report) return invoke();
			const answered = () => invoke().then(response => {
				window.__claimRecorder.lastReportStatus = response.status;
				return response;
			});
			if (!window.__claimRecorder.delay) return answered();
			window.__claimRecorder.delay = false;
			return new Promise((resolve, reject) => {
				window.__claimRecorder.pending.push({ release: () => answered().then(resolve, reject) });
			});
		};
		return { installed: true };
	})()`);

const claimCounts = (browser: AgentBrowserSession): Promise<ClaimCounts> =>
	browser.eval(`(() => ({
		holds: window.__claimRecorder.holds,
		sent: window.__claimRecorder.sent,
		pending: window.__claimRecorder.pending.length,
		takeBacks: window.__claimRecorder.takeBacks,
		takeBackPending: window.__claimRecorder.takeBackPending.length,
		takeBackSettled: window.__claimRecorder.takeBackSettled,
		lastReportUrl: window.__claimRecorder.lastReportUrl,
		lastReportStatus: window.__claimRecorder.lastReportStatus,
	}))()`);

const navigatorActivity = (
	browser: AgentBrowserSession,
	board: string,
): Promise<NavigatorActivity> =>
	browser.eval(`(() => {
		const row = document.querySelector(${JSON.stringify(navigatorRow(board))});
		const marker = row?.querySelector('[data-slot="agent-activity"]') ?? null;
		const doing = row?.querySelector('[data-slot="agent-doing"]') ?? null;
		return {
			row: row !== null,
			marker: marker ? marker.getAttribute('title') : null,
			doing: doing ? doing.textContent.trim() : null,
		};
	})()`);
/**
 * Drag from a point on the claimed element; under a claim the canvas is in
 * view mode, so the gesture pans rather than moves anything.
 * @param browser The page.
 * @param elementId The element to drag on.
 */
async function dragOn(browser: AgentBrowserSession, elementId: string): Promise<void> {
	let priorPoint = "";
	let stablePoints = 0;
	const point = await pollUntil(
		() =>
			browser.eval<{ error?: string; inside?: boolean; x?: number; y?: number }>(`(() => {
				const app = ${EXCALIDRAW_APP_EXPRESSION};
				const element = app?.scene.getElementsIncludingDeleted()
					.find(candidate => candidate.id === ${JSON.stringify(elementId)});
				const canvas = document.querySelector(".excalidraw")?.getBoundingClientRect();
				if (!app || !element || !canvas) return { error: "drag target is missing" };
				const zoom = app.state.zoom?.value ?? 1;
				const x = Math.round((element.x + 24 + app.state.scrollX) * zoom + app.state.offsetLeft);
				const y = Math.round((element.y + 24 + app.state.scrollY) * zoom + app.state.offsetTop);
				return { x, y, inside: x >= canvas.left && x <= canvas.right && y >= canvas.top && y <= canvas.bottom };
			})()`),
		(value) => {
			const sample = `${value.x}:${value.y}`;
			stablePoints = sample === priorPoint ? stablePoints + 1 : 0;
			priorPoint = sample;
			return value.inside === true && stablePoints >= 3;
		},
		"the claimed element to be framed inside the canvas",
	);
	await browser.run(["mouse", "move", String(point.x), String(point.y)]);
	await browser.run(["mouse", "down"]);
	for (let segment = 1; segment <= 4; segment += 1) {
		await browser.run(["mouse", "move", String(point.x! + segment * 9), String(point.y)]);
	}
	await browser.run(["mouse", "up"]);
}

function noteBytes(noteFile: string): Buffer<ArrayBuffer> {
	return readFileSync(noteFile);
}

function expectNoteUnchanged(noteFile: string, expected: Buffer<ArrayBuffer>): void {
	expect(readFileSync(noteFile)).toEqual(expected);
}

/**
 * The claim banner and the take-back control stay usable from the keyboard,
 * in both themes, and a refused take-back is shown as a recoverable failure.
 * @param options The board, the page, the note file, the status reader and the API.
 * @returns The note bytes before the flow, unchanged after it.
 */
async function verifyBoardStatusPresentation(options: {
	board: string;
	browser: AgentBrowserSession;
	noteFile: string;
	readStatus: () => Promise<WorkbenchSnapshot>;
	request: Request;
}): Promise<Buffer<ArrayBuffer>> {
	const { board, browser, noteFile, readStatus, request } = options;
	const before = noteBytes(noteFile);
	const failedWhy = "checking failed take-back recovery";
	expect(
		(
			await request(`/api/boards/claim?board=${board}`, {
				method: "POST",
				body: { reason: failedWhy },
			})
		).status,
	).toBe(200);
	await pollUntil(
		readStatus,
		(value) => value.reason === failedWhy && value.takeBackState === "idle",
		"the failed-flow claim to expose an available take-back action",
	);
	// Reach the control the way a keyboard user does: Tab from the pane bar's
	// last control, so the focus ring is a keyboard ring and not a script one.
	await browser.eval<boolean>(
		`(() => { const present = document.querySelector('button[aria-label^="Present pane"]'); present?.focus(); return !!present; })()`,
	);
	await browser.run(["press", "Tab"]);
	const keyboardFocus = await browser.eval<{
		active: boolean;
		height: number;
		ring: boolean;
	}>(`(() => {
		const action = document.querySelector(${JSON.stringify(TAKE_BACK)});
		const style = action ? getComputedStyle(action) : null;
		return {
			active: document.activeElement === action,
			height: action?.getBoundingClientRect().height ?? 0,
			ring: !!style && (style.boxShadow !== 'none' || (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 1)),
		};
	})()`);
	expect(keyboardFocus.active).toBe(true);
	expect(keyboardFocus.height).toBeGreaterThanOrEqual(MIN_TARGET);
	expect(keyboardFocus.ring).toBe(true);

	const readBannerColors = () =>
		browser.eval<{ background: string; foreground: string; theme: string }>(`(() => {
			const banner = document.querySelector(${JSON.stringify(`${paneSection("Pane A")} ${CLAIM_BANNER}`)});
			return {
				background: getComputedStyle(banner).backgroundColor,
				foreground: getComputedStyle(banner).color,
				theme: document.documentElement.dataset.theme ?? "",
			};
		})()`);
	const startTheme = (await currentTheme(browser)) === "dark" ? "dark" : "light";
	const other = startTheme === "dark" ? "light" : "dark";
	const lightBanner = await readBannerColors();
	await switchTheme(browser, other);
	const darkBanner = await pollUntil(
		readBannerColors,
		(value) =>
			value.theme === other &&
			value.background !== lightBanner.background &&
			value.foreground !== lightBanner.foreground,
		"the claim banner to render in the other theme",
	);
	expect(darkBanner.background).not.toBe(lightBanner.background);
	expect(darkBanner.foreground).not.toBe(lightBanner.foreground);
	await switchTheme(browser, startTheme);

	await browser.eval("window.__failNextTakeBack()");
	await browser.run(["focus", TAKE_BACK]);
	await browser.run(["press", "Enter"]);
	const refused = await pollUntil(
		readStatus,
		(value) => value.takeBackState === "failed",
		"the refused take-back to render as a recoverable failure",
	);
	expect(refused).toMatchObject({
		reason: failedWhy,
		take: "Take back control",
		takeBackState: "failed",
	});
	expect(refused.takeBackMessage).toContain("could not be taken back");
	expectNoteUnchanged(noteFile, before);

	expect(
		(
			await request(`/api/boards/claim/release?board=${board}`, {
				method: "POST",
				body: {},
			})
		).status,
	).toBe(200);
	const recovered = await pollUntil(
		readStatus,
		(value) => value.banner === null && value.headerClaim === null,
		"the released failed-flow claim to restore the available board",
	);
	expect(recovered).toMatchObject({ takeBackState: null, take: null });
	expectNoteUnchanged(noteFile, before);
	return before;
}

/**
 * A pending take-back belongs to its pane: another pane shows nothing of it,
 * and the settled result frees the board the first pane holds.
 * @param options The board, the page, the first pane's client, the status reader and the API.
 */
async function verifyPaneScopedTakeBack(options: {
	board: string;
	browser: AgentBrowserSession;
	primaryClientId: string;
	readStatus: () => Promise<WorkbenchSnapshot>;
	reason: string;
	request: Request;
}): Promise<void> {
	const { board, browser, primaryClientId, readStatus, reason, request } = options;
	await browser.eval(`(() => {
		window.__takeBackActivations = 0;
		document.querySelector(${JSON.stringify(TAKE_BACK)})?.addEventListener(
			"click",
			() => { window.__takeBackActivations += 1; },
			{ once: true },
		);
		return true;
	})()`);
	await browser.eval("window.__delayNextTakeBack()");
	await browser.run(["click", TAKE_BACK]);
	expect(await browser.eval<number>("window.__takeBackActivations")).toBe(1);
	const pending = await pollUntil(
		async () => ({ banner: await readStatus(), counts: await claimCounts(browser) }),
		(value) => value.banner.takeBackState === "pending" && value.counts.takeBackPending === 1,
		"the delayed take-back to render its pending state",
	);
	expect(pending.banner).toMatchObject({
		reason,
		take: "Taking back control",
		takeBackState: "pending",
	});

	expect((await request("/api/panes/open", { method: "POST", body: {} })).status).toBe(200);
	const split = await pollUntil(
		async () => (await request<PaneList>("/api/panes")).body,
		(report) => report.paneCount === 2,
		"a second pane to mount while Pane A take-back remains pending",
	);
	const secondClientId = split.panes.find((pane) => pane.clientId !== primaryClientId)?.clientId;
	expect(typeof secondClientId).toBe("string");
	const otherBoard = `${board}-take-back-other`;
	expect(
		(
			await request("/api/boards/new", {
				method: "POST",
				body: { board: otherBoard, level: "service" },
			})
		).status,
	).toBe(200);
	expect(
		(
			await request("/api/boards/open", {
				method: "POST",
				body: { board: otherBoard, pane: secondClientId },
			})
		).status,
	).toBe(200);
	await browser.run(["click", `${paneSection("Pane B")} .excalidraw`]);
	const paneBBeforeSettlement = await pollUntil(
		readStatus,
		(value) => value.pane === "Pane B" && value.banner === null,
		"Pane B to omit Pane A's claim and take-back state",
	);
	expect(paneBBeforeSettlement).toMatchObject({
		headerClaim: null,
		takeBackState: null,
		take: null,
	});
	expect(paneBBeforeSettlement.otherBanners).toEqual(["Pane A"]);
	expect((await browser.eval<{ released: boolean }>("window.__releaseTakeBack()")).released).toBe(
		true,
	);
	const paneBAfterSettlement = await pollUntil(
		async () => ({ banner: await readStatus(), counts: await claimCounts(browser) }),
		(value) =>
			value.banner.pane === "Pane B" &&
			value.banner.banner === null &&
			value.counts.takeBackSettled === 1,
		"Pane B to remain idle after Pane A settles",
	);
	expect(paneBAfterSettlement.banner).toMatchObject({ takeBackState: null, take: null });

	await browser.run(["click", `${paneSection("Pane A")} .excalidraw`]);
	const paneASettled = await pollUntil(
		readStatus,
		(value) => value.pane === "Pane A" && value.banner === null && value.headerClaim === null,
		"Pane A to show its board free after the settled take-back",
	);
	expect(paneASettled).toMatchObject({ takeBackState: null, take: null });
	expect(
		(
			await request("/api/panes/close", {
				method: "POST",
				body: { pane: secondClientId },
			})
		).status,
	).toBe(200);
	await pollUntil(
		async () => (await request<PaneList>("/api/panes")).body,
		(report) => report.paneCount === 1,
		"the take-back isolation pane to close",
	);
}

export {
	type ClaimCounts,
	type NavigatorActivity,
	installClaimRecorder,
	claimCounts,
	dragOn,
	navigatorActivity,
	noteBytes,
	expectNoteUnchanged,
	verifyBoardStatusPresentation,
	verifyPaneScopedTakeBack,
};
