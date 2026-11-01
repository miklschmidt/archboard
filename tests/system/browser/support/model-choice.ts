import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";

const WAIT = { timeoutMs: 10_000 } as const;

async function pickModelChoice(
	browser: AgentBrowserSession,
	trigger: string,
	option: string,
): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const button = document.querySelector(${JSON.stringify(trigger)}); return button != null && !button.disabled; })()`,
			),
		Boolean,
		"the installed navigation control",
		WAIT,
	);
	await browser.run(["click", trigger]);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector(${JSON.stringify(option)}) !== null`),
		Boolean,
		"the exact navigation choice",
		WAIT,
	);
	await browser.run(["scrollintoview", option]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const item = document.querySelector(${JSON.stringify(option)}); if (!item) return false; const r = item.getBoundingClientRect(); return r.height > 0 && item.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()`,
			),
		Boolean,
		"the visible navigation choice",
		WAIT,
	);
	await browser.run(["click", option]);
}

export { pickModelChoice };
