// Whether the focused pane's walkthrough can be narrated aloud, and how (TASK-251).
//
// A pane knows nothing about voice, and voice knows nothing about walkthroughs:
// the shell is where they meet. Narration is offered only while voice could be
// started for the focused pane, because a session already running was started
// for something else and a narration is a session started to present one
// walkthrough. The session adapter owns whether a start is possible; this reads
// that one fact and turns it into the pane's control.

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { WorkbenchOwners } from "@/ui/application/lib/workbench-owners";

/** The focused pane's narration, when voice could be started for it. */
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
 * Nothing to listen to while no pane has voice owners.
 * @returns How to stop listening.
 */
function subscribeToNothing(): () => void {
	return (): void => undefined;
}

/**
 * The focused pane's narration.
 * @param owners The focused pane's workbench owners, or null while it has none.
 * @param paneId The focused pane, or null.
 * @returns The narration, or null while voice cannot be started for that pane.
 */
function useNarration(owners: WorkbenchOwners | null, paneId: string | null): Narration | null {
	const voice = owners?.voice ?? null;
	const canStart = useSyncExternalStore(
		voice === null ? subscribeToNothing : voice.subscribe,
		() => voice?.view().controls.canStart ?? false,
	);
	const start = useCallback(
		(walkthrough: string): void => {
			void voice?.start({ walkthrough });
		},
		[voice],
	);
	return useMemo(
		() => (canStart && paneId !== null ? { paneId, start } : null),
		[canStart, paneId, start],
	);
}

export { useNarration, type Narration };
