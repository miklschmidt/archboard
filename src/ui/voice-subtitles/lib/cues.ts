// Cutting what the voice model says into cues: the two lines or so on screen at one time.
//
// A subtitle that showed the tail of a growing text would re-wrap with every word. So the text is
// cut into cues of a fixed most length, at word boundaries and, where one falls conveniently, at
// the end of a sentence. Where a cue is cut depends only on the words before the cut, so a cue
// already on screen never changes as the utterance grows; the last cue is the one being spoken.

/** The most characters a cue holds: two comfortable lines of a subtitle. */
const CUE_MAX_CHARS = 84;

/** A cue is ended early at the end of a sentence once it is at least this long. */
const CUE_SENTENCE_MIN_CHARS = 36;

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

/** The cue being filled, while an utterance is cut. */
interface OpenCue {
	readonly start: number;
	readonly words: readonly string[];
	/** Its length as drawn: the words and the single spaces between them. */
	readonly chars: number;
}

/**
 * A cue with nothing in it yet.
 * @param start The utterance's word it will begin at.
 * @returns The empty cue.
 */
function emptyCue(start: number): OpenCue {
	return { start, words: [], chars: 0 };
}

/**
 * A cue with one more word.
 * @param cue The cue.
 * @param word The word.
 * @returns The longer cue.
 */
function withWord(cue: OpenCue, word: string): OpenCue {
	const space = cue.words.length === 0 ? 0 : 1;
	return { start: cue.start, words: [...cue.words, word], chars: cue.chars + space + word.length };
}

/**
 * Whether a cue is closed once it holds a word: at a sentence's end, when it is long enough to be
 * worth a cue of its own.
 * @param cue The cue, holding the word.
 * @param word The word.
 * @returns True when the next word starts another cue.
 */
function closesCue(cue: OpenCue, word: string): boolean {
	return endsSentence(word) && cue.chars >= CUE_SENTENCE_MIN_CHARS;
}

/**
 * Cut an utterance into cues.
 * @param words Its words.
 * @returns The cues, in order, together holding every word once.
 */
function cuesOf(words: readonly string[]): SubtitleCue[] {
	const cues: SubtitleCue[] = [];
	let open = emptyCue(0);
	/**
	 * Close the cue being filled, when it holds anything, and begin the next.
	 * @param next The utterance's word the next cue begins at.
	 */
	const close = (next: number): void => {
		if (open.words.length > 0) {
			cues.push({ start: open.start, words: open.words });
		}
		open = emptyCue(next);
	};
	for (const [index, word] of words.entries()) {
		// A word that would overflow the cue begins the next one instead.
		if (withWord(open, word).chars > CUE_MAX_CHARS) {
			close(index);
		}
		open = withWord(open, word);
		if (closesCue(open, word)) {
			close(index + 1);
		}
	}
	close(words.length);
	return cues;
}

export { cuesOf, wordsOf, type SubtitleCue };
