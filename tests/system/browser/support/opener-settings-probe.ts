import { expect } from "bun:test";

import { pollUntil } from "./agent-browser.ts";
import type { AgentBrowserSession } from "./agent-browser.ts";

interface RecordedRequest {
	readonly method: string;
	readonly path: string;
	readonly body: unknown;
}
type BrowserEvaluator = Readonly<Pick<AgentBrowserSession, "eval">>;

async function requests(browser: BrowserEvaluator): Promise<RecordedRequest[]> {
	return browser.eval<RecordedRequest[]>("window.__openerProbe?.requests ?? []");
}

async function setProbeHold(
	browser: BrowserEvaluator,
	key: string,
): Promise<void> {
	expect(
		await browser.eval<boolean>(
			`Boolean(window.__openerProbe && (window.__openerProbe.hold(${JSON.stringify(key)}), true))`,
		),
	).toBe(true);
}

async function setNextGet(
	browser: BrowserEvaluator,
	outcome: "success" | "failure",
): Promise<void> {
	expect(
		await browser.eval<boolean>(
			`Boolean(window.__openerProbe && (window.__openerProbe.nextGet = ${JSON.stringify(outcome)}))`,
		),
	).toBe(true);
}

async function releaseProbe(
	browser: BrowserEvaluator,
	key: string,
): Promise<void> {
	await pollUntil(
		async () => {
			const pending = await browser.eval<boolean>(
				`window.__openerProbe?.pending?.key === ${JSON.stringify(key)}`,
			);
			return pending;
		},
		Boolean,
		`${key} to become pending`,
	);
	expect(
		await browser.eval<boolean>(`window.__openerProbe?.release(${JSON.stringify(key)}) ?? false`),
	).toBe(true);
}

export { releaseProbe, requests, setNextGet, setProbeHold, type RecordedRequest };
