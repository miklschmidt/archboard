import { expect } from "bun:test";

import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";

/** The expanded settings must remain readable inside the production dialog. */
export async function assertCoordinatorSettingsLayout(
	browser: AgentBrowserSession,
	state: "unavailable" | "priority_fallback",
): Promise<void> {
	await browser.run(["find", "text", "Coordinator details", "click", "--exact"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-coordinator-disclosure]')?.closest('details')?.open === true`,
			),
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
	for (const width of layout.valueWidths) expect(width).toBeGreaterThanOrEqual(200);
	if (state === "unavailable") expect(layout.height).toBeLessThan(300);
	else expect(layout.valueWidths.length).toBeGreaterThan(0);
	await browser.run(["screenshot", `/tmp/archboard-149-coordinator-${state}.png`]);
}
