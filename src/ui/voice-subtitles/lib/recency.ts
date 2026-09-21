// Whether there is something to subtitle right now.
//
// Measured against Codex 0.155.1 in a full-duplex session: the voice model's transcript arrives a
// word at a time, each word within some tens of milliseconds of its place on the audio clock. So
// a word is shown the moment it arrives, and nothing here paces or holds text back; an earlier
// cut that did fell further behind the voice with every sentence. What is left to decide is when
// a subtitle goes: once no word has arrived for `SUBTITLE_LINGER_MS`, longer than the voice ever
// pauses mid-thought. That one rule also covers an interruption, which simply stops the words
// where the speech stopped. The timer is the hook's; what it is compared with is here.

/** How much of which utterance has been received. */
interface SubtitleProgress {
	/** The voice model's latest utterance, or null when it has said nothing. */
	readonly itemId: string | null;
	/** How many words of it have been received. */
	readonly words: number;
}

/**
 * One moment of progress as a value to compare: it changes exactly when a word arrives.
 * @param progress What has been received.
 * @returns The mark.
 */
function progressMark(progress: SubtitleProgress): string {
	return `${progress.words}:${progress.itemId ?? ""}`;
}

/** What the progress is compared with. */
interface SubtitleWatch {
	/** The mark when watching began: whatever was said by then is history, not a subtitle. */
	readonly from: string;
	/** The mark the linger last ran out on, or null. */
	readonly lapsed: string | null;
}

/**
 * Whether the progress is something to subtitle.
 * @param progress What has been received.
 * @param watch When watching began, and what the linger last ran out on.
 * @returns True while a word has arrived since watching began and the linger has not run out on it.
 */
function subtitleShowing(progress: SubtitleProgress, watch: SubtitleWatch): boolean {
	const mark = progressMark(progress);
	return progress.words > 0 && mark !== watch.from && mark !== watch.lapsed;
}

export { progressMark, subtitleShowing, type SubtitleProgress, type SubtitleWatch };
