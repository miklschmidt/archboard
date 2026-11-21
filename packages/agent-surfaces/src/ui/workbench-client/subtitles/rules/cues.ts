// Cutting what the voice model says into cues: the two lines on screen at one time.
//
// A subtitle that showed the tail of a growing text would re-wrap with every word. So the text is
// cut into cues that fill the subtitle box's two lines, at word boundaries, and end early where a
// sentence ends on the second line (TASK-307). Where the lines break is measured, not estimated
// from characters, so a cue fills the box as it is drawn and never wraps to a third line. Where a
// cue is cut depends only on the words before the cut, so a cue already on screen never changes as
// the utterance grows; the last cue is the one being spoken.

/** How many lines a run of words, joined by single spaces, takes in the subtitle box. */
type LineCount = (text: string) => number;

/** The lines the subtitle box holds. */
const CUE_LINES = 2;

/** One cue: consecutive words of the utterance. */
interface SubtitleCue {
	/** The index, in the utterance, of its first word. */
	readonly start: number;
	readonly words: readonly string[];
}

/**
 * The words of a text.
 * @param text What was said.
 * @returns The words, in order.
 */
function wordsOf(text: string): string[] {
	return text.split(/\s+/u).filter((word) => word.length > 0);
}

/**
 * Whether a word ends a sentence.
 * @param word The word, with its punctuation.
 * @returns True after a full stop, a question mark, an exclamation mark or an ellipsis.
 */
function endsSentence(word: string): boolean {
	return /[.!?…]["')\]]?$/u.test(word);
}

/**
 * Cut an utterance into cues.
 * @param words Its words.
 * @param lines How many lines a run of words takes in the subtitle box.
 * @returns The cues, in order, together holding every word once.
 */
function cuesOf(words: readonly string[], lines: LineCount): SubtitleCue[] {
	const cues: SubtitleCue[] = [];
	let open: SubtitleCue = { start: 0, words: [] };
	/**
	 * Close the cue being filled, when it holds anything, and begin the next.
	 * @param next The utterance's word the next cue begins at.
	 */
	const close = (next: number): void => {
		if (open.words.length > 0) {
			cues.push(open);
		}
		open = { start: next, words: [] };
	};
	for (const [index, word] of words.entries()) {
		let taken = lines([...open.words, word].join(" "));
		// A word that would wrap the cue to a third line begins the next one instead.
		if (taken > CUE_LINES && open.words.length > 0) {
			close(index);
			taken = lines(word);
		}
		open = { start: open.start, words: [...open.words, word] };
		// A sentence that ends on the second line ends the cue.
		if (endsSentence(word) && taken >= CUE_LINES) {
			close(index + 1);
		}
	}
	close(words.length);
	return cues;
}

export { cuesOf, wordsOf, type LineCount, type SubtitleCue };
