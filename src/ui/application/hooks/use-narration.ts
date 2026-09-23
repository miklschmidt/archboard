// Narrating the focused pane's walkthrough aloud (TASK-251). A pane knows
// nothing about voice and voice knows nothing about walkthroughs: the shell is
// where they meet. Narration is offered whenever voice is off — Talk sets up
// whatever is missing, so a narration needs no voice to be ready first — and
// not while a session runs, because that session was started for something
// else.

import { useCallback, useMemo } from "react";

import type { AgentSetup } from "@/ui/agent-setup";
import type { AgentVoiceView } from "@/ui/workbench/contracts";

/** The focused pane's narration, when voice is off. */
interface Narration {
	/** The pane voice would be started for. */
	readonly paneId: string;
	/**
	 * Start voice to narrate one walkthrough of that pane's board.
	 * @param walkthrough The walkthrough's id.
	 */
	readonly start: (walkthrough: string) => void;
}

/**
 * The focused pane's narration.
 * @param setup The agent setup.
 * @param voice The voice as the agent bar shows it.
 * @param paneId The focused pane, or null.
 * @returns The narration, or null while voice is on or on its way.
 */
function useNarration(
	setup: AgentSetup,
	voice: AgentVoiceView,
	paneId: string | null,
): Narration | null {
	const start = useCallback((walkthrough: string): void => setup.talk({ walkthrough }), [setup]);
	const off = voice.stage === "idle";
	return useMemo(() => (off && paneId !== null ? { paneId, start } : null), [off, paneId, start]);
}

export { useNarration, type Narration };
