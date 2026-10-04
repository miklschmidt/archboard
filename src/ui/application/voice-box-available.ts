// Whether the voice box may carry the voice over a pane (TASK-391), as a second entrypoint of the
// module so that a test can hold the rule without drawing the application.

/** What decides it. */
interface VoiceBoxSources {
	/** Whether a pane has a voice owner: a transport the voice runs over. */
	readonly owned: boolean;
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
 * voice owner has no box to carry it, and the voice is then in the dock.
 * @param sources Whether a pane has a voice owner, what is presented, whether the page records, and whether it demonstrates.
 * @returns True when it may.
 */
function voiceBoxAvailable(sources: VoiceBoxSources): boolean {
	const { owned, presentedPane, recording, demonstrating } = sources;
	return presentedPane === null && !recording && (demonstrating || owned);
}

export { voiceBoxAvailable, type VoiceBoxSources };
