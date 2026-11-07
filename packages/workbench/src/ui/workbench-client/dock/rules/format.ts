// Small text helpers for technical tokens: clock times and shortened ids.

/**
 * The time of day of a millisecond timestamp, `HH:MM:SS` in UTC, matching how
 * the shell prints activity times from ISO strings.
 * @param ms Milliseconds since the epoch.
 * @returns The clock time.
 */
function clockTime(ms: number): string {
	return new Date(ms).toISOString().slice(11, 19);
}

/**
 * An identifier short enough for a dense row: the first and last few characters.
 * @param id The identifier.
 * @returns The id, or its head and tail joined by an ellipsis when long.
 */
function shortId(id: string): string {
	return id.length <= 14 ? id : `${id.slice(0, 6)}…${id.slice(-5)}`;
}

/**
 * A count with its noun.
 * @param count How many.
 * @param singular The noun for one.
 * @param plural The noun for any other count.
 * @returns `1 file`, `3 files`.
 */
function counted(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

export { clockTime, counted, shortId };
