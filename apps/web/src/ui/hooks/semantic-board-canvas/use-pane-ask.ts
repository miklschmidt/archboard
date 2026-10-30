import { use } from "react";

import { PaneAskContext, type PaneAsk } from "#ui/state/semantic-board-canvas/pane-ask.ts";

/**
 * The question this reader's pane can put to the agent of its checkout.
 * @returns The ask, or null where the page has no agent to ask.
 */
function usePaneAsk(): PaneAsk | null {
	return use(PaneAskContext);
}

export { usePaneAsk };
