import { expect } from "bun:test";

import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";
import { dialogSnapshot } from "./opener-settings.ts";

type ShellTheme = "light" | "dark";

export function roleAction(
	browser: AgentBrowserSession,
	role: string,
	name: string,
	action: "click" | "text" = "click",
): Promise<string> {
	return browser.run(["find", "role", role, action, "--name", name, "--exact"]);
}

export function fillLabel(
	browser: AgentBrowserSession,
	label: string,
	value: string,
): Promise<string> {
	return browser.run(["find", "label", label, "fill", value, "--exact"]);
}

export async function setTheme(browser: AgentBrowserSession, theme: ShellTheme): Promise<void> {
	const current = await browser.eval<string | null>(
		"document.querySelector('.shell')?.getAttribute('data-theme') ?? null",
	);
	if (current !== theme) {
		await roleAction(browser, "button", `Use ${theme} theme`);
	}
	await pollUntil(
		() =>
			browser.eval<string | null>(
				"document.querySelector('.shell')?.getAttribute('data-theme') ?? null",
			),
		(value) => value === theme,
		`the ${theme} theme`,
	);
}

export async function assertDialogClosedAndFocusReturned(
	browser: AgentBrowserSession,
): Promise<void> {
	await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value === null,
		"the opener settings dialog to close",
	);
	expect(
		await browser.eval<boolean>(
			"document.activeElement === window.__openerTrigger && document.querySelectorAll('[role=dialog]').length === 0",
		),
	).toBe(true);
}
