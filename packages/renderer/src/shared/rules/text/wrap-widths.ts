// The widths words wrap at, searched for over Pretext's line breaking: the
// narrowest that keeps as few lines as a wider one, and the narrowest that
// takes a line fewer.
import {
	measureLineStats,
	measureNaturalWidth,
	walkLineRanges,
	type prepareWithSegments,
} from "@chenglou/pretext";

/**
 * How many lines end inside a word: Pretext breaks a word wider than the line
 * between two of its letters rather than let it overflow.
 * @param prepared The measured text.
 * @param width The width the lines wrap at.
 * @returns The number of words broken.
 */
function wordBreaks(prepared: ReturnType<typeof prepareWithSegments>, width: number): number {
	let breaks = 0;
	walkLineRanges(prepared, width, (line) => {
		// A line that ends between segments ends at a place the text may break.
		if (line.end.graphemeIndex > 0) breaks += 1;
	});
	return breaks;
}

/**
 * The narrowest wrap width that keeps the line count the widest wrap gives,
 * so wrapped words share their lines evenly instead of leaving one word alone
 * on the last, and that breaks no word the widest wrap keeps whole.
 * @param prepared The measured text.
 * @param limit The widest the lines may be.
 * @returns A width at most `limit` that breaks into no more lines, and inside
 *   no more words, than `limit` does.
 */
function balancedWrapWidth(
	prepared: ReturnType<typeof prepareWithSegments>,
	limit: number,
): number {
	const lines = measureLineStats(prepared, limit).lineCount;
	if (lines <= 1) {
		return limit;
	}
	const breaks = wordBreaks(prepared, limit);
	/**
	 * Whether a narrower wrap is as good as the widest: no more lines, no more broken words.
	 * @param width The narrower wrap's width.
	 * @returns Whether it serves.
	 */
	const fitsAt = (width: number): boolean =>
		measureLineStats(prepared, width).lineCount <= lines && wordBreaks(prepared, width) <= breaks;
	let tooNarrow = measureNaturalWidth(prepared) / lines;
	let fits = limit;
	while (fits - tooNarrow > 0.5) {
		const middle = (tooNarrow + fits) / 2;
		if (fitsAt(middle)) {
			fits = middle;
		} else {
			tooNarrow = middle;
		}
	}
	return fits;
}

/**
 * The narrowest whole width, wider than some, at which words wrap into fewer lines than there.
 * @param prepared The measured words.
 * @param width The width they wrap at now.
 * @returns The width, or nothing when they take one line or none.
 */
function fewerLinesAt(
	prepared: ReturnType<typeof prepareWithSegments>,
	width: number,
): number | undefined {
	const lines = measureLineStats(prepared, width).lineCount;
	if (lines <= 1) return undefined;
	let tooNarrow = width;
	let fits = Math.ceil(measureNaturalWidth(prepared)) + 1;
	while (fits - tooNarrow > 1) {
		const middle = Math.floor((tooNarrow + fits) / 2);
		if (measureLineStats(prepared, middle).lineCount < lines) fits = middle;
		else tooNarrow = middle;
	}
	return fits;
}

export { balancedWrapWidth, fewerLinesAt };
