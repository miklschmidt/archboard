// Whether the voice box may carry the voice over a pane.

import type { Workbench } from "@/ui/application/hooks/use-workbench";

/** What decides it. */
interface VoiceBoxSources {
	readonly workbench: Workbench;
	/** The pane presented fullscreen, or null in the workspace. */
	readonly presentedPane: string | null;
	/** Whether the page is a recording. */
	readonly recording: boolean;
	/** Whether the page demonstrates the voice (`?voiceDemo`), in place of a voice there is not. */
	readonly demonstrating: boolean;
}

/**
 * Whether the voice box may carry the voice. It does only where a pane shows it: not while a pane
 * is presented, which has its own voice controls, and not on a recording page. A pane with no
 * transport has no voice owner and so no box to carry it: the voice is then in the dock.
 * @param sources The workbench, what is presented, whether the page records, and whether it demonstrates.
 * @returns True when it may.
 */
function voiceBoxAvailable(sources: VoiceBoxSources): boolean {
	const { workbench, presentedPane, recording, demonstrating } = sources;
	const owned = demonstrating || workbench.voice !== null;
	return presentedPane === null && !recording && owned;
}

export { voiceBoxAvailable };
