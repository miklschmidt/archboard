import { expect } from "bun:test";

import { pollUntil } from "./agent-browser.ts";
import type { AgentBrowserSession } from "./agent-browser.ts";
import { openSettingsItem } from "./shell-dom.ts";

type BrowserOperator = AgentBrowserSession;

/** The agent settings dialog by its accessible name. */
const AGENT_DIALOG = `[...document.querySelectorAll('[role="dialog"]')].find(node =>
	[...node.querySelectorAll('[data-slot="dialog-title"]')].some(title => title.textContent?.trim() === 'Agent settings'))`;

/**
 * Open the agent settings dialog from the header settings menu and wait for it.
 * @param browser The page.
 */
async function openAgentSettings(browser: BrowserOperator): Promise<void> {
	await openSettingsItem(browser, "Agent settings");
	await pollUntil(
		() => browser.eval<boolean>(`Boolean(${AGENT_DIALOG})`),
		Boolean,
		"the agent settings dialog to open",
	);
}

/**
 * Whether the agent settings dialog is open.
 * @param browser The page.
 * @returns True while it is.
 */
function agentSettingsOpen(browser: BrowserOperator): Promise<boolean> {
	return browser.eval<boolean>(`Boolean(${AGENT_DIALOG})`);
}

/**
 * The account section offers sign-in through a select of variants and one
 * button, with readable text and no overflow, while signed out.
 * @param browser The page.
 */
async function assertSignedOutAccount(browser: BrowserOperator): Promise<void> {
	const state = await browser.eval<{
		badge: string | null;
		variant: string | null;
		buttons: string[];
		width: number;
		overflow: boolean;
		textSizes: number[];
	}>(`(() => {
		const dialog = ${AGENT_DIALOG};
		const heading = [...(dialog?.querySelectorAll('h3') ?? [])].find(node => /^Account/.test(node.textContent.trim()));
		const section = heading?.closest('section');
		if (!dialog || !section) throw new Error('Signed-out account settings are missing');
		const select = section.querySelector('[role="combobox"]');
		return {
			badge: heading.querySelector('span')?.textContent?.trim() ?? null,
			variant: select?.textContent?.trim() ?? null,
			buttons: [...section.querySelectorAll('button')].map(node => node.textContent.trim()).filter(Boolean),
			width: dialog.getBoundingClientRect().width,
			overflow: section.scrollWidth > section.clientWidth,
			textSizes: [...section.querySelectorAll('p, label, legend, output')].filter(node => node.getBoundingClientRect().height > 0).map(node => parseFloat(getComputedStyle(node).fontSize)),
		};
	})()`);
	expect(state.badge).toBe("Signed out");
	expect(state.variant).toBe("ChatGPT");
	expect(state.buttons).toContain("Sign in");
	expect(state.buttons).not.toContain("Cancel sign-in");
	expect(state.width).toBeGreaterThanOrEqual(480);
	expect(state.overflow).toBe(false);
	for (const size of state.textSizes) {
		expect(size).toBeGreaterThanOrEqual(12);
	}
}

/**
 * The coordinator section reads its state and facts inside the viewport
 * without horizontal overflow.
 * @param browser The page.
 * @param state The coordinator state the badge must name.
 */
async function assertCoordinatorSettingsLayout(
	browser: BrowserOperator,
	state: "ready" | "unavailable",
): Promise<void> {
	const layout = await pollUntil(
		() =>
			browser.eval<{
				state: string | null;
				insideViewport: boolean;
				overflow: boolean;
				valueWidths: number[];
				height: number;
			} | null>(`(() => {
				const dialog = ${AGENT_DIALOG};
				const heading = [...(dialog?.querySelectorAll('h3') ?? [])].find(node => node.textContent.trim().startsWith('Coordinator') && !node.textContent.trim().startsWith('Coordinator settings'));
				const section = heading?.closest('section');
				if (!dialog || !section) return null;
				const rect = dialog.getBoundingClientRect();
				return {
					state: heading.querySelector('span')?.textContent?.trim() ?? null,
					insideViewport: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
					overflow: section.scrollWidth > section.clientWidth,
					valueWidths: [...section.querySelectorAll('dd')].map(node => node.getBoundingClientRect().width),
					height: section.getBoundingClientRect().height,
				};
			})()`),
		// The badge reads the state in words (TASK-150.08): "Ready", not the raw enum.
		(value) => value !== null && value.state?.toLowerCase() === state,
		`the coordinator section to read ${state}`,
		{ timeoutMs: 5_000 },
	);
	expect(layout?.insideViewport).toBe(true);
	expect(layout?.overflow).toBe(false);
	for (const width of layout?.valueWidths ?? []) {
		expect(width).toBeGreaterThanOrEqual(120);
	}
}

export {
	agentSettingsOpen,
	assertCoordinatorSettingsLayout,
	assertSignedOutAccount,
	openAgentSettings,
};
