import { expect } from "bun:test";

import { pollUntil } from "./agent-browser.ts";
import type { AgentBrowserSession } from "./agent-browser.ts";

type BrowserOperator = Readonly<Pick<AgentBrowserSession, "eval" | "run">>;

async function assertSignedOutAccount(browser: BrowserOperator): Promise<void> {
	const state = await browser.eval<{
		options: string[];
		selected: string | null;
		buttons: string[];
		width: number;
		overflow: boolean;
		textSizes: number[];
	}>(`(() => {
		const account = document.querySelector('[data-thread-link-account="signed_out"]');
		const dialog = document.querySelector('[data-workbench-settings]');
		if (!account || !dialog) throw new Error('Signed-out account settings are missing');
		return {
			options: [...account.querySelectorAll('[data-thread-link-form-option]')].map(node => node.getAttribute('data-thread-link-form-option')),
			selected: account.querySelector('[data-thread-link-form-option]:checked, [data-thread-link-form-option][aria-checked="true"]')?.getAttribute('data-thread-link-form-option') ?? null,
			buttons: [...account.querySelectorAll('button')].map(node => node.textContent.trim()),
			width: dialog.getBoundingClientRect().width,
			overflow: account.scrollWidth > account.clientWidth,
			textSizes: [...account.querySelectorAll('p, label, legend, output')].filter(node => node.getBoundingClientRect().height > 0).map(node => parseFloat(getComputedStyle(node).fontSize)),
		};
	})()`);
	expect(state.options[0]).toBe("chatgpt");
	expect(state.selected).toBe("chatgpt");
	expect(state.buttons).not.toContain("Cancel sign-in");
	expect(state.buttons).not.toContain("Sign out");
	expect(state.width).toBeGreaterThanOrEqual(600);
	expect(state.overflow).toBe(false);
	for (const size of state.textSizes) {
		expect(size).toBeGreaterThanOrEqual(14);
	}
	await browser.run(["find", "role", "radio", "click", "--name", "API key", "--exact"]);
	expect(
		await browser.eval<boolean>(`!!document.querySelector('[data-thread-link-field="apiKey"]')`),
	).toBe(true);
	await browser.run(["find", "role", "radio", "click", "--name", "ChatGPT", "--exact"]);
	expect(
		await browser.eval<boolean>(`!!document.querySelector('[data-thread-link-field="apiKey"]')`),
	).toBe(false);
}

/**
 * The expanded settings must remain readable inside the production dialog.
 * @param browser - Browser operator used by the system owner.
 * @param state - Expected coordinator availability state.
 */
async function assertCoordinatorSettingsLayout(
	browser: BrowserOperator,
	state: "unavailable" | "priority_fallback",
): Promise<void> {
	await browser.run(["find", "text", "Coordinator details", "click", "--exact"]);
	await pollUntil(
		async () => {
			const expanded = await browser.eval<boolean>(
				`document.querySelector('[data-coordinator-disclosure]')?.closest('details')?.open === true`,
			);
			return expanded;
		},
		Boolean,
		"expanded coordinator settings",
	);
	const layout = await browser.eval<{
		state: string | null;
		insideViewport: boolean;
		overflow: boolean;
		valueWidths: number[];
		height: number;
	}>(`(() => {
		const dialog = document.querySelector('[data-workbench-settings]');
		const details = document.querySelector('[data-coordinator-disclosure]');
		if (!dialog || !details) throw new Error('Expanded agent settings are missing');
		const rect = dialog.getBoundingClientRect();
		return {
			state: details.getAttribute('data-coordinator-state'),
			insideViewport: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
			overflow: details.scrollWidth > details.clientWidth,
			valueWidths: [...details.querySelectorAll('dd')].map(node => node.getBoundingClientRect().width),
			height: details.getBoundingClientRect().height,
		};
	})()`);
	expect(layout.state).toBe(state);
	expect(layout.insideViewport).toBe(true);
	expect(layout.overflow).toBe(false);
	for (const width of layout.valueWidths) {
		expect(width).toBeGreaterThanOrEqual(200);
	}
	if (state === "unavailable") {
		expect(layout.height).toBeLessThan(300);
	} else {
		expect(layout.valueWidths.length).toBeGreaterThan(0);
	}
	await browser.run(["screenshot", `/tmp/archboard-149-coordinator-${state}.png`]);
}

export { assertCoordinatorSettingsLayout, assertSignedOutAccount };
