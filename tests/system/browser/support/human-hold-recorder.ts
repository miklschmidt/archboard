import type { AgentBrowserSession } from "./agent-browser.ts";

export interface HoldCounters {
	holdDone: number;
	holds: number;
	pending: number;
	reports: number;
}

export const installHoldRecorder = (browser: AgentBrowserSession): Promise<unknown> =>
	browser.eval(`(() => {
		window.__holdPersistence = { delay: 0, pending: [], holds: 0, holdDone: 0, reports: 0 };
		window.__delayHumanHolds = count => { window.__holdPersistence.delay = count; };
		window.__releaseHumanHold = () => {
			const entry = window.__holdPersistence.pending.shift();
			if (!entry) return { released: false };
			entry.release();
			return { released: true };
		};
		const original = window.fetch;
		window.fetch = function(input, init) {
			const url = typeof input === "string" ? input : input?.url ?? "";
			const method = init?.method ?? input?.method ?? "GET";
			const hold = method === "POST" && url.includes("/api/boards/hold")
				&& !url.includes("/api/boards/hold/release");
			const report = method === "POST" && url.includes("/api/elements/changes");
			if (hold) window.__holdPersistence.holds += 1;
			if (report) window.__holdPersistence.reports += 1;
			const answer = original.apply(this, arguments);
			if (!hold) return answer;
			const counted = answer.then(response => {
				window.__holdPersistence.holdDone += 1;
				return response;
			});
			if (window.__holdPersistence.delay === 0) return counted;
			window.__holdPersistence.delay -= 1;
			return new Promise((resolve, reject) => {
				window.__holdPersistence.pending.push({ release: () => counted.then(resolve, reject) });
			});
		};
		return { installed: true };
	})()`);

export const readHoldCounters = (browser: AgentBrowserSession): Promise<HoldCounters> =>
	browser.eval(`(() => ({
		holdDone: window.__holdPersistence.holdDone,
		holds: window.__holdPersistence.holds,
		pending: window.__holdPersistence.pending.length,
		reports: window.__holdPersistence.reports,
	}))()`);

export const resetHoldRecorder = (browser: AgentBrowserSession): Promise<boolean> =>
	browser.eval(`(() => {
		const state = window.__holdPersistence;
		if (!state || state.pending.length !== 0) return false;
		state.delay = 0;
		state.holds = 0;
		state.holdDone = 0;
		state.reports = 0;
		return true;
	})()`);
