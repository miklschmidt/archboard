// Telling the person, once per build, that this tab runs old code (TASK-056).
//
// Two answers can say it. The pane report's answer comes when the pane's model
// or shell options change, and the reading's answer comes at every selection and
// navigation, so between them a tab hears at its next interaction that somebody
// rebuilt the frontend under it. Both feed this one memory, so the person hears
// it once for each build the server serves, whichever answer said it first.

import type { StaleFrontend } from "#ui/panes/pane-session/clients/pane-requests.ts";

/** A server answer that may say this tab runs old code. */
interface BuildAnswer {
	readonly staleFrontend?: StaleFrontend;
}

/**
 * Create one pane's memory of the build it already told the person about.
 * @param tell Tell the person what the server said.
 * @returns Hear one answer, or null for a request that never settled.
 */
function createStaleBuildNotice(
	tell: (message: string) => void,
): (answer: BuildAnswer | null) => void {
	let told: string | null = null;
	return (answer) => {
		const stale = answer?.staleFrontend;
		if (typeof stale?.message !== "string" || stale.current === told) {
			return;
		}
		told = stale.current;
		tell(stale.message);
	};
}

export { createStaleBuildNotice };
