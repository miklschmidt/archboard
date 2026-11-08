// Telling the person, once per build, that this tab runs old code (TASK-056).
//
// Pane reports and readings share this memory for the lifetime of the page.
// A late reply, another pane, or a reopened pane cannot repeat a served build.

import type { StaleFrontend } from "#ui/panes/pane-session/clients/pane-requests.ts";

/** A server answer that may say this tab runs old code. */
interface BuildAnswer {
	readonly staleFrontend?: StaleFrontend;
}

/** Every served build that this page already announced, across all panes. */
const announcedBuilds = new Set<string | null>();

/**
 * Connect a pane's answers to the page's shared notice memory.
 * @param tell Tell the person what the server said.
 * @returns Hear one answer, or null for a request that never settled.
 */
function createStaleBuildNotice(
	tell: (message: string) => void,
): (answer: BuildAnswer | null) => void {
	return (answer) => {
		const stale = answer?.staleFrontend;
		if (typeof stale?.message !== "string" || announcedBuilds.has(stale.current)) {
			return;
		}
		announcedBuilds.add(stale.current);
		tell(stale.message);
	};
}

export { createStaleBuildNotice };
