import { expect } from "bun:test";

import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";

type RecordedRequest = { method: string; path: string; body: unknown };

export async function requests(browser: AgentBrowserSession): Promise<RecordedRequest[]> {
	return browser.eval<RecordedRequest[]>("window.__openerProbe?.requests ?? []");
}

export async function setProbeHold(browser: AgentBrowserSession, key: string): Promise<void> {
	expect(
		await browser.eval<boolean>(
			`Boolean(window.__openerProbe && (window.__openerProbe.hold(${JSON.stringify(key)}), true))`,
		),
	).toBe(true);
}

export async function setNextGet(
	browser: AgentBrowserSession,
	outcome: "success" | "failure",
): Promise<void> {
	expect(
		await browser.eval<boolean>(
			`Boolean(window.__openerProbe && (window.__openerProbe.nextGet = ${JSON.stringify(outcome)}))`,
		),
	).toBe(true);
}

export async function releaseProbe(browser: AgentBrowserSession, key: string): Promise<void> {
	await pollUntil(
		() => browser.eval<boolean>(`window.__openerProbe?.pending?.key === ${JSON.stringify(key)}`),
		Boolean,
		`${key} to become pending`,
	);
	expect(
		await browser.eval<boolean>(`window.__openerProbe?.release(${JSON.stringify(key)}) ?? false`),
	).toBe(true);
}
