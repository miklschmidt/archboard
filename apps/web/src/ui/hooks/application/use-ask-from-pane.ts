// Asking the agent about what one pane shows: the diagnostics bell's repair,
// or a design question about a part.
//
// A question goes to the workhorse of the pane's checkout (ADR 0050), so that
// checkout is activated first. The server tells the workbench socket of the
// switch before it answers, but that answer can arrive first. A read on the
// socket comes after the news, so the question is composed for the conversation
// shown now, not refused because the workbench moved under it.

import { useCallback } from "react";

import type { ConversationActivation } from "#ui/clients/application/shown-conversation.ts";
import type { AgentSurfaces } from "#ui/hooks/application/use-agent-surfaces.ts";

/**
 * Ask the agent of one pane's checkout a question, sent at once.
 * @param activate Shows the conversation of a pane's checkout.
 * @param transport The focused pane's workbench transport, read again after the switch, or null while it has none.
 * @param ask Sends the question to the conversation shown.
 * @returns Ask, by the pane and the words of the question.
 */
function useAskFromPane(
	activate: ConversationActivation,
	transport: { readonly refresh: () => Promise<unknown> } | null,
	ask: AgentSurfaces["ask"],
): (paneId: string, text: string) => void {
	return useCallback(
		(paneId: string, text: string): void => {
			void activate(paneId)
				.then(() => transport?.refresh())
				.catch(() => undefined)
				.then(() => ask(text));
		},
		[activate, transport, ask],
	);
}

export { useAskFromPane };
