// What a test waits for while a pane's sidebar comes or goes.

import { act } from "@testing-library/react";

import { ms } from "@archboard/timing";

/**
 * Let a sidebar that is leaving finish leaving: it stays drawn, out of reach,
 * for as long as it takes to ease away.
 * @returns Settles once it has had time to.
 */
async function sidebarSettled(): Promise<void> {
	await act(async () => {
		await new Promise<void>((resolve) => setTimeout(resolve, ms("sidebar.dock") + 60));
	});
}

export { sidebarSettled };
