// Spans of a file, by byte offset, that a capture marks as a whole: code that
// is only types, code where no name is a use, code that did not parse. A name
// is tested against them by its offset, with no walk up the syntax tree.

/** A set of spans that answers whether an offset is inside one. */
interface Spans {
	/**
	 * Whether an offset is inside a span.
	 * @param offset The byte offset.
	 * @returns True when a span holds it.
	 */
	holds(offset: number): boolean;
}

/** A span of a file, by byte offset: the first byte and the byte after the last. */
interface Span {
	readonly startIndex: number;
	readonly endIndex: number;
}

/**
 * The spans as one sorted list in which no two overlap.
 * @param spans The spans, in any order, nested or overlapping.
 * @returns Their union.
 */
function merged(spans: readonly Span[]): Span[] {
	const sorted = spans.toSorted((left, right) => left.startIndex - right.startIndex);
	const union: Span[] = [];
	for (const span of sorted) {
		const last = union.at(-1);
		if (last !== undefined && span.startIndex <= last.endIndex) {
			union[union.length - 1] = {
				startIndex: last.startIndex,
				endIndex: Math.max(last.endIndex, span.endIndex),
			};
		} else union.push({ startIndex: span.startIndex, endIndex: span.endIndex });
	}
	return union;
}

/**
 * The spans, ready to test offsets against.
 * @param spans The spans.
 * @returns The set.
 */
function spansOf(spans: readonly Span[]): Spans {
	const union = merged(spans);
	return {
		/**
		 * Whether an offset is inside a span, by binary search.
		 * @param offset The byte offset.
		 * @returns True when a span holds it.
		 */
		holds(offset) {
			let low = 0;
			let high = union.length - 1;
			while (low <= high) {
				const middle = (low + high) >> 1;
				const span = union[middle];
				if (span === undefined) return false;
				if (offset < span.startIndex) high = middle - 1;
				else if (offset >= span.endIndex) low = middle + 1;
				else return true;
			}
			return false;
		},
	};
}

export { type Span, type Spans, merged, spansOf };
