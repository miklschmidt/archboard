// Whether the voice box may carry the voice over a pane (TASK-391, TASK-392), as a second entrypoint
// of the module so that a test can hold the rule without drawing the application.

/** What decides it. */
interface VoiceBoxSources {
	/** Whether a pane has a voice owner: a transport the voice runs over. */
	readonly owned: boolean;
	/** Whether the page is a recording. */
	readonly recording: boolean;
	/** Whether the page demonstrates the voice (`?voiceDemo`), in place of a voice there is not. */
	readonly demonstrating: boolean;
}

/**
 * Whether the voice box may carry the voice. It does wherever a pane shows it, in the workspace and
 * in a fullscreen presentation, and not on a recording page, where nobody can press anything and
 * the subtitles are plain. A pane with no voice owner has no box to carry it, and the voice is then
 * in the dock.
 * @param sources Whether a pane has a voice owner, whether the page records, and whether it demonstrates.
 * @returns True when it may.
 */
function voiceBoxAvailable(sources: VoiceBoxSources): boolean {
	const { owned, recording, demonstrating } = sources;
	return !recording && (demonstrating || owned);
}

export { voiceBoxAvailable, type VoiceBoxSources };
