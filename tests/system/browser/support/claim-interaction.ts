import { expect } from "bun:test";
import type { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

import type { createJsonRequester } from "../../boards/support/http.ts";
import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";
import { readSemanticAccessibility } from "./semantic-accessibility.ts";
import type { WorkbenchSnapshot } from "./workbench-metrics.ts";

export interface ClaimCounts {
	holds: number;
	pending: number;
	sent: number;
	takeBackPending: number;
	takeBackSettled: number;
}

interface PaneList {
	paneCount: number;
	panes: Array<{ board: string; clientId: string }>;
}

type Request = ReturnType<typeof createJsonRequester>;

export const installClaimRecorder = (browser: AgentBrowserSession): Promise<unknown> =>
	browser.eval(`(() => {
		window.__claimRecorder = {
			holds: 0,
			sent: 0,
			delay: false,
			pending: [],
			takeBackMode: "pass",
			takeBackPending: [],
			takeBackSettled: 0,
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
			if (report) window.__claimRecorder.sent += 1;
			if (hold) window.__claimRecorder.holds += 1;
			if (hold && window.__claimRecorder.takeBackMode === "fail") {
				window.__claimRecorder.takeBackMode = "pass";
				return Promise.resolve(new Response(JSON.stringify({ success: false }), {
					status: 409,
					headers: { "Content-Type": "application/json" },
				}));
			}
			if (hold && window.__claimRecorder.takeBackMode === "delay") {
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
			if (!report || !window.__claimRecorder.delay) return invoke();
			window.__claimRecorder.delay = false;
			return new Promise((resolve, reject) => {
				window.__claimRecorder.pending.push({ release: () => invoke().then(resolve, reject) });
			});
		};
		return { installed: true };
	})()`);

export const claimCounts = (browser: AgentBrowserSession): Promise<ClaimCounts> =>
	browser.eval(`(() => ({
		holds: window.__claimRecorder.holds,
		sent: window.__claimRecorder.sent,
		pending: window.__claimRecorder.pending.length,
		takeBackPending: window.__claimRecorder.takeBackPending.length,
		takeBackSettled: window.__claimRecorder.takeBackSettled,
	}))()`);

export function noteBytes(noteFile: string): Buffer<ArrayBuffer> {
	return readFileSync(noteFile);
}

export function expectNoteUnchanged(noteFile: string, expected: Buffer<ArrayBuffer>): void {
	expect(readFileSync(noteFile)).toEqual(expected);
}

interface SemanticAnnouncerSnapshot {
	atomic: string | null;
	bodyHidden: boolean;
	count: number;
	hiddenAncestor: boolean;
	label: string | null;
	live: string | null;
	role: string | null;
	state: string | null;
	text: string;
	workbenchExpanded: string | null;
}

const readSemanticAnnouncer = (browser: AgentBrowserSession): Promise<SemanticAnnouncerSnapshot> =>
	browser.eval(`(() => {
		const announcer = document.querySelector(".workbench-semantic-announcer");
		const body = document.querySelector('[data-workbench-content="expanded"]');
		const workbench = document.querySelector("[data-workbench-frame]");
		return {
			atomic: announcer?.getAttribute("aria-atomic") ?? null,
			bodyHidden: body === null,
			count: document.querySelectorAll(".workbench-semantic-announcer").length,
			hiddenAncestor: announcer?.closest("[hidden]") !== null,
			label: announcer?.getAttribute("aria-label") ?? null,
			live: announcer?.getAttribute("aria-live") ?? null,
			role: announcer?.getAttribute("role") ?? null,
			state: announcer?.getAttribute("data-semantic-state") ?? null,
			text: announcer?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
			workbenchExpanded: workbench?.getAttribute("data-workbench-disclosure") ?? null,
		};
	})()`);

export async function verifyCollapsedSemanticAnnouncement(
	browser: AgentBrowserSession,
): Promise<void> {
	const unavailableText =
		"Semantic context Unavailable No semantic context delivery is available for this pane.";
	expect(await readSemanticAnnouncer(browser)).toEqual({
		atomic: "true",
		bodyHidden: true,
		count: 1,
		hiddenAncestor: false,
		label: unavailableText,
		live: "polite",
		role: "status",
		state: "unavailable",
		text: unavailableText,
		workbenchExpanded: "collapsed",
	});
	expect(await readSemanticAccessibility(browser)).toEqual({
		atomic: true,
		ignored: false,
		live: "polite",
		name: unavailableText,
		role: "status",
	});
}

export async function verifyBoardStatusPresentation(options: {
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
		(value) => value.reason === failedWhy && value.takeBackState === "available",
		"the failed-flow claim to expose an available take-back action",
	);
	await browser.run(["focus", ".pane-claim-take"]);
	const keyboardFocus = await browser.eval<{
		active: boolean;
		height: number;
		outlineWidth: number;
	}>(`(() => {
		const action = document.querySelector(".pane-claim-take");
		return {
			active: document.activeElement === action,
			height: action?.getBoundingClientRect().height ?? 0,
			outlineWidth: parseFloat(getComputedStyle(action).outlineWidth),
		};
	})()`);
	expect(keyboardFocus.active).toBe(true);
	expect(keyboardFocus.height).toBeGreaterThanOrEqual(43.5);
	expect(keyboardFocus.outlineWidth).toBeGreaterThanOrEqual(2);

	const lightWorkbench = await browser.eval<{ background: string; foreground: string }>(`(() => {
		const workbench = document.querySelector(".agent-status-strip");
		return {
			background: getComputedStyle(workbench).backgroundColor,
			foreground: getComputedStyle(workbench).color,
		};
	})()`);
	await browser.run(["click", '[aria-label="Use dark theme"]']);
	const darkWorkbench = await pollUntil(
		() =>
			browser.eval<{
				background: string;
				foreground: string;
				semantic: string | null;
				theme: string;
			}>(`(() => {
				const workbench = document.querySelector(".agent-status-strip");
				return {
					background: getComputedStyle(workbench).backgroundColor,
					foreground: getComputedStyle(workbench).color,
					semantic: workbench?.getAttribute("data-semantic") ?? null,
					theme: document.documentElement.dataset.theme ?? "",
				};
			})()`),
		(value) =>
			value.theme === "dark" &&
			value.background !== lightWorkbench.background &&
			value.foreground !== lightWorkbench.foreground,
		"the board-status view to render in the dark theme",
	);
	expect(darkWorkbench.background).not.toBe(lightWorkbench.background);
	expect(darkWorkbench.foreground).not.toBe(lightWorkbench.foreground);
	expect(darkWorkbench.semantic).toBe("unavailable");
	await browser.run(["click", '[aria-label="Use light theme"]']);
	await pollUntil(
		() => browser.eval<string>("document.documentElement.dataset.theme ?? ''"),
		(value) => value === "light",
		"the board-status view to return to the light theme",
	);

	await browser.eval("window.__failNextTakeBack()");
	await browser.run(["focus", ".pane-claim-take"]);
	await browser.run(["press", "Enter"]);
	const refused = await pollUntil(
		readStatus,
		(value) => value.takeBackState === "failure",
		"the refused take-back to render as a recoverable failure",
	);
	expect(refused).toMatchObject({
		reason: failedWhy,
		state: "working",
		take: "Try Take back control again",
		takeBackState: "failure",
		takeBackOutcomeVisible: true,
	});
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
		(value) => value.what === null && value.takeBackState === "idle",
		"the released failed-flow claim to restore the available board",
	);
	expect(recovered).toMatchObject({ state: "ready", takeBackState: "idle" });
	expectNoteUnchanged(noteFile, before);
	return before;
}

export async function verifyPaneScopedTakeBack(options: {
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
		document.querySelector(".pane-claim-take")?.addEventListener(
			"click",
			() => { window.__takeBackActivations += 1; },
			{ once: true },
		);
		return true;
	})()`);
	await browser.eval("window.__delayNextTakeBack()");
	await browser.run(["click", ".pane-claim-take"]);
	expect(await browser.eval<number>("window.__takeBackActivations")).toBe(1);
	const pending = await pollUntil(
		async () => ({ banner: await readStatus(), counts: await claimCounts(browser) }),
		(value) => value.banner.takeBackState === "pending" && value.counts.takeBackPending === 1,
		"the delayed take-back to render its pending state",
	);
	expect(pending.banner).toMatchObject({
		reason,
		state: "working",
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
	await browser.run(["click", '.pane[aria-label="Pane B"] .excalidraw']);
	const paneBBeforeSettlement = await pollUntil(
		readStatus,
		(value) => value.pane === "Pane B" && value.takeBackState === "idle",
		"Pane B to expose only its own idle take-back state",
	);
	expect(paneBBeforeSettlement).toMatchObject({
		takeBackAnnouncement: null,
		takeBackState: "idle",
		what: null,
	});
	expect((await browser.eval<{ released: boolean }>("window.__releaseTakeBack()")).released).toBe(
		true,
	);
	const paneBAfterSettlement = await pollUntil(
		async () => ({ banner: await readStatus(), counts: await claimCounts(browser) }),
		(value) =>
			value.banner.pane === "Pane B" &&
			value.banner.takeBackState === "idle" &&
			value.counts.takeBackSettled === 1,
		"Pane B to remain idle after Pane A settles",
	);
	expect(paneBAfterSettlement.banner).toMatchObject({
		takeBackAnnouncement: null,
		takeBackState: "idle",
		what: null,
	});

	await browser.run(["click", '.pane[aria-label="Pane A"] .excalidraw']);
	const paneASettled = await pollUntil(
		readStatus,
		(value) =>
			value.pane === "Pane A" &&
			value.takeBackState === "success" &&
			value.takeBackAnnouncement === "Board control returned.",
		"Pane A to retain its own settled take-back result",
	);
	expect(paneASettled).toMatchObject({
		takeBackAnnouncement: "Board control returned.",
		takeBackState: "success",
		takeBackOutcomeVisible: true,
		what: null,
	});
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
