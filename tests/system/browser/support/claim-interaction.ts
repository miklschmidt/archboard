import { expect } from "bun:test";
import type { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

import type { createJsonRequester } from "../../boards/support/http.ts";
import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";
import type { WorkbenchSnapshot } from "./workbench-metrics.ts";

export interface ClaimCounts {
	holds: number;
	pending: number;
	sent: number;
	takeBackPending: number;
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
						release: () => invoke().then(resolve, reject),
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
	}))()`);

export function noteBytes(noteFile: string): Buffer<ArrayBuffer> {
	return readFileSync(noteFile);
}

export function expectNoteUnchanged(noteFile: string, expected: Buffer<ArrayBuffer>): void {
	expect(readFileSync(noteFile)).toEqual(expected);
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
		const workbench = document.querySelector(".agent-workbench");
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
				const workbench = document.querySelector(".agent-workbench");
				return {
					background: getComputedStyle(workbench).backgroundColor,
					foreground: getComputedStyle(workbench).color,
					semantic: workbench?.getAttribute("data-semantic") ?? null,
					theme: document.documentElement.dataset.theme ?? "",
				};
			})()`),
		(value) => value.theme === "dark",
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

export async function beginDelayedTakeBack(
	browser: AgentBrowserSession,
	readStatus: () => Promise<WorkbenchSnapshot>,
	reason: string,
): Promise<void> {
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
	expect((await browser.eval<{ released: boolean }>("window.__releaseTakeBack()")).released).toBe(
		true,
	);
}
